import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { analyzeMarketCell, assessMarketSide } from '../js/core/market-opportunities.mjs';
import { qualityCalibration } from '../js/core/market-opportunity-quality.mjs';
import { assessSpreadRealism } from '../js/core/market-spread-realism.mjs';
import { reviewOpportunityResults } from '../js/core/market-opportunity-review.mjs';
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { salesOpportunityReference } from '../js/core/market-sales-reference.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';

const file = new URL('../js/tools/opportunities.js', import.meta.url);
const source = readFileSync(process.env.OPPORTUNITY_UI_SOURCE || file, 'utf8');
const context = vm.createContext({ console, document: { querySelector: () => null } });
const htmlEscape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let savedFilters = null;
const stubs = { readStorage: () => null, readJsonStorage: () => savedFilters, itemLabel: value => value,
    escapeHtml: htmlEscape, itemNameHtml: htmlEscape, itemIconHtml: () => '<span class="item-visual"></span>',
    formatSilver: value => `${Number(value).toFixed(2)} silver`, formatPct: value => `${(value * 100).toFixed(1)}%`,
    formatQuantity: value => String(value), setupFeeRate: () => fees.setupFeeRate,
    taxPremiumRate: () => fees.taxPremiumRate, taxFreeRate: () => fees.taxFreeRate,
    loadActiveCities: () => [], cityFieldHtml: () => '', getServer: () => ({ id: 'europe' }), getSettings: () => ({ premium: true }) };
const browser = new vm.SourceTextModule(source + '\nexport { state, visibleRows, rankedVisibleRows, listCounts, cardHtml, renderFilters, readFilters, actionTags, defaultFilters, viewCounts, scenarioHtml, scenarioResultHtml, bindScenario }; export function setRoot(value) { root = value; }', { context, identifier: fileURLToPath(file) });
await browser.link(async specifier => {
    if (specifier.endsWith('.mjs')) {
        const module = await import(new URL(specifier, file));
        return new vm.SyntheticModule(Object.keys(module), function () { for (const [key, value] of Object.entries(module)) this.setExport(key, value); }, { context });
    }
    const statement = source.split('\n').find(line => line.includes(`from '${specifier}'`));
    const names = statement.match(/\{([^}]+)\}/)[1].split(',').map(name => name.trim().split(/\s+as\s+/)[0]);
    return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, stubs[name] || (() => {})); }, { context });
});
await browser.evaluate();
const { state, visibleRows, rankedVisibleRows, listCounts, cardHtml, renderFilters, setRoot } = browser.namespace;
savedFilters = { execution: 'transport', views: ['cross-city-instant'] };
assert.equal(browser.namespace.readFilters().execution, 'transport', 'transport filter is retained');
assert.equal(browser.namespace.readFilters().views.length, 1);
savedFilters = null;
if (process.env.OPPORTUNITY_AUDIT_SNAPSHOT) {
    const scan = JSON.parse(readFileSync(process.env.OPPORTUNITY_AUDIT_SNAPSHOT, 'utf8'));
    const unchanged = JSON.stringify(scan);
    state.scan = scan; state.filters = browser.namespace.defaultFilters();
    const main = rankedVisibleRows(), audit = { scannedAt: scan.scannedAt, engineMode: scan.engineMode,
        candidates: scan.eligibleCandidates.length, main: main.length, displayed: visibleRows().length,
        totals: listCounts(), strategies: {} };
    for (const id of ['place-sell-order', 'place-buy-order', 'instant-sell-to-buy', 'instant-buy-from-sell', 'local-flip', 'local-make', 'cross-city-instant']) {
        const expected = scan.eligibleCandidates.filter(row => row.eligible && row.strategies.some(strategy => strategy.id === id && strategy.weight > 0 && strategy.advantageSilver > 0));
        state.filters = browser.namespace.defaultFilters();
        state.filters.viewMode = id === 'local-make' ? 'spreads' : 'opportunities';
        state.filters.views = [id];
        const selected = rankedVisibleRows();
        const selectedIds = new Set(selected.flatMap(row => (row.routeOptions || [row]).map(option => option.id)));
        audit.strategies[id] = { eligible: expected.length, primaryInMain: main.filter(row => row.primary.id === id).length,
            selectable: selected.length, displayed: visibleRows().length,
            excludedFromTool: false,
            missing: expected.filter(row => !selectedIds.has(row.id)).map(row => row.id),
            primaryMake: expected.filter(row => row.primary.id === 'local-make').length };
    }
    assert.equal(JSON.stringify(scan), unchanged, 'presentation must not mutate live observations or decisions');
    writeFileSync(process.env.OPPORTUNITY_AUDIT_OUTPUT, JSON.stringify(audit, null, 2));
    console.log('Live strategy audit saved: ' + process.env.OPPORTUNITY_AUDIT_OUTPUT);
    process.exit(0);
}
const now = Date.parse('2026-10-10T15:24:07.570Z'), fees = { setupFeeRate: .025, taxPremiumRate: .04, taxFreeRate: .08 };
const side = (city, direction, price) => assessMarketSide({ now, points: [{ server: 'europe', itemId: 'T4_TEST', quality: 1, city, side: direction, source: 'aodp-current', price, sourceQuoteAt: new Date(now - 1000).toISOString(), fetchedAt: new Date(now).toISOString() }] });
const transport = analyzeMarketCell({ server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1, now, fees,
    sell: side('Lymhurst', 'sell', 1000), peers: [{ city: 'Brecilien', buy: side('Brecilien', 'buy', 1300) }] });
