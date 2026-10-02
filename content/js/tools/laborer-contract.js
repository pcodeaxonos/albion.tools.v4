import { toolPageHtml } from '../components/tool-page.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { getSettings, saveSettings, listServers, getDefaultCity } from '../core/settings.js';
import { loadActiveCities } from '../core/cities.js';
import { cityFieldHtml, bindCityField } from '../components/city-picker.js';
import { fetchPrices, indexPrices } from '../core/market.js';
import { fetchHistoryIndex, historyAt } from '../core/market-history.js';
import { bindLivePrices } from '../core/price-live.js';
import { saleProceeds, purchaseCost, feeMetaText } from '../core/market-fees.js';
import { readJsonStorage, writeJsonStorage } from '../core/storage.js';
import { itemIconHtml, itemLabel } from '../components/item-icon.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { formatSilver, formatPct, formatQuantity, formatDateTime } from '../utils/format.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { loadLaborerData, laborerTypes, mechanicIssues } from '../core/laborer/data.js';
import { resolvePrice, overrideKey, priceIssue } from '../core/laborer/prices.js';
import { liquidity } from '../core/laborer/liquidity.js';
import { planProgression } from '../core/laborer/planning.js';
import { cycleEconomics, evaluatePlan, compareContinue, optimum, netSale } from '../core/laborer/economics.js';
import { rewardAssets, observedRewards } from '../core/laborer/rewards.js';
import { progressionRules } from '../core/laborer/progression-rules.js';

const STORAGE_KEY = 'albiontools.v4.laborer-contract';
const PRICE_BATCH_SIZE = 80;
const root = document.querySelector('[data-tool="laborer-contract"]');
let data, types, cities, request = 0;
let priceIndex = new Map(), history = new Map();
let activeMarketKey = '', error = '', loading = false;
const state = { type: '', startTier: 2, count: 1, acquisitionMode: 'owned',
    buyCity: '', sellCity: '', buySide: 'sell', sellSide: 'sell', premium: true,
    strategy: 'auto', manual: {}, setupMode: 'existing', setupCost: '', overrides: {}, journalItem: '', rewardQuantities: {}, ...readJsonStorage(STORAGE_KEY) };

const selected = () => types.find((type) => type.type === state.type);
const mechanics = () => progressionRules(data, state.type);
const persist = () => writeJsonStorage(STORAGE_KEY, state);
const quantity = () => Number(state.count);
const contractAt = (tier) => selected().contracts.find((contract) => contract.tier === tier);
const saleOptions = () => ({ premium: state.premium, setup: state.sellSide === 'sell' });
const journalOptions = () => data.journals.filter((journal) => journal.type === state.type || journal.type === 'general');
const currentJournal = () => journalOptions().find((journal) => journal.item === state.journalItem) || journalOptions()[0];

function quote(item, intent) {
    const city = intent === 'buy' ? state.buyCity : state.sellCity;
    const side = intent === 'buy' ? state.buySide : state.sellSide;
    const key = overrideKey(getSettings().server, item, city, side, intent);
    return resolvePrice({ index: priceIndex, item, city, side, intent, override: state.overrides[key] });
}

function marketItems() {
    const stages = mechanics().stages || {};
    return [...new Set([...selected().contracts.map((row) => row.item),
        currentJournal().filled, ...rewardAssets(currentJournal()),
        ...Object.values(stages).flatMap((stage) => stage.journals.flatMap((journal) => [journal.filled, ...(journal.rewards || []).map((reward) => reward.item)]))].filter((item) => item && item !== 'SILVER'))];
}

function marketKey() {
    return JSON.stringify([getSettings().server, getSettings().priceSource, state.buyCity, state.sellCity, marketItems()]);
}

