# Günün Fırsatları — strateji bazlı uygunluk

Aynı journal snapshot’ında doğrulanmış fiyat kanıtına dayanan strateji hücresi **0 → 1709**. Bunlar gerçekleşmiş kâr veya miktarı doğrulanmış işlem değildir: kartların tamamı **STRATEGY / evaluate**; ACTIONABLE yok.

Validated modu açılmadı; üretim migration, arşiv yazımı veya servis restart yapılmadı. UI, referans motoru ve güven eşikleri değişmedi.

## Karar matrisi

| Strateji | Okunan emirler | Tarihsel kanıt | Ücret / sonuç |
|---|---|---|---|
| Yüksek Sell | Sell | L3+, ≥%12, ≥25, hareket onayı | Sell−1 satış emri; setup + satış vergisi; referansa göre avantaj |
| Düşük Sell | Sell | Aynı | Sell’den anında alış; referansa göre tasarruf |
| Yüksek Buy | Buy | Aynı | Buy’a anında satış; satış vergisi; referansa göre avantaj |
| Düşük Buy | Buy | Aynı | Buy+1 alış emri; setup; referansa göre tasarruf |
| Yerel makas: emir açma | Buy + Sell | Gerekmez | (Sell−1) satışından vergi+setup düşülür; (Buy+1) alışına setup eklenir |
| Yerel makas: anında | Sell + Buy | Gerekmez | Sell’den alınır, Buy’a satılır; yalnız satış vergisi |
| Şehirler arası | Kaynak Sell + hedef Buy | Gerekmez | Hedef Buy × (1−vergi) − kaynak Sell; taşıma öncesi |

Her okunan emir için gerçek kaynak zamanı, reported-top/complete kapsamı, kabul edilmiş gözlem, E1 ve 6 saatten kısa yaş gerekir. Partial/unknown kapsam, bilinmeyen zaman, karantina veya onaysız hareket engellenir. Tek güvenilir taraf iki taraflı stratejiyi doğrulamaz. İlk kabul edilmiş AODP fiyatı E1 olabilir; bu tarihsel L3 olduğu anlamına gelmez. Referans şartının kaldırılması E1, tazelik veya kapsam şartını kaldırmaz.

Şüpheli yerel Buy, yalnız Sell ve başka şehir Buy kullanan rotayı engellemez. Şüpheli hedef Buy veya kaynak Sell aynı rotayı engeller. Onaylanmamış uç fiyat eski accepted fiyatla gizlenmez. Miktar/dolma olasılığı bilinmiyor; hiçbir sayı üretilmedi.

## Aynı veriyle karşılaştırma

asOf: 2026-10-10T15:24:07.570Z; checkpoint 24 + journal 25–775. Kaynak hash’leri ../market-observation-audit/snapshot-manifest.json içinde; ham dondurulmuş snapshot aynıdır. 25210 tarafın referans/fiyat/kabul/karantina kararları birebir eşit assert edildi. L3: **33 → 33**, L4: **0 → 0**. Önceki 22 aday iki replay’de aynı üretildi.

| Ölçüm | Önce | Sonra |
|---|---:|---:|
| Legacy journal adayları | 766 | 766 |
| Hareket veya birincil stratejisi olan hücreler | 824 | 2494 |
| Uygun stratejisi olan hücreler | 0 | 1709 |
| Liste sınırıyla gösterilen | 0 | 500 |
| Gerçek cold | 3445 ms | 3690 ms |
| Gerçek warm | 1406 ms | 1162 ms |

| Strateji | Önce uygun | Sonra uygun |
|---|---:|---:|
| place-sell-order | 0 | 0 |
| instant-buy-from-sell | 0 | 0 |
| instant-sell-to-buy | 0 | 0 |
| place-buy-order | 0 | 0 |
| local-make | 0 | 1436 |
| local-flip | 0 | 2 |
| cross-city-instant | 0 | 355 |

Strateji sayıları örtüşür; hücre toplamına eklenmez. Cross-city motoru her kaynak hücre için uygun en yüksek teorik netli hedefi seçer; tüm hedef denemeleri decisionCounts içinde ayrı tutulur.

