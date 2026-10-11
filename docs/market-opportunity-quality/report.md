# Günün Fırsatları — fırsat kalitesi ve sıralama

**Uygunluk değişmedi:** 1.709 hücre; 1.436 emir kurma, 355 taşıma ve 2 anlık strateji. Strateji sayıları örtüşür. 25.210 fiyat tarafının fiyat/ref/güven/kabul/karantina sonuçları ve bütün hücrelerin uygunluk kararları birebir eşit test edildi.

Validated modu açılmadı; üretim migration/servis restart yapılmadı; üretim arşivleri değiştirilmedi. %12 tarihsel eşik, 25 gümüş fark, referans/işlem kapıları ve kompakt kart DOM/CSS yapısı korunur.

Yeni kalite sırası validated değerlendirme satırlarında kullanılır; üretim servisi hâlâ legacy-shadow seçer. Legacy satırların dengeli sırası bu rollout’ta eski algoritmada kalır; bu rapordaki yeni sıra aynı verinin validated shadow sonucudur. Üretimde yeni doğrulama motoru etkinleştirilmiş gibi yorumlanmamalıdır.

## Açıklanabilir kalite

Kalite, gerçekleşme olasılığı veya beklenen kâr tahmini değildir. Bütün sıralama tercihleri content/js/core/market-opportunity-quality.mjs içindeki OPPORTUNITY_QUALITY_POLICY’de; işlem modelleri ortak STRATEGY_SPECS’tedir.

| Bileşen | Ağırlık | Tanım |
|---|---:|---|
| Silver | %30 | log(1+fark), P90’da doyar; yarısı bütün havuza, yarısı işlem grubuna göre normalize edilir |
| Yüzdesel getiri | %30 | log(1+getiri), işlem grubunun P90’ında doyar |
| Güncellik | %25 | Kullanılan emirlerin en eski gerçek kaynak yaşı; ilk saat tam, mevcut 6 saat sınırına doğru azalır |
| Kaynak kanıtı | %15 | Kullanılan emirlerin mevcut işlem güveninin minimumu; yeni güven seviyesi veya kaynak-isimi önceliği eklenmez |

Bu ağırlıklar ölçülmüş başarı/dolma ihtimali değil, açıklanan sunum tercihidir. Mutlak silver tek başına en fazla 30 puan sağlar. Farklı işlem türlerinin ekonomik ölçekleri çok farklı olduğundan grup bağlamı da kullanılır; 4,91 gümüş, aynı gruptaki 100.000 gümüş ile aynı silver bileşenini alamaz. P90 ölçekleri her tam uygun strateji havuzundan hesaplanır, kullanıcı filtresine göre yeniden üretilmez. Farklı snapshot’ların kalite puanları mutlak zaman serisi olarak karşılaştırılmamalıdır.

Bu snapshot normalizasyonu: {"sampleStrategies":1793,"silverScale":70808.356,"returnScale":1.785114349211394,"byExecution":{"instant":{"samples":2,"silverScale":2.9479999999999995,"returnScale":0.18971428571428567},"order":{"samples":1436,"silverScale":98577.96,"returnScale":2.142287291746947},"transport":{"samples":355,"silverScale":935.5759999999923,"returnScale":0.6450493506493511}}}. Kaynak kalite bileşeni gerçek uygun kayıtlarda E1 olduğu için aynıdır; yapay farklı güven puanları üretilmez. Anlık grupta yalnız 2 örnek vardır; grup ölçeği piyasa dağılımının güvenilir bir tahmini olarak yorumlanmaz.

ROI = ücret sonrası teorik fark / görünen birim alış maliyeti. Emir kurmada Buy+1 ve alış setup’ı; anlık/taşımada kaynak Sell maliyeti kullanılır. Satış setup/vergi net farkta zaten düşülür. Taşıma maliyeti hesaplanmaz. Envanterden satış gibi alış maliyeti bilinmeyen tarihsel stratejilerde ROI null kalır; referansa göre avantaj yüzdesi ayrı alandır ve ROI diye gösterilmez.

