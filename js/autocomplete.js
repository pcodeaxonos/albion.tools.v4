import { escapeHtml } from './utils.js';

const MENU_MAX_HEIGHT = 280;
const VALUE_DESC = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const DISABLED_DESC = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
const openWidgets = new Set();
let globalsBound = false;

function bindGlobalListeners() {
    if (globalsBound) {
        return;
    }

    globalsBound = true;

    const pruneAnd = (fn) => {
        for (const widget of [...openWidgets]) {
            if (!widget.isAlive()) {
                widget.destroy();
            }
        }
        fn?.();
    };

    window.addEventListener('resize', () => {
        pruneAnd(() => {
            openWidgets.forEach((widget) => widget.position());
        });
    });

    document.addEventListener('scroll', () => {
        pruneAnd(() => {
            openWidgets.forEach((widget) => widget.position());
        });
    }, true);

    document.addEventListener('mousedown', (event) => {
        pruneAnd(() => {
            openWidgets.forEach((widget) => widget.onPointerDown(event));
        });
    });
}

function foldChar(ch) {
    return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function fold(str) {
    return Array.from(str, foldChar).join('');
}

function indexLabel(label) {
    const chars = [];
    let wordStart = true;

    for (let i = 0; i < label.length; i += 1) {
        const folded = foldChar(label[i]);
        const isAlnum = /[\p{L}\p{N}]/u.test(folded);

        if (isAlnum) {
            chars.push({ i, c: folded, wordStart });
            wordStart = false;
        } else {
            wordStart = true;
        }
    }

    return chars;
}

function rangesFromIndexed(indexed, start, length) {
    const slice = indexed.slice(start, start + length);
    if (slice.length === 0) {
        return [];
    }

    const ranges = [];
    let rangeStart = slice[0].i;
    let rangeEnd = slice[0].i + 1;

    for (let k = 1; k < slice.length; k += 1) {
        const orig = slice[k].i;
        if (orig === rangeEnd) {
            rangeEnd = orig + 1;
        } else {
            ranges.push({ start: rangeStart, end: rangeEnd });
            rangeStart = orig;
            rangeEnd = orig + 1;
        }
    }

    ranges.push({ start: rangeStart, end: rangeEnd });
    return ranges;
}

function hitsToRanges(indexed, hitIndexes) {
    if (hitIndexes.length === 0) {
        return [];
    }

    const ranges = [];
    let rangeStart = indexed[hitIndexes[0]].i;
    let rangeEnd = indexed[hitIndexes[0]].i + 1;
    let prevOrig = indexed[hitIndexes[0]].i;

    for (let k = 1; k < hitIndexes.length; k += 1) {
        const orig = indexed[hitIndexes[k]].i;
        if (orig === prevOrig + 1) {
            rangeEnd = orig + 1;
        } else {
            ranges.push({ start: rangeStart, end: rangeEnd });
            rangeStart = orig;
            rangeEnd = orig + 1;
        }
        prevOrig = orig;
    }

    ranges.push({ start: rangeStart, end: rangeEnd });
    return ranges;
}

function mergeRanges(ranges) {
    if (ranges.length <= 1) {
        return ranges.slice();
    }

    const sorted = ranges.slice().sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];

    for (let i = 1; i < sorted.length; i += 1) {
        const last = merged[merged.length - 1];
        const next = sorted[i];
        if (next.start <= last.end) {
            last.end = Math.max(last.end, next.end);
        } else {
            merged.push({ ...next });
        }
    }

    return merged;
}

function splitWords(indexed) {
    const words = [];

    for (const ch of indexed) {
        if (ch.wordStart || words.length === 0) {
            words.push([ch]);
        } else {
            words[words.length - 1].push(ch);
        }
    }

    return words;
}

