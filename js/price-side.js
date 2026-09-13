import { escapeHtml } from './utils.js';
import { placesOrder } from './market-fees.js';
import { itemIconHtml } from './item-icon.js';
import { parseSortNumber } from './table-sort.js';

export const PRICE_SIDES = ['buy', 'sell'];
/** Prices older than this are still shown, but marked stale (blue). */
export const PRICE_STALE_MS = 6 * 60 * 60 * 1000;
/** How long a live price % delta stays on the field. */
export const PRICE_DELTA_MS = 60_000;

const priceDeltaTimers = new WeakMap();

export function normalizePriceSide(value, fallback = 'buy') {
    return value === 'sell' || value === 'buy' ? value : fallback;
}

function isLiveDate(value) {
    return Boolean(value) && !String(value).startsWith('0001');
}

export function isStalePriceDate(value) {
    if (!isLiveDate(value)) {
        return false;
    }
    const at = Date.parse(value);
    return Number.isFinite(at) && Date.now() - at > PRICE_STALE_MS;
}

/**
 * @param {'buy' | 'sell'} intent  buy = purchasing, sell = listing/selling
 * Purchase: buy book +1, sell book +0 (instant take).
 * Sale: sell book −1, buy book +0 (instant take).
 */
export function quoteFromRow(row, side, intent) {
    const posting = placesOrder(intent, side);

    if (side === 'buy') {
        if (!row || !(row.buy_price_max > 0)) {
            return null;
        }
        const tick = intent === 'buy' ? 1 : 0;
        const date = isLiveDate(row.buy_price_max_date) ? row.buy_price_max_date : null;
        return {
            price: row.buy_price_max + tick,
            book: row.buy_price_max,
            date,
            stale: isStalePriceDate(date),
            side: 'buy',
            intent,
            tick,
            setup: posting
        };
    }

    if (!row || !(row.sell_price_min > 0)) {
        return null;
    }

    const tick = intent === 'sell' ? -1 : 0;
    const date = isLiveDate(row.sell_price_min_date) ? row.sell_price_min_date : null;
    return {
        price: Math.max(1, row.sell_price_min + tick),
        book: row.sell_price_min,
        date,
        stale: isStalePriceDate(date),
        side: 'sell',
        intent,
        tick,
        setup: posting
    };
}

export function priceSideHint(side, intent) {
    if (intent === 'buy') {
        return side === 'buy' ? 'buy +1' : 'sell';
    }
    return side === 'sell' ? 'sell −1' : 'buy';
}

export function priceFieldClass({ manual, missing, stale }) {
    if (manual) {
        return ' is-manual';
    }
    if (missing) {
        return ' is-missing';
    }
    return stale ? ' is-stale' : '';
}

export function priceFieldTitle({ manual, missing, stale }) {
    if (manual) {
        return '';
    }
    if (missing) {
        return 'Fiyat yok — elle girebilirsin';
    }
    if (stale) {
        return 'Eski fiyat (6 saatten fazla) — güncel olmayabilir';
    }
    return '';
}

export function priceInputValue(manualRaw, fetchedPrice) {
    if (manualRaw != null) {
        return manualRaw;
    }
    if (!Number.isFinite(fetchedPrice)) {
        return '';
    }
    return Math.round(fetchedPrice).toLocaleString('tr-TR');
}

function setPriceInputDisplay(input, value) {
    const next = value == null ? '' : String(value);
    input.value = next;
    input.classList.toggle('is-filled', next.length > 0);
}

function clearPriceFieldUpdateMark(field) {
    field.classList.remove('is-price-updated', 'is-price-flash', 'is-up', 'is-down', 'is-flat', 'is-changed');
}

function clearPriceFieldDelta(field) {
    const timer = priceDeltaTimers.get(field);
    if (timer) {
        window.clearTimeout(timer);
        priceDeltaTimers.delete(field);
    }
    field.querySelector('.price-field-delta')?.remove();
    clearPriceFieldUpdateMark(field);
}

/** Undo every visual effect from a live price update (chips + marked borders). */
export function clearAllPriceFieldDeltas(root = document) {
    const marked = root.querySelectorAll(
        '.form-floating:has(.price-field-delta), .form-floating.is-price-updated, .form-floating.is-price-flash'
    );
    marked.forEach((field) => clearPriceFieldDelta(field));
    root.querySelectorAll('.price-field-delta').forEach((el) => el.remove());
}

function markPriceFieldUpdated(field, mode) {
    clearPriceFieldUpdateMark(field);
    field.classList.add('is-price-updated', mode);
}

function mountPriceFieldDelta(field, { text, dirClass, markMode }) {
    const timer = priceDeltaTimers.get(field);
    if (timer) {
        window.clearTimeout(timer);
        priceDeltaTimers.delete(field);
    }
    field.querySelector('.price-field-delta')?.remove();

    const el = document.createElement('span');
    el.className = `price-field-delta ${dirClass}`;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = text;
    field.appendChild(el);

    markPriceFieldUpdated(field, markMode);

    priceDeltaTimers.set(field, window.setTimeout(() => {
        priceDeltaTimers.delete(field);
        el.classList.add('is-leaving');
        window.setTimeout(() => el.remove(), 220);
    }, PRICE_DELTA_MS));
}

/**
 * Overlay on a price field without shifting layout.
 * Direction chips use info/warning; value-change border stays green until cleared;
 * unchanged feed uses gray "=".
 */