**Bilinmeyen yürütme koşulları:** derinlik, hacim, dolma ihtimali, taşıma maliyeti/süresi/riski ayrı neden/unknown alanlarıdır; kalite toplamında bunlara katsayı veya sayı atanmaz. instant/order/transport bir risk katsayısı değildir: grup seçimi, karşılaştırma bağlamı ve yakın puanlarda çeşitlilik için kullanılır.

## Sıralama ve görünürlük

Dengeli sıralama kaliteyi kullanır. En yüksek puana göre açılan en fazla 0,02 genişliğindeki bantlarda daha az gösterilmiş işlem türü önce alınabilir. Daha düşük kalite bandından aday çekilmez; sabit tür kotası veya eleme yoktur. Alternatif tür aynı bantta yoksa o bant tek tür olabilir. İki küçük anlık aday büyük getirili kayıtların önüne kota ile taşınmaz; Anlık işlem filtresinde ikisi de erişilebilir.

Önem ve Güncellik modlarının önceki sıralamaları aynı veride birebir korundu. Tarayıcı ve sunucu ortak sıralama kodunu kullanır. Sunucu, istek üzerine tüm uygun adayları decisions yükü olmadan taşır; filtre/grup/sıralama uygulanınca 500 sınırı konur. Böylece ilk 500 dışında kalan kayıt tür/ürün/ekonomik filtrelerde kaybolmaz. Uygunluk sayacı görünürlük filtreleriyle değişmez.

Minimum net fark ve minimum teorik getiri filtreleri kullanıcı tarafından ayarlanır ve kaydedilir. Varsayılanlar **boş/kapalı**: farklı gruplar arasında ortak bir zaman/miktar/taşıma maliyeti bilinmediği için evrensel minimum ekonomik fayda eşiği veriyle gerekçelendirilemiyor. Aşağıdaki P10 örnekleri dağılım analizi, otomatik filtre veya yeni güven eşiği değildir.

Pozitif minimum getiri filtresi seçildiğinde ROI’si bilinmeyen stratejiler o görünümde gösterilmez; uygunlukları değişmez. Referans avantajı gerçek alış maliyetinin yerine konmaz.

Kartlar mevcut kompakt yapıda ürün ve rota şehirlerini, ücret sonrası teorik farkı/getiriyi, işlem türünü ve mevcut eylemi gösterir. order: emirler dolarsa; transport: taşıma öncesi; instant: görünen emre karşı işlem. Miktar/dolma ihtimali gösterilmez; teorik fark gerçekleşmiş kazanç olarak sunulmaz.

## Aynı journal snapshot’ı

asOf 2026-10-10T15:24:07.570Z; checkpoint 24 + journal 25–775. Hash’ler ../market-observation-audit/snapshot-manifest.json içinde. Üretim constructor’ı çalıştırılmadan donmuş veriler bellekte replay edildi. L3 33→33, L4 0→0; uygun hücre 1709→1709; ACTIONABLE 0.

Birincil işlem dağılımı (hücreler): {"order":1384,"transport":324,"instant":1}. Tüm uygun strateji dağılımı: {"order":1436,"transport":355,"instant":2}.

| İlk 100 | Önce | Sonra |
|---|---:|---:|
| instant | 0 | 0 |
| order | 77 | 94 |
| transport | 23 | 6 |

## Eski ilk 20

