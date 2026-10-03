import { escapeHtml } from '../utils/utils.js';
import { getAll } from '../db/store.js';
import { loadActiveCities, orderCities } from '../core/cities.js';
import { getCityPickerStyle, cityHasIsland } from '../core/settings.js';

export function cityIslandDecorate(city) {
    return cityHasIsland(city.marketApiName) ? {} : { muted: true, hint: 'ada yok' };
}

const CITY_MAP_POS = {
    thetford: { x: 20, y: 18 },
    fortsterling: { x: 76, y: 16 },
    martlock: { x: 16, y: 48 },
    caerleon: { x: 46, y: 44 },
    lymhurst: { x: 82, y: 50 },
    bridgewatch: { x: 44, y: 80 },
    brecilien: { x: 82, y: 82 }
};

const FALLBACK_COLORS = {
    bridgewatch: '#e0a04a',
    fortsterling: '#c5d4e8',
    lymhurst: '#5ecf7a',
    martlock: '#5aa8e8',
    thetford: '#b07ae8',
    caerleon: '#e85a5a',
    brecilien: '#6ec9c0'
};

function cityKey(city) {
    const raw = city?.name || city?.marketApiName || city?.displayName || '';
    return String(raw).toLowerCase().replace(/[\s_-]+/g, '');
}

function colorRows() {
    return getAll('cityColors');
}

function mapPos(city) {
    return CITY_MAP_POS[cityKey(city)] || { x: 50, y: 50 };
}

export function cityColorHex(city) {
    if (!city) {
        return 'var(--color-primary)';
    }
    const id = Number(city.id);
    const row = colorRows().find((entry) => Number(entry.cityId) === id);
    if (row?.colorHex) {
        return row.colorHex;
    }
    return FALLBACK_COLORS[cityKey(city)] || 'var(--color-primary)';
}

function optionMeta(city, decorate) {
    if (typeof decorate !== 'function') {
        return { muted: false, hint: '', attrs: '' };
    }
    const meta = decorate(city) || {};
    const muted = Boolean(meta.muted);
    const hint = meta.hint ? String(meta.hint) : '';
    const attrs = [
        muted ? ' data-muted="1"' : '',
        hint ? ` data-hint="${escapeHtml(hint)}"` : ''
    ].join('');
    return { muted, hint, attrs };
}