function showPriceFieldDelta(field, prev, next) {
    if (!(prev > 0) || !Number.isFinite(next)) {
        return;
    }

    if (prev === next) {
        mountPriceFieldDelta(field, {
            text: '=',
            dirClass: 'is-flat',
            markMode: 'is-flat'
        });
        return;
    }

    const rawPct = ((next - prev) / prev) * 100;
    const dir = rawPct > 0 ? 'is-up' : 'is-down';

    if (Math.abs(rawPct) < 1) {
        mountPriceFieldDelta(field, {
            text: '<1%',
            dirClass: dir,
            markMode: 'is-changed'
        });
        return;
    }

    const pct = Math.round(rawPct);
    mountPriceFieldDelta(field, {
        text: `${Math.abs(pct)}%`,
        dirClass: dir,
        markMode: 'is-changed'
    });
}

export function applyPriceFieldState(field, { manual, missing, stale, date, displayValue } = {}) {
    if (!field) {
        return;
    }
    const isManual = Boolean(manual);
    const isMissing = Boolean(missing) && !isManual;
    const isStale = !isManual && !isMissing && (Boolean(stale) || isStalePriceDate(date));
    field.classList.toggle('is-manual', isManual);
    field.classList.toggle('is-missing', isMissing);
    field.classList.toggle('is-stale', isStale);
    const title = priceFieldTitle({ manual: isManual, missing: isMissing, stale: isStale });
    if (title) {
        field.title = title;
    } else {
        field.removeAttribute('title');
    }

    const input = field.querySelector('.form-control');
    if (!input || isManual) {
        if (isManual) {
            clearPriceFieldDelta(field);
        }
        return;
    }

    if (displayValue !== undefined) {
        const prev = parseSortNumber(input.value);
        const next = parseSortNumber(displayValue);
        const prevAt = field.dataset.priceAt || '';
        const nextAt = isLiveDate(date) ? String(date) : '';
        setPriceInputDisplay(input, displayValue);

        if (prev != null && next != null) {
            if (prev !== next) {
                showPriceFieldDelta(field, prev, next);
            } else if (nextAt && prevAt && nextAt !== prevAt) {
                // Same silver, newer quote timestamp → feed touched, no move.
                showPriceFieldDelta(field, prev, next);
            }
        }

        if (nextAt) {
            field.dataset.priceAt = nextAt;
        }
        return;
    }

    if (isMissing) {
        setPriceInputDisplay(input, '');
        clearPriceFieldDelta(field);
    }
}

export function incompleteClass(value) {
    if (value == null || value === '') {
        return ' is-missing';
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return ' is-missing';
    }
    return '';
}

/**
 * Shared price input. Icon sits beside the field (never inside). Meta sits in a
 * fixed-height foot under the field so sibling columns stay aligned.
 *
 * @param {object} opts
 * @param {string} [opts.fieldClass='farming-price-field']
 * @param {string|null} [opts.iconId] item uniqueName — shown left of the input
 * @param {string} [opts.mark] HTML for top-right float-cut badge (e.g. NPC)
 * @param {string} [opts.meta] plain text under the field (e.g. birim …)
 */
export function priceFieldHtml({
    id,
    label,
    value,
    manual = false,
    missing = false,
    stale = false,
    date = null,
    dataAttr = '',
    fieldClass = 'farming-price-field',
    iconId = null,
    mark = '',
    meta = ''
}) {
    const filled = String(value ?? '').length > 0 ? ' is-filled' : '';
    const isStale = !manual && !missing && (Boolean(stale) || isStalePriceDate(date));
    const title = priceFieldTitle({ manual, missing, stale: isStale });
    const aside = iconId
        ? `<span class="price-field-aside" aria-hidden="true">${itemIconHtml(iconId, { className: 'item-icon price-field-aside-icon' })}</span>`
        : '';
    const foot = meta
        ? `<span class="price-field-meta">${escapeHtml(meta)}</span>`
        : '<span class="price-field-meta is-empty" aria-hidden="true">&nbsp;</span>';
    return `
        <div class="price-field-stack${iconId ? ' has-aside' : ''}">
            <div class="price-field-row">
                ${aside}
                <div class="form-floating ${escapeHtml(fieldClass)}${priceFieldClass({ manual, missing, stale: isStale })}"${title ? ` title="${escapeHtml(title)}"` : ''}>
                    <input type="text" class="form-control${filled}" id="${escapeHtml(id)}"
                        ${dataAttr} value="${escapeHtml(value)}" placeholder=" "
                        inputmode="decimal" autocomplete="off" spellcheck="false">
                    <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
                    ${mark}
                </div>
            </div>
            <div class="price-field-foot">${foot}</div>
        </div>
    `;
}

export function priceMarkHtml(mark) {
    if (!mark?.label) {
        return '';
    }
    return `<span class="price-field-mark farming-seed-mark float-cut is-${escapeHtml(mark.tone)}">${escapeHtml(mark.label)}</span>`;
}

export function setPriceFieldMeta(stackOrField, meta) {
    const stack = stackOrField?.closest?.('.price-field-stack') ?? stackOrField;
    const el = stack?.querySelector?.('.price-field-meta');
    if (!el) {
        return;
    }
    if (meta) {
        el.textContent = meta;
        el.classList.remove('is-empty');
        el.removeAttribute('aria-hidden');
    } else {
        el.innerHTML = '&nbsp;';
        el.classList.add('is-empty');
        el.setAttribute('aria-hidden', 'true');
    }
}

export function priceSideToggleHtml(name, selected) {
    return PRICE_SIDES.map((side) => {
        const pressed = side === selected;
        return `
            <button type="button" class="price-side-btn${pressed ? ' is-active' : ''}"
                data-price-for="${escapeHtml(name)}" data-price-side="${side}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${side === 'buy' ? 'Buy' : 'Sell'}
            </button>
        `;
    }).join('');
}