const local = analyzeMarketCell({ server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1, now, fees,
    buy: side('Lymhurst', 'buy', 800), sell: side('Lymhurst', 'sell', 1000) });
const instant = analyzeMarketCell({ server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1, now, fees,
    buy: side('Lymhurst', 'buy', 1100), sell: side('Lymhurst', 'sell', 1000) });
const identity = { server: 'europe', itemId: 'T4_TEST', city: 'Lymhurst', quality: 1 };
local.spreadRealism = assessSpreadRealism({ row: local, buyIdentity: identity, sellIdentity: identity, fees, calibration: { outerFence: 4 } });
assert.ok(cardHtml(local).includes('Veri yetersiz'));
const uncertain = { ...local, spreadRealism: { ...local.spreadRealism, classification: 'extreme-wide-uncertain' } };
assert.ok(cardHtml(uncertain).includes('Veri yetersiz'));
const quarantined = { ...local, eligible: false, validationStatus: 'quarantined', strategies: [], primary: null,
    buy: { ...local.buy, validationStatus: 'quarantined', anomalous: false, deviation: null },
    sell: { ...local.sell, validationStatus: 'quarantined', anomalous: false, deviation: null } };
assert.ok(cardHtml(quarantined).includes('Karantinada'), 'quarantine without an extreme deviation still renders');
for (const [row, model, action] of [[transport, 'Taşıma', 'Şehirler arası taşı'], [local, 'Emir kurma', 'İzle'], [instant, 'Anlık işlem', 'Şimdi al']]) {
    const html = cardHtml(row);
    assert.ok(html.includes('class="opp-card '));
    assert.ok(html.includes(model)); assert.ok(html.includes('Detayı aç'));
    assert.ok(html.includes('teorik fark / adet'));
    assert.ok(html.includes('Gerçekleşmiş kâr değildir'));
    assert.ok(!html.includes('Dolma olasılığı'));
}
assert.ok(cardHtml(transport).includes('Lymhurst → Brecilien'));
const pool = Array.from({ length: 600 }, (_, index) => ({ ...local, id: `row-${index}`, itemId: `T4_${index}` }));
pool.push({ ...instant, id: 'instant-outside-first-500', itemId: 'T4_RARE' });
pool.push({ ...transport, id: 'transport-only' });
assert.ok(browser.namespace.actionTags(transport).includes('Taşı'));
state.scan = { opportunities: pool.slice(0, 500), eligibleCandidates: pool, diagnostics: [], qualityCalibration: qualityCalibration(pool), listLimit: 500,
    counts: { verified: 601, monitored: 0, suspicious: 4, insufficient: 7 } };
assert.equal(listCounts().opportunities, 2, 'ordinary local make rows are absent from the default opportunities list');
assert.equal(listCounts().spreads, 600, 'local-make candidates have a distinct total');
assert.equal(visibleRows().length, 2);
assert.ok(visibleRows().some(row => row.id === 'instant-outside-first-500'));
assert.ok(visibleRows().every(row => row.primary.id !== 'local-make'));
const potentialStrategy = { ...instant.primary, evidence: { ...instant.primary.evidence, eligible: false,
    reasons: ['buy:source-time-unknown'] }, potential: true, note: 'Görünen ters fark var. Kaynak gözlem zamanı doğrulanamıyor.' };