async function refresh(force = false) {
    const key = marketKey();
    if (!force && key === activeMarketKey) return;
    activeMarketKey = key;
    const token = ++request;
    priceIndex = new Map(); history = new Map(); error = ''; loading = true;
    renderResults();
    const ids = marketItems();
    const locations = [...new Set([state.buyCity, state.sellCity])];
    const contracts = selected().contracts.map((row) => row.item);
    // Shared history cache is server/city keyed. Recalculate-only inputs keep the
    // price snapshot; the explicit refresh and packet events update it.
    const pricesJob = async () => {
        const rows = [];
        for (let offset = 0; offset < ids.length; offset += PRICE_BATCH_SIZE) rows.push(...await fetchPrices(ids.slice(offset, offset + PRICE_BATCH_SIZE), locations));
        return indexPrices(rows);
    };
    const results = await Promise.allSettled([pricesJob(), fetchHistoryIndex(contracts, [state.sellCity])]);
    if (token !== request || key !== marketKey()) return;
    if (results[0].status === 'fulfilled') priceIndex = results[0].value;
    else { error = results[0].reason?.message || 'Fiyatlar alınamadı'; activeMarketKey = ''; }
    if (results[1].status === 'fulfilled') history = results[1].value;
    loading = false;
    renderResults();
}

function acquisition() {
    if (state.acquisitionMode === 'owned') return 0;
    if (state.acquisitionMode === 'market') {
        const price = quote(contractAt(Number(state.startTier)).item, 'buy');
        return priceIssue(price) ? null : purchaseCost(price.price, { setup: price.setup });
    }
    const source = mechanics().acquisition;
    if (!source?.verified || source.tier !== Number(state.startTier)) return null;
    return source.cost;
}

function plan(startTier, targetTier, progress = 0) {
    return planProgression({ mechanics: mechanics(), startTier, targetTier, progress,
        manual: state.strategy === 'manual' ? state.manual : {},
        journalEconomics: (journal) => cycleEconomics(journal, quote, state.premium) });
}

function model() {
    const tiers = selected().contracts.filter((row) => row.tier >= Number(state.startTier));
    const count = quantity();
    if (!Number.isSafeInteger(count) || count < 1) return { issues: ['Laborer adedi pozitif bir tam sayı olmalı.'], rows: [] };
    const rows = tiers.map((contract) => {
        const sale = quote(contract.item, 'sell');
        const progression = plan(Number(state.startTier), contract.tier);
        const setupCost = state.setupMode === 'existing' ? 0 : state.setupCost === '' ? null : Number(state.setupCost);
        const economics = evaluatePlan({ plan: progression, acquisition: acquisition(), quantity: count, sale, premium: state.premium, setupCost });
        const next = contractAt(contract.tier + 1);
        const continuation = next ? compareContinue({
            plan: plan(contract.tier, next.tier, progression.status === 'ok' ? progression.end.progress : 0),
            currentSale: sale, nextSale: quote(next.item, 'sell'), quantity: count, premium: state.premium
        }) : null;
        return { ...contract, sale, progression, economics, continuation,
            liquidity: liquidity(historyAt(history, contract.item, state.sellCity), count) };
    });
    return { rows, issues: [] };
}

function priceField(item, intent) {
    const price = quote(item, intent);
    const key = overrideKey(getSettings().server, item, price.city, price.side, intent);
    const manual = Object.hasOwn(state.overrides, key);
    const value = manual ? state.overrides[key] : '';
    const status = priceIssue(price);
    return `<div class="ava-side-field">
        <label>${esc(itemLabel(item))} · ${intent === 'buy' ? 'Alış' : 'Satış'}
        <input class="form-control" type="number" min="1" step="1" data-price-item="${esc(item)}" data-price-intent="${intent}" value="${esc(String(value))}" placeholder="${price.price ? esc(String(price.price)) : 'Fiyat yok'}" aria-label="${esc(itemLabel(item))} manuel ${intent === 'buy' ? 'alış' : 'satış'} fiyatı"></label>
        <small>${esc(price.city)} · ${manual ? 'Manuel' : 'Canlı'} · ${esc(formatDateTime(price.date, { empty: 'Tarih yok' }))}${status ? ` · ${esc(status)}` : ''}</small>
        ${manual ? `<button type="button" class="btn btn-sm btn-secondary" data-price-reset="${esc(item)}" data-price-intent="${intent}">Canlı fiyata dön</button>` : ''}
    </div>`;
}

