import { initForms } from '../components/forms.js';
import { showToast } from '../components/toast.js';
import { toolPageHtml } from '../components/tool-page.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { getSettings, getDefaultCity } from '../core/settings.js';
import { priceSideToggleHtml } from '../core/price-side.js';
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
import { acquisitionStartTier, hireCost } from '../core/laborer/acquisition.mjs';
import { resolvePrice, overrideKey, priceIssue } from '../core/laborer/prices.js';
import { liquidity } from '../core/laborer/liquidity.js';
import { planProgression } from '../core/laborer/planning.js';
import { cycleEconomics, evaluatePlan, compareContinue, optimum, netSale, economicPriceState } from '../core/laborer/economics.js';
import { rewardAssets, observedRewards, resolveRewards } from '../core/laborer/rewards.js';
import { progressionRules } from '../core/laborer/progression-rules.js';

const STORAGE_KEY = 'albiontools.v4.laborer-contract';
const PRICE_BATCH_SIZE = 80;
const root = document.querySelector('[data-tool="laborer-contract"]');
let data, types, cities, request = 0;
let priceIndex = new Map(), history = new Map();
let activeMarketKey = '';
const state = { type: '', startTier: 2, count: 1, acquisitionMode: 'owned',
    buyCity: '', sellCity: '',
    returnYield: 100, strategy: 'auto', manual: {}, setupMode: 'existing', setupCost: '', overrides: {}, journalItem: '', rewardQuantities: {}, ...readJsonStorage(STORAGE_KEY) };

const selected = () => types.find((type) => type.type === state.type);
const mechanics = () => progressionRules(data, state.type, { returnYield: Number(state.returnYield) / 100 });
const persist = () => writeJsonStorage(STORAGE_KEY, state);
const quantity = () => Number(state.count);
const startTier = () => acquisitionStartTier(data, state);
const contractAt = (tier) => selected().contracts.find((contract) => contract.tier === tier);
const saleOptions = () => ({ premium: state.premium, setup: state.sellSide === 'sell' });
const journalOptions = () => {
    const accepted = new Set(data.mechanics.byType[state.type]?.stages[startTier()]?.accepted || []);
    return data.journals.filter((journal) => accepted.has(journal.filled));
};
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
    priceIndex = new Map(); history = new Map();
    showToast('Piyasa fiyatları ve geçmiş güncelleniyor…', { kind: 'info' });
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
    else { activeMarketKey = ''; }
    if (results[1].status === 'fulfilled') history = results[1].value;
    if (results[0].status === 'rejected') {
        showToast(results[0].reason?.message || 'Fiyatlar alınamadı', { kind: 'error' });
    } else if (results[1].status === 'rejected') {
        showToast('Fiyatlar güncellendi; piyasa geçmişi alınamadı.', { kind: 'info' });
    } else {
        showToast('Piyasa fiyatları ve geçmiş güncellendi.');
    }
    renderResults();
}

function acquisition() {
    if (state.acquisitionMode === 'owned') return 0;
    if (state.acquisitionMode === 'market') {
        const price = quote(contractAt(startTier()).item, 'buy');
        return priceIssue(price) ? null : purchaseCost(price.price, { setup: price.setup });
    }
    return hireCost(data, state.type);
}

function plan(startTier, targetTier, progress = 0) {
    return planProgression({ mechanics: mechanics(), startTier, targetTier, progress,
        manual: state.strategy === 'manual' ? state.manual : {},
        journalEconomics: (journal) => cycleEconomics(journal, quote, state.premium) });
}

function model() {
    const tiers = selected().contracts.filter((row) => row.tier >= startTier());
    const count = quantity();
    if (!Number.isSafeInteger(count) || count < 1) return { issues: ['Laborer adedi pozitif bir tam sayı olmalı.'], rows: [] };
    const rows = tiers.map((contract) => {
        const sale = quote(contract.item, 'sell');
        const progression = plan(startTier(), contract.tier);
        const setupCost = state.setupMode === 'existing' ? 0 : state.setupCost === '' ? null : Number(state.setupCost);
        const economics = evaluatePlan({ plan: progression, acquisition: acquisition(), quantity: count, sale, premium: state.premium, setupCost });
        const next = contractAt(contract.tier + 1);
        const continuation = next ? compareContinue({
            plan: plan(contract.tier, next.tier, progression.status === 'ok' ? progression.end.progress : 0),
            currentSale: sale, nextSale: quote(next.item, 'sell'), quantity: count, premium: state.premium
        }) : null;
        const priceState = economicPriceState({ plan: progression, sale,
            acquisitionQuote: state.acquisitionMode === 'market' ? quote(contractAt(startTier()).item, 'buy') : null });
        return { ...contract, sale, progression, economics, continuation, priceState,
            liquidity: liquidity(historyAt(history, contract.item, state.sellCity), count) };
    });
    return { rows, issues: [] };
}

