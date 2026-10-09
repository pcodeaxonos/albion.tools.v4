import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
const module = new vm.SourceTextModule(fs.readFileSync('content/js/core/long-term-quotes.js', 'utf8'), { context });
const dependencies = {
    './settings.js': ['getServer', 'localPriceHost'],
    './market-primitives.mjs': ['marketSeriesKey', 'BOOK_PRICE_FIELDS'],
    './price-side.js': ['quoteFromRow'],
    './market-history-config.mjs': ['AODP_COLLECTOR_POLICY'],
    './market-request.mjs': ['urlBatches']
};
await module.link(specifier => new vm.SyntheticModule(dependencies[specifier], function () {
    for (const name of dependencies[specifier]) this.setExport(name, undefined);
}, { context }));
await module.evaluate();
const { longTermMetadata } = module.namespace;
assert.equal(longTermMetadata(null), '');
const reference = {
    source: 'sales-history-anchor', validDays: 27, validBuckets: 27,
    sourceQuoteAt: '2026-10-07T03:00:00Z', fallbackReason: 'internal diagnostic sell_price_min',
    dayCoverage: Array.from({ length: 90 }, (_, index) => ({
        day: `day-${index}`, status: index < 3 ? 'partial-day' : 'covered-day',
        firstObservationAt: 'raw UTC', reasons: ['insufficient-buckets']
    }))
};
const label = longTermMetadata({ reference });
assert.match(label, /Gerçekleşen satış ortalaması · 27 gün/);
assert.match(label, /Emir geçmişi yetersiz/);
assert.match(label, /3 eksik gün/);
assert.match(label, /Son veri:/);
assert.doesNotMatch(label, /bucket|partial-day|raw UTC|sell_price_min|day-89/);
assert.ok(label.length < 300, 'history size must not expand the tooltip');
assert.equal(longTermMetadata({ reference }, { compact: true }), 'Gerçekleşen satış ortalaması · 27 gün');
const buy = longTermMetadata({ reference: { source: 'current-buy-fallback', validDays: 0, sourceQuoteAt: 'invalid' } });
assert.match(buy, /güncel alış fiyatı kullanıldı/);
assert.doesNotMatch(buy, /Invalid Date|Son veri:/);
assert.match(longTermMetadata({ reference: { source: 'quote-history', validDays: 4 } }), /tamamlanmış günlerden/);
console.log('Tooltip metadata: concise history, fallback explanations, missing days and invalid dates passed.');
