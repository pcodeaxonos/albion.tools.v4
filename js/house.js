import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { initStore } from './db/store.js';
import { itemIconHtml, itemLabel, rawStoneId, stoneBlockId } from './item-icon.js';
import { getBuildings, getRefineTier } from './catalog.js';
import { showPageLoader, hidePageLoader } from './loader.js';

const TIERS = [2, 3, 4, 5, 6, 7, 8];

function refineRaw(tier) {
    return getRefineTier()[tier]?.rawQty ?? 0;
}

function buildingsMap() {
    const map = {};
    for (const building of getBuildings()) {
        map[building.id] = building;
    }
    return map;
}

const state = {
    building: 'house',
    from: 0,
    to: 8,
    qty: 1
};

function formatCount(value) {
    return Number(value).toLocaleString('tr-TR');
}

function emptyMats() {
    return {
        wood: 0,
        stone: 0,
        blocks: Object.fromEntries(TIERS.map((tier) => [tier, 0])),
        raw: Object.fromEntries(TIERS.map((tier) => [tier, 0]))
    };
}

function addStep(mats, building, tier) {
    mats.wood += building.wood[tier] || 0;
    mats.stone += building.stone[tier] || 0;
    mats.blocks[tier] += building.blocks;
    for (const stoneTier of TIERS) {
        if (stoneTier <= tier) {
            mats.raw[stoneTier] += building.blocks * refineRaw(stoneTier);
        }
    }
}

function scaleMats(mats, qty) {
    return {
        wood: mats.wood * qty,
        stone: mats.stone * qty,
        blocks: Object.fromEntries(TIERS.map((tier) => [tier, mats.blocks[tier] * qty])),
        raw: Object.fromEntries(TIERS.map((tier) => [tier, mats.raw[tier] * qty]))
    };
}

function sumRange(building, from, to) {
    const mats = emptyMats();
    for (const tier of TIERS) {
        if (tier > from && tier <= to) {
            addStep(mats, building, tier);
        }
    }
    return mats;
}

function clampState() {
    const qty = Number.parseInt(String(state.qty), 10);
    state.qty = Number.isFinite(qty) ? Math.min(99, Math.max(1, qty)) : 1;

    const buildings = buildingsMap();
    if (!buildings[state.building]) {
        state.building = 'house';
    }

    if (!TIERS.includes(state.to)) {
        state.to = 8;
    }

    if (state.from !== 0 && !TIERS.includes(state.from)) {
        state.from = 0;
    }

    if (state.from >= state.to) {
        state.from = state.to === 2 ? 0 : TIERS.filter((tier) => tier < state.to).at(-1);
    }
}

function rangeLabel(from, to) {
    return from === 0 ? `T${to}` : `T${from} → T${to}`;
}

function qtySuffix() {
    return state.qty > 1 ? ` × ${state.qty}` : '';
}

function remainingTiers(from, to) {
    return TIERS.filter((tier) => tier > from && tier <= to);
}

function renderTypeToggle() {
    return Object.values(buildingsMap()).map((building) => {
        const pressed = building.id === state.building;
        return `
            <button type="button" class="house-type-btn${pressed ? ' is-active' : ''}"
                data-building="${building.id}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(building.label)}
            </button>
        `;
    }).join('');
}

function renderFromOptions() {
    const options = [`<option value="0"${state.from === 0 ? ' selected' : ''}>Yok · yeni</option>`];
    for (const tier of TIERS) {
        if (tier >= state.to) {
            continue;
        }
        const selected = state.from === tier ? ' selected' : '';
        options.push(`<option value="${tier}"${selected}>T${tier}</option>`);
    }
    return options.join('');
}

function renderToOptions() {
    return TIERS.map((tier) => {
        const selected = state.to === tier ? ' selected' : '';
        const disabled = tier <= state.from ? ' disabled' : '';
        return `<option value="${tier}"${selected}${disabled}>T${tier}</option>`;
    }).join('');
}

function needT1Items(mats) {
    return [
        { uniqueName: 'T1_WOOD', label: itemLabel('T1_WOOD'), meta: 'T1 odun', value: mats.wood },
        { uniqueName: 'T1_ROCK', label: itemLabel('T1_ROCK'), meta: 'T1 taş', value: mats.stone }
    ].filter((item) => item.value > 0);
}

function needBlockItems(mats) {
    return TIERS
        .filter((tier) => mats.blocks[tier] > 0)
        .map((tier) => ({
            uniqueName: stoneBlockId(tier),
            label: itemLabel(stoneBlockId(tier)),
            meta: `T${tier} block`,
            value: mats.blocks[tier]
        }));
}

function rawStoneItems(mats) {
    return TIERS
        .filter((tier) => mats.raw[tier] > 0)
        .map((tier) => ({
            uniqueName: rawStoneId(tier),
            label: itemLabel(rawStoneId(tier)),
            meta: `T${tier} ham taş`,
            value: mats.raw[tier]
        }));
}

function renderMatCard(item) {
    return `
        <li class="house-mat">
            ${itemIconHtml(item.uniqueName)}
            <span class="house-mat-text">
                <span class="house-mat-value">${formatCount(item.value)}</span>
                <span class="house-mat-label">${escapeHtml(item.label)}</span>
                <span class="house-mat-meta">${escapeHtml(item.meta)}</span>
            </span>
        </li>
    `;
}