let priceFieldSequence = 0;
const disclosureState = new Map();

function rememberDisclosures() {
    root.querySelectorAll('[data-laborer-disclosure]').forEach((panel) => {
        disclosureState.set(panel.dataset.laborerDisclosure, panel.open);
    });
}

function priceField(item, intent) {
    const price = quote(item, intent);
    const key = overrideKey(getSettings().server, item, price.city, price.side, intent);
    const manual = Object.hasOwn(state.overrides, key);
    const value = manual ? state.overrides[key] : price.price ?? '';
    const fieldId = `laborer-price-${++priceFieldSequence}`;
    const status = priceIssue(price);
    return `<div class="laborer-price">
        <div class="form-floating ava-price-field${manual ? ' is-manual' : ''}${status ? ' is-missing' : ''}">
            <input id="${fieldId}" class="form-control" type="number" min="1" step="1" data-price-item="${esc(item)}" data-price-intent="${intent}" value="${esc(String(value))}" placeholder=" " aria-label="${esc(itemLabel(item))} manuel ${intent === 'buy' ? 'alış' : 'satış'} fiyatı">
            <label for="${fieldId}">Manuel ${intent === 'buy' ? 'alış' : 'satış'} fiyatı</label>
        </div>
        <small class="laborer-price-meta">${esc(itemLabel(item))} · ${esc(price.city)} · ${intent === 'buy' ? price.side === 'buy' ? 'Buy Order' : 'Buy' : price.side === 'sell' ? 'Sell Order' : 'Sell'} · ${manual ? 'Manuel fiyat' : status ? 'Canlı fiyat: Yok' : 'Canlı'} · ${esc(formatDateTime(price.date, { empty: 'Tarih yok' }))}${status ? ` · ${esc(status)}` : ''}</small>
        ${manual ? `<button type="button" class="btn btn-sm btn-secondary" data-price-reset="${esc(item)}" data-price-intent="${intent}">Canlı fiyata dön</button>` : ''}
    </div>`;
}

