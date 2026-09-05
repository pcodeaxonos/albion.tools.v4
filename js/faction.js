import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { getBonusFamilyLabel } from './bonus-families.js';
import { bonusDayIso, bonusWindowLabel } from './bonus-day.js';
import { defaultCraftBonusRate, normalizeCraftBonusRate, todayCraftBonuses, craftBonusToggleHtml } from './craft-bonus.js';
import { getSettings } from './settings.js';
import { fetchPrices, indexPrices, cityRow, priceRefreshActionsHtml, bindPriceRefresh, priceLoaderMessage, applyPriceLoadMode } from './market.js';
import { itemIconHtml, itemLabel } from './item-icon.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { initFloatingLabels } from './forms.js';
import { initTableSort, parseSortNumber, sortHeaderHtml } from './table-sort.js';
import {
    quoteFromRow,
    priceSideHint,
    priceSideToggleHtml,
    priceFieldClass,
    priceFieldTitle,
    priceInputValue,
    applyPriceFieldState,
    incompleteClass
} from './price-side.js';
import { SETUP_FEE, purchaseCost, saleProceeds, salesTaxRate, placesOrder } from './market-fees.js';
import { bindCalcSticky } from './calc-sticky.js';
import { loadCities } from './cities.js';
import { bindLivePrices } from './price-live.js';

const CITY_PRODUCTION = 18;
const FAMILY_KEY = 'category/capes';
const CITY_STORAGE_KEY = 'albiontools.v4.faction.city';
const TIERS = [4, 5, 6, 7, 8];
const CREST_POINTS = { 4: 400, 5: 2250, 6: 3000, 7: 7500, 8: 15000 };
const HEART_POINTS = 3000;
const BABY_POINTS = 3000;
const ELITE_POINTS = 50000;

const FACTIONS = [
    {
        city: 'Bridgewatch',
        stem: 'BRIDGEWATCH',
        heartId: 'T1_FACTION_STEPPE_TOKEN_1',
        heartLabel: 'Beastheart',
        babyId: 'T5_FARM_MOABIRD_FW_BRIDGEWATCH_BABY',
        babyLabel: 'Baby Moabird',
        eliteId: 'T8_FARM_MOABIRD_FW_BRIDGEWATCH_BABY',
        eliteLabel: 'Baby Elite Terrorbird'
    },
    {
        city: 'Fort Sterling',
        stem: 'FORTSTERLING',
        heartId: 'T1_FACTION_HIGHLAND_TOKEN_1',
        heartLabel: 'Rockheart',
        babyId: 'T5_FARM_DIREBEAR_FW_FORTSTERLING_BABY',
        babyLabel: 'Winter Bear Cub',
        eliteId: 'T8_FARM_DIREBEAR_FW_FORTSTERLING_BABY',
        eliteLabel: 'Elite Winter Bear Cub'
    },
    {
        city: 'Lymhurst',
        stem: 'LYMHURST',
        heartId: 'T1_FACTION_FOREST_TOKEN_1',
        heartLabel: 'Treeheart',
        babyId: 'T5_FARM_DIREBOAR_FW_LYMHURST_BABY',
        babyLabel: 'Wild Boarlet',
        eliteId: 'T8_FARM_DIREBOAR_FW_LYMHURST_BABY',
        eliteLabel: 'Elite Wild Boarlet'
    },
    {
        city: 'Martlock',
        stem: 'MARTLOCK',
        heartId: 'T1_FACTION_MOUNTAIN_TOKEN_1',
        heartLabel: 'Mountainheart',
        babyId: 'T5_FARM_RAM_FW_MARTLOCK_BABY',
        babyLabel: 'Bighorn Ram Lamb',
        eliteId: 'T8_FARM_RAM_FW_MARTLOCK_BABY',
        eliteLabel: 'Elite Bighorn Ram Lamb'
    },
    {
        city: 'Thetford',
        stem: 'THETFORD',
        heartId: 'T1_FACTION_SWAMP_TOKEN_1',
        heartLabel: 'Vineheart',
        babyId: 'T5_FARM_SWAMPDRAGON_FW_THETFORD_BABY',
        babyLabel: 'Baby Swamp Salamander',
        eliteId: 'T8_FARM_SWAMPDRAGON_FW_THETFORD_BABY',
        eliteLabel: 'Baby Elite Swamp Salamander'
    },
    {
        city: 'Caerleon',
        stem: 'CAERLEON',
        heartId: 'T1_FACTION_CAERLEON_TOKEN_1',
        heartLabel: 'Shadowheart',
        babyId: 'T5_FARM_GREYWOLF_FW_CAERLEON_BABY',
        babyLabel: 'Caerleon Greywolf Pup',
        eliteId: 'T8_FARM_GREYWOLF_FW_CAERLEON_BABY',
        eliteLabel: 'Elite Greywolf Pup'
    },
    {
        city: 'Brecilien',
        stem: 'BRECILIEN',
        heartId: null,
        heartLabel: null,
        babyId: 'T5_FARM_OWL_FW_BRECILIEN_BABY',
        babyLabel: 'Mystic Owlet',
        eliteId: 'T8_FARM_OWL_FW_BRECILIEN_BABY',
        eliteLabel: 'Elite Mystic Owlet'
    }
];