| Strateji denemeleri | Toplam | Uygun | Engellenen giriş nedenleri (örtüşür) |
|---|---:|---:|---|
| instant-sell-to-buy | 19598 | 0 | buy:reference-insufficient: 7470; buy:movement-direction: 7341; buy:movement-below-threshold: 7389; buy:movement-unconfirmed: 7470; buy:missing-reference: 5461; buy:quarantined: 29; buy:execution-unverified: 4195; buy:observation-unverified: 548; buy:stale-price: 4004; buy:missing-price: 12120; buy:source-time-unknown: 405; buy:incomplete-book: 405; buy:extreme-price: 4 |
| place-sell-order | 19598 | 0 | sell:reference-insufficient: 17707; sell:movement-below-threshold: 16984; sell:movement-direction: 16949; sell:movement-unconfirmed: 17661; sell:missing-reference: 12369; sell:quarantined: 151; sell:execution-unverified: 11135; sell:extreme-price: 25; sell:missing-price: 1866; sell:observation-unverified: 1567; sell:stale-price: 9837; sell:source-time-unknown: 423; sell:incomplete-book: 423 |
| instant-buy-from-sell | 19598 | 0 | sell:reference-insufficient: 17707; sell:movement-below-threshold: 16984; sell:movement-direction: 16908; sell:movement-unconfirmed: 17661; sell:missing-reference: 12369; sell:quarantined: 151; sell:execution-unverified: 11135; sell:extreme-price: 25; sell:missing-price: 1866; sell:observation-unverified: 1567; sell:stale-price: 9837; sell:source-time-unknown: 423; sell:incomplete-book: 423 |
| place-buy-order | 19598 | 0 | buy:reference-insufficient: 7470; buy:movement-below-threshold: 7389; buy:movement-direction: 7345; buy:movement-unconfirmed: 7470; buy:missing-reference: 5461; buy:quarantined: 29; buy:execution-unverified: 4195; buy:observation-unverified: 548; buy:stale-price: 4004; buy:missing-price: 12120; buy:source-time-unknown: 405; buy:incomplete-book: 405; buy:extreme-price: 4 |
| local-flip | 19598 | 2 | non-positive-after-fees: 1919; buy:quarantined: 29; buy:execution-unverified: 4195; buy:observation-unverified: 548; buy:stale-price: 4004; buy:missing-price: 12120; sell:quarantined: 151; sell:execution-unverified: 11135; sell:missing-price: 1866; sell:observation-unverified: 1567; buy:source-time-unknown: 405; buy:incomplete-book: 405; sell:stale-price: 9837; sell:source-time-unknown: 423; sell:incomplete-book: 423 |
| local-make | 19598 | 1436 | buy:quarantined: 29; buy:execution-unverified: 4195; non-positive-after-fees: 485; buy:observation-unverified: 548; buy:stale-price: 4004; buy:missing-price: 12120; sell:quarantined: 151; sell:execution-unverified: 11135; sell:missing-price: 1866; sell:observation-unverified: 1567; buy:source-time-unknown: 405; buy:incomplete-book: 405; sell:stale-price: 9837; sell:source-time-unknown: 423; sell:incomplete-book: 423 |
| cross-city-instant | 55930 | 639 | non-positive-after-fees: 6566; destination:missing-price: 30559; destination:observation-unverified: 1207; destination:execution-unverified: 12849; destination:stale-price: 12082; destination:quarantined: 121; destination:source-time-unknown: 463; destination:incomplete-book: 463; sell:quarantined: 690; sell:execution-unverified: 32344; sell:observation-unverified: 5212; sell:stale-price: 27374; sell:source-time-unknown: 476; sell:incomplete-book: 476 |

## Önceden engellenen gerçek rota

T3_MOUNT_HORSE Q1 Lymhurst Sell **11917** → Brecilien Buy **13039**. Premium vergi %4: 13039×0,96−11917 = **600,44 gümüş**, taşıma öncesi. İki taraf da AODP / reported-top, gerçek kaynak zamanlı, accepted / E1 / L3. Tarihsel sapma <%12; önce historical-deviation-required, sonra iki emir kapısı geçildi.

- sell: 11917, 2026-10-10T15:10:00.000Z, yaş 0.24 saat; evidenceId: europe|T3_MOUNT_HORSE|Lymhurst|1|sell|market|2026-10-10T15:10:00.000Z.
- destination: 13039, 2026-10-10T14:55:00.000Z, yaş 0.49 saat; evidenceId: europe|T3_MOUNT_HORSE|Brecilien|1|buy|market|2026-10-10T14:55:00.000Z.

Fixture gerçek arşiv zaman çizelgesini taşır: content/scripts/fixtures/market-strategy-route.json. Partial kaynak veya doğrulanmamış hedef varyantında rota engellenir; ilgisiz karantinadaki Buy varyantında uygun kalır.

## İlk 22 aday