function matchTokensAsWordPrefixes(tokens, indexed) {
    const words = splitWords(indexed);
    if (words.length === 0) {
        return null;
    }

    const used = new Set();
    const ranges = [];
    let score = 620;

    const ordered = tokens
        .map((token, index) => ({ token, index }))
        .sort((a, b) => b.token.length - a.token.length || a.index - b.index);

    for (const { token } of ordered) {
        let best = -1;
        let bestRank = -Infinity;

        for (let w = 0; w < words.length; w += 1) {
            if (used.has(w)) {
                continue;
            }

            const wordStr = words[w].map((ch) => ch.c).join('');
            if (!wordStr.startsWith(token)) {
                continue;
            }

            const exact = wordStr === token ? 40 : 0;
            const early = (words.length - w) * 2;
            const rank = exact + early + token.length;
            if (rank > bestRank) {
                bestRank = rank;
                best = w;
            }
        }

        if (best < 0) {
            return null;
        }

        used.add(best);
        const chars = words[best].slice(0, token.length);
        ranges.push({ start: chars[0].i, end: chars[chars.length - 1].i + 1 });
        score += token.length * 12 + (words[best].map((ch) => ch.c).join('') === token ? 28 : 0);
    }

    return { score, ranges: mergeRanges(ranges) };
}

function fuzzyMatch(qCompact, indexed) {
    let qi = 0;
    const hitIndexes = [];
    let consecutive = 0;
    let score = 120;

    for (let i = 0; i < indexed.length && qi < qCompact.length; i += 1) {
        if (indexed[i].c === qCompact[qi]) {
            if (indexed[i].wordStart) {
                score += 14;
            }
            if (i === 0) {
                score += 18;
            }
            if (consecutive > 0) {
                score += 10;
            }
            hitIndexes.push(i);
            consecutive += 1;
            qi += 1;
        } else {
            consecutive = 0;
        }
    }

    if (qi < qCompact.length) {
        return null;
    }

    const span = hitIndexes[hitIndexes.length - 1] - hitIndexes[0] + 1;
    score -= (indexed.length - qCompact.length);
    score -= (span - qCompact.length) * 3;

    return { score, ranges: hitsToRanges(indexed, hitIndexes) };
}

function matchQuery(query, label) {
    const q = fold(query).trim();
    if (!q) {
        return { score: 0, ranges: [] };
    }

    const tokens = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (tokens.length === 0) {
        return { score: 0, ranges: [] };
    }

    const indexed = indexLabel(label);
    if (indexed.length === 0) {
        return null;
    }

    const compact = indexed.map((ch) => ch.c).join('');
    const qCompact = tokens.join('');

    if (compact === qCompact) {
        return { score: 1000, ranges: rangesFromIndexed(indexed, 0, qCompact.length) };
    }

    if (compact.startsWith(qCompact)) {
        return {
            score: 820 + qCompact.length * 2 - (compact.length - qCompact.length),
            ranges: rangesFromIndexed(indexed, 0, qCompact.length)
        };
    }

    const wordMatch = matchTokensAsWordPrefixes(tokens, indexed);
    if (wordMatch) {
        return wordMatch;
    }

    const containsAt = compact.indexOf(qCompact);
    if (containsAt >= 0) {
        return {
            score: 420 - containsAt + qCompact.length,
            ranges: rangesFromIndexed(indexed, containsAt, qCompact.length)
        };
    }

    return fuzzyMatch(qCompact, indexed);
}

function scoreOption(query, option) {
    const labelMatch = matchQuery(query, option.label);
    const valueHaystack = option.value && option.value !== option.label
        ? option.value.replace(/[_-]+/g, ' ')
        : '';
    const valueMatch = valueHaystack ? matchQuery(query, valueHaystack) : null;
    const groupMatch = option.group ? matchQuery(query, option.group) : null;

    const ranked = [labelMatch, valueMatch, groupMatch]
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
        return null;
    }

    const best = ranked[0];
    return {
        score: best.score + (best === labelMatch ? 8 : 0),
        ranges: labelMatch?.ranges ?? []
    };
}