| # | Ürün / şehir / kalite | İşlem | Teorik fark | Getiri |
|---:|---|---|---:|---:|
| 1 | T8_METALBAR_LEVEL2@2 / Bridgewatch / 1 | order | 72601.79 | 39.35% |
| 2 | T4_ARTEFACT_2H_SHAPESHIFTER_HELL / Brecilien / 1 → Martlock | transport | 9966.72 | 20.88% |
| 3 | T7_WOOD_LEVEL3@3 / Lymhurst / 1 | order | 40016.07 | 45.92% |
| 4 | T4_ARTEFACT_SHOES_CLOTH_AVALON / Martlock / 1 | order | 18257.74 | 34.86% |
| 5 | T6_ARMOR_PLATE_SET3@1 / Brecilien / 1 → Thetford | transport | 18257.28 | 67.62% |
| 6 | T3_POTION_REVIVE / Fort Sterling / 1 | order | 110.71 | 66.67% |
| 7 | T5_ORE_LEVEL2@2 / Thetford / 1 | order | 13.41 | 0.59% |
| 8 | T6_HIDE_LEVEL3@3 / Bridgewatch / 1 | order | 3084.04 | 8.99% |
| 9 | T4_HIDE_LEVEL1@1 / Thetford / 1 → Martlock | transport | 33.96 | 18.56% |
| 10 | T4_CAPE@1 / Fort Sterling / 1 | order | 1924.91 | 92.10% |
| 11 | T4_METALBAR / Bridgewatch / 1 | order | 4.91 | 2.12% |
| 12 | T4_METALBAR_LEVEL1@1 / Bridgewatch / 1 | order | 48.58 | 11.39% |
| 13 | T7_RUNE / Fort Sterling / 1 | order | 4.72 | 0.89% |
| 14 | T6_SHARD_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN / Thetford / 1 → Lymhurst | transport | 410.44 | 180.81% |
| 15 | T8_RANDOM_DUNGEON_TOKEN_D2@2 / Martlock / 1 | order | 129134.83 | 59.89% |
| 16 | T5_PLANKS / Lymhurst / 1 | order | 71.75 | 8.61% |
| 17 | T4_WOOD_LEVEL2@2 / Brecilien / 1 → Lymhurst | transport | 120.84 | 16.71% |
| 18 | T8_2H_KNUCKLES_SET1@1 / Martlock / 1 | order | 619737.88 | 123.39% |
| 19 | T2_FIBER / Thetford / 1 → Lymhurst | transport | 5.00 | 26.32% |
| 20 | T2_ORE / Martlock / 1 → Thetford | transport | 14.56 | 72.80% |

## Yeni ilk 20

| # | Ürün / şehir / kalite | İşlem | Teorik fark | Getiri |
|---:|---|---|---:|---:|
| 1 | T8_2H_TOOL_TRACKING / Martlock / 1 | order | 108404.36 | 297.45% |
| 2 | T8_MEAL_SANDWICH_FISH@2 / Martlock / 1 | order | 259994.02 | 537.14% |
| 3 | T6_OFF_JESTERCANE_HELL@3 / Martlock / 1 | order | 466303.30 | 39490.46% |
| 4 | T6_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | order | 1529236.10 | 994.57% |
| 5 | T7_OFF_JESTERCANE_HELL@1 / Martlock / 1 | order | 195897.50 | 13144.40% |
| 6 | T8_ARTEFACT_MAIN_DAGGER_HELL / Bridgewatch / 1 | order | 119529.87 | 256.13% |
| 7 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | order | 11872391.34 | 1020512.85% |
| 8 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D4@4 / Lymhurst / 1 | order | 37165088.77 | 3203058.59% |
| 9 | T7_2H_TOOL_SICKLE / Caerleon / 1 | order | 9293622.01 | 16484.76% |
| 10 | T4_SHOES_PLATE_HELL@2 / Brecilien / 1 | order | 56352.14 | 340.90% |
| 11 | T7_METALBAR_LEVEL2@2 / Lymhurst / 1 | order | 51656.38 | 215.45% |
| 12 | T6_MAIN_SCIMITAR_MORGANA / Martlock / 1 | order | 51608.53 | 279.71% |
| 13 | T6_SHOES_PLATE_FEY@2 / Brecilien / 1 | order | 128340.11 | 260.32% |
| 14 | T4_HEAD_LEATHER_HELL@3 / Martlock / 1 | order | 53465.57 | 205.90% |
| 15 | T5_FARM_HORSE_BABY / Brecilien / 1 | order | 109147.63 | 2128.43% |
| 16 | T4_MEAL_STEW@3 / Brecilien / 1 | order | 31583.24 | 2768.46% |
| 17 | T4_2H_FIRESTAFF@2 / Thetford / 1 | order | 27973.78 | 2334.60% |
| 18 | T4_2H_ARCANESTAFF_HELL / Martlock / 1 | order | 25247.15 | 1230.34% |
| 19 | T4_ARMOR_PLATE_AVALON@2 / Bridgewatch / 1 | order | 134224.80 | 250.69% |
| 20 | T4_ARMOR_PLATE_FEY@4 / Martlock / 1 | order | 275607.71 | 218.00% |