const potentialRow = { ...instant, id: 'potential-instant', eligible: false, validationStatus: 'provisional', potential: true,
    stage: 'potential', strategies: [potentialStrategy], primary: potentialStrategy };
state.scan = { ...state.scan, eligibleCandidates: [], opportunities: [], diagnostics: [], potentialCandidates: [potentialRow],
    counts: { verified: 0, potential: 1, suspicious: 3, insufficient: 0 }, listLimit: 500 };
state.filters = browser.namespace.defaultFilters();
assert.equal(listCounts().opportunities, 0); assert.equal(listCounts().verified, 0);
assert.equal(listCounts().watch, 1);
assert.equal(listCounts().potential, 1); assert.equal(listCounts().suspicious, 3); assert.equal(listCounts().spreads, 0);
assert.equal(rankedVisibleRows().length, 0, 'unvalidated signals do not fill the main list');
state.filters.viewMode = 'watch';
assert.equal(rankedVisibleRows().length, 1);
const potentialHtml = cardHtml(visibleRows()[0]);
assert.ok(potentialHtml.includes('Potansiyel'));
assert.ok(!potentialHtml.includes('undefined'), 'potential status and action render defined icons');
assert.match(potentialHtml, /class="opp-mark [^"]*"[^>]*><svg/, 'potential status displays an SVG icon');
assert.match(potentialHtml, /class="opp-card-go"[^>]*><svg/, 'potential action displays an SVG icon');
assert.ok(potentialHtml.includes('İzle'));
assert.ok(!potentialHtml.includes('Al ve hemen sat'), 'potential card does not recommend trading');
state.scan.potentialCandidates = Array.from({ length: 501 }, (_, index) => ({ ...potentialRow, id: `potential-${index}`, itemId: `T4_${index}` }));
assert.equal(rankedVisibleRows().length, 501, 'potential filters see the whole pool before display limit');
assert.equal(visibleRows().length, 500, '500 limits visible cards only');
state.filters.query = 'T4_500';
assert.equal(visibleRows().length, 1, 'search reaches potential candidates beyond the first 500');
state.filters.query = ''; state.filters.views = ['place-sell-order'];
assert.equal(visibleRows().length, 0, 'strategy filter cannot select a strategy absent from potential evidence');
state.filters.views = []; state.filters.execution = 'order';
assert.equal(visibleRows().length, 0, 'execution filter applies to potential strategies');
const suspiciousRow = { ...potentialRow, id: 'suspicious-row', potential: false, validationStatus: 'quarantined', primary: null, strategies: [],
    buy: { ...potentialRow.buy, validationStatus: 'quarantined', anomalous: false, deviation: null } };
state.scan.suspiciousCandidates = [suspiciousRow];
state.scan.counts.suspicious = 1;
state.filters = browser.namespace.defaultFilters(); state.filters.viewMode = 'suspicious';
assert.equal(listCounts().suspiciousView, 1);
assert.equal(visibleRows().length, 1, 'quarantined records are accessible only in their separate view');
assert.ok(cardHtml(visibleRows()[0]).includes('data-trade="blocked"'), 'suspicious data cannot enable a trade');
state.scan = { opportunities: pool.slice(0, 500), eligibleCandidates: pool, diagnostics: [], qualityCalibration: qualityCalibration(pool), listLimit: 500,
    counts: { verified: 601, monitored: 0, suspicious: 4, insufficient: 7 } };