function highlightLabel(label, ranges) {
    if (!ranges || ranges.length === 0) {
        return escapeHtml(label);
    }

    const merged = mergeRanges(ranges);
    let html = '';
    let cursor = 0;

    for (const range of merged) {
        html += escapeHtml(label.slice(cursor, range.start));
        html += `<mark class="autocomplete-hl">${escapeHtml(label.slice(range.start, range.end))}</mark>`;
        cursor = range.end;
    }

    html += escapeHtml(label.slice(cursor));
    return html;
}

function readOptions(select) {
    const options = [];

    for (const child of select.children) {
        if (child.tagName === 'OPTGROUP') {
            const group = child.label;
            for (const opt of child.children) {
                if (opt.tagName !== 'OPTION') {
                    continue;
                }
                options.push({
                    value: opt.value,
                    label: opt.textContent.trim(),
                    group,
                    disabled: opt.disabled,
                    muted: opt.dataset.muted === '1' || opt.dataset.muted === 'true',
                    hint: (opt.dataset.hint || '').trim()
                });
            }
        } else if (child.tagName === 'OPTION') {
            options.push({
                value: child.value,
                label: child.textContent.trim(),
                group: null,
                disabled: child.disabled,
                muted: child.dataset.muted === '1' || child.dataset.muted === 'true',
                hint: (child.dataset.hint || '').trim()
            });
        }
    }

    return options;
}

function selectedLabel(select, options, floating) {
    const current = options.find((opt) => opt.value === select.value);
    if (!current) {
        return '';
    }
    if (floating && current.value === '') {
        return '';
    }
    return current.label;
}

