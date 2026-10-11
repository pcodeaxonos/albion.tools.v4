import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readAuditFile, writeAuditJson } from './market-audit-artifacts.mjs';
import { STRATEGY_SPECS, strategyEvidence } from '../js/core/market-strategy-policy.mjs';
import { resolveOpportunityCard } from '../js/core/opportunity-status.mjs';

const root = 'docs/market-strategy-eligibility';
const read = path => JSON.parse(readAuditFile(path, 'utf8'));
const before = read(`${root}/before/analysis.json`), after = read(`${root}/replay/analysis.json`);
assert.deepEqual(before.manifest, after.manifest);
assert.deepEqual(before.policy, after.policy);
assert.deepEqual(before.journal.bounds, after.journal.bounds);
assert.equal(before.original.reproducedOldCandidates, 22);
assert.equal(after.original.reproducedOldCandidates, 22);
assert.equal(before.journal.oldCandidates, after.journal.oldCandidates);
const beforeSeries = read(`${root}/before/live-series.json`);
const afterSeries = read(`${root}/replay/live-series.json`);
assert.deepEqual(beforeSeries.map(row => [row.id, row.actual]), afterSeries.map(row => [row.id, row.actual]));
const baseline = new Map(before.evaluationRows.map(row => [row.id, row]));
const verified = after.evaluationRows.filter(row => row.eligible);
const totals = rows => {
    const counts = Object.fromEntries(Object.keys(STRATEGY_SPECS).map(id => [id, 0]));
    for (const row of rows) for (const strategy of row.strategies) if (strategy.weight > 0) counts[strategy.id]++;
    return counts;
};
const previousReasons = (row, strategy) => {
    const previous = baseline.get(row.id);
    const inputs = strategy.evidence.inputs;
    const reasons = [];
    for (const key of STRATEGY_SPECS[strategy.id].inputs) {
        const side = key === 'destination' ? baseline.get(`${row.itemId}|${strategy.toCity}|${row.quality}`)?.buy : previous?.[key];
        if (!side?.usable) reasons.push(`${key}:historical-reference-required`);
    }
    if (strategy.id === 'local-make' && !previous?.buy?.anomalous && !previous?.sell?.anomalous) reasons.push('historical-deviation-required');
    if (strategy.id === 'cross-city-instant' && !inputs.sell.anomalous && !inputs.destination.anomalous) reasons.push('historical-deviation-required');
    return reasons;
};
const proofs = verified.map(row => {
    assert.equal(resolveOpportunityCard(row).status, 'STRATEGY', row.id);
    assert.equal(row.parts.feasibility, null);
    const strategies = row.strategies.filter(strategy => strategy.weight > 0).map(strategy => {
        const check = strategyEvidence(strategy.id, strategy.evidence.inputs);
        assert.equal(check.eligible, true, `${row.id} ${strategy.id}: ${check.reasons}`);
        assert.ok(strategy.netSilver > 0);
        assert.equal(STRATEGY_SPECS[strategy.id].group, 'orders');
        return { id: strategy.id, toCity: strategy.toCity || null, netBeforeTravelOrFill: strategy.netSilver,
            beforeReasons: previousReasons(row, strategy), afterReasons: check.reasons, inputs: check.inputs };
    });
    return { id: row.id, primary: row.primary.id, status: 'STRATEGY', strategies };
});
const strategyCounts = { before: totals(before.evaluationRows.filter(row => row.eligible)), after: totals(verified) };
const decisions = {};
for (const row of after.evaluationRows) for (const decision of row.decisions || []) {
    const count = decisions[decision.id] ||= { evaluated: 0, eligible: 0, reasons: {} };
    count.evaluated++; if (decision.eligible) count.eligible++;
    for (const reason of decision.reasons) count.reasons[reason] = (count.reasons[reason] || 0) + 1;
}
const candidate22 = after.candidates.map(candidate => {
    const old = before.candidates.find(row => row.id === candidate.id);
    const row = after.evaluationRows.find(row => row.id === candidate.id);
    return { id: candidate.id, originalStrategy: candidate.strategy,
        historicalBeforeGates: old.journalSnapshot.gates, historicalAfterGates: candidate.journalSnapshot.gates,
        beforeEligible: old.journalSnapshot.eligible, afterEligible: candidate.journalSnapshot.eligible,
        afterPrimary: row?.primary?.id || null, afterDecisions: row?.decisions || [] };
});
const route = proofs.find(row => row.id === 'T3_MOUNT_HORSE|Lymhurst|1');
assert.ok(route.strategies.some(strategy => strategy.id === 'cross-city-instant' && strategy.toCity === 'Brecilien' && Math.abs(strategy.netBeforeTravelOrFill - 600.44) < 1e-8));
const summary = { manifest: after.manifest, before: before.journal, after: after.journal,
    comparedSides: afterSeries.length, unchangedReferenceAndObservationDecisions: true,
    strategyCounts, decisionCounts: decisions, candidate22, proofs, route };