| Hücre | Önceki strateji | Önce kapılar | Aynı stratejide sonra kapılar | Sonra uygun birincil |
|---|---|---|---|---|
| T8_PUMPKIN / Thetford / 1 | place-sell-order | other | other | — |
| T8_MOUNT_RAM_FW_MARTLOCK_ELITE / Brecilien / 1 | place-sell-order | reference | reference | local-make |
| T5_LEATHER / Brecilien / 1 | place-buy-order | reference, execution | reference, execution | — |
| T6_FARM_SHEEP_GROWN / Brecilien / 1 | local-make | reference | — | local-make |
| T7_CORN / Thetford / 1 | place-sell-order | reference | reference | — |
| T8_FARM_COW_BABY / Martlock / 1 | place-sell-order | reference | reference | — |
| T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / 1 | instant-buy-from-sell | reference | reference | local-make |
| T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / 2 | instant-buy-from-sell | reference, execution | reference, execution | — |
| T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / 4 | instant-buy-from-sell | reference, execution | reference, execution | — |
| T6_MOUNT_DIREWOLF / Brecilien / 1 | local-make | reference | — | local-make |
| T5_HEAD_PLATE_ROYAL@2 / Fort Sterling / 5 | place-sell-order | reference, execution | reference, execution | — |
| T5_HEAD_PLATE_ROYAL@2 / Fort Sterling / 4 | local-make | reference, execution | execution | — |
| QUESTITEM_TOKEN_ROYAL_T5 / Thetford / 1 | instant-sell-to-buy | reference, execution | reference, execution | — |
| T7_FARM_PIG_GROWN / Brecilien / 1 | place-buy-order | reference, execution, quarantine | reference, execution, quarantine | — |
| T6_MEAT / Brecilien / 1 | local-make | reference, execution, quarantine | execution, quarantine | — |
| T5_MOUNT_HORSE / Brecilien / 1 | local-make | reference | — | local-make |
| T4_MOUNT_HORSE / Brecilien / 1 | local-make | other | — | local-make |
| T3_PLANKS / Brecilien / 1 | instant-sell-to-buy | reference, execution, quarantine | reference, execution, quarantine | — |
| T4_LEATHER / Martlock / 1 | place-buy-order | reference | reference | local-make |
| T6_LABOURER_CONTRACT_MAGE / Martlock / 1 | instant-buy-from-sell | reference, execution, freshness | reference, execution, freshness | — |
| T2_JOURNAL_MAGE_EMPTY / Martlock / 1 | instant-buy-from-sell | reference, execution | reference, execution | — |
| T3_PLANKS / Martlock / 1 | instant-buy-from-sell | reference | reference | local-make |

Eski hareket stratejisinin engellenmesi ile aynı hücrede başka bir emir stratejisinin uygun olması farklı kararlardır. comparison.json.gz her adayın önce/sonra kapılarını ve tüm yeni strateji neden kodlarını içerir.

İlk 22’nin aynı eski stratejisine ait kapı sayıları: önce {"other":2,"reference":20,"execution":11,"quarantine":3,"freshness":1}; sonra {"other":1,"reference":15,"execution":11,"quarantine":3,"freshness":1}. Kapılar örtüşür. Yeni uygun hücre: 8/22.

## Yeni kayıtların kanıt denetimi

1709 yeni hücrenin bütün pozitif stratejilerindeki her gerekli emir yeniden strategyEvidence ile doğrulandı. Hepsinde kaynak zamanı/kapsam/status/E1/tazelik uygun; ücret sonrası fark pozitif. Tarihsel stratejilerden yeni kayıt yok. Her fiyat, gerçek kaynak zamanı, evidenceId, L ve E, önceki engel ve sonraki karar comparison.json.gz/proofs içinde korunur.