function enhanceSelect(select) {
    if (select.dataset.autocomplete === 'on') {
        return;
    }

    select.dataset.autocomplete = 'on';
    select.classList.add('autocomplete-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    const floating = Boolean(select.closest('.form-floating'));
    const compact = select.classList.contains('form-select-sm')
        || select.classList.contains('db-col-filter');

    const wrap = document.createElement('div');
    wrap.className = compact ? 'autocomplete autocomplete--sm' : 'autocomplete';

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = compact
        ? 'form-control form-control-sm autocomplete-input'
        : 'form-control autocomplete-input';
    input.placeholder = ' ';
    input.size = 1;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocapitalize', 'off');
    if (select.id) {
        input.id = `${select.id}-ac`;
        const label = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
        if (label) {
            label.htmlFor = input.id;
        }
    }
    wrap.appendChild(input);

    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'autocomplete-chevron';
    chevron.tabIndex = -1;
    chevron.setAttribute('aria-hidden', 'true');
    wrap.appendChild(chevron);

    const menuId = `${select.id || `ac-${Math.random().toString(36).slice(2, 8)}`}-menu`;
    const menu = document.createElement('div');
    menu.className = 'autocomplete-menu';
    menu.id = menuId;
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    wrap.appendChild(menu);
    input.setAttribute('aria-controls', menuId);

    let options = readOptions(select);
    let visible = [];
    let activeIndex = -1;
    let query = '';
    let open = false;
    let syncing = false;
    let widget;

    const syncDisabled = () => {
        input.disabled = select.disabled;
        wrap.classList.toggle('is-disabled', select.disabled);
    };

    const syncFilled = () => {
        const filled = select.value !== '' || input.value.length > 0;
        input.classList.toggle('is-filled', filled);
        wrap.classList.toggle('is-filled', filled);
    };

    const syncFromSelect = () => {
        if (syncing) {
            return;
        }
        options = readOptions(select);
        input.value = selectedLabel(select, options, floating);
        query = '';
        syncDisabled();
        syncFilled();
    };

    const closeMenu = () => {
        openWidgets.delete(widget);
        if (!open && menu.hidden) {
            return;
        }
        open = false;
        menu.hidden = true;
        wrap.classList.remove('is-open');
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        if (wrap.isConnected) {
            wrap.appendChild(menu);
        } else {
            menu.remove();
        }
    };

    const positionMenu = () => {
        if (!wrap.isConnected) {
            closeMenu();
            menu.remove();
            return;
        }

        const rect = wrap.getBoundingClientRect();
        const width = `${Math.max(1, Math.ceil(rect.width))}px`;
        menu.style.minWidth = width;
        menu.style.width = width;
        menu.style.maxWidth = width;
        menu.style.maxHeight = `${MENU_MAX_HEIGHT}px`;

        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const menuHeight = Math.min(menu.scrollHeight, MENU_MAX_HEIGHT);
        const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

        menu.classList.toggle('is-above', openUp);
        menu.style.left = `${rect.left}px`;
        if (openUp) {
            menu.style.top = 'auto';
            menu.style.bottom = `${window.innerHeight - rect.top}px`;
        } else {
            menu.style.bottom = 'auto';
            menu.style.top = `${rect.bottom}px`;
        }
    };

    const setActive = (index, scroll = true) => {
        const items = menu.querySelectorAll('.autocomplete-option');
        items.forEach((el) => el.classList.remove('is-active'));

        if (items.length === 0) {
            activeIndex = -1;
            input.removeAttribute('aria-activedescendant');
            return;
        }

        activeIndex = ((index % items.length) + items.length) % items.length;
        const active = items[activeIndex];
        active.classList.add('is-active');
        input.setAttribute('aria-activedescendant', active.id);
        if (scroll) {
            active.scrollIntoView({ block: 'nearest' });
        }
    };

    const renderMenu = () => {
        const q = query.trim();
        const ranked = [];

        options.forEach((option, index) => {
            if (option.disabled) {
                return;
            }
            if (!q) {
                ranked.push({ option, index, score: 0, ranges: [] });
                return;
            }
            const match = scoreOption(q, option);
            if (match) {
                ranked.push({ option, index, score: match.score, ranges: match.ranges });
            }
        });

        if (q) {
            ranked.sort((a, b) => b.score - a.score || a.index - b.index);
        } else {
            ranked.sort((a, b) => Number(a.option.muted) - Number(b.option.muted) || a.index - b.index);
        }

        visible = ranked;

        if (ranked.length === 0) {
            menu.innerHTML = '<div class="autocomplete-empty">Sonuç yok</div>';
            activeIndex = -1;
            input.removeAttribute('aria-activedescendant');
            return;
        }

        const parts = [];
        let lastGroup = Symbol('none');

        ranked.forEach((entry, visIndex) => {
            const { option, ranges } = entry;
            if (option.group && option.group !== lastGroup) {
                lastGroup = option.group;
                parts.push(`<div class="autocomplete-group-label">${escapeHtml(option.group)}</div>`);
            } else if (!option.group) {
                lastGroup = null;
            }

            const selected = option.value === select.value ? ' is-selected' : '';
            const muted = option.muted ? ' is-muted' : '';
            const optionId = `${menuId}-opt-${visIndex}`;
            const hint = option.hint
                ? `<span class="autocomplete-option-hint">${escapeHtml(option.hint)}</span>`
                : '';
            parts.push(`
                <div class="autocomplete-option${selected}${muted}" role="option" id="${optionId}" data-index="${visIndex}" aria-selected="${option.value === select.value ? 'true' : 'false'}"${option.hint ? ` aria-label="${escapeHtml(`${option.label}, ${option.hint}`)}"` : ''}>
                    <span class="autocomplete-option-text">${highlightLabel(option.label, q ? ranges : [])}</span>
                    ${hint}
                </div>
            `);
        });

        menu.innerHTML = parts.join('');

        const selectedVis = ranked.findIndex((entry) => entry.option.value === select.value);
        setActive(selectedVis >= 0 ? selectedVis : 0, false);
    };

    const openMenu = () => {
        if (select.disabled) {
            return;
        }

        bindGlobalListeners();
        document.body.appendChild(menu);
        menu.hidden = false;
        open = true;
        wrap.classList.add('is-open');
        input.setAttribute('aria-expanded', 'true');
        openWidgets.add(widget);
        renderMenu();
        positionMenu();
    };

    const pick = (visIndex) => {
        const entry = visible[visIndex];
        if (!entry) {
            return;
        }

        syncing = true;
        VALUE_DESC.set.call(select, entry.option.value);
        syncing = false;
        input.value = selectedLabel(select, options, floating);
        query = '';
        syncFilled();
        closeMenu();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const revertInput = () => {
        query = '';
        input.value = selectedLabel(select, options, floating);
        syncFilled();
    };

    widget = {
        isAlive() {
            return wrap.isConnected;
        },
        position() {
            if (open) {
                positionMenu();
            }
        },
        onPointerDown(event) {
            if (!open) {
                return;
            }
            if (wrap.contains(event.target) || menu.contains(event.target)) {
                return;
            }
            revertInput();
            closeMenu();
        },
        destroy() {
            open = false;
            menu.remove();
            openWidgets.delete(widget);
        }
    };

    input.addEventListener('focus', () => {
        query = '';
        input.select();
        openMenu();
    });

    input.addEventListener('input', () => {
        query = input.value;
        syncFilled();
        if (!open) {
            openMenu();
        } else {
            renderMenu();
            positionMenu();
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) {
                openMenu();
                return;
            }
            setActive(activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
                openMenu();
                return;
            }
            setActive(activeIndex - 1);
        } else if (event.key === 'Enter') {
            if (open && visible.length > 0) {
                event.preventDefault();
                pick(activeIndex < 0 ? 0 : activeIndex);
            }
        } else if (event.key === 'Escape') {
            if (open) {
                event.preventDefault();
                revertInput();
                closeMenu();
            }
        } else if (event.key === 'Tab') {
            if (open && query.trim() && visible.length > 0) {
                pick(activeIndex < 0 ? 0 : activeIndex);
            } else if (open) {
                revertInput();
                closeMenu();
            }
        }
    });

    input.addEventListener('blur', () => {
        window.setTimeout(() => {
            if (!wrap.contains(document.activeElement) && !menu.contains(document.activeElement)) {
                revertInput();
                closeMenu();
            }
        }, 0);
    });

    chevron.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (select.disabled) {
            return;
        }
        if (open) {
            closeMenu();
            return;
        }
        input.focus();
        openMenu();
    });

    menu.addEventListener('mousedown', (event) => {
        event.preventDefault();
    });

    menu.addEventListener('click', (event) => {
        const optionEl = event.target.closest('[data-index]');
        if (!optionEl) {
            return;
        }
        pick(Number(optionEl.dataset.index));
    });

    Object.defineProperty(select, 'value', {
        configurable: true,
        enumerable: true,
        get() {
            return VALUE_DESC.get.call(this);
        },
        set(next) {
            VALUE_DESC.set.call(this, next);
            syncFromSelect();
        }
    });

    if (DISABLED_DESC) {
        Object.defineProperty(select, 'disabled', {
            configurable: true,
            enumerable: true,
            get() {
                return DISABLED_DESC.get.call(this);
            },
            set(next) {
                DISABLED_DESC.set.call(this, next);
                syncDisabled();
            }
        });
    }

    const observer = new MutationObserver(() => {
        options = readOptions(select);
        if (!query) {
            input.value = selectedLabel(select, options, floating);
        }
        syncDisabled();
        syncFilled();
        if (open) {
            renderMenu();
            positionMenu();
        }
    });

    observer.observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'data-muted', 'data-hint']
    });

    syncFromSelect();
}

export function initAutocompleteSelects(root = document) {
    for (const widget of [...openWidgets]) {
        if (!widget.isAlive()) {
            widget.destroy();
        }
    }

    const selects = root.querySelectorAll
        ? root.querySelectorAll('select.form-select')
        : [];

    selects.forEach((select) => enhanceSelect(select));

    if (root.matches?.('select.form-select')) {
        enhanceSelect(root);
    }
}
