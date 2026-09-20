import { escapeHtml } from './utils.js';
import { getPlants, getAnimals } from './catalog.js';
import { itemIconHtml } from './item-icon.js';
import { getPlantPickerStyle } from './settings.js';

const PLANT_GROUPS = [
    { id: 'crop', label: 'Ekin', filter: (item) => item.kind === 'crop', tierSlots: true },
    { id: 'herb', label: 'Ot', filter: (item) => item.kind === 'herb', tierSlots: true }
];

function animalGroups(plotType) {
    return plotType === 'pasture'
        ? [
            { id: 'livestock', label: 'Çiftlik hayvanları', filter: (item) => item.kind === 'livestock' },
            { id: 'horse', label: 'Atlar', filter: (item) => item.key.startsWith('horse-') },
            { id: 'ox', label: 'Öküzler', filter: (item) => item.key.startsWith('ox-') }
        ]
        : [
            { id: 'kennel', label: 'Kennel hayvanları', filter: (item) => item.kind === 'mount' },
            { id: 'faction-t5', label: 'Faction T5', filter: (item) => item.kind === 'faction-mount' && Number(item.tier) === 5 },
            { id: 'faction-t8', label: 'Faction T8', filter: (item) => item.kind === 'faction-mount' && Number(item.tier) === 8 }
        ];
}

function optionsHtml(items, groups, selected) {
    const options = (list) => list.map((item) => {
        const selectedAttr = item.key === selected ? ' selected' : '';
        return `<option value="${escapeHtml(item.key)}"${selectedAttr}>T${item.tier} ${escapeHtml(item.label)}</option>`;
    }).join('');
    return `
        <option value="">Seçin</option>
        ${groups.map((group) => {
            const list = items.filter(group.filter);
            return list.length ? `<optgroup label="${escapeHtml(group.label)}">${options(list)}</optgroup>` : '';
        }).join('')}
    `;
}

function renderIconNode(item, selected, iconId) {
    const pressed = item.key === selected;
    const title = `T${item.tier} ${item.label}`;
    return `
        <button type="button"
            class="plant-icon-node is-item-tier-${Number(item.tier) || 2}${pressed ? ' is-selected' : ''}"
            data-picker-value="${escapeHtml(item.key)}"
            aria-pressed="${pressed ? 'true' : 'false'}"
            aria-label="${escapeHtml(title)}"
            title="${escapeHtml(title)}">
            ${iconId ? itemIconHtml(iconId, { size: 96, className: 'item-icon plant-icon-node-img' }) : `<span class="plant-icon-node-fallback">T${item.tier}</span>`}
        </button>
    `;
}

function renderIconRows(items, groups, selected, iconIdFor) {
    return groups.map((group) => {
        const list = items.filter(group.filter);
        if (!list.length) return '';
        const slots = group.tierSlots
            ? Array.from({ length: 8 }, (_, index) => list.find((item) => Number(item.tier) === index + 1) ?? null)
            : list;
        return `
            <div class="plant-icon-row" role="presentation" data-picker-group="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.label)}">
                ${slots.map((item) => item
                    ? renderIconNode(item, selected, iconIdFor(item))
                    : '<span class="plant-icon-slot is-empty" aria-hidden="true"></span>'
                ).join('')}
            </div>
        `;
    }).join('');
}

function pickerFieldHtml({ items, groups, iconIdFor, id, label, selected = '', className = 'farming-city-field', name = id }) {
    if (getPlantPickerStyle() === 'icons') {
        return `
            <div class="plant-field plant-field--icons ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
                <span class="plant-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="plant-icon-picker" role="radiogroup" aria-labelledby="${escapeHtml(id)}-label">
                    ${renderIconRows(items, groups, selected, iconIdFor)}
                </div>
                <input type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(selected ?? '')}" data-plant-input>
            </div>
        `;
    }
    return `
        <div class="form-floating plant-field plant-field--standard ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
            <select class="form-select${selected ? ' is-filled' : ''}" id="${escapeHtml(id)}" name="${escapeHtml(name)}" data-plant-input required>
                ${optionsHtml(items, groups, selected)}
            </select>
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

export function plantFieldHtml(opts) {
    return pickerFieldHtml({
        ...opts,
        label: opts.label ?? 'Bitki',
        items: getPlants(),
        groups: PLANT_GROUPS,
        iconIdFor: (item) => item.plantId || item.seedId
    });
}

export function animalFieldHtml(opts) {
    const plotType = opts.plotType || 'pasture';
    return pickerFieldHtml({
        ...opts,
        label: opts.label ?? 'Hayvan',
        items: getAnimals({ plotType }),
        groups: animalGroups(plotType),
        iconIdFor: (item) => item.grownId || item.babyId
    });
}

export function getPlantFieldValue(container, id) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    return field?.querySelector('[data-plant-input]')?.value
        || field?.querySelector('.plant-icon-node.is-selected')?.dataset.pickerValue
        || '';
}

export function setPlantFieldValue(container, id, value) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    const input = field?.querySelector('[data-plant-input]');
    if (input) {
        input.value = value ?? '';
        input.setAttribute('value', value ?? '');
    }
    if (!field?.classList.contains('plant-field--icons')) {
        input?.classList.toggle('is-filled', Boolean(value));
        return;
    }
    field.querySelectorAll('.plant-icon-node').forEach((node) => {
        const pressed = node.dataset.pickerValue === value;
        node.classList.toggle('is-selected', pressed);
        node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
}

export function bindPlantField(container, id, onChange) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    if (!field || field.dataset.plantBound === 'on') return;
    field.dataset.plantBound = 'on';
    if (field.classList.contains('plant-field--icons')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.plant-icon-node');
            if (!node || !field.contains(node)) return;
            const value = node.dataset.pickerValue || '';
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

export const setAnimalFieldValue = setPlantFieldValue;
export const bindAnimalField = bindPlantField;