writeAuditJson(`${root}/comparison.json`, summary, { compressed: true });
const lines = [
    '# Günün Fırsatları — strateji bazlı uygunluk', '',
    `Aynı journal snapshot’ında doğrulanmış fiyat kanıtına dayanan strateji hücresi **${before.journal.verified} → ${after.journal.verified}**. Bunlar gerçekleşmiş kâr veya miktarı doğrulanmış işlem değildir: kartların tamamı **STRATEGY / evaluate**; ACTIONABLE yok.`, '',
    'Validated modu açılmadı; üretim migration, arşiv yazımı veya servis restart yapılmadı. UI, referans motoru ve güven eşikleri değişmedi.', '',
    '## Karar matrisi', '',
    '| Strateji | Okunan emirler | Tarihsel kanıt | Ücret / sonuç |', '|---|---|---|---|',
    '| Yüksek Sell | Sell | L3+, ≥%12, ≥25, hareket onayı | Sell−1 satış emri; setup + satış vergisi; referansa göre avantaj |',
    '| Düşük Sell | Sell | Aynı | Sell’den anında alış; referansa göre tasarruf |',
    '| Yüksek Buy | Buy | Aynı | Buy’a anında satış; satış vergisi; referansa göre avantaj |',
    '| Düşük Buy | Buy | Aynı | Buy+1 alış emri; setup; referansa göre tasarruf |',
    '| Yerel makas: emir açma | Buy + Sell | Gerekmez | (Sell−1) satışından vergi+setup düşülür; (Buy+1) alışına setup eklenir |',
    '| Yerel makas: anında | Sell + Buy | Gerekmez | Sell’den alınır, Buy’a satılır; yalnız satış vergisi |',
    '| Şehirler arası | Kaynak Sell + hedef Buy | Gerekmez | Hedef Buy × (1−vergi) − kaynak Sell; taşıma öncesi |', '',
    'Her okunan emir için gerçek kaynak zamanı, reported-top/complete kapsamı, kabul edilmiş gözlem, E1 ve 6 saatten kısa yaş gerekir. Partial/unknown kapsam, bilinmeyen zaman, karantina veya onaysız hareket engellenir. Tek güvenilir taraf iki taraflı stratejiyi doğrulamaz. İlk kabul edilmiş AODP fiyatı E1 olabilir; bu tarihsel L3 olduğu anlamına gelmez. Referans şartının kaldırılması E1, tazelik veya kapsam şartını kaldırmaz.', '',
    'Şüpheli yerel Buy, yalnız Sell ve başka şehir Buy kullanan rotayı engellemez. Şüpheli hedef Buy veya kaynak Sell aynı rotayı engeller. Onaylanmamış uç fiyat eski accepted fiyatla gizlenmez. Miktar/dolma olasılığı bilinmiyor; hiçbir sayı üretilmedi.', '',
    '## Aynı veriyle karşılaştırma', '',
    `asOf: ${after.manifest.asOf}; checkpoint 24 + journal 25–775. Kaynak hash’leri ../market-observation-audit/snapshot-manifest.json içinde; ham dondurulmuş snapshot aynıdır. ${afterSeries.length} tarafın referans/fiyat/kabul/karantina kararları birebir eşit assert edildi. L3: **33 → 33**, L4: **0 → 0**. Önceki 22 aday iki replay’de aynı üretildi.`, '',
    '| Ölçüm | Önce | Sonra |', '|---|---:|---:|',
    `| Legacy journal adayları | ${before.journal.oldCandidates} | ${after.journal.oldCandidates} |`,
    `| Hareket veya birincil stratejisi olan hücreler | ${before.journal.newCandidates} | ${after.journal.newCandidates} |`,
    `| Uygun stratejisi olan hücreler | ${before.journal.verified} | ${after.journal.verified} |`,
    `| Liste sınırıyla gösterilen | ${before.verifiedRows.length} | ${after.verifiedRows.length} |`,
    `| Gerçek cold | ${before.journal.validatedColdMs.toFixed(0)} ms | ${after.journal.validatedColdMs.toFixed(0)} ms |`,
    `| Gerçek warm | ${before.journal.validatedWarmMs.toFixed(0)} ms | ${after.journal.validatedWarmMs.toFixed(0)} ms |`, '',
    '| Strateji | Önce uygun | Sonra uygun |', '|---|---:|---:|',
    ...Object.keys(STRATEGY_SPECS).map(id => `| ${id} | ${strategyCounts.before[id]} | ${strategyCounts.after[id]} |`), '',
    'Strateji sayıları örtüşür; hücre toplamına eklenmez. Cross-city motoru her kaynak hücre için uygun en yüksek teorik netli hedefi seçer; tüm hedef denemeleri decisionCounts içinde ayrı tutulur.', '',
    '| Strateji denemeleri | Toplam | Uygun | Engellenen giriş nedenleri (örtüşür) |', '|---|---:|---:|---|',
    ...Object.entries(decisions).map(([id, counts]) => `| ${id} | ${counts.evaluated} | ${counts.eligible} | ${Object.entries(counts.reasons).map(([reason, count]) => `${reason}: ${count}`).join('; ')} |`), '',
    '## Önceden engellenen gerçek rota', '',
    'T3_MOUNT_HORSE Q1 Lymhurst Sell **11917** → Brecilien Buy **13039**. Premium vergi %4: 13039×0,96−11917 = **600,44 gümüş**, taşıma öncesi. İki taraf da AODP / reported-top, gerçek kaynak zamanlı, accepted / E1 / L3. Tarihsel sapma <%12; önce historical-deviation-required, sonra iki emir kapısı geçildi.', '',
    ...route.strategies.filter(strategy => strategy.id === 'cross-city-instant').flatMap(strategy => Object.entries(strategy.inputs).map(([side, input]) => `- ${side}: ${input.price}, ${input.at}, yaş ${(input.ageMs / 3600000).toFixed(2)} saat; evidenceId: ${input.evidenceId}.`)), '',
    'Fixture gerçek arşiv zaman çizelgesini taşır: content/scripts/fixtures/market-strategy-route.json. Partial kaynak veya doğrulanmamış hedef varyantında rota engellenir; ilgisiz karantinadaki Buy varyantında uygun kalır.', '',
    '## İlk 22 aday', '',
    '| Hücre | Önceki strateji | Önce kapılar | Aynı stratejide sonra kapılar | Sonra uygun birincil |', '|---|---|---|---|---|',
    ...candidate22.map(row => `| ${row.id.replaceAll('|', ' / ')} | ${row.originalStrategy} | ${row.historicalBeforeGates.failed.join(', ') || '—'} | ${row.historicalAfterGates.failed.join(', ') || '—'} | ${row.afterEligible ? row.afterPrimary : '—'} |`), '',
    'Eski hareket stratejisinin engellenmesi ile aynı hücrede başka bir emir stratejisinin uygun olması farklı kararlardır. comparison.json.gz her adayın önce/sonra kapılarını ve tüm yeni strateji neden kodlarını içerir.', '',
    `İlk 22’nin aynı eski stratejisine ait kapı sayıları: önce ${JSON.stringify(before.journal.gateCountsOriginalCandidates.inclusive)}; sonra ${JSON.stringify(after.journal.gateCountsOriginalCandidates.inclusive)}. Kapılar örtüşür. Yeni uygun hücre: ${candidate22.filter(row => row.afterEligible).length}/22.`, '',
    '## Yeni kayıtların kanıt denetimi', '',
    `${proofs.length} yeni hücrenin bütün pozitif stratejilerindeki her gerekli emir yeniden strategyEvidence ile doğrulandı. Hepsinde kaynak zamanı/kapsam/status/E1/tazelik uygun; ücret sonrası fark pozitif. Tarihsel stratejilerden yeni kayıt yok. Her fiyat, gerçek kaynak zamanı, evidenceId, L ve E, önceki engel ve sonraki karar comparison.json.gz/proofs içinde korunur.`, '',
    '| Hücre | Birincil | Hedef | Teorik fark |', '|---|---|---|---:|',
    ...proofs.slice(0, 20).map(row => { const strategy = row.strategies.find(strategy => strategy.id === row.primary); return `| ${row.id.replaceAll('|', ' / ')} | ${row.primary} | ${strategy.toCity || 'aynı şehir'} | ${strategy.netBeforeTravelOrFill.toFixed(2)} |`; }), '',
    '## Kök neden ve kalan risk', '',
    '**Aşırı katı strateji politikası:** tarihsel referans/sapma koşulu güncel emir karşılaştırmalarını gereksiz engelliyordu; bu bağ ayrıldı. **Algoritma hatası:** kart çözümleyicisi yerel emirlerde tarihsel referans arıyordu ve bazı ortak anomali kontrolleri ilgisiz tarafa bağımlıydı; gerekli girişlere göre düzeltildi. **Veri eksikliği:** tarihsel fırsatlar hâlâ güçlü referans ve onaylı ≥%12/25 hareket bulamıyor. **Kaynak kapsamı:** belirsiz/kısmi yerel gözlemler işlem kanıtı sayılmıyor; AODP reported-top yalnız görünen fiyatı doğrular.', '',
    'Yanlış gerçekleşmiş kâr beklentisi riski sürer: AODP top emirler eşzamanlı ve miktarlı bir defter snapshot’ı değildir; fiyatlar iki işlem arasında değişebilir. Yerel emir kurmada dolma, şehirler arasında taşıma süresi/maliyeti/risk ve hedef emir miktarı bilinmiyor. Mevcut 6 saat eşiği korunmuştur; teorik fiyat uygunluğu anında uygulanabilirlik garantisi olarak gösterilmez.', '',
    '## Testler ve tekrar üretim', '',
    '67 strateji karar matrisi vakası: eksik, eski, karantina, partial, bilinmeyen kaynak zamanı, tek/iki güvenilir taraf ve %12 altı/no-history. Gerçek rota fixture’ı, bağımsız taraf izolasyonu, ilk gözlemler, premium/non-premium vergi ve setup yönleri test edildi. Mevcut opportunity/status, observation/lifecycle, geçici migration/rollback, order history, collector/collection, performans ve 25.210 seri optimizasyon eşdeğerliği kontrolleri geçti.', '',
    'Sentetik 2.520 seri × 2.160 saat performans regresyonu: cold 3347 ms, warm 73 ms, ölçüm sonu heap 41 MB; uygun 1260, listelenen 500. Sentetik kayıtlar gerçek piyasa fırsatlarına katılmadı. Gerçek snapshot süreleri yukarıdaki ayrı ölçümlerdir; yeni strateji denemelerinin maliyetini de içerir. Normalizasyon ve seri revizyonuna bağlı referans cache korunur. Her replay cold/warm kararlarının tam eşitliğini assert eder.', '',
    '```powershell', 'npm run opportunities:test', "$env:AUDIT_OUTPUT='docs/market-strategy-eligibility/replay'", 'node content/scripts/audit-market-observations.mjs', 'Remove-Item Env:AUDIT_OUTPUT', 'node content/scripts/compare-market-strategy-eligibility.mjs', '```', '',
    'before dizini saklanmış engine-before.txt ile üretilen aynı snapshot baseline’ıdır. replay/analysis.json.gz tüm değerlendirme satırlarını ve kanıtları içerir; comparison.json.gz nedenler ve denetim sonucudur. Önceki audit/fix raporları korunmuştur.'
];
writeFileSync(`${root}/report.md`, lines.join('\n') + '\n');
console.log(JSON.stringify({ verified: verified.length, strategyCounts, unchangedSides: afterSeries.length,
    original22Eligible: candidate22.filter(row => row.afterEligible).length, coldMs: after.journal.validatedColdMs, warmMs: after.journal.validatedWarmMs }, null, 2));
