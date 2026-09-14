import { escapeHtml } from './utils.js';
import { getPlants } from './catalog.js';
import { itemIconHtml } from './item-icon.js';
import { getPlantPickerStyle } from './settings.js';

const GROUPS = [
    { kind: 'crop', label: 'Ekin' },
    { kind: 'herb', label: 'Ot' }
];

function plantOptionsHtml(selected) {
    const plants = getPlants();
    const opt = (list) => list.map((plant) => {
        const sel = plant.key === selected ? ' selected' : '';
        return `<option value="${escapeHtml(plant.key)}"${sel}>T${plant.tier} ${escapeHtml(plant.label)}</option>`;
    }).join('');

    return `
        <option value="">Seçin</option>
        ${GROUPS.map((group) => {
            const list = plants.filter((plant) => plant.kind === group.kind);
            if (!list.length) {
                return '';
            }
            return `<optgroup label="${escapeHtml(group.label)}">${opt(list)}</optgroup>`;
        }).join('')}
    `;
}

function renderIconNode(plant, selected) {
    const pressed = plant.key === selected;
    const iconId = plant.plantId || plant.seedId;
    const title = `T${plant.tier} ${plant.label}`;
    return `
        <button type="button"
            class="plant-icon-node is-item-tier-${Number(plant.tier) || 2}${pressed ? ' is-selected' : ''}"
            data-plant-value="${escapeHtml(plant.key)}"
            aria-pressed="${pressed ? 'true' : 'false'}"
            aria-label="${escapeHtml(title)}"
            title="${escapeHtml(title)}">
            ${iconId ? itemIconHtml(iconId, { size: 96, className: 'item-icon plant-icon-node-img' }) : `<span class="plant-icon-node-fallback">T${plant.tier}</span>`}
        </button>
    `;
}

function renderIconRows(selected) {
    const plants = getPlants();
    return GROUPS.map((group) => {
        const list = plants.filter((plant) => plant.kind === group.kind);
        if (!list.length) {
            return '';
        }
        const slots = Array.from({ length: 8 }, (_, index) => {
            const tier = index + 1;
            return list.find((plant) => Number(plant.tier) === tier) ?? null;
        });
        return `
            <div class="plant-icon-row" role="presentation" data-plant-kind="${escapeHtml(group.kind)}" aria-label="${escapeHtml(group.label)}">
                ${slots.map((plant) => (plant
                    ? renderIconNode(plant, selected)
                    : '<span class="plant-icon-slot is-empty" aria-hidden="true"></span>'
                )).join('')}
            </div>
        `;
    }).join('');
}

/**
 * Shared plant field — standard &lt;select&gt; or icon rows (settings).
 * @param {{ id: string, label?: string, selected?: string, className?: string, name?: string }} opts
 */
export function plantFieldHtml(opts) {
    const {
        id,
        label = 'Bitki',
        selected = '',
        className = 'farming-city-field',
        name = id
    } = opts;

    const style = getPlantPickerStyle();

    if (style === 'icons') {
        return `
            <div class="plant-field plant-field--icons ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
                <span class="plant-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="plant-icon-picker" role="radiogroup" aria-labelledby="${escapeHtml(id)}-label">
                    ${renderIconRows(selected)}
                </div>
                <input type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(selected ?? '')}" data-plant-input>
            </div>
        `;
    }

    return `
        <div class="form-floating plant-field plant-field--standard ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
            <select class="form-select${selected ? ' is-filled' : ''}" id="${escapeHtml(id)}" name="${escapeHtml(name)}" data-plant-input required>
                ${plantOptionsHtml(selected)}
            </select>
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

export function getPlantFieldValue(container, id) {
    const input = container.querySelector(`#${CSS.escape(id)}`);
    return input?.value ?? '';
}

export function setPlantFieldValue(container, id, value) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    const input = container.querySelector(`#${CSS.escape(id)}`);
    if (input) {
        input.value = value ?? '';
    }
    if (!field?.classList.contains('plant-field--icons')) {
        if (input) {
            input.classList.toggle('is-filled', Boolean(value));
        }
        return;
    }
    field.querySelectorAll('.plant-icon-node').forEach((node) => {
        const pressed = node.dataset.plantValue === value;
        node.classList.toggle('is-selected', pressed);
        node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

export function bindPlantField(container, id, onChange) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    if (!field || field.dataset.plantBound === 'on') {
        return;
    }
    field.dataset.plantBound = 'on';

    if (field.classList.contains('plant-field--icons')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.plant-icon-node');
            if (!node || !field.contains(node)) {
                return;
            }
            const value = node.dataset.plantValue || '';
            setPlantFieldValue(container, id, value);
            onChange?.(value);
        });
        return;
    }

    field.querySelector('select')?.addEventListener('change', (event) => {
        event.target.classList.toggle('is-filled', Boolean(event.target.value));
        onChange?.(event.target.value);
    });
}