state.filters = browser.namespace.defaultFilters();
pool.push({ ...transport, id: 'mixed-transport-local', strategies: [...transport.strategies, ...instant.strategies] });
assert.equal(listCounts().opportunities, 2, 'the shared target quote is one group');
assert.ok(visibleRows().flatMap(row => row.routeOptions || [row]).find(row => row.id === 'mixed-transport-local').presentationStrategies.some(strategy => strategy.id === 'local-flip'), 'local alternatives survive route grouping');
state.filters.views = ['local-flip'];
assert.ok(visibleRows().some(row => row.id === 'mixed-transport-local'), 'strategy filter runs before grouping and recovers the local alternative');
state.filters.views = [];
pool.pop();
state.filters.viewMode = 'spreads';
assert.equal(visibleRows().length, 500);
assert.ok(visibleRows().every(row => row.primary.id === 'local-make'));
state.filters.query = 'T4_599';
assert.equal(visibleRows().length, 1, 'search applies to the full eligible spread pool before the display limit');
assert.equal(rankedVisibleRows().length, 1);
state.filters.query = ''; state.filters.viewMode = 'opportunities';
assert.equal(visibleRows().length, 2);
state.filters.execution = 'instant';
assert.equal(visibleRows().length, 1);
assert.equal(visibleRows()[0].id, 'instant-outside-first-500');
state.filters.execution = ''; state.filters.query = 'T4_RARE';
assert.equal(visibleRows().length, 1, 'query sees all eligible candidates');
state.filters.query = ''; state.filters.minReturn = '10';
assert.ok(visibleRows().every(row => row.primary.economics.returnRatio >= .1));
state.filters.minReturn = ''; state.filters.viewMode = 'spreads'; state.filters.evidence = 'extreme-wide-uncertain';
assert.equal(visibleRows().length, 0);
state.filters.evidence = '';
state.scan.eligibleCandidates.push({ ...uncertain, id: 'uncertain-retained' });
assert.ok(rankedVisibleRows().some(row => row.id === 'uncertain-retained'), 'uncertain spreads remain accessible');
const panel = { innerHTML: '' }, button = { addEventListener() {} };
setRoot({ querySelector: selector => selector === '[data-opportunities-filters]' ? panel : button, querySelectorAll: () => [] });
renderFilters();
assert.ok(panel.innerHTML.includes('data-filter="minReturn"'));
assert.ok(panel.innerHTML.includes('data-filter="execution"'));
assert.ok(panel.innerHTML.includes('value="transport"'), 'transport is a page execution option');
assert.ok(panel.innerHTML.includes('data-filter="evidence"'));
assert.ok(panel.innerHTML.includes('class="form-floating"'));
assert.ok(panel.innerHTML.includes('<label for="opp-minReturn">'));
state.filters.viewMode = 'spreads'; renderFilters();
assert.ok(panel.innerHTML.includes('Makas değerlendirmesi'));
assert.ok(panel.innerHTML.includes('value="unusual"'));
assert.ok(panel.innerHTML.includes('value="normal"'));
assert.ok(panel.innerHTML.includes('value="insufficient"'));
console.log('Opportunity browser flow: compact cards, execution labels, route cities, net/return, all-pool filters and shared controls passed.');


// Synthetic regression data, never inserted into the market archive.
const mature = (direction, price, reference, ageMs) => ({ ...side('Lymhurst', direction, price),
    reference, referenceLevel: 3, referenceConfidence: .75, reliability: .75, usable: true,
    deviation: (price - reference) / reference, absoluteDelta: price - reference,
    anomalous: true, confirmed: true, direction: price > reference ? 'up' : 'down', ageMs,
    at: new Date(now - ageMs).toISOString(), formedAt: new Date(now - ageMs).toISOString() });
const mixed = analyzeMarketCell({ server: 'europe', itemId: 'T4_MIXED', city: 'Lymhurst', quality: 1, now, fees,
    buy: mature('buy', 100, 200, 7200000), sell: mature('sell', 1000, 800, 1000) });
