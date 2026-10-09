import { escapeHtml } from '../utils/utils.js';
import { getPlants, getAnimals } from '../core/catalog.js';
import { itemIconHtml } from './item-icon.js';
import { getPlantPickerStyle } from '../core/settings.js';

const PLANT_GROUPS = [
    { id: 'crop', label: 'Ekin', tabLabel: 'Ekin tohumları', filter: (item) => item.kind === 'crop', tierSlots: true },
    { id: 'herb', label: 'Ot', tabLabel: 'Ot tohumları', filter: (item) => item.kind === 'herb', tierSlots: true }
];

function animalGroups(plotType) {
    return plotType === 'pasture'
        ? [
            { id: 'livestock', label: 'Çiftlik hayvanları', filter: (item) => item.kind === 'livestock', tierSlots: true },
            { id: 'horse', label: 'Atlar', filter: (item) => item.key.startsWith('horse-'), tierSlots: true },
            { id: 'ox', label: 'Öküzler', filter: (item) => item.key.startsWith('ox-'), tierSlots: true }
        ]
        : [
            { id: 'faction-t5', label: 'Faction T5', filter: (item) => item.kind === 'faction-mount' && Number(item.tier) === 5 },
            { id: 'faction-t8', label: 'Faction T8', filter: (item) => item.kind === 'faction-mount' && Number(item.tier) === 8 },
            { id: 'kennel', label: 'Kennel hayvanları', filter: (item) => item.kind === 'mount', tierSlots: true }
        ];
}

export function pickerGroupsForKind(kind = 'plant') {
    return kind === 'plant' ? PLANT_GROUPS : animalGroups(kind);
}

