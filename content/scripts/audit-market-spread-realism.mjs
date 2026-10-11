import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { readAuditFile, writeAuditJson } from './market-audit-artifacts.mjs';
import { assessSpreadRealism, spreadCalibration } from '../js/core/market-spread-realism.mjs';
import { quantile, rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';
const read = path => JSON.parse(readAuditFile(path, 'utf8'));
const root = 'docs/market-spread-realism';
mkdirSync(root, { recursive: true });
const audit = read('docs/market-opportunity-quality/replay/analysis.json');
const sides = read('docs/market-opportunity-quality/replay/live-series.json');
const index = new Map(sides.map(side => [side.id, side]));
const frozen = read('docs/market-observation-audit/snapshot.json');
const archive = JSON.parse(frozen['.aodp-quote-history.json']);
const anchors = new Map(archive.anchors), now = Date.parse(audit.manifest.asOf);
for (const tx of frozen['.aodp-quote-history.json.journal'].split('\n').filter(Boolean).map(JSON.parse)) {
    if (tx.sequence <= archive.sequence || tx.sequence > audit.manifest.lastSequence || Date.parse(tx.writtenAt) > now) continue;
    for (const event of tx.events) if (event.type === 'anchor') {
        const row = event.row;
        anchors.set(`${row.server}|${row.item_id}|${row.location}|${row.quality}`, row);
    }
}
const rates = JSON.parse(readFileSync('data/economy-constants.json', 'utf8'));
const rate = key => Number(rates.find(row => row.key === key).value);
const fees = { setupFeeRate: rate('setup_fee'), taxPremiumRate: rate('tax_premium'), taxFreeRate: rate('tax_free') };
const rows = audit.evaluationRows.filter(row => row.eligible);
const local = rows.filter(row => row.strategies.some(strategy => strategy.id === 'local-make'));
const calibration = spreadCalibration(local);
const before = JSON.stringify(audit.evaluationRows), sideBefore = JSON.stringify(sides.map(side => side.actual));
const elapsed = performance.now();
function classify(row) {
    // row.quality is the presentation score object; product quality remains in the immutable cell ID.
    const quality = Number(row.id.split('|').at(-1));
    const key = `${row.server}|${row.itemId}|${row.city}|${quality}`;
    const buy = index.get(`${key}|buy`), sell = index.get(`${key}|sell`);
    const result = assessSpreadRealism({ row, buyIdentity: buy, sellIdentity: sell, fees, calibration });
    const anchor = anchors.get(key);
    const days = (anchor?.data || []).filter(day => Number(day.item_count) > 0 && Number(day.avg_price) > 0 && Date.parse(`${day.timestamp.replace(/Z$/, '')}Z`) + 86400000 <= now);
    const prices = days.map(day => Number(day.avg_price));
    return { id: row.id, server: row.server, itemId: row.itemId, city: row.city, productQuality: quality,
        rank: rows.indexOf(row) + 1, primary: row.primary.id, qualityScore: row.quality?.score,
        buy: row.buy, sell: row.sell, ...result,
        aggregateSalesHistory: { source: anchor?.source || null, fetchedAt: anchor?.fetchedAt || null, completedDays: days.length,
            reportedItemCount: days.length ? days.reduce((sum, day) => sum + Number(day.item_count), 0) : null,
            minDailyAverage: prices.length ? Math.min(...prices) : null, medianDailyAverage: quantile(prices, .5), maxDailyAverage: prices.length ? Math.max(...prices) : null,
            askWithinDailyAverageRange: prices.length ? row.sell.price >= Math.min(...prices) && row.sell.price <= Math.max(...prices) : null,
            days, meaning: 'Provider-reported daily sales aggregates; not individual fills, order depth or a guaranteed sale price.' } };
}
const results = local.map(classify), classificationMs = performance.now() - elapsed;
const count = list => Object.fromEntries(['historical-price-supported', 'current-orders-only', 'extreme-wide-uncertain', 'data-calculation-inconsistent'].map(key => [key, list.filter(row => row.classification === key).length]));
const top100 = results.filter(row => row.rank <= 100);
const roi20 = top100.slice().sort((a, b) => b.returnRatio - a.returnRatio).slice(0, 20);
const silver20 = top100.slice().sort((a, b) => b.netSilver - a.netSilver).slice(0, 20);
const named = results.filter(row => /T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN|T6_OFF_JESTERCANE_HELL|T7_2H_TOOL_(SICKLE|TRACKING)/.test(row.itemId));
const selected = [...new Map([...roi20, ...silver20, ...named].map(row => [row.id, row])).values()];
const timelines = selected.map(row => ({ id: row.id, buy: index.get(`${row.server}|${row.itemId}|${row.city}|${row.productQuality}|buy`), sell: index.get(`${row.server}|${row.itemId}|${row.city}|${row.productQuality}|sell`) }));
assert.equal(JSON.stringify(audit.evaluationRows), before);
assert.equal(JSON.stringify(sides.map(side => side.actual)), sideBefore);
assert.deepEqual(rankOpportunityPresentation(audit.evaluationRows).filter(row => row.eligible).map(row => row.id), rows.map(row => row.id));
assert.equal(results.filter(row => row.reasons.length).length, 0);
const summary = { manifest: audit.manifest, fees, calibration, eligible: rows.length, localMake: results.length,
    classifications: count(results), top100Classifications: count(top100), top100LocalMake: top100.length,
    top100PrimaryLocalMake: top100.filter(row => row.primary === 'local-make').length,
    extreme: results.filter(row => row.extreme).length, top100Extreme: top100.filter(row => row.extreme).length,
    historicalQuoteSupport: results.filter(row => row.historicalSupport).length,
    salesAggregateCoverage: results.filter(row => row.aggregateSalesHistory.completedDays).length,
    top100SalesAggregateCoverage: top100.filter(row => row.aggregateSalesHistory.completedDays).length,
    individualFillEvidence: 0, knownDepth: 0, knownFillProbability: 0,
    scoreOne: results.filter(row => row.qualityScore === 1).length,
    classificationMs, unchangedSides: sides.length, unchangedRankedCandidates: rows.length,
    scanPerformance: audit.journal.performance || audit.journal.timings || null };
writeAuditJson(`${root}/analysis.json`, { summary, results, roi20, silver20, named }, { compressed: true });
writeAuditJson(`${root}/timelines.json`, timelines, { compressed: true });
const n = value => Number.isFinite(value) ? value.toFixed(2) : 'bilinmiyor';
const table = list => ['| Sıra | Ürün / şehir / kalite | Buy | Sell | Buy zamanı / Sell zamanı (UTC) | L Buy/Sell | Net / ürün | Teorik ROI % | Sınıf |', '|---|---|---:|---:|---|---|---:|---:|---|', ...list.map(row => `| ${row.rank} | ${row.itemId} / ${row.city} / ${row.productQuality} | ${row.buy.price} | ${row.sell.price} | ${row.buy.at} / ${row.sell.at} | ${row.buy.referenceLevel}/${row.sell.referenceLevel} | ${n(row.netSilver)} | ${n(row.returnRatio * 100)} | ${row.classification} |`)].join('\n');
writeFileSync(`${root}/report.md`, [
    '# Emir makası gerçekçilik denetimi', '',
    `Snapshot: ${audit.manifest.asOf}; checkpoint ${audit.manifest.checkpointSequence}, journal son sıra ${audit.manifest.lastSequence}. Önceki kalite raporuyla aynı dondurulmuş journal dahil veri. Üretim dosyaları okunmaz veya yazılmaz.`, '',
    '## Sonuç', '',
    `Hesap ve kimlik denetiminde ${results.length} uygun local-make kaydında tutarsızlık bulunmadı. ${summary.extreme} kayıt dağılıma göre aşırı geniş; ilk 100 içinde ${summary.top100Extreme}. Büyük makasın hatalı olduğu veya dolacağı bu sonuçtan çıkarılamaz.`, '',
    `Uygun hücre ${rows.length}, fiyat tarafı ${sides.length}; accepted/E1/L3, uygunluk ve bütün sıralama değişmedi. İlk 100 içinde ${summary.top100PrimaryLocalMake} birincil local-make, ayrıca ${top100.length - summary.top100PrimaryLocalMake} alternatif local-make var. Aşağıdaki ilk 100 makas sayıları alternatif dahil ${top100.length} kayda ait. Sınıflandırma yalnız ayrı tanı artefaktında; motor, UI ve üretim modu değiştirilmedi.`, '',
    '## Hesap denetimi', '',
    `Mevcut oranlar: alış ve satış emir açma ${fees.setupFeeRate * 100}%; premium satış vergisi ${fees.taxPremiumRate * 100}%, ücretsiz ${fees.taxFreeRate * 100}%. Premium için B\'=Buy+1, S\'=max(1,Sell−1), sermaye=B\'×1.025, satış geliri=S\'×0.935, net=gelir−sermaye, ROI=net/sermaye. Ücretsiz hesapta satış çarpanı 0.895. Mevcut ortak ücret motoru kullanılır.`, '',
    'Bütün tutarlar bir ürün içindir; yığın miktarıyla çarpılmadı. ROI paydası düşük mevcut bid üzerine kurulacak alış emrinin maliyetidir; mevcut ask üzerinden hemen satın alma maliyeti değildir. İki yeni emrin de bir kez dolması, fiyatların korunması ve yeniden emir açılmaması varsayılır. Tekrar açma ücretleri, kuyruğa girme, sermaye bekleme süresi bilinmez. Fiyat/ücret yuvarlaması ve oyundaki fiili emir faturası bu snapshot ile doğrulanamaz; mevcut kesirli hesap korunur.', '',
    'Kimlik: server, tam itemId (enchant dahil), şehir ve ürün kalitesi iki tarafın seri kimliğinden ve evidenceId önekinden denetlendi. Tarayıcı sunucuyu önce filtreler; hücreler item/şehir/kalite ile, şehirler arası eşler tam item/kalite ile gruplanır. Sunum quality nesnesi ürün kalitesi yerine kullanılmadı; ürün kalitesi hücre ID ve ham seri kimliğinde korundu.', '',
    '## Kanıt ve sınıflandırma', '',
    'historical-price-supported: iki tarafın mevcut L3+ referansı var ve fiyat mevcut düz bandında veya doğrulanmış harekette. Bu yalnız tarihsel emir fiyatı desteğidir, gerçekleşmiş satış kanıtı değildir. current-orders-only: iki güncel görünen emir doğrulanmış, bu tarihsel destek yok. extreme-wide-uncertain: tarihsel destek yok ve Sell/Buy dağılımın üst dış çitinin üzerinde. data-calculation-inconsistent: kimlik, fiyat kanıtı veya ücret/ROI denetimi tutarsız.', '',
    `“Aşırı” tanımı ROI sınırı değildir: ${calibration.samples} local-make için Sell/Buy Q1=${n(calibration.q1)}, Q3=${n(calibration.q3)}, betimsel Tukey dış çiti Q3+3×IQR=${n(calibration.outerFence)}. Bir istatistiksel işaret, ekonomik gerçeklik hükmü değildir; listeleme, puan ve güven kapılarını etkilemez. Çit çevresindeki kayıtların sınıf değişimi keyfî bir doğrulama kararına dönüşmez.`, '',
    '| Sınıf | Tüm local-make | İlk 100 |', '|---|---:|---:|',
    ...Object.keys(summary.classifications).map(key => `| ${key} | ${summary.classifications[key]} | ${summary.top100Classifications[key]} |`), '',
    `Tarihsel iki taraflı L3 desteği ${summary.historicalQuoteSupport}. Tamamlanmış gün satış agregası bulunan ${summary.salesAggregateCoverage}, ilk 100 içinde ${summary.top100SalesAggregateCoverage}. Bunlar kaynakta raporlanan günlük avg_price/item_count; tekil emir dolumu, kuyruk, tam derinlik veya mevcut ask seviyesinde satış kanıtı değildir. Her kaydın günlük aralığı, medyanı, toplam raporlanan miktarı ve ham günleri analysis.json.gz içinde. Eksik veri null; hacim sıfır kabul edilmedi.`, '',
    'E1/accepted burada kaynak zamanı bilinen reported-top fiyat kanıtıdır. İki uç zamanları farklı olabilir; bir anda aynı defterin iki tarafının birlikte görüldüğünü iddia etmiyoruz. Zaman farkı her kayıt için artefakta yazıldı. reported-top tam defter değildir. Tekil gerçekleşmiş işlem, derinlik ve dolma olasılığı kanıtı bu veri kümesinde yok.', '',
    '## İlk 100 içinde en yüksek ROI (20 kayıt)', '', table(roi20), '',
    '## İlk 100 içinde en yüksek net silver (20 kayıt)', '', table(silver20), '',
    '## İstenen ürünler (tüm uygun şehir/enchant varyantları)', '', table(named), '',
    'T7_2H_TOOL_SICKLE ile T7_2H_TOOL_TRACKING ayrı ürünlerdir. Önceki ilk 20 kaydı T7_2H_TOOL_SICKLE / Caerleon; “Tracking Sickle” adıyla iki kimlik birleştirilmedi. T8 token D3@3 ve D4@4 ayrı enchant/ürün kimlikleri; Jester Cane enchant varyantları ayrı incelendi. Tüm seçilmiş kayıtların ham ve normalleştirilmiş zaman çizelgeleri timelines.json.gz içinde.', '',
    ...named.filter(row => row.rank <= 20).map(row => {
        const history = row.aggregateSalesHistory;
        return `**${row.id}:** Buy ${row.buy.price} → yeni alış ${row.postedBuy}, Sell ${row.sell.price} → yeni satış ${row.postedSell}; sermaye ${n(row.capitalSilver)}, satış geliri ${n(row.proceedsSilver)}. Referans gözlem sayısı Buy/Sell ${row.buy.referenceSamples}/${row.sell.referenceSamples}; yayılım saat ${n(row.buy.referenceSpanMs / 3600000)}/${n(row.sell.referenceSpanMs / 3600000)}. Tamamlanmış satış agregası ${history.completedDays} gün, raporlanan miktar ${history.reportedItemCount ?? 'bilinmiyor'}; günlük ortalama aralığı ${n(history.minDailyAverage)}–${n(history.maxDailyAverage)}, medyan ${n(history.medianDailyAverage)}; güncel ask aralık içinde ${history.askWithinDailyAverageRange === null ? 'bilinmiyor' : history.askWithinDailyAverageRange ? 'evet' : 'hayır'}. Bu karşılaştırma ask seviyesinin geçmiş bağlamını verir; düşük bid üzerinden alışın dolacağını kanıtlamaz.`;
    }), '',
    'Özel yorum: T8 D4@4 tokenın 39.750.000 ask fiyatı geçmiş günlük ortalamaların 25–54 milyon aralığında; milyonluk satış seviyesi sırf büyüklüğü nedeniyle hatalı ilan edilemez. D3@3 için iki gün/üç ürün 14–20,2 milyon ortalama mevcut. İkisinde de yaklaşık 1.100 silver yeni alış emrinin dolum kanıtı yok; milyonluk teorik farkın kritik belirsizliği budur. T7 Sickle 10 milyon ask ise 9 günlük 117 ürünün 64.055–69.988 günlük ortalamalarından çok uzak; eski düşük fiyatlı satışlar bugünkü yüksek askı doğrulamaz. T6 Jester Cane @3 için tamamlanmış satış agregası ve L3 desteği yok. Bu bağlamlar ayrı tutulmalı; hepsi tek “yüksek ROI” etiketiyle aynı kesinlikte önerilemez.', '',
    'Her tablodaki mevcut iki taraf accepted/E1 ve reported-top. Kaynak zamanı tablodadır; L seviyesi ayrıca verilir. Posted Buy/Sell, sermaye, satış geliri, ücret sonrası net, ROI, kaynak evidenceId, referans/gözlem sayısı/zaman yayılımı ve bütün varsayımlar analysis.json.gz içinde. Emir miktarı, dolma süresi/olasılığı ve yüksek ask seviyesinde gerçek alıcı olup olmadığı bilinmiyor.', '',
    '## Sıralama etkisi', '',
    `${summary.scoreOne} local-make sunum kalite puanı 1. P90 normalizasyonu net ve ROI bileşenlerini doyuruyor; taze E1 fiyatlar da güncellik/kanıt bileşenini 1 yapabiliyor. Böylece zayıf tarihsel destek ve bilinmeyen dolum ile azami sunum puanı birlikte bulunabiliyor. Bu hesap hatası değil; puanı gerçekleşebilirlik güveni gibi okumak yanıltıcı. Özellikle token/Jester/Sickle kayıtları kanıtlanmış milyonluk kâr olarak önerilemez.`, '',
    'Öneri: mevcut ekonomik öncelik puanını ve ayrı recommendationEvidence/classification bilgisini birlikte göster; “Görünen emirler doğrulandı; iki emrin dolması bilinmiyor” de. Tarihsel emir desteğini günlük satış agregası bağlamından ve tekil dolum kanıtından ayrı tut. Belirsizleri erişilebilir bir görünümde koru. Gizli risk çarpanı, ROI tavanı veya eleme eklenmedi; bu denetim sırasında yeni sıralama uygulanmadı.', '',
    '## Ek kanıt ve çözülemeyenler', '',
    'Mevcut AODP collector günlük sales-history anchor topluyor; aynı sunucu/şehir/item/kalite için tamamlanmış gün avg_price ve item_count bağlamını fırsata taşımak güvenli olabilir. Beklenen etki: yüksek ask ile tarihsel gerçekleşmiş ortalamaların ayrışmasını görünür kılmak. Risk: günlük ortalamayı tekil gerçekleşme veya güncel likidite sanmak; bu yüzden Buy/Sell bağımsız gözlemine dönüştürülmemeli, E1/L3 üretmemeli.', '',
    'Mevcut fiyat toplayıcısının tercih edilen ürün planında bu belirsiz kayıtları önceliklendirmek daha fazla gerçek kaynak zamanına sahip uç fiyat sağlayabilir. Tekrarlanan aynı timestamp bağımsız kanıt değildir. Yerel hub için protokol gerçekten sağlıyorsa emir kimliği, miktar, değişiklik/silme ve snapshot tamamlanma bilgisini ayrı kapsamla saklamak gerekir. Emir silinmesi satış değildir. Eksik kapsamdan tam ekstrem veya hacim çıkarılmamalı. Bu analiz toplayıcı davranışını değiştirmedi ve yeni servis eklemedi.', '',
    'Mevcut snapshot ile iki yeni emrin dolacağı, fiili kuyruk/derinlik, satış süresi, güncel yüksek ask seviyesinde alıcı, rekabet/repricing maliyeti çözülemez. Günlük satış agregası bulunması bunları çözmez. Tekil fiili emir/işlem kayıtları olmadan beklenen kâr veya gerçekleşme olasılığı hesaplanamaz.', '',
    '## Sınıflanan kök nedenler ve doğrulama', '',
    'Veri eksikliği: tekil dolum/derinlik/kuyruk verisi yok. Kaynak kapsamı: reported-top ve günlük agregalar; tam defter değil. Algoritma/politika: local-make matematiğinde veya kimlik eşleşmesinde bu snapshot üzerinde hata bulunmadı; kalite puanının kanıtlayabildiğinden daha güçlü ekonomik kesinlik olarak yorumlanması sunum semantiği riski. Aşırı katı politika saptanmadı; hiçbir güven eşiği değiştirilmedi.', '',
    `Sınıflandırma ${n(classificationMs)} ms. Bu tarama değil, dondurulmuş sonuçların tanı analizi; üretim cold/warm yoluna eklenmedi. Yeniden üretim: node content/scripts/audit-market-spread-realism.mjs. 1.709 sıralı hücre ve 25.210 taraf sonuçları değişmediği assertion ile denetlendi. node content/scripts/test-market-spread-realism.mjs ve npm run opportunities:test başarılı: kimlik/enchant/kalite/sunucu, premium/ücretsiz ücret/ROI, destek/eksik destek/aşırı makas/tutarsız hesap, saf değerlendirme; mevcut strateji/gözlem/yaşam döngüsü/kalite/kart regresyonları ve geçici migration/rollback kontrolleri. Testlerin migration kontrolü geçici test dosyalarındadır; üretim migration çalıştırılmadı. Optimizasyon eşdeğerliği yeniden geçti: 25.210 karşılaştırma, 0 değişiklik. Performans regresyonu yeniden geçti: 2.520 seri × 2.160 saat sentetik test, cold 3.643 ms, warm 101 ms, heap 54 MB; bu test sentetik verisi gerçek audit sonuçlarına katılmadı. Validated modu ve üretim arşivlerine dokunulmadı.`, ''
].join('\n'));
console.log(JSON.stringify(summary, null, 2));