assert.equal(mixed.primary.id, 'local-make');
const rawMixed = JSON.stringify(mixed);
state.scan = { eligibleCandidates: [mixed], scannedAt: new Date(now).toISOString(), listLimit: 500, qualityCalibration: qualityCalibration([mixed]) };
state.filters = browser.namespace.defaultFilters();
assert.equal(listCounts().opportunities, 1);
assert.equal(listCounts().spreads, 1);
assert.equal(visibleRows().length, 1, 'multi-strategy cells do not duplicate cards');
assert.notEqual(visibleRows()[0].primary.id, 'local-make');
const counts = browser.namespace.viewCounts(rankedVisibleRows({ ignoreTypes: true }));
assert.equal(counts['place-sell-order'], 1);
assert.equal(counts['place-buy-order'], 1, 'alternative historical strategy remains counted');
for (const [id, title, action, price] of [['place-sell-order', 'Yüksek Sell', 'Emir açmayı değerlendir', 1000], ['place-buy-order', 'Düşük Buy', 'Emir açmayı değerlendir', 100]]) {
    state.filters.views = [id];
    const [selected] = visibleRows();
    assert.ok(selected, id + ' survives when local-make was the engine primary');
    assert.equal(selected.primary.id, id);
    assert.equal(selected.opportunityQuality.economics, selected.primary.economics);
    const html = cardHtml(selected);
    assert.ok(html.includes(title)); assert.ok(html.includes(action));
    assert.ok(!html.includes('silver / Ref'), 'reference detail stays outside the compact card');
    assert.ok(!html.includes('Çift emir kur'));
}
state.filters.views = []; state.filters.excludedViews = ['place-sell-order'];
assert.equal(visibleRows()[0].primary.id, 'place-buy-order', 'excluding the selected strategy falls back to another');
state.filters.excludedViews = []; state.filters.minDeviation = '40';
assert.equal(visibleRows()[0].primary.id, 'place-buy-order', 'deviation is evaluated on the selected input, not the other side');
state.filters = browser.namespace.defaultFilters(); state.filters.viewMode = 'spreads';
assert.equal(visibleRows()[0].primary.id, 'local-make');
assert.ok(cardHtml(visibleRows()[0]).includes('İzle'));
assert.equal(JSON.stringify(mixed), rawMixed);
console.log('Multi-strategy regression: primary-make fallback, high Sell/low Buy cards, overlapping totals, type/exclusion/deviation filters and immutability passed.');

const inverted = analyzeMarketCell({ server: 'europe', itemId: 'T4_INVERTED', city: 'Lymhurst', quality: 1, now, fees,
    buy: mature('buy', 1100, 800, 1000), sell: mature('sell', 700, 1000, 3600000) });
state.scan = { ...state.scan, eligibleCandidates: [inverted], qualityCalibration: qualityCalibration([inverted]) };
for (const id of ['instant-sell-to-buy', 'instant-buy-from-sell', 'local-flip']) {
    state.filters = browser.namespace.defaultFilters(); state.filters.views = [id];
    assert.equal(visibleRows().length, 1);
    assert.equal(visibleRows()[0].primary.id, id);
}
state.scan = { ...state.scan, eligibleCandidates: [mixed], qualityCalibration: qualityCalibration([mixed]) };
state.filters = browser.namespace.defaultFilters();
state.filters.views = ['place-sell-order'];
const sellView = visibleRows()[0];
state.filters.views = ['place-buy-order'];
const buyView = visibleRows()[0];
assert.notEqual(sellView.score, buyView.score, 'importance uses the selected movement');
assert.notEqual(sellView.recency, buyView.recency, 'recency uses the selected movement time');
state.filters.views = []; state.filters.minNet = '150';
assert.equal(visibleRows()[0].primary.id, 'place-sell-order', 'economic filter retains a qualifying alternative');

state.scan = { eligibleCandidates: ['unusual', 'normal', 'insufficient'].map((classification, i) => ({ ...local, id: `review-${i}`, spreadReview: { classification } })), listLimit: 500 };
state.filters = browser.namespace.defaultFilters(); state.filters.viewMode = 'spreads';
const reviewCounts = browser.namespace.viewCounts(rankedVisibleRows({ ignoreTypes: true }));
for (const key of ['unusual', 'normal', 'insufficient']) {
    assert.equal(reviewCounts[`spread:${key}`], 1);
    state.filters.views = [`spread:${key}`];
    assert.equal(visibleRows().length, 1);
    assert.equal(visibleRows()[0].spreadReview.classification, key);
    const html = cardHtml(visibleRows()[0]);
    assert.ok(!html.includes('Çift emir kur'));
    assert.ok(html.includes('İzle'), 'a classification label alone cannot authorize orders');
}
console.log('Spread review: class counters, filters and non-directive actions passed.');
const priceSupported = { ...instant, outcome: 'price-supported', primary: { ...instant.primary,
    referenceRequired: false, missingExecutionEvidence: ['depth-unknown'],
    economics: { capitalSilver: 1000, returnRatio: .056, referenceAdvantageRatio: null } } };