| Hücre | Birincil | Hedef | Teorik fark |
|---|---|---|---:|
| T8_METALBAR_LEVEL2@2 / Bridgewatch / 1 | local-make | aynı şehir | 72601.79 |
| T4_ARTEFACT_2H_SHAPESHIFTER_HELL / Brecilien / 1 | cross-city-instant | Martlock | 9966.72 |
| T7_WOOD_LEVEL3@3 / Lymhurst / 1 | local-make | aynı şehir | 40016.07 |
| T4_ARTEFACT_SHOES_CLOTH_AVALON / Martlock / 1 | local-make | aynı şehir | 18257.74 |
| T6_ARMOR_PLATE_SET3@1 / Brecilien / 1 | cross-city-instant | Thetford | 18257.28 |
| T3_POTION_REVIVE / Fort Sterling / 1 | local-make | aynı şehir | 110.71 |
| T5_ORE_LEVEL2@2 / Thetford / 1 | local-make | aynı şehir | 13.41 |
| T6_HIDE_LEVEL3@3 / Bridgewatch / 1 | local-make | aynı şehir | 3084.04 |
| T4_HIDE_LEVEL1@1 / Thetford / 1 | cross-city-instant | Martlock | 33.96 |
| T4_CAPE@1 / Fort Sterling / 1 | local-make | aynı şehir | 1924.91 |
| T4_METALBAR / Bridgewatch / 1 | local-make | aynı şehir | 4.91 |
| T4_METALBAR_LEVEL1@1 / Bridgewatch / 1 | local-make | aynı şehir | 48.58 |
| T7_RUNE / Fort Sterling / 1 | local-make | aynı şehir | 4.72 |
| T6_SHARD_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN / Thetford / 1 | cross-city-instant | Lymhurst | 410.44 |
| T8_RANDOM_DUNGEON_TOKEN_D2@2 / Martlock / 1 | local-make | aynı şehir | 129134.83 |
| T5_PLANKS / Lymhurst / 1 | local-make | aynı şehir | 71.75 |
| T4_WOOD_LEVEL2@2 / Brecilien / 1 | cross-city-instant | Lymhurst | 120.84 |
| T8_2H_KNUCKLES_SET1@1 / Martlock / 1 | local-make | aynı şehir | 619737.88 |
| T2_FIBER / Thetford / 1 | cross-city-instant | Lymhurst | 5.00 |
| T2_ORE / Martlock / 1 | cross-city-instant | Thetford | 14.56 |

## Kök neden ve kalan risk

**Aşırı katı strateji politikası:** tarihsel referans/sapma koşulu güncel emir karşılaştırmalarını gereksiz engelliyordu; bu bağ ayrıldı. **Algoritma hatası:** kart çözümleyicisi yerel emirlerde tarihsel referans arıyordu ve bazı ortak anomali kontrolleri ilgisiz tarafa bağımlıydı; gerekli girişlere göre düzeltildi. **Veri eksikliği:** tarihsel fırsatlar hâlâ güçlü referans ve onaylı ≥%12/25 hareket bulamıyor. **Kaynak kapsamı:** belirsiz/kısmi yerel gözlemler işlem kanıtı sayılmıyor; AODP reported-top yalnız görünen fiyatı doğrular.

Yanlış gerçekleşmiş kâr beklentisi riski sürer: AODP top emirler eşzamanlı ve miktarlı bir defter snapshot’ı değildir; fiyatlar iki işlem arasında değişebilir. Yerel emir kurmada dolma, şehirler arasında taşıma süresi/maliyeti/risk ve hedef emir miktarı bilinmiyor. Mevcut 6 saat eşiği korunmuştur; teorik fiyat uygunluğu anında uygulanabilirlik garantisi olarak gösterilmez.

## Testler ve tekrar üretim

67 strateji karar matrisi vakası: eksik, eski, karantina, partial, bilinmeyen kaynak zamanı, tek/iki güvenilir taraf ve %12 altı/no-history. Gerçek rota fixture’ı, bağımsız taraf izolasyonu, ilk gözlemler, premium/non-premium vergi ve setup yönleri test edildi. Mevcut opportunity/status, observation/lifecycle, geçici migration/rollback, order history, collector/collection, performans ve 25.210 seri optimizasyon eşdeğerliği kontrolleri geçti.

Sentetik 2.520 seri × 2.160 saat performans regresyonu: cold 3347 ms, warm 73 ms, ölçüm sonu heap 41 MB; uygun 1260, listelenen 500. Sentetik kayıtlar gerçek piyasa fırsatlarına katılmadı. Gerçek snapshot süreleri yukarıdaki ayrı ölçümlerdir; yeni strateji denemelerinin maliyetini de içerir. Normalizasyon ve seri revizyonuna bağlı referans cache korunur. Her replay cold/warm kararlarının tam eşitliğini assert eder.

```powershell
npm run opportunities:test
$env:AUDIT_OUTPUT='docs/market-strategy-eligibility/replay'
node content/scripts/audit-market-observations.mjs
Remove-Item Env:AUDIT_OUTPUT
node content/scripts/compare-market-strategy-eligibility.mjs
```

before dizini saklanmış engine-before.txt ile üretilen aynı snapshot baseline’ıdır. replay/analysis.json.gz tüm değerlendirme satırlarını ve kanıtları içerir; comparison.json.gz nedenler ve denetim sonucudur. Önceki audit/fix raporları korunmuştur.