function capeId(tier) {
    return `T${tier}_CAPE`;
}

function crestId(stem, tier) {
    return `T${tier}_CAPEITEM_FW_${stem}_BP`;
}

function factionCapeId(stem, tier) {
    return `T${tier}_CAPEITEM_FW_${stem}`;
}

function allUniqueNames() {
    const names = TIERS.map(capeId);
    for (const faction of FACTIONS) {
        for (const tier of TIERS) {
            names.push(crestId(faction.stem, tier), factionCapeId(faction.stem, tier));
        }
        if (faction.heartId) {
            names.push(faction.heartId);
        }
        names.push(faction.babyId, faction.eliteId);
    }
    return [...new Set(names)];
}

const state = {
    premium: true,
    matSide: 'buy',
    itemSide: 'sell',
    city: 'Bridgewatch',
    cities: [],
    priceIndex: null,
    manualPrices: {},
    bonusRate: 0,
    error: null,
    loaded: false,
    vendorSort: { key: 'sellPoint', direction: 'desc' },
    capeSort: { key: 'pct', direction: 'desc' }
};

function currentFaction() {
    return FACTIONS.find((faction) => faction.city === state.city) ?? FACTIONS[0];
}

function vendorItems() {
    const faction = currentFaction();
    const items = TIERS.map((tier) => ({
        id: `crest-${tier}`,
        uniqueName: crestId(faction.stem, tier),
        label: `T${tier} Crest`,
        points: CREST_POINTS[tier],
        kind: 'crest'
    }));

    if (faction.heartId) {
        items.push({
            id: 'heart',
            uniqueName: faction.heartId,
            label: faction.heartLabel,
            points: HEART_POINTS,
            kind: 'heart'
        });
    }

    items.push(
        {
            id: 'baby',
            uniqueName: faction.babyId,
            label: faction.babyLabel,
            points: BABY_POINTS,
            kind: 'baby'
        },
        {
            id: 'elite',
            uniqueName: faction.eliteId,
            label: faction.eliteLabel,
            points: ELITE_POINTS,
            kind: 'elite'
        }
    );

    return items;
}

function capeItems() {
    const faction = currentFaction();
    return TIERS.map((tier) => ({
        id: `cape-${tier}`,
        uniqueName: factionCapeId(faction.stem, tier),
        capeMat: capeId(tier),
        crest: crestId(faction.stem, tier),
        label: `T${tier} Cape`,
        points: CREST_POINTS[tier]
    }));
}

function formatSilver(value, { unsigned = false } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(value) : value;
    return Math.round(amount).toLocaleString('tr-TR');
}

function formatPct(ratio, { unsigned = false } = {}) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    const amount = unsigned ? Math.abs(ratio) : ratio;
    return `${(amount * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

function formatDateTime(iso) {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}.${mm} ${hh}:${min}`;
}

function cityNames() {
    return state.cities.map((city) => city.marketApiName).filter(Boolean);
}

function cityLabel(apiName) {
    return state.cities.find((city) => city.marketApiName === apiName)?.displayName ?? apiName;
}

function readSavedCity(cities) {
    try {
        const saved = localStorage.getItem(CITY_STORAGE_KEY);
        if (cities.some((city) => city.marketApiName === saved)) {
            return saved;
        }
    } catch {
        /* ignore */
    }
    return cities[0]?.marketApiName ?? 'Bridgewatch';
}