const decisionHtml = cardHtml(priceSupported);
assert.ok(decisionHtml.includes('Net teorik fark / adet'));
assert.ok(decisionHtml.includes('ROI'));
assert.ok(decisionHtml.includes('kontrol et'));
assert.ok(!decisionHtml.includes('opp-reference'), 'long quantity warnings belong to detail');
assert.ok(!decisionHtml.includes('Şimdi al'));
assert.ok(decisionHtml.includes('Bu stratejide tarihsel referans gerekmez.'));
console.log('V4 decision card: unit advantage, capital, honest action and relevant evidence passed.');
state.scan.premium = true;
assert.ok(browser.namespace.scenarioHtml(instant).includes('Toplamları hesaplamak için miktar girin.'));
const output = { innerHTML: '' }, events = {};
const inputs = ['quantity', 'fixedCost', 'sellSetup'].map(key => ({ dataset: { scenarioField: key }, value: '',
    addEventListener(type, callback) { events[key] = callback; } }));
const scenarioHost = { querySelectorAll: () => inputs, querySelector: () => output };
browser.namespace.bindScenario({ querySelector: () => scenarioHost, querySelectorAll: () => [] }, instant, instant.id);
inputs[0].value = '10'; events.quantity();
assert.ok(output.innerHTML.includes('560.00 silver'));
inputs[1].value = '1000'; events.fixedCost();
assert.ok(output.innerHTML.includes('-440.00 silver'));
assert.ok(output.innerHTML.includes('Başabaş miktarı: 18'));
const restoredScenario = browser.namespace.scenarioHtml(instant);
assert.ok(restoredScenario.includes('value="10"'));
assert.ok(restoredScenario.includes('value="1000"'), 'chart rerender preserves user scenario');
assert.ok(restoredScenario.includes('class="form-control"'));
assert.ok(restoredScenario.includes('class="tool-split-controls"'));
assert.ok(restoredScenario.includes('class="tool-split-result"'));
assert.ok(restoredScenario.includes('Sonuç gerçekleşmiş kâr değildir.'));
inputs[2].value = '1'; events.sellSetup();
assert.ok(output.innerHTML.includes('-715.00 silver'), 'resale order mode charges its setup fee');
const lowActivityRow = { ...instant, primary: { ...instant.primary, salesActivity: { units: 1, reportedDays: 1, days: 28 } } };
assert.ok(browser.namespace.scenarioResultHtml(lowActivityRow).includes('adedi aşıyor'), 'entered quantity is compared with reported units without assuming available depth');
state.filters = browser.namespace.defaultFilters(); state.filters.viewMode = 'quantity';
state.scan.eligibleCandidates = [priceSupported];
assert.equal(visibleRows().length, 1);
console.log('V5 panel: blank quantity, input updates, negative scenario, break-even, persisted inputs, shared forms and quantity view passed.');

const salesBuy = side('Lymhurst', 'buy', 112);
salesBuy.salesReference = salesOpportunityReference({ data: Array.from({ length: 14 }, (_, i) => ({
    timestamp: new Date(Math.floor(now / DAY_MS) * DAY_MS - (i + 1) * DAY_MS).toISOString(),
    avg_price: 576, item_count: 1000 })) }, { now });
const salesRow = reviewOpportunityResults(analyzeMarketCell({ server: 'europe', itemId: 'T6_FOXGLOVE',
    city: 'Lymhurst', quality: 1, buy: salesBuy, now, fees }), OPPORTUNITY_POLICY, { premium: true, fees });
state.filters = browser.namespace.defaultFilters();
state.scan.eligibleCandidates = [salesRow];
state.scan.qualityCalibration = qualityCalibration([salesRow]);
assert.equal(visibleRows().length, 1, 'sales valuation belongs in the default opportunities view');
state.filters.views = ['place-buy-order-sales'];
const salesVisible = visibleRows();
assert.equal(salesVisible.length, 1, 'sales valuation is selectable without Buy movement');
const salesHtml = cardHtml(salesVisible[0]);
assert.ok(salesHtml.includes('Düşük Buy · Satış geçmişi'));
assert.ok(salesHtml.includes('Satış medyanı 576.00 silver'));
assert.ok(salesHtml.includes('14 gün'));
state.filters.minDeviation = '90';
assert.equal(visibleRows().length, 0, 'valuation filter uses fee-adjusted sales discount');
assert.equal(salesRow.buy.reference, null, 'rendering preserves Buy reference');
console.log('Sales valuation UI: default list, strategy filter, source label and fee-adjusted discount passed.');
