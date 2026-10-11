import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readAuditFile, writeAuditJson } from './market-audit-artifacts.mjs';
import { OPPORTUNITY_QUALITY_POLICY, qualityCalibration, quantile, rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';
import { STRATEGY_SPECS } from '../js/core/market-strategy-policy.mjs';
const root = 'docs/market-opportunity-quality';
const read = path => JSON.parse(readAuditFile(path, 'utf8'));
const before = read(`${root}/before/analysis.json`), after = read(`${root}/replay/analysis.json`);
assert.deepEqual(before.manifest, after.manifest);
assert.deepEqual(before.policy, after.policy);
assert.deepEqual(before.journal.bounds, after.journal.bounds);
const oldSides = read(`${root}/before/live-series.json`), newSides = read(`${root}/replay/live-series.json`);
assert.deepEqual(oldSides.map(row => [row.id, row.actual]), newSides.map(row => [row.id, row.actual]));
const canonical = rows => rows.map(row => ({ id: row.id, eligible: row.eligible, validationStatus: row.validationStatus,
    buy: row.buy, sell: row.sell, referenceConfidence: row.referenceConfidence, executionConfidence: row.executionConfidence,
    anomalies: row.anomalies, declined: row.declined, decisions: row.decisions, primaryId: row.primary?.id, primaryDestination: row.primary?.toCity,
    score: row.score, rankScore: row.rankScore, recency: row.recency, parts: row.parts,
    strategies: row.strategies.map(strategy => ({ id: strategy.id, advantageSilver: strategy.advantageSilver, netSilver: strategy.netSilver,
        weight: strategy.weight, reliability: strategy.reliability, toCity: strategy.toCity, evidence: strategy.evidence })) })).sort((a, b) => a.id.localeCompare(b.id));
assert.deepEqual(canonical(before.evaluationRows), canonical(after.evaluationRows));
const oldRows = before.evaluationRows.filter(row => row.eligible), newRows = after.evaluationRows.filter(row => row.eligible);
assert.deepEqual(rankOpportunityPresentation(after.evaluationRows).filter(row => row.eligible).map(row => row.id), newRows.map(row => row.id));
assert.equal(newRows.length, 1709);
for (const row of newRows) assert.equal(resolveOpportunityCard(row).status, 'STRATEGY');
const oldRank = (rows, mode) => rows.slice().sort((a, b) => {
    const value = row => mode === 'recent' ? row.recency || 0 : mode === 'importance' ? row.score || 0 : row.rankScore || 0;
    return value(b) - value(a) || (b.parts.reliability || 0) - (a.parts.reliability || 0) || (b.recency || 0) - (a.recency || 0)
        || Math.abs(b.buy?.deviation || b.sell?.deviation || 0) - Math.abs(a.buy?.deviation || a.sell?.deviation || 0) || a.id.localeCompare(b.id);
});
for (const mode of ['importance', 'recent']) assert.deepEqual(oldRank(oldRows, mode).map(row => row.id), rankOpportunityPresentation(newRows, { mode }).map(row => row.id));
const execution = strategy => strategy.execution || STRATEGY_SPECS[strategy.id].execution;
const entries = newRows.flatMap(row => row.strategies.filter(strategy => strategy.weight > 0).map(strategy => ({ cell: row.id, id: strategy.id, execution: execution(strategy), net: strategy.netSilver, roi: strategy.economics.returnRatio })));
const counts = list => list.reduce((result, key) => (result[key] = (result[key] || 0) + 1, result), {});
const distribution = values => Object.fromEntries([['min', 0], ['p10', .1], ['p25', .25], ['median', .5], ['p75', .75], ['p90', .9], ['max', 1]].map(([key, fraction]) => [key, quantile(values, fraction)]));
const byExecution = Object.fromEntries(['instant', 'order', 'transport'].map(model => {
    const list = entries.filter(entry => entry.execution === model);
    return [model, { strategies: list.length, silver: distribution(list.map(entry => entry.net)), returnRatio: distribution(list.map(entry => entry.roi)) }];
}));
const calibration = qualityCalibration(newRows);
const compact = (row, rank) => ({ rank, id: row.id, strategy: row.primary.id, execution: execution(row.primary), toCity: row.primary.toCity || null,
    net: row.primary.netSilver, returnRatio: row.primary.economics?.returnRatio ?? newRows.find(candidate => candidate.id === row.id)?.strategies.find(strategy => strategy.id === row.primary.id && strategy.toCity === row.primary.toCity)?.economics.returnRatio ?? null,
    ageHours: row.quality?.ageMs == null ? null : row.quality.ageMs / 3600000,
    quality: row.quality || null, oldBalancedScore: row.rankScore });
const first20 = { before: oldRows.slice(0, 20).map((row, index) => compact(row, index + 1)), after: newRows.slice(0, 20).map((row, index) => compact(row, index + 1)) };
const first100 = { before: counts(oldRows.slice(0, 100).map(row => execution(row.primary))), after: counts(newRows.slice(0, 100).map(row => execution(row.primary))) };
const oldPositions = new Map(oldRows.map((row, index) => [row.id, index + 1]));
const movements = newRows.map((row, index) => ({ ...compact(row, index + 1), beforeRank: oldPositions.get(row.id), delta: oldPositions.get(row.id) - index - 1 }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const netP10 = quantile(newRows.map(row => row.primary.netSilver), .1), roiP10 = quantile(newRows.map(row => row.primary.economics.returnRatio), .1);
const low = newRows.map((row, index) => ({ ...compact(row, index + 1), beforeRank: oldPositions.get(row.id),
    lowSilver: row.primary.netSilver <= netP10, lowReturn: row.primary.economics.returnRatio <= roiP10 }))
    .filter(row => row.lowSilver || row.lowReturn);
const filterViews = [
    { name: 'Varsayılan / filtre kapalı', minNet: null, minReturn: null },
    { name: 'Silver P10', minNet: netP10 }, { name: 'Getiri P10', minReturn: roiP10 },
    { name: 'Silver ve getiri P10', minNet: netP10, minReturn: roiP10 }
].map(options => ({ ...options, visibleBeforeLimit: rankOpportunityPresentation(newRows, options).length }));
const grouped = Object.fromEntries(['instant', 'order', 'transport'].map(model => [model, rankOpportunityPresentation(newRows, { execution: model }).map((row, index) => compact(row, index + 1))]));
assert.equal(grouped.instant.length, 2); assert.equal(grouped.order.length, 1436); assert.equal(grouped.transport.length, 355);
assert.deepEqual(after.verifiedRows.map(row => row.id), newRows.slice(0, 500).map(row => row.id));
const result = { manifest: after.manifest, policy: OPPORTUNITY_QUALITY_POLICY, calibration,
    unchanged: { sides: newSides.length, evaluatedCells: after.evaluationRows.length, eligibleCells: newRows.length, importance: true, recent: true, confidencePolicy: true, eligibility: true },
    strategies: counts(entries.map(entry => entry.id)), executionStrategies: counts(entries.map(entry => entry.execution)), primaryExecution: counts(newRows.map(row => execution(row.primary))),
    first20, first100, distributions: byExecution, lowDefinition: { silverP10: netP10, returnP10: roiP10 }, low, movements, grouped, filterViews,
    performance: { before: { coldMs: before.journal.validatedColdMs, warmMs: before.journal.validatedWarmMs }, after: { coldMs: after.journal.validatedColdMs, warmMs: after.journal.validatedWarmMs } } };
writeAuditJson(`${root}/comparison.json`, result, { compressed: true });
const number = value => value == null ? '—' : value.toFixed(2);
const pct = value => value == null ? '—' : `${(value * 100).toFixed(2)}%`;
const table = rows => ['| # | Ürün / şehir / kalite | İşlem | Teorik fark | Getiri |', '|---:|---|---|---:|---:|',
    ...rows.map(row => `| ${row.rank} | ${row.id.replaceAll('|', ' / ')}${row.toCity ? ` → ${row.toCity}` : ''} | ${row.execution} | ${number(row.net)} | ${pct(row.returnRatio)} |`)];
const lines = [
    '# Günün Fırsatları — fırsat kalitesi ve sıralama', '',
    '**Uygunluk değişmedi:** 1.709 hücre; 1.436 emir kurma, 355 taşıma ve 2 anlık strateji. Strateji sayıları örtüşür. 25.210 fiyat tarafının fiyat/ref/güven/kabul/karantina sonuçları ve bütün hücrelerin uygunluk kararları birebir eşit test edildi.', '',
    'Validated modu açılmadı; üretim migration/servis restart yapılmadı; üretim arşivleri değiştirilmedi. %12 tarihsel eşik, 25 gümüş fark, referans/işlem kapıları ve kompakt kart DOM/CSS yapısı korunur.', '',
    'Yeni kalite sırası validated değerlendirme satırlarında kullanılır; üretim servisi hâlâ legacy-shadow seçer. Legacy satırların dengeli sırası bu rollout’ta eski algoritmada kalır; bu rapordaki yeni sıra aynı verinin validated shadow sonucudur. Üretimde yeni doğrulama motoru etkinleştirilmiş gibi yorumlanmamalıdır.', '',
    '## Açıklanabilir kalite', '',
    'Kalite, gerçekleşme olasılığı veya beklenen kâr tahmini değildir. Bütün sıralama tercihleri content/js/core/market-opportunity-quality.mjs içindeki OPPORTUNITY_QUALITY_POLICY’de; işlem modelleri ortak STRATEGY_SPECS’tedir.', '',
    '| Bileşen | Ağırlık | Tanım |', '|---|---:|---|',
    '| Silver | %30 | log(1+fark), P90’da doyar; yarısı bütün havuza, yarısı işlem grubuna göre normalize edilir |',
    '| Yüzdesel getiri | %30 | log(1+getiri), işlem grubunun P90’ında doyar |',
    '| Güncellik | %25 | Kullanılan emirlerin en eski gerçek kaynak yaşı; ilk saat tam, mevcut 6 saat sınırına doğru azalır |',
    '| Kaynak kanıtı | %15 | Kullanılan emirlerin mevcut işlem güveninin minimumu; yeni güven seviyesi veya kaynak-isimi önceliği eklenmez |', '',
    'Bu ağırlıklar ölçülmüş başarı/dolma ihtimali değil, açıklanan sunum tercihidir. Mutlak silver tek başına en fazla 30 puan sağlar. Farklı işlem türlerinin ekonomik ölçekleri çok farklı olduğundan grup bağlamı da kullanılır; 4,91 gümüş, aynı gruptaki 100.000 gümüş ile aynı silver bileşenini alamaz. P90 ölçekleri her tam uygun strateji havuzundan hesaplanır, kullanıcı filtresine göre yeniden üretilmez. Farklı snapshot’ların kalite puanları mutlak zaman serisi olarak karşılaştırılmamalıdır.', '',
    `Bu snapshot normalizasyonu: ${JSON.stringify(calibration)}. Kaynak kalite bileşeni gerçek uygun kayıtlarda E1 olduğu için aynıdır; yapay farklı güven puanları üretilmez. Anlık grupta yalnız 2 örnek vardır; grup ölçeği piyasa dağılımının güvenilir bir tahmini olarak yorumlanmaz.`, '',
    'ROI = ücret sonrası teorik fark / görünen birim alış maliyeti. Emir kurmada Buy+1 ve alış setup’ı; anlık/taşımada kaynak Sell maliyeti kullanılır. Satış setup/vergi net farkta zaten düşülür. Taşıma maliyeti hesaplanmaz. Envanterden satış gibi alış maliyeti bilinmeyen tarihsel stratejilerde ROI null kalır; referansa göre avantaj yüzdesi ayrı alandır ve ROI diye gösterilmez.', '',
    '**Bilinmeyen yürütme koşulları:** derinlik, hacim, dolma ihtimali, taşıma maliyeti/süresi/riski ayrı neden/unknown alanlarıdır; kalite toplamında bunlara katsayı veya sayı atanmaz. instant/order/transport bir risk katsayısı değildir: grup seçimi, karşılaştırma bağlamı ve yakın puanlarda çeşitlilik için kullanılır.', '',
    '## Sıralama ve görünürlük', '',
    'Dengeli sıralama kaliteyi kullanır. En yüksek puana göre açılan en fazla 0,02 genişliğindeki bantlarda daha az gösterilmiş işlem türü önce alınabilir. Daha düşük kalite bandından aday çekilmez; sabit tür kotası veya eleme yoktur. Alternatif tür aynı bantta yoksa o bant tek tür olabilir. İki küçük anlık aday büyük getirili kayıtların önüne kota ile taşınmaz; Anlık işlem filtresinde ikisi de erişilebilir.', '',
    'Önem ve Güncellik modlarının önceki sıralamaları aynı veride birebir korundu. Tarayıcı ve sunucu ortak sıralama kodunu kullanır. Sunucu, istek üzerine tüm uygun adayları decisions yükü olmadan taşır; filtre/grup/sıralama uygulanınca 500 sınırı konur. Böylece ilk 500 dışında kalan kayıt tür/ürün/ekonomik filtrelerde kaybolmaz. Uygunluk sayacı görünürlük filtreleriyle değişmez.', '',
    'Minimum net fark ve minimum teorik getiri filtreleri kullanıcı tarafından ayarlanır ve kaydedilir. Varsayılanlar **boş/kapalı**: farklı gruplar arasında ortak bir zaman/miktar/taşıma maliyeti bilinmediği için evrensel minimum ekonomik fayda eşiği veriyle gerekçelendirilemiyor. Aşağıdaki P10 örnekleri dağılım analizi, otomatik filtre veya yeni güven eşiği değildir.', '',
    'Pozitif minimum getiri filtresi seçildiğinde ROI’si bilinmeyen stratejiler o görünümde gösterilmez; uygunlukları değişmez. Referans avantajı gerçek alış maliyetinin yerine konmaz.', '',
    'Kartlar mevcut kompakt yapıda ürün ve rota şehirlerini, ücret sonrası teorik farkı/getiriyi, işlem türünü ve mevcut eylemi gösterir. order: emirler dolarsa; transport: taşıma öncesi; instant: görünen emre karşı işlem. Miktar/dolma ihtimali gösterilmez; teorik fark gerçekleşmiş kazanç olarak sunulmaz.', '',
    '## Aynı journal snapshot’ı', '',
    `asOf ${after.manifest.asOf}; checkpoint 24 + journal 25–775. Hash’ler ../market-observation-audit/snapshot-manifest.json içinde. Üretim constructor’ı çalıştırılmadan donmuş veriler bellekte replay edildi. L3 33→33, L4 0→0; uygun hücre 1709→1709; ACTIONABLE 0.`, '',
    `Birincil işlem dağılımı (hücreler): ${JSON.stringify(result.primaryExecution)}. Tüm uygun strateji dağılımı: ${JSON.stringify(result.executionStrategies)}.`, '',
    '| İlk 100 | Önce | Sonra |', '|---|---:|---:|',
    ...['instant', 'order', 'transport'].map(model => `| ${model} | ${first100.before[model] || 0} | ${first100.after[model] || 0} |`), '',
    '## Eski ilk 20', '', ...table(first20.before), '', '## Yeni ilk 20', '', ...table(first20.after), '',
    '## Gerçek ekonomik dağılım', '',
    '| Model | Sayı | Fark min / P10 / medyan / P90 / max | Getiri min / P10 / medyan / P90 / max |', '|---|---:|---|---|',
    ...Object.entries(byExecution).map(([model, stats]) => `| ${model} | ${stats.strategies} | ${['min','p10','median','p90','max'].map(key => number(stats.silver[key])).join(' / ')} | ${['min','p10','median','p90','max'].map(key => pct(stats.returnRatio[key])).join(' / ')} |`), '',
    'Çok geniş emir makasları büyük teorik oranlar üretebilir; bunlar kabul edilmiş görünen fiyatlardır, dolma kanıtı değildir. Kalite puanı P90 üzerinde doyduğu için milyonlarca silver ve aşırı yüzdeler sınırsız sıralama avantajı üretmez. Fill/likidite bilinmiyor sınırlaması kartta ve unknown metadata’da korunur.', '',
    '## Düşük ekonomik değer ve filtre etkisi', '',
    `Tanım: mevcut birincil havuzun alt %10 silver (≤${number(netP10)}) veya alt %10 getiri (≤${pct(roiP10)}). Birleşim ${low.length} hücre; bu göreli etiket doğrulama engeli değildir. Tam kimlikler comparison.json.gz/low içinde.`, '',
    '| Görünüm | Minimum fark | Minimum getiri | Limit öncesi hücre |', '|---|---:|---:|---:|',
    ...filterViews.map(view => `| ${view.name} | ${number(view.minNet)} | ${pct(view.minReturn)} | ${view.visibleBeforeLimit} |`), '',
    '| Kayıt | Önce sıra | Sonra sıra | Fark | Getiri |', '|---|---:|---:|---:|---:|',
    ...low.slice().sort((a, b) => a.beforeRank - b.beforeRank).slice(0, 20).map(row => `| ${row.id.replaceAll('|', ' / ')} | ${row.beforeRank} | ${row.rank} | ${number(row.net)} | ${pct(row.returnRatio)} |`), '',
    '## Ciddi sıra değişimleri', '',
    '| Kayıt | Önce → sonra | Fark / getiri | Silver / getiri / tazelik / kanıt bileşeni |', '|---|---:|---|---|',
    ...movements.slice(0, 20).map(row => `| ${row.id.replaceAll('|', ' / ')} | ${row.beforeRank} → ${row.rank} | ${number(row.net)} / ${pct(row.returnRatio)} | ${Object.values(row.quality.components).map(number).join(' / ')} |`), '',
    'Yükselenlerde artık net fark ve birim getiri katkısı vardır; düşenlerde düşük ekonomik fark/getiri eski güncellik/anomali avantajını aşamamaktadır. Tablodaki bileşenler toplamdaki ağırlıklar uygulanmadan önceki değerlerdir. Kaynak kanıtı/uygunluk değişmedi. Tam önce/sonra sıra ve kalite gerekçeleri comparison.json.gz/movements içindedir.', '',
    '## Performans ve kontroller', '',
    '| Gerçek replay | Önce | Sonra |', '|---|---:|---:|',
    `| Cold | ${number(result.performance.before.coldMs)} ms | ${number(result.performance.after.coldMs)} ms |`,
    `| Warm | ${number(result.performance.before.warmMs)} ms | ${number(result.performance.after.warmMs)} ms |`, '',
    'Her replay cold/warm bütün değerlendirme kararlarının eşitliğini assert eder. Normalizasyon ve seri revizyonuna bağlı referans cache aynen korunur. Kalite/test modülleri kaynak güvenini veya geçmiş veriyi değiştirmez.', '',
    'Sentetik performans regresyonu (2.520 seri × 2.160 saat): cold 4171 ms, warm 91 ms, ölçüm sonu heap 54 MB; uygun 1260/listelenen 500. Test verileri gerçek piyasa adaylarına katılmaz. Yeni kalite hesaplaması ve metadata ek maliyet getirir; gerçek replay cold yaklaşık %7, warm yaklaşık %8 arttı. Bu tek koşu ölçümüdür; performans eşikleri geçti, eski normalizasyon/cache optimizasyonları kaldırılmadı.', '',
    'Kontroller: eski opportunity/status/observation/lifecycle ve 67 strateji matrisi; yeni ekonomik hesap, ağırlıklar, bilinmeyen alanlar, sınırlı çeşitlilik, önem/güncellik, filtrelerin saf olması, alternatif grup stratejisi ve 500 sonrasında erişim; gerçek tarayıcı modülünün VM ile kart/filtre render akışı; 25.210 seri optimizasyon eşdeğerliği; order history, collector/collection, performans ve geçici migration/rollback. Kart DOM/CSS tasarımı korunur; VM testi görsel piksel testi değildir.', '',
    '```powershell', 'npm run opportunities:test', "$env:AUDIT_OUTPUT='docs/market-opportunity-quality/replay'", 'node content/scripts/audit-market-observations.mjs', 'Remove-Item Env:AUDIT_OUTPUT', 'node content/scripts/compare-market-opportunity-quality.mjs', '```', '',
    'before/ aynı veri üzerinde saklanmış engine-before.txt ve scan-before.txt ile önceki sıralamanın replay’idir. replay/ tüm yeni sonuçları; comparison.json.gz değişmezlik kanıtlarını, sıra/dağılım/filtre analizlerini ve üç işlem grubunun tüm sıralamasını içerir. Önceki raporlar korunmuştur.'
];
writeFileSync(`${root}/report.md`, lines.join('\n') + '\n');
console.log(JSON.stringify({ unchanged: result.unchanged, strategies: result.strategies, first100, calibration, performance: result.performance }, null, 2));