function detail(row) {
    const e = row.economics;
    const p = row.progression;
    const c = row.continuation;
    const issues = [...new Set([...(p.issues || []), ...(e.issues || []), ...(c?.issues || [])])];
    return `<details data-contract-detail="${row.tier}"><summary>Hesap detayları</summary>
        ${priceField(row.item, 'sell')}
        <p>Contract: ${formatSilver(row.sale.price)} × ${formatQuantity(quantity())} → fee sonrası ${formatSilver(netSale(row.sale, quantity(), state.premium))} gümüş.</p>
        ${issues.length ? `<ul>${issues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>` : ''}
        ${e.status === 'ok' ? `<p>Journal brüt: ${formatSilver(e.grossJournalCost)} · Reward net: ${formatSilver(e.rewardNet)} · Levelleme net: ${formatSilver(e.levelingCost)} · Laborer başına kâr: ${formatSilver(e.perLaborer)} · Kâr/gün: ${formatSilver(e.profitDay)} · ROI: ${formatPct(e.roi)} · Break-even: ${formatSilver(e.breakEven)}</p><p>Başlangıç sermayesi: ${formatSilver(e.initialCapital)} · Peak capital: ${formatSilver(e.peakCapital)} · Ayrı setup: ${formatSilver(e.setupCost)} · Setup sonrası: ${formatSilver(e.profitAfterSetup)}</p>` : ''}
        ${c?.status === 'ok' ? `<p>Şimdi sat vs T${row.tier + 1}: mevcut contract opportunity cost ${formatSilver(c.opportunityCost)} · Ek kâr ${formatSilver(c.additionalProfit)} · ${c.cycles} cycle / ${formatQuantity(c.days)} gün · Ek kâr/gün ${formatSilver(c.additionalProfitDay)} · Marginal break-even ${formatSilver(c.marginalBreakEven)}</p>` : c ? '<p>Şimdi sat / devam et: doğrulanmış progression ve güncel fiyatlar gerekli.</p>' : '<p>Son contract tier — sonraki tier yok.</p>'}
        ${p.status === 'ok' ? `<ol>${p.sequence.map((cycle) => `<li>T${cycle.from.tier} (${cycle.from.progress}) → T${cycle.to.tier} (${cycle.to.progress}): ${esc(itemLabel(cycle.journal))} · brüt ${formatSilver(cycle.economics.gross)} · reward ${formatSilver(cycle.economics.rewardNet)} · net ${formatSilver(cycle.economics.net)}</li>`).join('')}</ol>` : ''}
        <p>${esc(row.liquidity.label)}. Hacim, seçilen fiyattan satış garantisi değildir.</p>
    </details>`;
}

function renderResults() {
    const result = root.querySelector('[data-laborer-results]');
    if (!result) return;
    const openTiers = new Set([...result.querySelectorAll('[data-contract-detail][open]')].map((detail) => detail.dataset.contractDetail));
    const { rows, issues } = model();
    const best = optimum(rows);
    const mechanicErrors = mechanicIssues(mechanics());
    const current = contractAt(Number(state.startTier));
    const currentNet = netSale(quote(current.item, 'sell'), quantity(), state.premium);
    const summaryLabel = (row) => row ? `${row.liquidity.status !== 'observed' ? 'Teorik ' : ''}T${row.tier}: ${formatSilver(row.economics.profit)}` : 'Hesaplanamıyor';
    root.querySelector('[data-laborer-summary]').innerHTML = `<p>Şimdi sat — T${current.tier}: <strong>${formatSilver(currentNet)}</strong> net gümüş</p><p>En yüksek toplam kâr: ${summaryLabel(best.total)}</p><p>En yüksek zaman verimliliği: ${best.efficiency ? `${best.efficiency.liquidity.status !== 'observed' ? 'Teorik ' : ''}T${best.efficiency.tier}: ${formatSilver(best.efficiency.economics.profitSlotDay)} / slot / gün` : 'Hesaplanamıyor'}</p>`;
    result.innerHTML = `${loading ? '<p role="status">Piyasa fiyatları ve geçmiş alınıyor…</p>' : ''}${error ? `<p class="alert alert-warning" role="status">${esc(error)}</p>` : ''}
        ${mechanicErrors.length ? `<div class="alert alert-warning"><strong>Progression verisi doğrulanamadı</strong><p>${esc(mechanicErrors.join(' '))}</p><p>Contract satış değeri ve gözlenen journal dönüşleri hesaplanabilir. Tier progression, süre ve optimum tier sonuçları kullanılamaz.</p></div>` : ''}
        ${issues.map((issue) => `<p role="alert">${esc(issue)}</p>`).join('')}
        <div class="table-responsive calc-table-wrap"><table class="table table-striped calc-table">
        <thead><tr><th>Contract</th><th>Cycle / journal</th><th>Gün</th><th>Satış brüt / net</th><th>Net kâr</th><th>Kâr / slot / gün</th><th>Veri / detay</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${itemIconHtml(row.item, { size: 32 })} T${row.tier}</td><td>${row.economics.status === 'ok' ? `${row.economics.cycles} / ${row.economics.journals}` : '—'}</td><td>${formatQuantity(row.economics.days)}</td><td>${formatSilver(row.sale.price == null ? null : row.sale.price * quantity())} / ${formatSilver(netSale(row.sale, quantity(), state.premium))}</td><td>${formatSilver(row.economics.profit)}</td><td>${formatSilver(row.economics.profitSlotDay)}</td><td>${esc(priceIssue(row.sale) || `${row.sale.mode === 'manual' ? 'Manuel' : 'Canlı'} · ${row.sale.city} · ${formatDateTime(row.sale.date, { empty: 'Tarih yok' })}`)}${detail(row)}</td></tr>`).join('')}</tbody></table></div>
        <p class="calc-note">${esc(feeMetaText(state.premium))}. ${state.sellSide === 'sell' ? 'Satış emri: sell −1 ve setup.' : 'Anında satış: buy, setup yok.'} Eski/tarihsiz fiyatlar net gelir ve önerilerde kullanılmaz.</p>
        ${state.acquisitionMode === 'market' ? `<details><summary>Başlangıç contract alış fiyatı</summary>${priceField(current.item, 'buy')}</details>` : ''}
        ${renderJournalEconomics()}
        <details><summary>Oyun verisi ve belirsizlikler</summary><p>Contract türleri: labourercontract. Journal doldurma fame’i: @maxfame; progression olarak kullanılmaz. Loot listesi ve @labourerfame ham referans verisidir; bunlardan dönüş veya carry-over varsayımı yapılmaz.</p><p><a href="${esc(data.provenance.repository)}" target="_blank" rel="noreferrer">Albion game data kaynağı</a> · Reward yield üst sınırı ${esc(String(data.maxRewardYield))} (tek başına happiness formülü değildir).</p></details>`;
    bindPriceFields();
    bindRewardFields();
    result.querySelectorAll('[data-contract-detail]').forEach((detail) => { detail.open = openTiers.has(detail.dataset.contractDetail); });
    bindCalcSticky(root);
}

function renderJournalEconomics() {
    const journal = currentJournal();
    const observation = observedRewards(journal, state.rewardQuantities[journal.item]);
    const cycle = observation.status === 'ok' ? cycleEconomics({ ...journal, rewardsVerified: true, rewards: observation.rewards }, quote, state.premium) : observation;
    const setup = state.setupMode === 'existing' ? 0 : state.setupCost === '' ? null : Number(state.setupCost);
    const count = quantity();
    const validCount = Number.isSafeInteger(count) && count > 0;
    const firstCapital = cycle.status === 'ok' && validCount && Number.isFinite(acquisition()) && Number.isFinite(setup) ? (acquisition() + cycle.gross) * count + setup : null;
    return `<section class="laborer-journal"><h2>Journal cycle ekonomisi</h2>
        <p>${esc(itemLabel(journal.filled || journal.item))} · Fame Capacity ${formatQuantity(journal.fillFame)} · Dump base loot ${formatQuantity(journal.baseLootAmount)}. Bu alanlar tier progression eşikleri değildir.</p>
        <p>Loot miktarı / happiness formülü doğrulanmadı. Oyun ekranından laborer başına bir cycle’ın gerçek dönüşlerini gir. Generalist trophy bir resource journal gibi değerlendirilmez. Katalogdaki meslek eşleşmesi, journal’ın mevcut tier’da kabul edildiğini kanıtlamaz.</p>
        ${journal.filled ? priceField(journal.filled, 'buy') : '<p>Filled journal item kimliği doğrulanamadı.</p>'}
        <div class="table-responsive calc-table-wrap"><table class="table table-striped calc-table"><thead><tr><th>Dönen asset</th><th>Dump miktar / weight</th><th>Gerçek adet / cycle / laborer</th><th>Birim fiyat / net değer</th></tr></thead><tbody>
        ${rewardAssets(journal).map((item) => {
            const loot = journal.loot.find((row) => row.item === item);
            const amount = state.rewardQuantities[journal.item]?.[item] ?? '';
            const q = item === 'SILVER' ? null : quote(item, 'sell');
            const valid = amount !== '' && Number.isFinite(Number(amount)) && Number(amount) >= 0;
            const value = valid ? Number(amount) === 0 ? 0 : item === 'SILVER' ? Number(amount) : priceIssue(q) ? null : saleProceeds(q.price, saleOptions()) * Number(amount) : null;
            return `<tr><td>${item === 'SILVER' ? 'Silver (fee yok)' : esc(itemLabel(item))}${item === journal.empty ? ' · Yalnız gerçekten döndüyse' : ''}</td><td>${loot ? `${formatQuantity(loot.amount)} / ${formatQuantity(loot.weight)}` : 'Dump loot listesinde yok'}</td><td><input class="form-control" type="number" min="0" step="any" data-reward-quantity="${esc(item)}" value="${esc(String(amount))}" placeholder="Dönmediyse 0" aria-label="${esc(itemLabel(item))} gerçek dönüş adedi"></td><td>${item === 'SILVER' ? 'Gümüş doğrudan' : priceField(item, 'sell')}<p>Net / laborer: ${formatSilver(value)}</p></td></tr>`;
        }).join('')}</tbody></table></div>
        <button type="button" class="btn btn-sm btn-secondary" data-rewards-zero>Dönmeyen asset alanlarını 0 yap</button>
        <p>${cycle.status === 'ok' ? `Laborer başına: journal brüt ${formatSilver(cycle.gross)} − reward net ${formatSilver(cycle.rewardNet)} = net cycle maliyeti ${formatSilver(cycle.net)}; cycle net getirisi ${formatSilver(-cycle.net)}. ${validCount ? `${formatQuantity(count)} laborer: ${formatSilver(cycle.net * count)} net maliyet; ilk journal sermayesi ${formatSilver(cycle.gross * count)}.` : 'Geçerli laborer adedi gerekli.'}` : esc((cycle.issues || []).join(' '))}</p>
        <p>İlk cycle başlangıç sermayesi (edinim + journal + setup): ${formatSilver(firstCapital)}. Peak capital için progression sequence gerekli; hesaplanamıyor.</p>
        <p>Setup ayrı: ${formatSilver(setup)}. ${setup == null ? 'Yeni setup toplam bedeli gerekli.' : ''} Gözlenen cycle değerlemesi gelecekteki rastgele reward’ları garanti etmez; cycle süresi, progression ve günlük kâr bu panelden türetilmez.</p></section>`;
}

function bindRewardFields() {
    root.querySelectorAll('[data-reward-quantity]').forEach((input) => input.addEventListener('change', () => {
        const journal = currentJournal();
        state.rewardQuantities[journal.item] ||= {};
        state.rewardQuantities[journal.item][input.dataset.rewardQuantity] = input.value;
        persist(); renderResults();
    }));
    root.querySelector('[data-rewards-zero]')?.addEventListener('click', () => {
        const journal = currentJournal();
        state.rewardQuantities[journal.item] ||= {};
        for (const item of rewardAssets(journal)) if (state.rewardQuantities[journal.item][item] == null || state.rewardQuantities[journal.item][item] === '') state.rewardQuantities[journal.item][item] = 0;
        persist(); renderResults();
    });
}

function bindPriceFields() {
    root.querySelectorAll('[data-price-item]').forEach((input) => input.addEventListener('change', () => {
        const intent = input.dataset.priceIntent;
        const price = quote(input.dataset.priceItem, intent);
        const key = overrideKey(getSettings().server, price.item, price.city, price.side, intent);
        if (input.value === '') delete state.overrides[key];
        else state.overrides[key] = input.value;
        persist(); renderResults();
    }));
    root.querySelectorAll('[data-price-reset]').forEach((button) => button.addEventListener('click', () => {
        const price = quote(button.dataset.priceReset, button.dataset.priceIntent);
        delete state.overrides[overrideKey(getSettings().server, price.item, price.city, price.side, price.intent)];
        persist(); renderResults();
    }));
}

function field(label, key, options, disabled = false) {
    return `<label class="ava-side-field">${esc(label)}<select class="form-select" data-laborer-field="${key}"${disabled ? ' disabled' : ''}>${options.map(([value, text]) => `<option value="${esc(String(value))}"${String(state[key]) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}

function render() {
    const unavailable = mechanicIssues(mechanics()).length > 0;
    root.innerHTML = toolPageHtml({ key: 'laborer-contract',
        head: '<section class="page-head"><h1>Laborer Contract Calculator</h1><p>Contract tier’larını karşılaştır; bugünkü net satış değerini ve doğrulanmış verilerle devam etmenin maliyetini gör.</p></section>',
        controls: `<div class="ava-toolbar">
            ${field('Laborer', 'type', types.map((type) => [type.type, type.contracts[0].label.replace(/^\S+\s/, '').replace(/\sContract$/, '')]))}
            ${field('Başlangıç tier', 'startTier', selected().contracts.map((contract) => [contract.tier, `T${contract.tier}`]))}
            <label class="ava-side-field">Laborer adedi<input class="form-control" data-laborer-field="count" type="number" min="1" step="1" value="${esc(String(state.count))}"></label>
            ${field('Başlangıç maliyeti', 'acquisitionMode', [['owned', 'Elimde mevcut'], ['market', 'Başlangıç contract’ını al'], ['new', 'Yeni laborer / acquisition']])}
            ${state.acquisitionMode === 'new' && !mechanics().acquisition?.verified ? '<p>Yeni laborer edinim tier/bedeli doğrulanmadı; bu modun maliyeti hesaplanamaz.</p>' : ''}
            <label class="ava-side-field">Server (ortak ayar)<select class="form-select" data-laborer-server>${listServers().map((server) => `<option value="${esc(server.id)}"${getSettings().server === server.id ? ' selected' : ''}>${esc(server.label)}</option>`).join('')}</select></label>
            ${cityFieldHtml({ id: 'laborer-buy-city', label: 'Journal / contract alış şehri', selected: state.buyCity, cities, className: 'ava-city-field' })}
            ${cityFieldHtml({ id: 'laborer-sell-city', label: 'Contract / reward satış şehri', selected: state.sellCity, cities, className: 'ava-city-field' })}
            ${field('Alış yöntemi', 'buySide', [['sell', 'Anında alış (sell)'], ['buy', 'Alış emri (buy +1)']])}
            ${field('Satış yöntemi', 'sellSide', [['sell', 'Satış emri (sell −1)'], ['buy', 'Anında satış (buy)']])}
            <label><input type="checkbox" data-laborer-premium${state.premium ? ' checked' : ''}> Premium</label>
            ${field('Journal stratejisi', 'strategy', [['auto', 'Otomatik — ekonomik yol'], ['manual', 'Manuel — aşama bazında']], unavailable)}
            ${field('Journal cycle değerlemesi', 'journalItem', journalOptions().map((journal) => [journal.item, itemLabel(journal.filled || journal.item)]))}
            ${state.strategy === 'manual' && !unavailable ? Object.entries(mechanics().stages).filter(([tier]) => Number(tier) >= Number(state.startTier)).map(([tier, stage]) => `<label>T${esc(tier)} journal<select class="form-select" data-stage-journal="${esc(tier)}"><option value="">Otomatik</option>${stage.journals.map((journal) => `<option value="${esc(journal.filled)}"${state.manual[tier] === journal.filled ? ' selected' : ''}>${esc(itemLabel(journal.filled))}</option>`).join('')}</select></label>`).join('') : ''}
            ${field('Setup', 'setupMode', [['existing', 'Mevcut altyapım var'], ['new', 'Yeni setup kuracağım']])}
            ${state.setupMode === 'new' ? `<label>Gerçek building / furniture toplamı (ayrı)<input class="form-control" data-laborer-field="setupCost" type="number" min="0" value="${esc(String(state.setupCost))}" placeholder="Doğrulanmış toplam maliyet"></label><p>Otomatik setup reçetesi doğrulanmadı. Girilen toplam setup bedeli ayrıca gösterilir.</p>` : ''}
            <button type="button" class="btn btn-primary" data-laborer-refresh>Fiyatları yenile</button>
        </div>`,
        summary: '<div data-laborer-summary aria-live="polite"></div>',
        result: '<div data-laborer-results></div>', resultClass: 'result--sections' });
    root.querySelectorAll('[data-laborer-field]').forEach((input) => input.addEventListener('change', () => {
        const key = input.dataset.laborerField;
        state[key] = input.value;
        if (key === 'type') {
            if (!contractAt(Number(state.startTier))) state.startTier = selected().contracts[0].tier;
            state.manual = {};
            state.journalItem = journalOptions()[0].item;
        }
        persist(); render(); void refresh();
    }));
    root.querySelectorAll('[data-stage-journal]').forEach((select) => select.addEventListener('change', () => {
        state.manual[select.dataset.stageJournal] = select.value; persist(); renderResults();
    }));
    root.querySelector('[data-laborer-server]').addEventListener('change', (event) => { saveSettings({ server: event.target.value }); render(); void refresh(); });
    root.querySelector('[data-laborer-premium]').addEventListener('change', (event) => { state.premium = event.target.checked; persist(); renderResults(); });
    for (const [name, key] of [['laborer-buy-city', 'buyCity'], ['laborer-sell-city', 'sellCity']]) bindCityField(root, name, (value) => { state[key] = value; persist(); void refresh(); });
    root.querySelector('[data-laborer-refresh]').addEventListener('click', () => { void refresh(true); });
    renderResults();
}

async function init() {
    try {
        await initStore();
        data = await loadLaborerData(); types = laborerTypes(data); cities = loadActiveCities();
        if (!types.length || !cities.length) throw new Error('Laborer veya aktif şehir verisi yok.');
        if (!types.some((type) => type.type === state.type)) state.type = types[0].type;
        if (!contractAt(Number(state.startTier))) state.startTier = selected().contracts[0].tier;
        for (const key of ['buyCity', 'sellCity']) if (!cities.some((city) => city.marketApiName === state[key])) state[key] = cities.some((city) => city.marketApiName === getDefaultCity()) ? getDefaultCity() : cities[0].marketApiName;
        state.overrides = state.overrides && typeof state.overrides === 'object' ? state.overrides : {};
        state.manual = state.manual && typeof state.manual === 'object' ? state.manual : {};
        state.rewardQuantities = state.rewardQuantities && typeof state.rewardQuantities === 'object' ? state.rewardQuantities : {};
        if (!journalOptions().some((journal) => journal.item === state.journalItem)) state.journalItem = journalOptions()[0].item;
        render(); initNav('laborer-contract');
        bindLivePrices(() => ({ items: marketItems(), cities: [state.buyCity, state.sellCity] }), () => { void refresh(true); });
        await refresh();
    } catch (cause) { root.innerHTML = `<p role="alert">${esc(cause.message)}</p>`; }
}

void init();