function saveCity(apiName) {
    try {
        localStorage.setItem(CITY_STORAGE_KEY, apiName);
    } catch {
        /* ignore */
    }
}

function productionBonus() {
    return CITY_PRODUCTION + state.bonusRate;
}

function returnRate() {
    const bonus = productionBonus();
    return bonus / (100 + bonus);
}

function parsePrice(raw) {
    if (raw == null) {
        return null;
    }
    const value = parseSortNumber(raw);
    return value != null && value >= 0 ? value : null;
}

function isManualPrice(raw) {
    return parsePrice(raw) != null;
}

function fetchedQuote(uniqueName, side, intent) {
    return quoteFromRow(cityRow(state.priceIndex, uniqueName, state.city), side, intent);
}

function manualQuote(price, side, intent) {
    return {
        price,
        book: price,
        date: null,
        side,
        intent,
        tick: 0,
        setup: placesOrder(intent, side),
        manual: true
    };
}

function quoteFor(uniqueName, side, intent) {
    const parsed = parsePrice(state.manualPrices[uniqueName]);
    if (parsed != null) {
        return manualQuote(parsed, side, intent);
    }
    return fetchedQuote(uniqueName, side, intent);
}

function priceInputValueFor(uniqueName, fetchedPrice) {
    return priceInputValue(state.manualPrices[uniqueName], fetchedPrice);
}

function priceFieldHtml({ id, label, uniqueName, value, dataAttr, missing = false }) {
    const filled = String(value ?? '').length > 0 ? ' is-filled' : '';
    const manual = isManualPrice(state.manualPrices[uniqueName]);
    const title = priceFieldTitle({ manual, missing });
    return `
        <div class="form-floating ava-price-field${priceFieldClass({ manual, missing })}"${title ? ` title="${escapeHtml(title)}"` : ''}>
            <input type="text" class="form-control${filled}" id="${escapeHtml(id)}"
                ${dataAttr} value="${escapeHtml(value)}" placeholder=" "
                inputmode="decimal" autocomplete="off" spellcheck="false">
            <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

function perPoint(silver, points) {
    return Number.isFinite(silver) && points > 0 ? silver / points : null;
}

function vendorRows() {
    return vendorItems().map((item) => {
        const sellQuote = quoteFor(item.uniqueName, state.itemSide, 'sell');
        const buyQuote = quoteFor(item.uniqueName, state.matSide, 'buy');
        const sellNet = sellQuote
            ? saleProceeds(sellQuote.price, { premium: state.premium, setup: sellQuote.setup })
            : null;
        const buyNet = buyQuote
            ? purchaseCost(buyQuote.price, { setup: buyQuote.setup })
            : null;

        return {
            item,
            sellQuote,
            buyQuote,
            sellPoint: perPoint(sellNet, item.points),
            buyPoint: perPoint(buyNet, item.points)
        };
    });
}

function capeRows() {
    const rr = returnRate();
    const matSetup = placesOrder('buy', state.matSide);

    return capeItems().map((item) => {
        const capeQuote = quoteFor(item.capeMat, state.matSide, 'buy');
        const crestQuote = quoteFor(item.crest, state.matSide, 'buy');
        const outQuote = quoteFor(item.uniqueName, state.itemSide, 'sell');
        const capeRaw = capeQuote ? capeQuote.price * (1 - rr) : null;
        const crestRaw = crestQuote ? crestQuote.price : null;
        const raw = capeRaw != null && crestRaw != null ? capeRaw + crestRaw : null;
        const cost = raw == null ? null : purchaseCost(raw, { setup: matSetup });
        const capeOnly = capeRaw == null ? null : purchaseCost(capeRaw, { setup: matSetup });
        const sell = outQuote
            ? saleProceeds(outQuote.price, { premium: state.premium, setup: outQuote.setup })
            : null;
        const profit = cost != null && sell != null ? sell - cost : null;
        const pct = profit != null && cost > 0 ? profit / cost : null;
        const pointValue = sell != null && capeOnly != null
            ? perPoint(sell - capeOnly, item.points)
            : null;

        return { item, outQuote, rr, cost, sell, profit, pct, pointValue };
    });
}

function renderPremiumToggle() {
    return [
        { id: true, label: 'Premium' },
        { id: false, label: 'Premium yok' }
    ].map((option) => {
        const pressed = option.id === state.premium;
        return `
            <button type="button" class="ava-type-btn${pressed ? ' is-active' : ''}"
                data-premium="${option.id ? '1' : '0'}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');
}

