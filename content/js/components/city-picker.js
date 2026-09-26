import { escapeHtml } from '../utils/utils.js';
import { getAll } from '../db/store.js';
import { loadActiveCities } from '../core/cities.js';
import { getCityPickerStyle } from '../core/settings.js';

/** Map positions — geographic bias, Brecilien bottom-right; edge inset for rings. */
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

function mapPos(city) {
    return CITY_MAP_POS[cityKey(city)] || { x: 50, y: 50 };
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
                data-city-key="${escapeHtml(cityKey(city))}"
                style="--city-color:${escapeHtml(color)};--x:${pos.x}%;--y:${pos.y}%;"
                aria-pressed="${pressed ? 'true' : 'false'}"
                aria-label="${escapeHtml(title)}"
                title="${escapeHtml(title)}">
                <span class="city-map-tip" aria-hidden="true">${escapeHtml(city.displayName)}</span>
            </button>
        `;
    }).join('');
}

function applyNodeDecor(node, city, selected, decorate) {
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
 * Shared city field — standard &lt;select&gt; or diagonal colored map (settings).
 * @param {{ id: string, label: string, selected: string, cities?: object[], className?: string, decorate?: Function }} opts
 */
export function cityFieldHtml(opts) {
    const {
        id,
        label,
        selected,
        cities = loadActiveCities(),
        className = 'farming-city-field',
        decorate
    } = opts;

    const style = getCityPickerStyle();
    const list = Array.isArray(cities) ? cities : loadActiveCities();

    if (style === 'diagonal') {
        return `
            <div class="city-field city-field--diagonal ${escapeHtml(className)}" data-city-field="${escapeHtml(id)}">
                <span class="city-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="city-map" role="radiogroup" aria-labelledby="${escapeHtml(id)}-label">
                    ${renderDiagonalNodes(list, selected, decorate)}
                </div>
                <input type="hidden" id="${escapeHtml(id)}" value="${escapeHtml(selected ?? '')}" data-city-input>
            </div>
        `;
    }

    return `
        <div class="form-floating city-field city-field--standard ${escapeHtml(className)}" data-city-field="${escapeHtml(id)}">
            <select class="form-select is-filled" id="${escapeHtml(id)}" data-city-input>
                ${renderStandardOptions(list, selected, decorate)}
            </select>
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

export function getCityFieldValue(container, id) {
    const input = container.querySelector(`#${CSS.escape(id)}`);
    return input?.value ?? '';
}

export function setCityFieldValue(container, id, value) {
    const field = container.querySelector(`[data-city-field="${CSS.escape(id)}"]`);
    const input = container.querySelector(`#${CSS.escape(id)}`);
    if (input) {
        input.value = value ?? '';
    }
    if (!field?.classList.contains('city-field--diagonal')) {
        return;
    }
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
    const list = Array.isArray(opts.cities) ? opts.cities : loadActiveCities();
    const selected = opts.selected;
    const decorate = opts.decorate;

    if (field.classList.contains('city-field--diagonal')) {
        const input = field.querySelector('[data-city-input]');
        if (input) {
            input.value = selected ?? '';
        }
        const byValue = new Map(list.map((city) => [city.marketApiName, city]));
        field.querySelectorAll('.city-map-node').forEach((node) => {
            const city = byValue.get(node.dataset.cityValue);
            if (city) {
                applyNodeDecor(node, city, selected, decorate);
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

export function bindCityField(container, id, onChange) {
    const field = container.querySelector(`[data-city-field="${CSS.escape(id)}"]`);
    if (!field || field.dataset.cityBound === 'on') {
        return;
    }
    field.dataset.cityBound = 'on';

    if (field.classList.contains('city-field--diagonal')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.city-map-node');
            if (!node || !field.contains(node)) {
                return;
            }
            const value = node.dataset.cityValue || '';
            setCityFieldValue(container, id, value);
            onChange?.(value);
        });
        return;
    }

    field.querySelector('select')?.addEventListener('change', (event) => {
        onChange?.(event.target.value);
    });
}
