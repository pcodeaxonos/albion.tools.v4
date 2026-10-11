import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ Date });
const module = new vm.SourceTextModule(fs.readFileSync('content/js/components/decision-history.js', 'utf8'), { context });
await module.link(specifier => {
    const exports = specifier.includes('format') ? { formatSilver: String } : { escapeHtml: value => String(value).replaceAll('<', '&lt;') };
    return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
});
await module.evaluate();
const { decisionHistoryHtml } = module.namespace;
assert.match(decisionHistoryHtml(null), /Geçerli geçmiş gözlemi yok/);
const html = decisionHistoryHtml({ sell: { points: [
    { at: '2026-10-10T08:00:00Z', price: 100 },
    { at: '2026-10-10T09:00:00Z', price: 110 },
    { at: '2026-10-10T14:00:00Z', price: 120 },
    { at: 'invalid', price: 130 }, { at: '2026-10-10T15:00:00Z', price: 0 }
] } });
assert.equal((html.match(/<circle /g) || []).length, 3, 'only real valid observations');
const sellGroup = html.match(/<g class="decision-series-sell">(.*?)<\/g>/s)[1];
assert.equal((sellGroup.match(/<line /g) || []).length, 1, 'missing hours are not joined or interpolated');
assert.doesNotMatch(html, /Ortalama Fiyat|İşlem hacmi|NaN|Infinity/);
assert.match(decisionHistoryHtml({ buy: { points: [{ at: '2026-10-10T08:00:00Z', price: 1 }] } }), /<circle /);
console.log('PASS decision history: real time axis, gaps, invalid/missing points, single observation, no synthetic average/volume');