function renderCityOptions() {
    return state.cities.map((city) => {
        const selected = city.marketApiName === state.city ? ' selected' : '';
        return `<option value="${escapeHtml(city.marketApiName)}"${selected}>${escapeHtml(city.displayName)}</option>`;
    }).join('');
}

function renderBonusNote() {
    const extra = state.bonusRate ? ` · +${state.bonusRate}%` : '';
    const recorded = todayCraftBonuses();
    const today = recorded.length === 0
        ? 'kayıt yok.'
        : recorded.map((bonus) =>
            `${escapeHtml(getBonusFamilyLabel(bonus.key))} +${bonus.rate}%`
        ).join(' · ');

    return `<p class="faction-note">Cape RR ${formatPct(returnRate())}${extra} (yalnız düz cape). Crest artefact, RR yok.
        Bugün (${escapeHtml(bonusWindowLabel(bonusDayIso()))}): ${today}
        <a href="daily-bonus.html">Günlük bonus</a></p>`;
}

function profitClass(profit) {
    if (profit == null) {
        return '';
    }
    if (profit > 0) {
        return ' is-profit';
    }
    if (profit < 0) {
        return ' is-loss';
    }
    return '';
}

function renderCapeMats() {
    return `
        <ul class="ava-mats ava-mats--tiers">
            ${TIERS.map((tier) => {
                const uniqueName = capeId(tier);
                const fetched = fetchedQuote(uniqueName, state.matSide, 'buy');
                return `
                    <li class="ava-mat ava-mat--tier" data-price-card="${escapeHtml(uniqueName)}">
                        <span class="ava-mat-text">
                            <span class="ava-mat-label">T${tier} Cape</span>
                            <span class="ava-mat-meta">${escapeHtml(priceSideHint(state.matSide, 'buy'))}</span>
                            <span class="ava-tier-row">
                                ${itemIconHtml(uniqueName)}
                                ${priceFieldHtml({
                                    id: `matPrice-${uniqueName}`,
                                    label: 'Alış',
                                    uniqueName,
                                    value: priceInputValueFor(uniqueName, fetched?.price),
                                    missing: !fetched,
                                    dataAttr: `data-price-id="${escapeHtml(uniqueName)}"`
                                })}
                            </span>
                        </span>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function renderVendorTable() {
    const sort = state.vendorSort;
    const body = vendorRows().map((row) => `
        <tr data-vendor-id="${escapeHtml(row.item.id)}">
            <td>
                <span class="ava-item">
                    ${itemIconHtml(row.item.uniqueName)}
                    <span>
                        <span class="ava-item-name">${escapeHtml(itemLabel(row.item.uniqueName, row.item.label))}</span>
                        <span class="ava-item-meta">${row.item.points.toLocaleString('tr-TR')} puan</span>
                    </span>
                </span>
            </td>
            <td class="num ava-num" data-sort-value="${row.item.points}">${row.item.points.toLocaleString('tr-TR')}</td>
            <td class="num ava-num ava-price-cell" data-sort-value="${row.sellQuote?.price ?? ''}">
                ${priceFieldHtml({
                    id: `vendorSell-${row.item.id}`,
                    label: 'Satış',
                    uniqueName: row.item.uniqueName,
                    value: priceInputValueFor(row.item.uniqueName, row.sellQuote?.price),
                    missing: !fetchedQuote(row.item.uniqueName, state.itemSide, 'sell'),
                    dataAttr: `data-price-id="${escapeHtml(row.item.uniqueName)}"`
                })}
            </td>
            <td class="num ava-num${incompleteClass(row.buyQuote?.price)}" data-sort-value="${row.buyQuote?.price ?? ''}">${formatSilver(row.buyQuote?.price)}</td>
            <td class="num ava-num${incompleteClass(row.sellPoint)}" data-sort-value="${row.sellPoint ?? ''}">${formatSilver(row.sellPoint)}</td>
            <td class="num ava-num${incompleteClass(row.buyPoint)}" data-sort-value="${row.buyPoint ?? ''}">${formatSilver(row.buyPoint)}</td>
        </tr>
    `).join('');

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped ava-table calc-table" data-faction-table="vendor">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Item', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Faction vendor eşyası' })}
                        ${sortHeaderHtml('Puan', { key: 'points', type: 'number', className: 'num ava-num', direction: sort.key === 'points' ? sort.direction : null, title: 'Faction puan maliyeti' })}
                        ${sortHeaderHtml('Satış', { key: 'sell', type: 'number', className: 'num ava-num', direction: sort.key === 'sell' ? sort.direction : null, title: 'Piyasa satış fiyatı' })}
                        ${sortHeaderHtml('Alış', { key: 'buy', type: 'number', className: 'num ava-num', direction: sort.key === 'buy' ? sort.direction : null, title: 'Piyasa alış fiyatı' })}
                        ${sortHeaderHtml('Satış/puan', { key: 'sellPoint', type: 'number', className: 'num ava-num', direction: sort.key === 'sellPoint' ? sort.direction : null, title: 'Net satışın puan başına gümüşü' })}
                        ${sortHeaderHtml('Alış/puan', { key: 'buyPoint', type: 'number', className: 'num ava-num', direction: sort.key === 'buyPoint' ? sort.direction : null, title: 'Alışın puan başına gümüşü' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function recipeChips(item) {
    return `
        <span class="ava-chip">
            ${itemIconHtml(item.capeMat, { className: 'item-icon ava-chip-icon' })}
            <span>1</span>
        </span>
        <span class="ava-chip">
            ${itemIconHtml(item.crest, { className: 'item-icon ava-chip-icon' })}
            <span>1</span>
        </span>
    `;
}

function renderCapeTable() {
    const sort = state.capeSort;
    const body = capeRows().map((row) => {
        const bonusMark = state.bonusRate
            ? `<span class="ava-bonus">+${state.bonusRate}%</span>`
            : '';
        return `
            <tr data-cape-id="${escapeHtml(row.item.id)}">
                <td>
                    <span class="ava-item">
                        ${itemIconHtml(row.item.uniqueName)}
                        <span>
                            <span class="ava-item-name">${escapeHtml(row.item.label)}${bonusMark}</span>
                            <span class="ava-item-meta">${row.item.points.toLocaleString('tr-TR')} puan · RR ${formatPct(row.rr)}</span>
                        </span>
                    </span>
                </td>
                <td class="ava-recipe">${recipeChips(row.item)}</td>
                <td class="num ava-num${incompleteClass(row.cost)}" data-sort-value="${row.cost ?? ''}">${formatSilver(row.cost)}</td>
                <td class="num ava-num ava-price-cell" data-sort-value="${row.outQuote?.price ?? ''}">
                    ${priceFieldHtml({
                        id: `capeSell-${row.item.id}`,
                        label: 'Satış',
                        uniqueName: row.item.uniqueName,
                        value: priceInputValueFor(row.item.uniqueName, row.outQuote?.price),
                        missing: !fetchedQuote(row.item.uniqueName, state.itemSide, 'sell'),
                        dataAttr: `data-price-id="${escapeHtml(row.item.uniqueName)}"`
                    })}
                </td>
                <td class="num ava-num${incompleteClass(row.sell)}" data-sort-value="${row.sell ?? ''}">${formatSilver(row.sell)}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}" data-sort-value="${row.profit ?? ''}">${formatSilver(row.profit, { unsigned: true })}</td>
                <td class="num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}" data-sort-value="${row.pct ?? ''}">${formatPct(row.pct, { unsigned: true })}</td>
                <td class="num ava-num${incompleteClass(row.pointValue)}" data-sort-value="${row.pointValue ?? ''}">${formatSilver(row.pointValue)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped ava-table calc-table" data-faction-table="cape">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Cape', { key: 'item', type: 'text', direction: sort.key === 'item' ? sort.direction : null, title: 'Üretilen faction cape' })}
                        ${sortHeaderHtml('Tarif', { key: 'recipe', type: 'text', direction: sort.key === 'recipe' ? sort.direction : null, title: 'Düz cape + crest' })}
                        ${sortHeaderHtml('Maliyet', { key: 'cost', type: 'number', className: 'num ava-num', direction: sort.key === 'cost' ? sort.direction : null, title: 'RR düşülmüş üretim maliyeti' })}
                        ${sortHeaderHtml('Fiyat', { key: 'price', type: 'number', className: 'num ava-num', direction: sort.key === 'price' ? sort.direction : null, title: 'Piyasa satış fiyatı' })}
                        ${sortHeaderHtml('Net', { key: 'sell', type: 'number', className: 'num ava-num', direction: sort.key === 'sell' ? sort.direction : null, title: 'Vergi sonrası net satış' })}
                        ${sortHeaderHtml('Kâr', { key: 'profit', type: 'number', className: 'num ava-num', direction: sort.key === 'profit' ? sort.direction : null, title: 'Net satış eksi maliyet' })}
                        ${sortHeaderHtml('%', { key: 'pct', type: 'number', className: 'num ava-num', direction: sort.key === 'pct' ? sort.direction : null, title: 'Kârın maliyete oranı' })}
                        ${sortHeaderHtml('₺/puan', { key: 'pointValue', type: 'number', className: 'num ava-num', direction: sort.key === 'pointValue' ? sort.direction : null, title: 'Crest puanı başına net değer' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderOutput() {
    if (state.error) {
        return `<div class="alert alert-info" id="factionResult">${escapeHtml(state.error)}</div>`;
    }

    if (!state.loaded) {
        return '<div id="factionResult"></div>';
    }

    const matSetup = placesOrder('buy', state.matSide);
    const itemSetup = placesOrder('sell', state.itemSide);
    const matNote = `${priceSideHint(state.matSide, 'buy')}${matSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''}`;
    const itemNote = `${priceSideHint(state.itemSide, 'sell')}${itemSetup ? ` · setup ${formatPct(SETUP_FEE)}` : ''} · vergi ${formatPct(salesTaxRate(state.premium))}`;
    const stamp = formatDateTime(
        vendorRows().map((row) => row.sellQuote?.date).filter(Boolean).sort().at(-1)
    );

    return `
        <div id="factionResult">
            <section class="faction-section">
                <h2>Puan değeri</h2>
                ${renderVendorTable()}
            </section>

            <section class="faction-section">
                <h2>Faction cape</h2>
                ${renderCapeMats()}
                ${renderCapeTable()}
            </section>

            ${renderBonusNote()}
            <p class="faction-note">${escapeHtml(cityLabel(state.city))} · malzeme ${escapeHtml(matNote)} · satış ${escapeHtml(itemNote)}.
                Satış/puan net (vergi sonrası). Cape ₺/puan = (net satış − düz cape maliyeti) / crest puanı.
                Elle yazılan fiyat API’nin yerine geçer. Kırmızı fiyat API’de yok; hesap da kırmızı kalır.${stamp ? ` · ${stamp}` : ''}</p>
        </div>
    `;
}

function bindFactionSort(container) {
    const vendorTable = container.querySelector('[data-faction-table="vendor"]');
    const capeTable = container.querySelector('[data-faction-table="cape"]');

    if (vendorTable) {
        initTableSort(vendorTable, {
            initial: state.vendorSort,
            onSort({ key, direction }) {
                state.vendorSort = { key, direction };
            }
        });
    }

    if (capeTable) {
        initTableSort(capeTable, {
            initial: state.capeSort,
            onSort({ key, direction }) {
                state.capeSort = { key, direction };
            }
        });
    }
}

function patchVendorRow(tr, row) {
    tr.cells[2].dataset.sortValue = row.sellQuote?.price ?? '';
    const sellFetched = fetchedQuote(row.item.uniqueName, state.itemSide, 'sell');
    applyPriceFieldState(tr.cells[2].querySelector('.ava-price-field'), {
        manual: Boolean(row.sellQuote?.manual),
        missing: !sellFetched,
        displayValue: priceInputValueFor(row.item.uniqueName, sellFetched?.price)
    });
    tr.cells[3].dataset.sortValue = row.buyQuote?.price ?? '';
    tr.cells[3].textContent = formatSilver(row.buyQuote?.price);
    tr.cells[3].className = `num ava-num${incompleteClass(row.buyQuote?.price)}`;
    tr.cells[4].dataset.sortValue = row.sellPoint ?? '';
    tr.cells[4].textContent = formatSilver(row.sellPoint);
    tr.cells[4].className = `num ava-num${incompleteClass(row.sellPoint)}`;
    tr.cells[5].dataset.sortValue = row.buyPoint ?? '';
    tr.cells[5].textContent = formatSilver(row.buyPoint);
    tr.cells[5].className = `num ava-num${incompleteClass(row.buyPoint)}`;
}

function patchCapeRow(tr, row) {
    tr.cells[2].dataset.sortValue = row.cost ?? '';
    tr.cells[2].textContent = formatSilver(row.cost);
    tr.cells[2].className = `num ava-num${incompleteClass(row.cost)}`;
    tr.cells[3].dataset.sortValue = row.outQuote?.price ?? '';
    const outFetched = fetchedQuote(row.item.uniqueName, state.itemSide, 'sell');
    applyPriceFieldState(tr.cells[3].querySelector('.ava-price-field'), {
        manual: Boolean(row.outQuote?.manual),
        missing: !outFetched,
        displayValue: priceInputValueFor(row.item.uniqueName, outFetched?.price)
    });
    tr.cells[4].dataset.sortValue = row.sell ?? '';
    tr.cells[4].textContent = formatSilver(row.sell);
    tr.cells[4].className = `num ava-num${incompleteClass(row.sell)}`;
    tr.cells[5].dataset.sortValue = row.profit ?? '';
    tr.cells[5].textContent = formatSilver(row.profit, { unsigned: true });
    tr.cells[5].className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.profit)}`;
    tr.cells[6].dataset.sortValue = row.pct ?? '';
    tr.cells[6].textContent = formatPct(row.pct, { unsigned: true });
    tr.cells[6].className = `num ava-num${profitClass(row.profit)}${incompleteClass(row.pct)}`;
    tr.cells[7].dataset.sortValue = row.pointValue ?? '';
    tr.cells[7].textContent = formatSilver(row.pointValue);
    tr.cells[7].className = `num ava-num${incompleteClass(row.pointValue)}`;
}

function refreshCalc(container) {
    const vendorTable = container.querySelector('[data-faction-table="vendor"]');
    if (vendorTable) {
        for (const row of vendorRows()) {
            const tr = vendorTable.querySelector(`tr[data-vendor-id="${row.item.id}"]`);
            if (tr) {
                patchVendorRow(tr, row);
            }
        }
    }

    const capeTable = container.querySelector('[data-faction-table="cape"]');
    if (capeTable) {
        for (const row of capeRows()) {
            const tr = capeTable.querySelector(`tr[data-cape-id="${row.item.id}"]`);
            if (tr) {
                patchCapeRow(tr, row);
            }
        }
    }

    container.querySelectorAll('[data-price-card]').forEach((card) => {
        const field = card.querySelector('.ava-price-field');
        if (field) {
            const fetched = fetchedQuote(card.dataset.priceCard, state.matSide, 'buy');
            applyPriceFieldState(field, {
                manual: isManualPrice(state.manualPrices[card.dataset.priceCard]),
                missing: !fetched,
                displayValue: priceInputValueFor(card.dataset.priceCard, fetched?.price)
            });
        }
    });
}

function bindPriceInputs(container) {
    initFloatingLabels(container);

    container.querySelectorAll('[data-price-id]').forEach((input) => {
        if (input.dataset.priceBound === 'on') {
            return;
        }
        input.dataset.priceBound = 'on';

        input.addEventListener('input', () => {
            state.manualPrices[input.dataset.priceId] = input.value;
            refreshCalc(container);
        });

        input.addEventListener('change', () => {
            const uniqueName = input.dataset.priceId;
            if (parsePrice(input.value) == null) {
                state.manualPrices[uniqueName] = null;
                const fetched = fetchedQuote(uniqueName, state.itemSide, 'sell')
                    ?? fetchedQuote(uniqueName, state.matSide, 'buy');
                input.value = fetched ? formatSilver(fetched.price) : '';
                input.classList.toggle('is-filled', input.value.length > 0);
            }
            refreshCalc(container);
        });
    });
}

function refreshOutput(container) {
    const result = container.querySelector('#factionResult');
    if (!result) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderOutput();
    result.replaceWith(wrap.querySelector('#factionResult'));
    bindFactionSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function renderPage(container) {
    container.innerHTML = `
        <section class="ava-hero">
            <h1>Faction</h1>
            <p>Vendor eşyalarının gümüş / puan değeri ve faction cape craft kârı. Crest artefact (RR yok); düz cape RR alır.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="ava-toolbar">
                    <div class="ava-type" role="radiogroup" aria-label="Premium">
                        ${renderPremiumToggle()}
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="factionBonusLabel">Bonus</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="factionBonusLabel">
                            ${craftBonusToggleHtml(state.bonusRate)}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="factionMatSideLabel">Malzeme</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="factionMatSideLabel">
                            ${priceSideToggleHtml('mat', state.matSide)}
                        </div>
                    </div>
                    <div class="ava-side-field">
                        <span class="ava-side-label" id="factionItemSideLabel">Satış</span>
                        <div class="price-side" role="radiogroup" aria-labelledby="factionItemSideLabel">
                            ${priceSideToggleHtml('item', state.itemSide)}
                        </div>
                    </div>
                    <div class="form-floating ava-city-field">
                        <select class="form-select is-filled" id="factionCity">
                            ${renderCityOptions()}
                        </select>
                        <label for="factionCity">Şehir</label>
                    </div>
                    ${priceRefreshActionsHtml({ refreshId: 'factionRefresh', apiId: 'factionRefreshApi' })}
                </div>
            </div>
            <div class="tool-split-result">
                ${renderOutput()}
            </div>
        </div>
    `;

    bindPage(container);
    bindFactionSort(container);
    bindPriceInputs(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    container.querySelectorAll('[data-premium]').forEach((button) => {
        button.addEventListener('click', () => {
            state.premium = button.dataset.premium === '1';
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-bonus-rate]').forEach((button) => {
        button.addEventListener('click', () => {
            state.bonusRate = normalizeCraftBonusRate(button.dataset.bonusRate);
            renderPage(container);
        });
    });

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const side = button.dataset.priceSide === 'sell' ? 'sell' : 'buy';
            if (button.dataset.priceFor === 'item') {
                state.itemSide = side;
            } else {
                state.matSide = side;
            }
            renderPage(container);
        });
    });

    container.querySelector('#factionCity')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!state.cities.some((city) => city.marketApiName === value)) {
            return;
        }
        state.city = value;
        saveCity(value);
        renderPage(container);
    });

    bindPriceRefresh(container, {
        refreshId: 'factionRefresh',
        apiId: 'factionRefreshApi',
        load: (options) => loadPrices(container, options)
    });
}

async function loadPrices(container, { showLoader = true, source } = {}) {
    applyPriceLoadMode(state, { source, showLoader });
    state.error = null;
    if (showLoader) {
        showPageLoader(priceLoaderMessage(source, 'Şehir fiyatları alınıyor…'));
    }

    try {
        const locations = cityNames();
        if (locations.length === 0) {
            throw new Error('Aktif şehir yok.');
        }
        const ids = allUniqueNames();
        const mid = Math.ceil(ids.length / 2);
        const [first, second] = await Promise.all([
            fetchPrices(ids.slice(0, mid), locations, { source }),
            fetchPrices(ids.slice(mid), locations, { source })
        ]);
        state.priceIndex = indexPrices([...first, ...second]);
        state.loaded = true;
    } catch (error) {
        console.error(error);
        state.error = error.message || 'Fiyatlar alınamadı.';
        state.loaded = true;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (container.querySelector('#factionResult')) {
            refreshOutput(container);
        } else {
            renderPage(container);
        }
    }
}

async function init() {
    initNav();
    const container = document.getElementById('factionTool');
    if (!container) {
        return;
    }

    const settings = getSettings();
    state.premium = settings.premium;
    state.matSide = settings.buyPriceSide;
    state.itemSide = settings.sellPriceSide;

    showPageLoader('Faction yükleniyor…');
    try {
        await initStore();
        state.cities = loadCities().filter((city) => city.isActive);
        state.city = readSavedCity(state.cities);
        state.bonusRate = defaultCraftBonusRate([FAMILY_KEY]);
        renderPage(container);
        await loadPrices(container, { showLoader: false });
        bindLivePrices(() => ({
            items: allUniqueNames(),
            cities: [state.city],
            pause: state.livePaused
        }), () => loadPrices(container, { showLoader: false }));
    } catch (error) {
        console.error(error);
        state.error = 'Sayfa yüklenemedi. Static server ile açın.';
        state.loaded = true;
        renderPage(container);
    } finally {
        hidePageLoader();
    }
}

init();