// Ada çıktı ekranındaki her görünüm aynı sıra bilgisini kullanır. Pasture
// ürünleri, ait oldukları çiftlik hayvanı grubunun hemen sonrasında gelir.
export function outputGroupsForKind(kind = 'plant') {
    const groups = pickerGroupsForKind(kind).map((group) => ({
        ...group,
        itemType: kind === 'plant' ? 'plant' : 'animal'
    }));
    if (kind === 'pasture') {
        groups.splice(1, 0, {
            id: 'animal-product',
            label: 'Üretilen ürünler',
            tabLabel: 'Üretilen ürünler',
            itemType: 'animalProduct',
            tierSlots: true,
            filter: (item) => item.kind === 'livestock' && Boolean(item.productId)
        });
    }
    return groups;
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

function renderIconNode(item, selected, iconId, selectedOutputMode = 'offspring') {
    const pressed = item.key === selected && selectedOutputMode === 'offspring';
    const title = `T${item.tier} ${item.label}`;
    return `
        <button type="button"
            class="plant-icon-node${pressed ? ' is-selected' : ''}"
            data-tier="${Number(item.tier) || 2}"
            data-picker-value="${escapeHtml(item.key)}"
            aria-pressed="${pressed ? 'true' : 'false'}"
            aria-label="${escapeHtml(title)}"
            title="${escapeHtml(title)}">
            ${iconId ? itemIconHtml(iconId, { size: 96, className: 'item-icon plant-icon-node-img' }) : `<span class="plant-icon-node-fallback">T${item.tier}</span>`}
        </button>
    `;
}

function renderEmptyIconNode(tier) {
    return `<button type="button" class="plant-icon-node is-empty" disabled aria-label="T${tier} mevcut değil" title="T${tier} mevcut değil"><span class="plant-icon-node-fallback">T${tier}</span></button>`;
}

function renderIconRows(items, groups, selected, iconIdFor, includeAnimalProducts = false, selectedOutputMode = 'offspring', outputGroupKind = null, pickerKind = null) {
    const outputGroups = includeAnimalProducts
        ? outputGroupsForKind(outputGroupKind)
        : groups;
    const kindAttr = pickerKind ? ` data-picker-kind="${escapeHtml(pickerKind)}"` : '';
    return outputGroups.map((group) => {
        const list = items.filter(group.filter);
        if (!list.length) return '';
        if (group.itemType === 'animalProduct') {
            return renderAnimalProductRow(list, selected, group.tierSlots, selectedOutputMode, pickerKind);
        }
        const slots = group.tierSlots
            ? Array.from({ length: 8 }, (_, index) => list.find((item) => Number(item.tier) === index + 1) ?? null)
            : list;
        const animalRow = `
            <div class="plant-icon-row" role="presentation" data-picker-group="${escapeHtml(group.id)}"${kindAttr} aria-label="${escapeHtml(group.label)}">
                ${slots.map((item, index) => item
                    ? renderIconNode(item, selected, iconIdFor(item), selectedOutputMode)
                    : renderEmptyIconNode(index + 1)
                ).join('')}
            </div>
        `;
        return animalRow;
    }).join('');
}

function renderAnimalProductRow(items, selected, tierSlots = false, selectedOutputMode = 'offspring', pickerKind = null) {
    if (!items.some((item) => item.productId)) return '';
    const slots = tierSlots
        ? Array.from({ length: 8 }, (_, index) => items.find((item) => Number(item.tier) === index + 1) ?? null)
        : items;
    const kindAttr = pickerKind ? ` data-picker-kind="${escapeHtml(pickerKind)}"` : '';
    return `
        <div class="plant-icon-row plant-icon-row--products" role="presentation"${kindAttr} aria-label="Üretilen ürünler">
            ${slots.map((item, index) => item?.productId ? `
                    <button type="button" class="plant-icon-node plant-icon-node--product${item.key === selected && selectedOutputMode === 'product' ? ' is-selected' : ''}"
                        data-tier="${Number(item.tier) || 2}" data-picker-value="${escapeHtml(item.key)}" data-animal-output="product"
                        aria-pressed="${item.key === selected && selectedOutputMode === 'product' ? 'true' : 'false'}" aria-label="${escapeHtml(item.productLabel || item.label)}"
                        title="${escapeHtml(item.productLabel || item.label)}">
                        ${itemIconHtml(item.productId, { size: 96, className: 'item-icon plant-icon-node-img' })}
                    </button>
            ` : renderEmptyIconNode(index + 1)).join('')}
        </div>
    `;
}

function pickerFieldHtml({ items, groups, iconIdFor, id, label, selected = '', selectedOutputMode = 'offspring', className = 'farming-city-field', name = id, includeAnimalProducts = false, outputGroupKind = null }) {
    if (getPlantPickerStyle() === 'icons') {
        return `
            <div class="plant-field plant-field--icons ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
                <span class="plant-field-label" id="${escapeHtml(id)}-label">${escapeHtml(label)}</span>
                <div class="plant-icon-picker" role="radiogroup" aria-labelledby="${escapeHtml(id)}-label">
                    ${renderIconRows(items, groups, selected, iconIdFor, includeAnimalProducts, selectedOutputMode, outputGroupKind)}
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
        groups: pickerGroupsForKind('plant'),
        iconIdFor: (item) => item.plantId || item.seedId
    });
}

export function animalFieldHtml(opts) {
    const plotType = opts.plotType || 'pasture';
    return pickerFieldHtml({
        ...opts,
        label: opts.label ?? 'Çıktı',
        items: getAnimals({ plotType }),
        groups: pickerGroupsForKind(plotType),
        iconIdFor: (item) => item.grownId || item.babyId,
        includeAnimalProducts: true,
        outputGroupKind: plotType
    });
}

const ISLAND_YIELD_SECTIONS = [
    {
        kind: 'plant',
        label: 'Tarla',
        defaultOpen: true,
        items: () => getPlants(),
        groups: () => pickerGroupsForKind('plant'),
        iconIdFor: (item) => item.plantId || item.seedId,
        includeAnimalProducts: false
    },
    {
        kind: 'pasture',
        label: 'Pasture',
        defaultOpen: true,
        items: () => getAnimals({ plotType: 'pasture' }),
        groups: () => pickerGroupsForKind('pasture'),
        iconIdFor: (item) => item.grownId || item.babyId,
        includeAnimalProducts: true
    },
    {
        kind: 'kennel',
        label: 'Kennel',
        defaultOpen: false,
        items: () => getAnimals({ plotType: 'kennel' }),
        groups: () => pickerGroupsForKind('kennel'),
        iconIdFor: (item) => item.grownId || item.babyId,
        includeAnimalProducts: true
    }
];

export function islandYieldSections() {
    return ISLAND_YIELD_SECTIONS.map(({ kind, label }) => ({ kind, label }));
}

export function kindForIslandYieldKey(key) {
    if (!key) return null;
    if (getPlants().some((item) => item.key === key)) return 'plant';
    const animal = getAnimals().find((item) => item.key === key);
    return animal?.plotType === 'kennel' ? 'kennel' : animal ? 'pasture' : null;
}

function islandYieldOptionsHtml(selected) {
    const options = (list) => list.map((item) => {
        const selectedAttr = item.key === selected ? ' selected' : '';
        return `<option value="${escapeHtml(item.key)}"${selectedAttr}>T${item.tier} ${escapeHtml(item.label)}</option>`;
    }).join('');
    return `
        <option value="">Seçin</option>
        ${ISLAND_YIELD_SECTIONS.map((section) => {
            const items = section.items();
            return section.groups().map((group) => {
                const list = items.filter(group.filter);
                return list.length
                    ? `<optgroup label="${escapeHtml(section.label)} · ${escapeHtml(group.label)}">${options(list)}</optgroup>`
                    : '';
            }).join('');
        }).join('')}
    `;
}

export function islandYieldFieldHtml(opts = {}) {
    const id = opts.id ?? 'plantKey';
    const name = opts.name ?? id;
    const selected = opts.selected ?? '';
    const selectedOutputMode = opts.selectedOutputMode ?? 'offspring';
    const className = opts.className ?? 'farming-city-field';
    if (getPlantPickerStyle() === 'icons') {
        return `
            <div class="plant-field plant-field--icons plant-field--island-yield ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
                <div class="plant-icon-picker" role="radiogroup" aria-label="Ada çıktısı">
                    ${ISLAND_YIELD_SECTIONS.map((section) => `
                        <details class="plant-field-section" data-picker-kind="${escapeHtml(section.kind)}"${section.defaultOpen ? ' open' : ''}>
                            <summary class="plant-field-section-title">
                                ${escapeHtml(section.label)}
                                <span class="plant-field-section-indicator" aria-hidden="true">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" focusable="false"><path d="m6 3 5 5-5 5"/></svg>
                                </span>
                            </summary>
                            <div class="plant-field-section-content">
                            ${renderIconRows(
                                section.items(),
                                section.groups(),
                                selected,
                                section.iconIdFor,
                                section.includeAnimalProducts,
                                selectedOutputMode,
                                section.kind,
                                section.kind
                            )}
                            </div>
                        </details>
                    `).join('')}
                </div>
                <input type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(selected)}" data-plant-input>
            </div>
        `;
    }
    return `
        <div class="form-floating plant-field plant-field--standard ${escapeHtml(className)}" data-plant-field="${escapeHtml(id)}">
            <select class="form-select${selected ? ' is-filled' : ''}" id="${escapeHtml(id)}" name="${escapeHtml(name)}" data-plant-input required>
                ${islandYieldOptionsHtml(selected)}
            </select>
            <label for="${escapeHtml(id)}">Çıktı</label>
        </div>
    `;
}

export function getPlantFieldValue(container, id) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    return field?.querySelector('[data-plant-input]')?.value
        || field?.querySelector('.plant-icon-node.is-selected')?.dataset.pickerValue
        || '';
}

export function setPlantFieldValue(container, id, value, outputMode = 'offspring') {
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
        const pressed = node.dataset.pickerValue === value
            && (node.dataset.animalOutput || 'offspring') === outputMode;
        node.classList.toggle('is-selected', pressed);
        node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (pressed) {
            const section = node.closest('details[data-picker-kind]');
            if (section) section.open = true;
        }
    });
}

export function bindPlantField(container, id, onChange) {
    const field = container.querySelector(`[data-plant-field="${CSS.escape(id)}"]`);
    if (!field || field.dataset.plantBound === 'on') return;
    field.dataset.plantBound = 'on';
    if (field.classList.contains('plant-field--icons')) {
        field.addEventListener('click', (event) => {
            const node = event.target.closest('.plant-icon-node');
            if (!node || !field.contains(node) || node.disabled) return;
            const value = node.dataset.pickerValue || '';
            const outputMode = node.dataset.animalOutput || 'offspring';
            const kind = node.closest('[data-picker-kind]')?.dataset.pickerKind || null;
            setPlantFieldValue(container, id, value, outputMode);
            onChange?.(value, outputMode, kind);
        });
        return;
    }
    field.querySelector('select')?.addEventListener('change', (event) => {
        event.target.classList.toggle('is-filled', Boolean(event.target.value));
        onChange?.(event.target.value, 'offspring', kindForIslandYieldKey(event.target.value));
    });
}

export const setAnimalFieldValue = setPlantFieldValue;
export const bindAnimalField = bindPlantField;