## Gerçek ekonomik dağılım

| Model | Sayı | Fark min / P10 / medyan / P90 / max | Getiri min / P10 / medyan / P90 / max |
|---|---:|---|---|
| instant | 2 | 0.68 / 0.93 / 1.94 / 2.95 / 3.20 | 9.71% / 10.74% / 14.86% / 18.97% / 20.00% |
| order | 1436 | 0.12 / 46.98 / 5353.58 / 98577.96 / 37165088.77 | 0.02% / 3.59% / 30.59% / 214.23% / 3203058.59% |
| transport | 355 | 0.04 / 5.96 / 61.00 / 935.58 / 18257.28 | 0.00% / 1.40% / 8.96% / 64.50% / 1804.84% |

Çok geniş emir makasları büyük teorik oranlar üretebilir; bunlar kabul edilmiş görünen fiyatlardır, dolma kanıtı değildir. Kalite puanı P90 üzerinde doyduğu için milyonlarca silver ve aşırı yüzdeler sınırsız sıralama avantajı üretmez. Fill/likidite bilinmiyor sınırlaması kartta ve unknown metadata’da korunur.

## Düşük ekonomik değer ve filtre etkisi

Tanım: mevcut birincil havuzun alt %10 silver (≤18.30) veya alt %10 getiri (≤2.92%). Birleşim 289 hücre; bu göreli etiket doğrulama engeli değildir. Tam kimlikler comparison.json.gz/low içinde.

| Görünüm | Minimum fark | Minimum getiri | Limit öncesi hücre |
|---|---:|---:|---:|
| Varsayılan / filtre kapalı | — | — | 1709 |
| Silver P10 | 18.30 | — | 1538 |
| Getiri P10 | — | 2.92% | 1538 |
| Silver ve getiri P10 | 18.30 | 2.92% | 1420 |