function renderStandardOptions(cities, selected, decorate) {
    return cities.map((city) => {
        const current = city.marketApiName === selected ? ' selected' : '';
        const { hint, attrs } = optionMeta(city, decorate);
        const suffix = hint ? ` · ${hint}` : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${current}${attrs}>${escapeHtml(city.displayName)}${escapeHtml(suffix)}</option>`;
    }).join('');
}

function orderedCities(cities) {
    return orderCities(cities);
}

function renderHorizontalNodes(cities, selected, decorate, crests = false) {
    return cities.map((city) => {
        const color = cityColorHex(city);
        const pressed = city.marketApiName === selected;
        const { muted, hint } = optionMeta(city, decorate);
        const title = hint ? `${city.displayName} (${hint})` : city.displayName;
        return `
            <button type="button"
                class="city-map-node city-map-node--horizontal${pressed ? ' is-selected' : ''}${muted ? ' is-muted' : ''}"
                data-city-value="${escapeHtml(city.marketApiName)}"
                data-city-key="${escapeHtml(cityKey(city))}"
                style="--city-color:${escapeHtml(color)};"
                aria-pressed="${pressed ? 'true' : 'false'}"
                aria-label="${escapeHtml(title)}"
                title="${escapeHtml(title)}">
                ${crests ? `<img class="city-crest" src="assets/cities/${escapeHtml(cityKey(city))}.png" alt="" aria-hidden="true">` : ''}
                <span class="city-map-tip" aria-hidden="true">${escapeHtml(city.displayName)}</span>
            </button>
        `;
    }).join('');
}

function renderDiagonalNodes(cities, selected, decorate) {
    return cities.map((city) => {
        const pos = mapPos(city);
        const color = cityColorHex(city);
        const pressed = city.marketApiName === selected;
        const { muted, hint } = optionMeta(city, decorate);
        const title = hint ? `${city.displayName} (${hint})` : city.displayName;
        return `
            <button type="button"
                class="city-map-node${pressed ? ' is-selected' : ''}${muted ? ' is-muted' : ''}"
                data-city-value="${escapeHtml(city.marketApiName)}"
                style="--city-color:${escapeHtml(color)};--x:${pos.x}%;--y:${pos.y}%;"
                aria-pressed="${pressed ? 'true' : 'false'}"
                aria-label="${escapeHtml(title)}"
                title="${escapeHtml(title)}">
                <span class="city-map-tip" aria-hidden="true">${escapeHtml(city.displayName)}</span>
            </button>
        `;
    }).join('');
}

function applyDiagonalNodeDecor(node, city, selected, decorate) {
    const pressed = city.marketApiName === selected;
    const { muted, hint } = optionMeta(city, decorate);
    const title = hint ? `${city.displayName} (${hint})` : city.displayName;
    node.classList.toggle('is-selected', pressed);
    node.classList.toggle('is-muted', muted);
    node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    node.setAttribute('aria-label', title);
    node.title = title;
    const tip = node.querySelector('.city-map-tip');
    if (tip) {
        tip.textContent = city.displayName;
    }
}

/**
 * Shared city field — list, map, horizontal dots, or compact city crests.
 * @param {{ id: string, label: string, selected: string, cities?: object[], className?: string, decorate?: Function, disabled?: boolean }} opts
 */
export function cityFieldHtml(opts) {
    const {
        id,
        label,
        selected,
        cities = loadActiveCities(),
        className = 'farming-city-field',
        decorate,
        order,
        disabled = false
    } = opts;

    const style = getCityPickerStyle();
    const list = orderedCities(Array.isArray(cities) ? cities : loadActiveCities(), order);

    if (style === 'buttons' || style === 'crests') {
        return `
            <div class="city-field city-field--horizontal${style === 'crests' ? ' city-field--crests' : ''} ${escapeHtml(className)}" data-city-field="${escapeHtml(id)}" data-city-disabled="${disabled}">
                <span class="city-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="city-map city-map--horizontal" role="group" aria-labelledby="${escapeHtml(id)}-label" style="--city-picker-count:${list.length}">
                    ${renderHorizontalNodes(list, selected, decorate, style === 'crests')}
                </div>
                <input type="hidden" value="${escapeHtml(selected ?? '')}" data-city-input>
            </div>
        `;
    }

    if (style === 'diagonal') {
        return `
            <div class="city-field city-field--diagonal ${escapeHtml(className)}" data-city-field="${escapeHtml(id)}" data-city-disabled="${disabled}">
                <span class="city-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="city-map" role="group" aria-labelledby="${escapeHtml(id)}-label">
                    ${renderDiagonalNodes(list, selected, decorate)}
                </div>
                <input type="hidden" value="${escapeHtml(selected ?? '')}" data-city-input>
            </div>
        `;
    }

    return `
        <div class="form-floating city-field city-field--standard ${escapeHtml(className)}" data-city-field="${escapeHtml(id)}">
            <select class="form-select is-filled" id="${escapeHtml(id)}" data-city-input${disabled ? ' disabled' : ''}>
                ${renderStandardOptions(list, selected, decorate)}
            </select>
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

export function getCityFieldValue(container, id) {
    const input = container.querySelector(`[data-city-field="${CSS.escape(id)}"] [data-city-input]`);
    return input?.value ?? '';
}

// The first city field represents the tool's operating city; secondary market
// fields must not overwrite it when a page has separate buy / sell selections.
function syncCityBackground(container) {
    const value = container.querySelector('[data-city-field] [data-city-input]')?.value;
    const city = String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
    for (const className of [...container.classList]) {
        if (className.startsWith('city-selected--')) container.classList.remove(className);
    }
    container.classList.toggle('city-selected', Boolean(city));
    if (city) container.classList.add(`city-selected--${city}`);
}

export function setCityFieldValue(container, id, value) {
    const field = container.querySelector(`[data-city-field="${CSS.escape(id)}"]`);
    const input = container.querySelector(`[data-city-field="${CSS.escape(id)}"] [data-city-input]`);
    if (input) {
        input.value = value ?? '';
    }
    syncCityBackground(container);
    if (!field?.classList.contains('city-field--horizontal') && !field?.classList.contains('city-field--diagonal')) {
        return;
    }
    field.querySelectorAll('.city-map-node--horizontal').forEach((node) => {
        const pressed = node.dataset.cityValue === value;
        node.classList.toggle('is-selected', pressed);
        node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    field.querySelectorAll('.city-map-node').forEach((node) => {
        const pressed = node.dataset.cityValue === value;
        node.classList.toggle('is-selected', pressed);
        node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

/** Update selection / option labels without destroying event bindings. */
export function syncCityField(container, id, opts) {
    const field = container.querySelector(`[data-city-field="${CSS.escape(id)}"]`);
    if (!field) {
        return;
    }
    const list = orderedCities(Array.isArray(opts.cities) ? opts.cities : loadActiveCities(), opts.order);
    const selected = opts.selected;
    const decorate = opts.decorate;
    setCityFieldValue(container, id, selected);

    if (field.classList.contains('city-field--horizontal')) {
        const input = field.querySelector('[data-city-input]');
        if (input) {
            input.value = selected ?? '';
        }
        const map = field.querySelector('.city-map--horizontal');
        if (map) {
            map.style.setProperty('--city-picker-count', String(list.length));
            map.innerHTML = renderHorizontalNodes(list, selected, decorate, field.classList.contains('city-field--crests'));
            map.querySelectorAll('button').forEach((node) => { node.disabled = field.dataset.cityDisabled === 'true'; });
        }
        return;
    }

    if (field.classList.contains('city-field--diagonal')) {
        const input = field.querySelector('[data-city-input]');
        if (input) {
            input.value = selected ?? '';
        }
        const byValue = new Map(list.map((city) => [city.marketApiName, city]));
        field.querySelectorAll('.city-map-node').forEach((node) => {
            const city = byValue.get(node.dataset.cityValue);
            if (city) {
                applyDiagonalNodeDecor(node, city, selected, decorate);
            }
        });
        return;
    }

    const select = field.querySelector('select');
    if (select) {
        select.innerHTML = renderStandardOptions(list, selected, decorate);
        select.value = selected ?? '';
        select.classList.toggle('is-filled', Boolean(selected));
    }
}

const cityChangeHandlers = new WeakMap();

function changeCityField(container, field, value) {
    const fields = [...container.querySelectorAll('[data-city-field]')];
    // Snapshot bindings before callbacks: a tool may render new fields on change.
    const targets = (fields[0] === field ? fields : [field]).filter((target) => {
        const input = target.querySelector('[data-city-input]');
        if (!input || input.disabled || target.dataset.cityDisabled === 'true') return false;
        return input.tagName === 'SELECT'
            ? [...input.options].some((option) => option.value === value && !option.disabled)
            : [...target.querySelectorAll('[data-city-value]')].some((node) => node.dataset.cityValue === value && !node.disabled);
    }).map((target) => ({ id: target.dataset.cityField, onChange: cityChangeHandlers.get(target) }));
    for (const target of targets) {
        setCityFieldValue(container, target.id, value);
        target.onChange?.(value);
    }
}

export function bindCityField(container, id, onChange) {
    const field = container.querySelector(`[data-city-field="${CSS.escape(id)}"]`);
    syncCityBackground(container);
    if (!field || field.dataset.cityBound === 'on') {
        return;
    }
    cityChangeHandlers.set(field, onChange);
    field.dataset.cityBound = 'on';
    field.querySelectorAll('button').forEach((node) => { node.disabled = field.dataset.cityDisabled === 'true'; });

    if (field.classList.contains('city-field--horizontal')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.city-map-node--horizontal');
            if (!node || node.disabled || !field.contains(node)) {
                return;
            }
            const value = node.dataset.cityValue || '';
            changeCityField(container, field, value);
        });
        return;
    }

    if (field.classList.contains('city-field--diagonal')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.city-map-node');
            if (!node || node.disabled || !field.contains(node)) {
                return;
            }
            const value = node.dataset.cityValue || '';
            changeCityField(container, field, value);
        });
        return;
    }

    field.querySelector('select')?.addEventListener('change', (event) => {
        changeCityField(container, field, event.target.value);
    });
}
