import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { strategyAdvantage } from '../js/core/market-opportunity-review.mjs';
import { strategyCategory } from '../js/core/market-strategy-policy.mjs';
import { PRICE_STALE_MS, ORDER_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { normalizePriceDate, quantile } from '../js/core/market-primitives.mjs';

const root = 'docs/opportunity-v4';
const read = path => JSON.parse(gunzipSync(readFileSync(`${root}/${path}.json.gz`)));
const frozen = read('comparison'), live = read('live/comparison'), refreshed = read('refreshed/comparison');
const capture = read('new-observations');
const rates = JSON.parse(readFileSync('data/economy-constants.json'));
const rate = key => Number(rates.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const fmt = value => Number.isFinite(value) ? value.toFixed(2) : 'bilinmiyor';
function inspect(report, row, index) {
    const inputs = Object.values(row.inputs || {}).filter(Boolean);
    const ages = inputs.map(side => side.ageMs / 3600000);
    const gap = inputs.length > 1 ? (Math.max(...inputs.map(side => Date.parse(side.at))) - Math.min(...inputs.map(side => Date.parse(side.at)))) / 60000 : 0;
    const itemVariants = report.trades.filter(other => other.itemId === row.itemId).length;
    const newest = {};
    let freshComplete = true;
    for (const [key, side] of Object.entries(row.inputs || {})) {
        if (!side) continue;
        const city = key === 'destination' ? row.toCity : row.city;
        const priceRow = capture.rows.find(candidate => candidate.item_id === row.itemId && candidate.city === city && Number(candidate.quality) === row.quality);
        const field = key === 'buy' || key === 'destination' ? 'buy_price_max' : 'sell_price_min';
        if (!priceRow || !(priceRow[field] > 0)) { freshComplete = false; continue; }
        const at = normalizePriceDate(priceRow[`${field}_date`]);
        newest[key] = { ...side, price: Number(priceRow[field]), at, ageMs: Date.parse(capture.capturedAt) - Date.parse(at) };
    }
    const newInputs = Object.values(newest);
    const newGapMs = newInputs.length > 1 ? Math.max(...newInputs.map(side => Date.parse(side.at))) - Math.min(...newInputs.map(side => Date.parse(side.at))) : 0;
    const newAdvantage = freshComplete ? strategyAdvantage(row.primary, newest, { premium: true, fees }) : null;
    const stillFresh = freshComplete && newInputs.every(side => Number.isFinite(side.ageMs) && side.ageMs >= 0 && side.ageMs < PRICE_STALE_MS);
    const refreshedRow = refreshed.trades.find(candidate => candidate.id === row.id) || refreshed.watch.find(candidate => candidate.id === row.id);
    const reviewed = refreshedRow?.reviews || refreshed.reviewDiagnostics.find(candidate => candidate.id === row.id)?.reviews || [];
    const review = reviewed.find(candidate => candidate.id === row.primary && (candidate.toCity || null) === (row.toCity || null));
    return { position: index + 1, item: row.itemId, quality: row.quality, route: row.toCity ? `${row.city} → ${row.toCity}` : row.city,
        strategy: row.primary, category: strategyCategory(row.primary), advantage: row.advantage, economics: row.economics,
        sourceCount: new Set(inputs.map(side => side.source)).size, inputs: row.inputs,
        maxAgeHours: Math.max(...ages), timestampGapMinutes: gap, itemVariants, missing: row.executionMissing,
        judgement: row.advantage < quantile(report.trades.map(candidate => candidate.advantage), .25)
            ? 'Birim avantaj bu dağılımın alt çeyreğinde; ancak doğrulanmış toplu miktar toplam taşıma/işlem maliyetini karşılıyorsa ticari olarak anlamlı. Tek birim üzerinden taşıma kararı verilmemeli.'
            : row.primary === 'cross-city-instant'
            ? 'Ücret sonrası pozitif rota sinyali; miktar, toplam taşıma maliyeti ve güvenli rota kontrolüyle değerlendirilebilir.'
            : row.primary === 'local-flip' ? 'Ücret sonrası pozitif yerel çevirme; iki tarafta aynı miktarın hâlâ mevcut olduğu kontrol edilmeli.'
                : 'Olgun referansa göre fiyat anomalisi; avantaj alış maliyetine göre gerçek satış kârı değildir, emir dolumu bilinmiyor.',
        newQuoteCheck: { capturedAt: capture.capturedAt, covered: freshComplete, inputs: newest,
            advantageUsingOriginalReference: newAdvantage, fresh: stillFresh, gapMinutes: newGapMs / 60000,
            timeAligned: newGapMs < ORDER_HISTORY_POLICY.bucketMs, refreshedOutcome: review?.outcome || refreshedRow?.outcome || null,
            reason: review?.reason || null } };
}
const first20 = { frozen: frozen.trades.slice(0, 20).map((row, i) => inspect(frozen, row, i)),
    live: live.trades.slice(0, 20).map((row, i) => inspect(live, row, i)) };
writeFileSync(`${root}/first20.json`, JSON.stringify(first20, null, 2));
let markdown = '# İlk 20 aday: teorik piyasa kararı\n\nGerçekleşmiş emir veya gerçekleşmiş kâr verisi yok. Sıra motorun birleşik nominal avantaj, getiri, güncellik ve ilgili kanıt sıralamasıdır; sabit fırsat kotası değildir. Bir ürünün farklı kaynak şehirleri ayrı işlemler, aynı hücrenin stratejileri tek adaydır.\n';
for (const [name, list] of Object.entries(first20)) {
    markdown += `\n## ${name === 'frozen' ? 'Donmuş snapshot' : 'Yeni arşiv'}\n\n| # | Ürün · Q | Şehir / rota | Ücret sonrası birim avantaj | Birim sermaye | Teorik getiri | En eski kaynak (saat) | Zaman farkı (dk) | Aynı ürünün toplam varyasyonu |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n`;
    for (const row of list) markdown += `| ${row.position} | ${row.item} · ${row.quality} | ${row.route} | ${fmt(row.advantage)} | ${fmt(row.economics?.capitalSilver)} | ${row.economics?.returnRatio !== null ? fmt(row.economics?.returnRatio * 100) + '%' : 'referans farkı'} | ${fmt(row.maxAgeHours)} | ${fmt(row.timestampGapMinutes)} | ${row.itemVariants} |\n`;
    for (const row of list) {
        markdown += `\n### ${row.position}. ${row.item} · ${row.route}\n\n${row.judgement} Birim avantaj ${fmt(row.advantage)} silver; bu değer taşımayı içermez. ${row.sourceCount} veri sağlayıcısı; sağlayıcı sayısı bağımsız zaman gözlemi sayısı değildir. Miktar, hacim${row.category === 'orders' ? ' ve karşılıklı emirlerin dolumu' : ''} doğrulanmamış. Aynı ürün için ${row.itemVariants} kaynak şehir varyasyonu var; bunlar bağımsız kazanç gibi toplanamaz.\n\n`;
        for (const [key, side] of Object.entries(row.inputs || {})) if (side) markdown += `- ${key}: ${fmt(side.price)} silver, ${side.at}, ${side.source}, ${side.coverage}, L${side.referenceLevel}, ${side.referenceSamples} referans örneği.\n`;
        const check = row.newQuoteCheck;
        markdown += `\nYeni sorgu (${check.capturedAt}): ${check.covered ? `ücret sonrası fark ${fmt(check.advantageUsingOriginalReference)} silver; kaynak tazeliği ${check.fresh ? '6 saat sınırında uygun' : 'uygun değil'}; taraf zaman farkı ${fmt(check.gapMinutes)} dakika (${check.timeAligned ? '1 saat sınırı içinde' : '1 saat sınırını geçiyor'}). Yeniden değerlendirilen sonuç: ${check.refreshedOutcome || 'ana/izleme listesinde yok'}; gerekçe ${check.reason || 'inceleme kaydında yok'}.` : 'Bu ilk 20 grubunun ürünü yeni sorgu kapsamına alınmadı veya gerekli geçerli taraf yok; yeni doğrulama iddiası yapılmıyor.'}\n`;
    }
}
writeFileSync(`${root}/first20.md`, markdown);
const distribution = report => ({ candidates: report.trades.length,
    nominal: { p25: quantile(report.trades.map(row => row.advantage), .25), median: quantile(report.trades.map(row => row.advantage), .5), p90: quantile(report.trades.map(row => row.advantage), .9) },
    // Sensitivity measurements only; none of these thresholds is installed.
    nominalThresholds: Object.fromEntries([0, 1, 5, 25, 100].map(threshold => [threshold, report.trades.filter(row => row.advantage >= threshold).length])),
    distinctItems: new Set(report.trades.map(row => row.itemId)).size,
    first20DistinctItems: new Set(report.trades.slice(0, 20).map(row => row.itemId)).size });
writeFileSync(`${root}/distribution.json`, JSON.stringify({ frozen: distribution(frozen), live: distribution(live), refreshed: distribution(refreshed) }, null, 2));
console.log(JSON.stringify({ frozen: first20.frozen.length, live: first20.live.length,
    liveUniqueItems: new Set(first20.live.map(row => row.item)).size,
    coveredLive: first20.live.filter(row => row.newQuoteCheck.covered).length,
    newPositiveAlignedFresh: first20.live.filter(row => row.newQuoteCheck.advantageUsingOriginalReference > 0 && row.newQuoteCheck.fresh && row.newQuoteCheck.timeAligned).length }));