const priceStatus = (sale) => sale.status === 'ok' ? sale.mode === 'manual' ? 'Manuel' : 'Canlı' : sale.status === 'stale' ? 'Eski fiyat' : sale.status === 'invalid' ? 'Geçersiz fiyat' : 'Fiyat yok';
const economicPriceStatus = (row) => row.priceState.missing.length ? `${row.priceState.missing.length} fiyat ${row.priceState.status === 'STALE' ? 'eski' : 'eksik'}` : row.priceState.status === 'MANUAL' ? 'Manuel' : 'Canlı';
const metricList = (entries) => `<dl class="laborer-metrics">${entries.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const detailCard = (title, content) => `<section class="laborer-detail-card"><h3>${esc(title)}</h3>${content}</section>`;
const issueText = (issue) => issue.replace(/T\d_[A-Z0-9_]+/g, (item) => itemLabel(item));

function detail(row) {
    const e = row.economics;
    const p = row.progression;
    const c = row.continuation;
    const issues = [...new Set([...(p.issues || []), ...(e.issues || []), ...(c?.issues || [])])];
    const editablePrices = row.priceState.dependencies.filter(price => priceIssue(price) || price.mode === 'manual');
    return `<div class="laborer-detail-identity">${itemIconHtml(row.item, { size: 64 })}<div><strong>T${row.tier}</strong><p>${esc(itemLabel(row.item))}</p></div><span class="laborer-price-status">${esc(economicPriceStatus(row))}</span></div>
        ${editablePrices.length ? `<section class="laborer-detail-card" data-laborer-missing-prices><h3>Eksik fiyatlar</h3>${editablePrices.map(price => priceField(price.item, price.intent)).join('')}</section>` : ''}
        <div class="laborer-detail-grid">
        ${detailCard('Fiyat özeti', metricList([
            ['Net satış', formatSilver(netSale(row.sale, quantity(), state.premium))],
            ['Birim fiyat', formatSilver(row.sale.price)],
            ['Adet', formatQuantity(quantity())]
        ]) + priceField(row.item, 'sell') + (state.acquisitionMode === 'market' ? priceField(contractAt(startTier()).item, 'buy') : ''))}
        ${detailCard('Fee / vergi', `<p class="calc-note">${esc(feeMetaText(state.premium))}</p><p class="calc-note">${state.sellSide === 'sell' ? 'Satış emri: sell −1 ve setup.' : 'Anında satış: buy, setup yok.'}</p>`)}
        ${detailCard('Journal planı', metricList([
            ['Cycle / journal', Number.isFinite(e.cycles) ? `${e.cycles} / ${e.journals}` : '—'],
            ['Planlama günü', formatQuantity(e.days)], ['Gerçek job süresi (saat)', formatQuantity(e.actualHours)], ['Journal brüt', formatSilver(e.grossJournalCost)],
            ['Levelleme net', formatSilver(e.levelingCost)], ['Başlangıç sermayesi', formatSilver(e.initialCapital)],
            ['Peak capital', formatSilver(e.peakCapital)], ['Ayrı setup', formatSilver(e.setupCost)],
            ['Doğrulanan edinim sermayesi', formatSilver(e.acquisitionCapital)],
            ['Setup sonrası', formatSilver(e.profitAfterSetup)]
        ]) + (p.status === 'ok' ? `<ol class="laborer-plan-sequence">${p.sequence.map((cycle) => `<li>T${cycle.from.tier} → T${cycle.to.tier}: ${esc(itemLabel(cycle.journal))} · expected fame ${formatQuantity(cycle.fame)} · threshold ${formatQuantity(cycle.threshold ?? mechanics().stages[cycle.from.tier].requiredFame)} · carry-over ${formatQuantity(cycle.to.progress)} · brüt ${formatSilver(cycle.economics?.gross)} · reward ${formatSilver(cycle.economics?.rewardNet)} · net ${formatSilver(cycle.economics?.net)}</li>`).join('')}</ol>` : ''))}
        ${detailCard('Reward değeri', metricList([['Toplam reward net', formatSilver(e.rewardNet)], ['Reward yield üst sınırı', esc(String(data.maxRewardYield))]]) + `<details data-laborer-disclosure="journal"><summary>Journal dönüşlerini hesapla</summary>${renderJournalEconomics()}</details>`)}
        ${detailCard('Break-even', metricList([
            ['Gerekli satış fiyatı', formatSilver(e.breakEven)], ['Net kâr', formatSilver(e.profit)],
            ['Laborer başına kâr', formatSilver(e.perLaborer)], ['Kâr / gün', formatSilver(e.profitDay)],
            ['ROI', formatPct(e.roi)]
        ]))}
        ${detailCard('Şimdi sat vs devam et', c?.status === 'ok' ? metricList([
            ['Şimdi sat (net)', formatSilver(c.opportunityCost)], ['Ek maliyet', formatSilver(c.incrementalCost)],
            ['Ek kâr', formatSilver(c.additionalProfit)], ['Cycle', formatQuantity(c.cycles)],
            ['Planlama günü', formatQuantity(c.days)], ['Ek kâr / gün', formatSilver(c.additionalProfitDay)],
            ['Marginal break-even', formatSilver(c.marginalBreakEven)]
        ]) : `<p class="calc-note">${c ? 'Karşılaştırma için gerekli fiyatlar veya hesap verileri eksik.' : 'Son contract tier — sonraki tier yok.'}</p>`)}
        </div>${issues.length ? `<details data-laborer-disclosure="selected-issues"><summary>Hesap belirsizlikleri</summary><ul class="calc-note">${issues.map((issue) => `<li>${esc(issueText(issue))}</li>`).join('')}</ul></details>` : ''}`;
}

function renderResults() {
    const result = root.querySelector('[data-laborer-results]');
    if (!result) return;
    const tableScroll = result.querySelector('[data-laborer-comparison-scroll]');
    const scrollTop = tableScroll?.scrollTop || 0;
    const scrollLeft = tableScroll?.scrollLeft || 0;
    priceFieldSequence = 0;
    rememberDisclosures();
    const { rows, issues } = model();
    const best = optimum(rows);
    const mechanicErrors = mechanicIssues(mechanics());
    const current = contractAt(startTier());
    const currentNet = netSale(quote(current.item, 'sell'), quantity(), state.premium);
    const selectedRow = rows.find((row) => row.tier === Number(state.selectedTier)) || rows[0];
    if (selectedRow) state.selectedTier = selectedRow.tier;
    const summaryLabel = (row) => row ? `${row.economics.optimal === false ? 'Mevcut fiyatlı rotalar · ' : ''}${row.liquidity.status !== 'observed' ? 'Teorik ' : ''}T${row.tier}: ${formatSilver(row.economics.profit)}` : 'Hesaplanamıyor';
    const efficiencyLabel = best.efficiency ? `${best.efficiency.liquidity.status !== 'observed' ? 'Teorik ' : ''}T${best.efficiency.tier}: ${formatSilver(best.efficiency.economics.profitSlotDay)}` : 'Hesaplanamıyor';
    const summaryCard = (title, value, note) => `<section class="laborer-result-card laborer-kpi"><h2>${esc(title)}</h2><strong>${value}</strong><small>${esc(note)}</small></section>`;
    result.innerHTML = `<div class="laborer-dashboard-top">
        <div class="laborer-kpis">
        ${summaryCard('Şimdi sat', formatSilver(currentNet), `T${current.tier} · net gümüş`)}
        ${summaryCard('En yüksek toplam kâr', summaryLabel(best.total), 'Net gümüş')}
        ${summaryCard('En yüksek kâr / slot / gün', efficiencyLabel, 'Net gümüş / slot / gün')}
        ${summaryCard('Gerekli sermaye', formatSilver(selectedRow?.economics.initialCapital), `${formatQuantity(quantity())} laborer · T${selectedRow?.tier ?? current.tier}`)}
        </div></div>
        <div class="laborer-dashboard-middle">
        <section class="laborer-result-card laborer-comparison"><h2 class="laborer-section-title">Contract tier karşılaştırması</h2><div class="table-responsive calc-table-wrap" data-laborer-comparison-scroll><table class="table table-striped calc-table">
        <thead><tr><th>Contract</th><th>Cycle / Journal</th><th>Planlama günü</th><th>Net satış</th><th>Net kâr</th><th>Kâr / slot / gün</th><th>Fiyat durumu</th></tr></thead>
        <tbody>${rows.map((row) => `<tr data-laborer-result-tier="${row.tier}" class="${row.tier === selectedRow?.tier ? 'is-selected' : ''}"><td><button type="button" class="laborer-contract-item" data-laborer-select-tier="${row.tier}" aria-pressed="${row.tier === selectedRow?.tier}" aria-label="T${row.tier} detaylarını göster">${itemIconHtml(row.item, { size: 64 })}<span>T${row.tier}</span></button></td><td>${Number.isFinite(row.economics.cycles) ? `${row.economics.cycles} / ${row.economics.journals}` : '—'}</td><td>${formatQuantity(row.economics.days)}</td><td>${formatSilver(netSale(row.sale, quantity(), state.premium))}</td><td>${formatSilver(row.economics.profit)}</td><td>${formatSilver(row.economics.profitSlotDay)}</td><td><span class="laborer-price-status" data-economic-price-status="${row.priceState.status}">${esc(economicPriceStatus(row))}</span></td></tr>`).join('')}</tbody></table></div>
        <p class="calc-note">${esc(feeMetaText(state.premium))}. ${state.sellSide === 'sell' ? 'Satış emri: sell −1 ve setup.' : 'Anında satış: buy, setup yok.'} Eski/tarihsiz fiyatlar net gelir ve önerilerde kullanılmaz.</p></section>
        <section class="laborer-result-card laborer-selected-detail"><h2 class="laborer-section-title" data-laborer-detail-title>Seçili tier detayları${selectedRow ? ` — T${selectedRow.tier}` : ''}</h2><div class="laborer-panel-scroll" data-laborer-selected-detail>${selectedRow ? detail(selectedRow) : '<p>Geçerli laborer adedi gerekli.</p>'}</div></section>
        </div>
        <div class="laborer-dashboard-bottom">
        <section class="laborer-result-card"><h2 class="laborer-section-title">Oyun verisi ve belirsizlikler</h2><div class="laborer-panel-scroll"><p>Contract türleri: labourercontract. Journal doldurma fame’i: @maxfame; progression olarak kullanılmaz. Return yield senaryosunda reward ve laborer fame aynı loot dağılımından türetilir. Carry-over davranışsal kaynaktır; job başına en fazla bir tier advance edilir.</p><p><a href="${esc(data.provenance.repository)}" target="_blank" rel="noreferrer">Albion game data kaynağı</a> · Reward yield üst sınırı ${esc(String(data.maxRewardYield))} (tek başına happiness formülü değildir).</p></div></section>
        <section class="laborer-result-card laborer-status-panel" role="status"><h2 class="laborer-section-title">Hesap durumu</h2><div class="laborer-panel-scroll"><strong>${mechanicErrors.length ? 'Mekanik veri eksik.' : 'XML mekanikleri ve davranışsal carry-over kullanılıyor. Sonuçlar beklenen loot senaryosudur.'}</strong>
        ${mechanicErrors.length ? `<p>${esc(mechanicErrors.join(' '))}</p><p>Job süresi 22 saat; planlamada her job 1 gün sayılır. Journal dönüşlerini manuel girebilirsin.</p>` : ''}
        ${issues.map((issue) => `<p role="alert">${esc(issueText(issue))}</p>`).join('')}</div></section>
        <section class="laborer-result-card"><h2 class="laborer-section-title">Fiyat / likidite / debug</h2><div class="laborer-panel-scroll">${metricList([
            ['Fiyat tarihi', esc(formatDateTime(selectedRow?.sale.date, { empty: 'Tarih yok' }))],
            ['Veri kaynağı', esc(getSettings().priceSource)],
            ['Piyasa', `${esc(state.buyCity)} → ${esc(state.sellCity)}`],
            ['Alış / satış', `${state.buySide === 'buy' ? 'Buy Order' : 'Buy'} / ${state.sellSide === 'sell' ? 'Sell Order' : 'Sell'}`],
            ['Likidite', esc(selectedRow?.liquidity.label || 'Hesaplanamıyor')],
            ['Fiyat durumu', selectedRow ? esc(economicPriceStatus(selectedRow)) : '—']
        ])}<p class="calc-note">Hacim, seçilen fiyattan satış garantisi değildir. Eski/tarihsiz fiyatlar net gelir ve önerilerde kullanılmaz.</p></div></section>
        </div>`;
    initForms(result);
    bindPriceFields();
    bindRewardFields();
    result.onclick = (event) => {
        const row = event.target.closest('[data-laborer-result-tier]');
        if (!row || event.target.closest('input, select, a')) return;
        state.selectedTier = Number(row.dataset.laborerResultTier);
        const focused = event.target.closest('[data-laborer-select-tier]');
        // Selection is presentation-only: no persistence, market refresh or input-tier change.
        renderResults();
        if (focused) result.querySelector(`[data-laborer-select-tier="${state.selectedTier}"]`)?.focus({ preventScroll: true });
    };
    root.querySelectorAll('[data-laborer-disclosure]').forEach((panel) => { panel.open = disclosureState.get(panel.dataset.laborerDisclosure) ?? false; });
    const newTableScroll = result.querySelector('[data-laborer-comparison-scroll]');
    newTableScroll.scrollTop = scrollTop;
    newTableScroll.scrollLeft = scrollLeft;
    bindCalcSticky(root);
}

function renderJournalEconomics() {
    const journal = currentJournal();
    const expected = resolveRewards(journal, { returnYield: Number(state.returnYield) / 100 });
    const observation = observedRewards(journal, state.rewardQuantities[journal.item]);
    const resolution = observation.status === 'ok' ? observation : expected;
    const cycle = resolution.status === 'ok' ? cycleEconomics({ ...journal, ...resolution, rewardsVerified: true }, quote, state.premium) : resolution;
    const setup = state.setupMode === 'existing' ? 0 : state.setupCost === '' ? null : Number(state.setupCost);
    const count = quantity();
    const validCount = Number.isSafeInteger(count) && count > 0;
    const firstCapital = cycle.status === 'ok' && validCount && Number.isFinite(acquisition()) && Number.isFinite(setup) ? (acquisition() + cycle.gross) * count + setup : null;
    return `<section class="laborer-journal-content">
        <p class="calc-note">${esc(itemLabel(journal.filled || journal.item))} · ${resolution.source === 'observed-manual' ? 'Gözlenen cycle' : `Beklenen cycle · return yield ${state.returnYield}%`} · laborer fame ${formatQuantity(resolution.expectedLabourerFame)}. Gerçek ölçüm için tüm adetleri gir; dönmeyen asset için 0 kullan.</p>

        ${journal.filled ? priceField(journal.filled, 'buy') : '<p class="calc-note">Filled journal item kimliği doğrulanamadı.</p>'}
        <div class="table-responsive calc-table-wrap"><table class="table table-striped calc-table"><thead><tr><th>Dönen asset</th><th>Gerçek adet / cycle / laborer</th><th>Birim fiyat / net değer</th></tr></thead><tbody>
        ${rewardAssets(journal).map((item) => {
            const amount = state.rewardQuantities[journal.item]?.[item] ?? '';
            const q = item === 'SILVER' ? null : quote(item, 'sell');
            const valid = amount !== '' && Number.isFinite(Number(amount)) && Number(amount) >= 0;
            const value = valid ? Number(amount) === 0 ? 0 : item === 'SILVER' ? Number(amount) : priceIssue(q) ? null : saleProceeds(q.price, saleOptions()) * Number(amount) : null;
            return `<tr><td>${item === 'SILVER' ? 'Silver (fee yok)' : esc(itemLabel(item))}${item === journal.empty ? ' · Yalnız gerçekten döndüyse' : ''}</td><td><input class="form-control" type="number" min="0" step="any" data-reward-quantity="${esc(item)}" value="${esc(String(amount))}" placeholder="Dönmediyse 0" aria-label="${esc(itemLabel(item))} gerçek dönüş adedi"></td><td>${item === 'SILVER' ? 'Gümüş doğrudan' : priceField(item, 'sell')}<p class="calc-note">Net / laborer: ${formatSilver(value)}</p></td></tr>`;
        }).join('')}</tbody></table></div>
        <button type="button" class="btn btn-sm btn-secondary" data-rewards-zero>Dönmeyen asset alanlarını 0 yap</button>
        <p class="calc-note">${cycle.status === 'ok' ? `Laborer başına: journal brüt ${formatSilver(cycle.gross)} − reward net ${formatSilver(cycle.rewardNet)} = net cycle maliyeti ${formatSilver(cycle.net)}; cycle net getirisi ${formatSilver(-cycle.net)}. ${validCount ? `${formatQuantity(count)} laborer: ${formatSilver(cycle.net * count)} net maliyet; ilk journal sermayesi ${formatSilver(cycle.gross * count)}.` : 'Geçerli laborer adedi gerekli.'}` : esc((cycle.issues || []).join(' '))}</p>
        <p class="calc-note">İlk cycle başlangıç sermayesi (edinim + journal + setup): ${formatSilver(firstCapital)}. Bu panel tek cycle ölçümüdür; planlama yield senaryosu seçili tier detaylarında gösterilir.</p>
        <details data-laborer-disclosure="journal-reference"><summary>Journal referans verisi ve varsayımlar</summary><p class="calc-note">Fame Capacity ${formatQuantity(journal.fillFame)} · Dump base loot ${formatQuantity(journal.baseLootAmount)}. Bunlar tier progression eşikleri değildir. Expected loot: base loot × return yield × normalize weight × item amount. Kabul edilen journal ID’leri doğrudan buildings.xml listesinden gelir. Happiness için ayrı XP çarpanı kullanılmaz.</p><ul>${journal.loot.map((loot) => `<li>${esc(itemLabel(loot.item))}: ${formatQuantity(loot.amount)} miktar / ${formatQuantity(loot.weight)} weight</li>`).join('')}</ul></details>
        <p class="calc-note">Setup ayrı: ${formatSilver(setup)}. ${setup == null ? 'Yeni setup toplam bedeli gerekli.' : ''} Gözlenen cycle değerlemesi gelecekteki rastgele reward’ları garanti etmez; cycle süresi, progression ve günlük kâr bu panelden türetilmez.</p></section>`;
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

function field(label, key, options, disabled = false, icon = '') {
    const control = `<div class="form-floating"><select id="laborer-${key}" class="form-select" data-laborer-field="${key}"${disabled ? ' disabled' : ''}>${options.map(([value, text]) => `<option value="${esc(String(value))}"${String(state[key]) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select><label for="laborer-${key}">${esc(label)}</label></div>`;
    return icon ? `<div class="price-field-row"><span class="price-field-aside" aria-hidden="true">${itemIconHtml(icon, { className: 'item-icon price-field-aside-icon' })}</span>${control}</div>` : control;
}

function render() {
    rememberDisclosures();
    const unavailable = mechanicIssues(mechanics()).length > 0;
    state.journalItem = currentJournal()?.item || '';
    root.innerHTML = toolPageHtml({ key: 'laborer-contract',
        head: '<section class="page-head" data-page-head="laborer-contract"><h1>Laborer Contract Calculator</h1><p>Contract tier’larını karşılaştır; bugünkü net satış değerini ve doğrulanmış verilerle devam etmenin maliyetini gör.</p></section>',
        controls: `<div class="laborer-controls"><section class="laborer-control-group"><h2>Laborer</h2>
            ${field('Laborer', 'type', types.map((type) => [type.type, type.contracts[0].label.replace(/^\S+\s/, '').replace(/\sContract$/, '')]))}
            <div class="price-side-field"><span class="price-side-label">Tier</span><div class="price-side laborer-tiers" role="group" aria-label="Başlangıç tier">${selected().contracts.map(({ tier }) => `<button type="button" class="price-side-btn${startTier() === tier ? ' is-active' : ''}" data-tier="${tier}" data-laborer-tier="${tier}"${state.acquisitionMode === 'new' ? ' disabled' : ''} aria-pressed="${startTier() === tier}">T${tier}</button>`).join('')}</div></div>
            <div class="laborer-control-pair">
            <div class="form-floating"><input id="laborer-count" class="form-control" data-laborer-field="count" type="number" min="1" step="1" value="${esc(String(state.count))}" placeholder="Adet"><label for="laborer-count">Adet</label></div>
            ${field('Başlangıç maliyeti', 'acquisitionMode', [['owned', 'Elimde mevcut'], ['market', 'Marketten başlangıç contract’ı al'], ['new', 'Sıfırdan laborer edin']])}
            </div>
            </section><section class="laborer-control-group"><h2>Piyasa</h2>
            ${cityFieldHtml({ id: 'laborer-buy-city', label: 'Alış şehri', selected: state.buyCity, cities, className: 'ava-city-field' })}
            ${cityFieldHtml({ id: 'laborer-sell-city', label: 'Satış şehri', selected: state.sellCity, cities, className: 'ava-city-field' })}
            ${[['buySide', 'Alış', { buy: 'Buy Order', sell: 'Buy' }], ['sellSide', 'Satış', { buy: 'Sell', sell: 'Sell Order' }]].map(([key, label, labels]) => `<div class="price-side" role="group" aria-label="${label} yöntemi">${priceSideToggleHtml(key, state[key], labels)}</div>`).join('')}
            <div class="ava-type" role="group" aria-label="Premium">${[[true, 'Premium'], [false, 'Premium yok']].map(([value, label]) => `<button type="button" class="ava-type-btn${state.premium === value ? ' is-active' : ''}" data-laborer-premium="${value}" aria-pressed="${state.premium === value}">${label}</button>`).join('')}</div>
            </section><section class="laborer-control-group"><h2>Journal ve altyapı</h2>${field('Journal stratejisi', 'strategy', [['auto', 'Otomatik — ekonomik yol'], ['manual', 'Manuel — aşama bazında']], unavailable)}
            <div class="form-floating"><input id="laborer-return-yield" class="form-control" type="number" min="50" max="150" step="5" data-laborer-field="returnYield" value="${esc(String(state.returnYield))}" placeholder="Return yield"><label for="laborer-return-yield">Return yield (%)</label></div>
            ${field('Journal cycle değerlemesi', 'journalItem', journalOptions().map((journal) => [journal.item, itemLabel(journal.filled || journal.item)]), false, currentJournal().filled || currentJournal().item)}
            ${state.strategy === 'manual' && !unavailable ? Object.entries(mechanics().stages).filter(([tier, stage]) => Number(tier) >= startTier() && stage.requiredFame > 0).map(([tier, stage]) => `<div class="price-field-row"><span class="price-field-aside" aria-hidden="true">${itemIconHtml(state.manual[tier] || stage.journals[0]?.filled, { className: 'item-icon price-field-aside-icon' })}</span><div class="form-floating"><select id="laborer-${esc(tier)}" class="form-select" data-stage-journal="${esc(tier)}"><option value="">Otomatik</option>${stage.journals.map((journal) => `<option value="${esc(journal.filled)}"${state.manual[tier] === journal.filled ? ' selected' : ''}>${esc(itemLabel(journal.filled))}</option>`).join('')}</select><label for="laborer-${esc(tier)}">T${esc(tier)} journal</label></div></div>`).join('') : ''}
            ${field('Setup', 'setupMode', [['existing', 'Mevcut altyapım var'], ['new', 'Yeni setup kuracağım']])}
            ${state.setupMode === 'new' ? `<div class="form-floating"><input id="laborer-setupCost" class="form-control" data-laborer-field="setupCost" type="number" min="0" value="${esc(String(state.setupCost))}" placeholder="Doğrulanmış toplam maliyet"><label for="laborer-setupCost">Toplam altyapı maliyeti</label></div><p>Otomatik setup reçetesi doğrulanmadı. Girilen toplam setup bedeli ayrıca gösterilir.</p>` : ''}
            </section><button type="button" class="btn btn-primary" data-laborer-refresh>Fiyatları yenile</button>
        </div>`,
        result: '<div data-laborer-results></div>', resultClass: 'laborer-result' });
    root.querySelectorAll('[data-laborer-field]').forEach((input) => input.addEventListener('change', () => {
        const key = input.dataset.laborerField;
        if (key === 'returnYield' && !input.checkValidity()) { input.reportValidity(); return; }
        state[key] = input.value;
        if (key === 'type') {
            if (!contractAt(startTier())) state.startTier = selected().contracts[0].tier;
            state.manual = {};
            state.journalItem = journalOptions()[0].item;
        }
        persist(); render(); void refresh();
    }));
    root.querySelectorAll('[data-stage-journal]').forEach((select) => select.addEventListener('change', () => {
        state.manual[select.dataset.stageJournal] = select.value; persist(); render();
    }));
    root.querySelectorAll('[data-laborer-tier]').forEach((button) => button.addEventListener('click', () => {
        state.startTier = Number(button.dataset.laborerTier); persist(); render(); void refresh();
    }));
    root.querySelectorAll('[data-price-for]').forEach((button) => button.addEventListener('click', () => {
        state[button.dataset.priceFor] = button.dataset.priceSide; persist(); render();
    }));
    root.querySelectorAll('[data-laborer-premium]').forEach((button) => button.addEventListener('click', () => { state.premium = button.dataset.laborerPremium === 'true'; persist(); render(); }));
    for (const [name, key] of [['laborer-buy-city', 'buyCity'], ['laborer-sell-city', 'sellCity']]) bindCityField(root, name, (value) => { state[key] = value; persist(); void refresh(); });
    root.querySelector('[data-laborer-refresh]').addEventListener('click', () => { void refresh(true); });
    initForms(root);
    renderResults();
}

async function init() {
    try {
        await initStore();
        if (!Number.isFinite(Number(state.returnYield)) || Number(state.returnYield) < 50 || Number(state.returnYield) > 150) state.returnYield = 100;
        const settings = getSettings();
        state.buySide = settings.buyPriceSide;
        state.sellSide = settings.sellPriceSide;
        state.premium = settings.premium;
        data = await loadLaborerData(); types = laborerTypes(data); cities = loadActiveCities();
        if (!types.length || !cities.length) throw new Error('Laborer veya aktif şehir verisi yok.');
        if (!types.some((type) => type.type === state.type)) state.type = types[0].type;
        if (!contractAt(startTier())) state.startTier = selected().contracts[0].tier;
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