| Kayıt | Önce sıra | Sonra sıra | Fark | Getiri |
|---|---:|---:|---:|---:|
| T5_ORE_LEVEL2@2 / Thetford / 1 | 7 | 1351 | 13.41 | 0.59% |
| T4_METALBAR / Bridgewatch / 1 | 11 | 1433 | 4.91 | 2.12% |
| T7_RUNE / Fort Sterling / 1 | 13 | 1537 | 4.72 | 0.89% |
| T2_FIBER / Thetford / 1 | 19 | 827 | 5.00 | 26.32% |
| T2_ORE / Martlock / 1 | 20 | 178 | 14.56 | 72.80% |
| T2_METALBAR / Bridgewatch / 1 | 21 | 1408 | 2.61 | 11.05% |
| T2_PLANKS / Lymhurst / 1 | 22 | 978 | 9.51 | 48.83% |
| T2_ORE / Thetford / 1 | 23 | 1500 | 1.34 | 3.55% |
| T4_HIDE / Lymhurst / 1 | 24 | 1491 | 2.17 | 1.90% |
| T3_ORE / Fort Sterling / 1 | 25 | 1074 | 6.60 | 12.94% |
| T2_METALBAR / Thetford / 1 | 28 | 864 | 13.91 | 61.71% |
| T2_METALBAR / Martlock / 1 | 29 | 763 | 17.57 | 74.51% |
| T8_METALBAR_LEVEL3@3 / Fort Sterling / 1 | 37 | 768 | 4073.97 | 0.58% |
| T2_ORE / Bridgewatch / 1 | 38 | 262 | 12.56 | 57.09% |
| T4_SOUL / Lymhurst / 1 | 40 | 1390 | 1.96 | 2.06% |
| T4_ORE / Thetford / 1 | 43 | 1398 | 5.35 | 6.07% |
| T2_STONEBLOCK / Lymhurst / 1 | 47 | 814 | 18.14 | 65.55% |
| T2_ORE / Lymhurst / 1 | 50 | 741 | 7.56 | 28.00% |
| T5_EGG / Brecilien / 1 | 56 | 1362 | 9.16 | 2.59% |
| T3_POTION_REVIVE / Martlock / 1 | 58 | 1172 | 9.96 | 3.91% |

## Ciddi sıra değişimleri

| Kayıt | Önce → sonra | Fark / getiri | Silver / getiri / tazelik / kanıt bileşeni |
|---|---:|---|---|
| T7_RUNE / Fort Sterling / 1 | 13 → 1537 | 4.72 / 0.89% | 0.15 / 0.01 / 0.89 / 1.00 |
| T2_ORE / Thetford / 1 | 23 → 1500 | 1.34 / 3.55% | 0.08 / 0.03 / 1.00 / 1.00 |
| T4_HIDE / Lymhurst / 1 | 24 → 1491 | 2.17 / 1.90% | 0.10 / 0.02 / 1.00 / 1.00 |
| T3_ORE / Lymhurst / 1 | 86 → 1526 | 1.06 / 1.69% | 0.06 / 0.01 / 1.00 / 1.00 |
| T4_METALBAR / Bridgewatch / 1 | 11 → 1433 | 4.91 / 2.12% | 0.16 / 0.02 / 1.00 / 1.00 |
| T2_METALBAR / Bridgewatch / 1 | 21 → 1408 | 2.61 / 11.05% | 0.11 / 0.09 / 1.00 / 1.00 |
| T4_HEAD_LEATHER_DRAGON@4 / Caerleon / 1 | 1646 → 268 | 296131.28 / 2384.91% | 1.00 / 1.00 / 0.07 / 1.00 |
| T5_CAPEITEM_FW_THETFORD@1 / Caerleon / 1 | 1518 → 141 | 142756.26 / 461.40% | 1.00 / 1.00 / 0.32 / 1.00 |
| T5_CAPEITEM_KEEPER / Caerleon / 1 | 1519 → 142 | 116906.91 / 278.09% | 1.00 / 1.00 / 0.32 / 1.00 |
| T4_2H_ENIGMATICSTAFF@3 / Fort Sterling / 1 | 1516 → 140 | 153386.48 / 298.58% | 1.00 / 1.00 / 0.32 / 1.00 |
| T4_HEAD_CLOTH_ROYAL@1 / Lymhurst / 1 | 1569 → 198 | 99991.26 / 463.83% | 1.00 / 1.00 / 0.20 / 1.00 |
| T4_HEAD_PLATE_AVALON@3 / Martlock / 1 | 1657 → 287 | 198912.05 / 341.75% | 1.00 / 1.00 / 0.04 / 1.00 |
| T4_LEATHER_LEVEL3@3 / Martlock / 1 | 106 → 1475 | 4.01 / 0.05% | 0.14 / 0.00 / 1.00 / 1.00 |
| T5_HEAD_PLATE_AVALON@2 / Martlock / 1 | 1645 → 279 | 168471.08 / 353.85% | 1.00 / 1.00 / 0.05 / 1.00 |
| T4_HEAD_LEATHER_DRAGON@2 / Martlock / 1 | 1495 → 134 | 115363.60 / 239.08% | 1.00 / 1.00 / 0.34 / 1.00 |
| T4_ORE / Thetford / 1 | 43 → 1398 | 5.35 / 6.07% | 0.16 / 0.05 / 1.00 / 1.00 |
| T4_2H_BOW_KEEPER / Brecilien / 1 | 1577 → 225 | 55756.33 / 388.27% | 0.96 / 1.00 / 0.19 / 1.00 |
| T4_SOUL / Lymhurst / 1 | 40 → 1390 | 1.96 / 2.06% | 0.13 / 0.04 / 1.00 / 1.00 |
| T5_ORE_LEVEL2@2 / Thetford / 1 | 7 → 1351 | 13.41 / 0.59% | 0.24 / 0.01 / 1.00 / 1.00 |
| T4_CAPEITEM_FW_LYMHURST@3 / Martlock / 1 | 1640 → 300 | 72020.24 / 351.16% | 0.99 / 1.00 / 0.04 / 1.00 |