function renderMatList(items, extraClass = '') {
    if (items.length === 0) {
        return '<p class="text-muted">Bu grupta malzeme yok.</p>';
    }

    const className = extraClass ? `house-mats ${extraClass}` : 'house-mats';
    return `<ul class="${className}">${items.map(renderMatCard).join('')}</ul>`;
}

function renderLayers(mats) {
    const t1 = needT1Items(mats);
    const blocks = needBlockItems(mats);
    const raw = rawStoneItems(mats);

    if (t1.length === 0 && blocks.length === 0 && raw.length === 0) {
        return '<p class="text-muted">Bu aralıkta malzeme yok.</p>';
    }

    const parts = [];

    if (t1.length > 0 || blocks.length > 0) {
        parts.push(`
            <div class="house-layer-head house-layer-need">
                <h3>Asıl ihtiyaç</h3>
                <p>Oyunun istediği — yükseltme penceresine koyduğun T1 ve block’lar.</p>
            </div>
            <div class="house-need-col house-need-t1">
                <h4 class="house-need-title">T1</h4>
                ${renderMatList(t1)}
            </div>
            <div class="house-need-col house-need-blocks">
                <h4 class="house-need-title">Block</h4>
                ${renderMatList(blocks)}
            </div>
        `);
    }

    if (raw.length > 0) {
        parts.push(`
            <div class="house-layer-head house-layer-raw">
                <h3>Ham eşdeğer · 0% RR</h3>
                <p>Block’ları sen refine edersen, return rate yok varsayımı. Odun dahil değil.</p>
            </div>
            <div class="house-need-col house-need-raw">
                <h4 class="house-need-title house-need-title-spacer" aria-hidden="true">&nbsp;</h4>
                ${renderMatList(raw, 'house-mats-raw')}
            </div>
        `);
    }

    return `<div class="house-layers">${parts.join('')}</div>`;
}

function renderOutput() {
    const building = buildingsMap()[state.building];
    const needed = scaleMats(sumRange(building, state.from, state.to), state.qty);
    const steps = remainingTiers(state.from, state.to);
    const stepNote = steps.length === 1
        ? `T${state.to} yükseltmesi`
        : `${steps.length} kademe · ${rangeLabel(state.from, state.to)}`;

    return `
        <section class="house-result" id="houseResult" aria-live="polite">
            <div class="house-result-head">
                <h2>Gerekli malzemeler</h2>
                <p>${escapeHtml(building.label)} · ${escapeHtml(stepNote)}${escapeHtml(qtySuffix())}</p>
            </div>

            ${renderLayers(needed)}
        </section>
    `;
}

function refreshOutput(container) {
    const result = container.querySelector('#houseResult');
    if (!result) {
        return;
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#houseResult'));
}

function renderPage(container) {
    clampState();

    container.innerHTML = `
        <section class="house-hero">
            <h1>House</h1>
            <p>Ada evi ve guild hall yükseltmesi. Oyunun istediği T1 + block; yanında isteğe bağlı ham taş (0% RR). Fiyat yok.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <form class="house-calc" id="houseCalc" action="#">
                    <div class="house-type" role="radiogroup" aria-label="Bina">
                        ${renderTypeToggle()}
                    </div>
                    <div class="house-fields">
                        <div class="form-floating">
                            <select class="form-select is-filled" id="houseFrom">${renderFromOptions()}</select>
                            <label for="houseFrom">Mevcut</label>
                        </div>
                        <div class="form-floating">
                            <select class="form-select is-filled" id="houseTo">${renderToOptions()}</select>
                            <label for="houseTo">Hedef</label>
                        </div>
                        <div class="form-floating">
                            <input type="number" class="form-control is-filled" id="houseQty"
                                min="1" max="99" value="${state.qty}" placeholder=" " inputmode="numeric">
                            <label for="houseQty">Adet</label>
                        </div>
                    </div>
                </form>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
}

function readControls(container) {
    const from = Number.parseInt(container.querySelector('#houseFrom')?.value ?? '0', 10);
    const to = Number.parseInt(container.querySelector('#houseTo')?.value ?? '8', 10);
    const qty = Number.parseInt(container.querySelector('#houseQty')?.value ?? '1', 10);

    state.from = Number.isFinite(from) ? from : 0;
    state.to = Number.isFinite(to) ? to : 8;
    state.qty = qty;
    clampState();
}

function bindPage(container) {
    initFloatingLabels(container);

    container.querySelectorAll('[data-building]').forEach((button) => {
        button.addEventListener('click', () => {
            state.building = button.dataset.building;
            renderPage(container);
        });
    });

    container.querySelector('#houseFrom')?.addEventListener('change', () => {
        readControls(container);
        renderPage(container);
    });

    container.querySelector('#houseTo')?.addEventListener('change', () => {
        readControls(container);
        renderPage(container);
    });

    container.querySelector('#houseQty')?.addEventListener('input', (event) => {
        const raw = event.target.value;
        if (raw === '') {
            return;
        }
        readControls(container);
        if (String(state.qty) !== raw) {
            event.target.value = String(state.qty);
        }
        refreshOutput(container);
    });

    container.querySelector('#houseQty')?.addEventListener('change', (event) => {
        readControls(container);
        event.target.value = String(state.qty);
        refreshOutput(container);
    });

    container.querySelector('#houseCalc')?.addEventListener('submit', (event) => {
        event.preventDefault();
    });
}

async function init() {
    initNav();
    const container = document.getElementById('houseTool');
    if (!container) {
        return;
    }
    try {
        await initStore();
    } catch (error) {
        console.error(error);
    }
    renderPage(container);
}

init();
