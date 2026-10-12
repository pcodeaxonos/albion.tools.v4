import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';
import { attachOpportunitySales, rankCommercialOpportunities, routeLiquidityKey } from '../js/core/market-opportunity-commerce.mjs';
import { opportunityTradePrices, calculateTradeScenario } from '../js/core/market-trade-scenario.mjs';

const root = 'docs/opportunity-v5';
const read = name => JSON.parse(gunzipSync(readFileSync(`${root}/${name}.json.gz`)));
const scan = read('baseline-scan'), history = read('sales-history');
const source = JSON.stringify(scan);
for (const [name, baseline] of [['market-opportunity-scan', 'detection'], ['market-opportunity-review', 'review'], ['market-opportunity-quality', 'quality']])
    assert.equal(readFileSync(`content/js/core/${name}.mjs`, 'utf8'), readFileSync(`${root}/baseline-${baseline}.txt`, 'utf8'), `${name}: V4 detection/reference/ranking is preserved`);
const anchors = new Map(history.rows.map(row => [`${row.item_id}|${row.location}|${row.quality}`, { ...row, fetchedAt: history.fetchedAt }]));
const enriched = attachOpportunitySales(scan.eligibleCandidates, (item, city, quality) => anchors.get(`${item}|${city}|${quality}`), Date.parse(history.fetchedAt));
const before = rankOpportunityPresentation(scan.eligibleCandidates, { calibration: scan.qualityCalibration });
const after = rankCommercialOpportunities(rankOpportunityPresentation(enriched, { calibration: scan.qualityCalibration }), { calibration: scan.qualityCalibration });
assert.equal(JSON.stringify(scan), source, 'presentation does not alter frozen V4 output');
assert.equal(after.reduce((sum, row) => sum + (row.routeOptions?.length || 1), 0), before.length, 'groups retain every candidate');
assert.equal(new Set(after.map(row => routeLiquidityKey(row) || row.id)).size, after.length, 'no repeated target liquidity pool');
const feesRows = JSON.parse(readFileSync('data/economy-constants.json'));
const rate = key => Number(feesRows.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const describe = (row, index) => ({ position: index + 1, id: row.id, itemId: row.itemId, quality: row.quality,
    route: row.primary.toCity ? `${row.city} → ${row.primary.toCity}` : row.city, strategy: row.primary.id,
    unitNet: row.primary.advantageSilver, roi: row.primary.economics?.returnRatio, capital: row.primary.economics?.capitalSilver,
    lane: row.commercialLane, components: row.commercial, paretoFront: row.commercialFront,
    sales: row.primary.salesActivity || null, alternatives: row.routeOptions?.map(other => ({ city: other.city, unitNet: other.primary.advantageSilver, capital: other.primary.economics.capitalSilver })) || [],
    inputs: row.primary.evidence.inputs,
    quantityScenario: calculateTradeScenario({ ...opportunityTradePrices(row.primary), quantity: 100, fixedCost: 1000, perUnitCost: 0, fees, premium: scan.premium }) });
const summarize20 = rows => ({ rows: Math.min(20, rows.length), uniqueItems: new Set(rows.slice(0, 20).map(row => `${row.itemId}|${row.quality}`)).size,
    below25: rows.slice(0, 20).filter(row => row.primary.advantageSilver < 25).length,
    repeatedTargetQuotes: rows.slice(0, 20).length - new Set(rows.slice(0, 20).map(row => routeLiquidityKey(row) || row.id)).size });
const report = { priceSnapshotAt: scan.scannedAt, historyCapturedAt: history.fetchedAt,
    sourceHashes: { prices: createHash('sha256').update(source).digest('hex'), sales: createHash('sha256').update(JSON.stringify(history)).digest('hex') },
    detectionUnchanged: true, beforeCandidates: before.length, afterGroups: after.length,
    preservedCandidates: after.reduce((sum, row) => sum + (row.routeOptions?.length || 1), 0),
    bulkBoundary: after[0]?.bulkBoundary,
    beforeFirst20: summarize20(before), afterFirst20: summarize20(after),
    lanes: after.reduce((counts, row) => { counts[row.commercialLane] = (counts[row.commercialLane] || 0) + 1; return counts; }, {}),
    movement: enriched.reduce((counts, row) => { const key = row.primary.salesActivity.status; counts[key] = (counts[key] || 0) + 1; return counts; }, {}),
    before: before.map(describe), after: after.map(describe) };
writeFileSync(`${root}/comparison.json`, JSON.stringify(report, null, 2));
let markdown = '# V4 / V5 — aynı gerçek fiyat girdisinde ilk 20\n\nFiyat snapshot: '+scan.scannedAt+'. Satış geçmişi: '+history.fetchedAt+'. API Sell geçmişindeki item_count ürün adedidir; işlem sayısı ve Buy derinliği bilinmez. Eksik günler sıfır sayılmaz.\n\n';
for (const [title, rows] of [['V4', report.before], ['V5', report.after]]) {
    markdown += `## ${title}\n\n| # | Ürün · Q | Rota | Birim net | ROI | Sermaye | Satış adedi / bildirilen gün | Alternatif |\n|---|---|---|---:|---:|---:|---|---:|\n`;
    for (const row of rows.slice(0, 20)) markdown += `| ${row.position} | ${row.itemId} · ${row.quality} | ${row.route} | ${row.unitNet.toFixed(2)} | ${row.roi == null ? 'bilinmiyor' : (row.roi * 100).toFixed(2)+'%'} | ${row.capital ?? 'bilinmiyor'} | ${row.sales?.units == null ? 'bilinmiyor' : `${row.sales.units} / ${row.sales.reportedDays} (${row.sales.status})`} | ${row.alternatives.length} |\n`;
}
markdown += '\n## V5 adaylarının ayrıntılı değerlendirmesi\n\n100 adet ve 1.000 silver sabit ek gider aşağıdaki karşılaştırmada **yalnız açık varsayımlı bir senaryodur**. Gerçek miktar, taşıma gideri veya gerçekleşmiş kazanç iddiası değildir.\n';
for (const row of report.after.slice(0, 20)) {
    const scenario = row.quantityScenario;
    markdown += `\n### ${row.position}. ${row.itemId} — ${row.route}\n\n${row.lane}; birim teorik avantaj ${row.unitNet.toFixed(2)}. Parasal öncelik indeksi ${row.components?.priorityIndex?.toFixed(2) ?? 'referans farkı'}; bu beklenen kâr değildir. Kaynak güncelliği ${row.components?.freshness?.toFixed(3)}, fiyat kanıtı ${row.components?.confidence?.toFixed(3)}; Pareto katmanı ${row.paretoFront}. ${row.sales?.units == null ? 'Satış hareketliliği bilinmiyor.' : `${row.sales.units} satılmış ürün adedi; ${row.sales.reportedDays}/${row.sales.days} gün bildirilmiş, son gün ${row.sales.latestDay}, kapsam ${row.sales.status}.`} Miktar ve mevcut Buy derinliği doğrulanmaz.\n\n`;
    for (const [side, input] of Object.entries(row.inputs)) if (input) markdown += `- ${side}: ${input.price} silver · ${input.at} · ${input.source}.\n`;
    markdown += `\n${row.alternatives.length > 1 ? `Ortak hedef Buy: ${row.alternatives.map(option => `${option.city} (${option.unitNet.toFixed(2)} / adet)`).join(', ')}. Aynı hedef likiditesini tüketir; kârları toplanmaz.` : 'Tek kaynak rotası veya ayrı yerel strateji.'} Senaryo: ${scenario.status === 'calculated' ? `net ${scenario.net.toFixed(2)}, sermaye ${scenario.capital.toFixed(2)}, başabaş ${scenario.breakEvenQuantity ?? 'anlamlı hesap yok'} adet.` : 'Tam alış/satış maliyeti bilinmediği için net kâr hesaplanamaz.'}${row.sales?.units != null && row.sales.units < 100 ? ` Örnek 100 adet, gözlenen ${row.sales.units} adetlik toplamı aşıyor; bildirilmeyen günler bilinmiyor ve bu miktarda satış kanıtı yok.` : ''}\n`;
}
writeFileSync(`${root}/first20.md`, markdown);
console.log(JSON.stringify({ ...report, before: undefined, after: undefined }, null, 2));