Yükselenlerde artık net fark ve birim getiri katkısı vardır; düşenlerde düşük ekonomik fark/getiri eski güncellik/anomali avantajını aşamamaktadır. Tablodaki bileşenler toplamdaki ağırlıklar uygulanmadan önceki değerlerdir. Kaynak kanıtı/uygunluk değişmedi. Tam önce/sonra sıra ve kalite gerekçeleri comparison.json.gz/movements içindedir.

## Performans ve kontroller

| Gerçek replay | Önce | Sonra |
|---|---:|---:|
| Cold | 3638.29 ms | 3891.21 ms |
| Warm | 1083.27 ms | 1170.23 ms |

Her replay cold/warm bütün değerlendirme kararlarının eşitliğini assert eder. Normalizasyon ve seri revizyonuna bağlı referans cache aynen korunur. Kalite/test modülleri kaynak güvenini veya geçmiş veriyi değiştirmez.

Sentetik performans regresyonu (2.520 seri × 2.160 saat): cold 4171 ms, warm 91 ms, ölçüm sonu heap 54 MB; uygun 1260/listelenen 500. Test verileri gerçek piyasa adaylarına katılmaz. Yeni kalite hesaplaması ve metadata ek maliyet getirir; gerçek replay cold yaklaşık %7, warm yaklaşık %8 arttı. Bu tek koşu ölçümüdür; performans eşikleri geçti, eski normalizasyon/cache optimizasyonları kaldırılmadı.

Kontroller: eski opportunity/status/observation/lifecycle ve 67 strateji matrisi; yeni ekonomik hesap, ağırlıklar, bilinmeyen alanlar, sınırlı çeşitlilik, önem/güncellik, filtrelerin saf olması, alternatif grup stratejisi ve 500 sonrasında erişim; gerçek tarayıcı modülünün VM ile kart/filtre render akışı; 25.210 seri optimizasyon eşdeğerliği; order history, collector/collection, performans ve geçici migration/rollback. Kart DOM/CSS tasarımı korunur; VM testi görsel piksel testi değildir.

```powershell
npm run opportunities:test
$env:AUDIT_OUTPUT='docs/market-opportunity-quality/replay'
node content/scripts/audit-market-observations.mjs
Remove-Item Env:AUDIT_OUTPUT
node content/scripts/compare-market-opportunity-quality.mjs
```

before/ aynı veri üzerinde saklanmış engine-before.txt ve scan-before.txt ile önceki sıralamanın replay’idir. replay/ tüm yeni sonuçları; comparison.json.gz değişmezlik kanıtlarını, sıra/dağılım/filtre analizlerini ve üç işlem grubunun tüm sıralamasını içerir. Önceki raporlar korunmuştur.
