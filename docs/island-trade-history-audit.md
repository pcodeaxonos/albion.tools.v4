# Ada Planlayıcı V2 — Yerel Trade History veri yeterliliği denetimi

Denetim kesiti: **2026-10-12T00:39:27.071Z**, Türkiye saati **12 Ekim 2026 03:39:27**. Pencere sonu 2026-10-12T00:00:00.000Z; tamamlanmamış 12 Ekim UTC günü hesaba alınmadı. Bu rapor kodu, güvenilirlik eşiklerini, hesap motorunu ve veri toplama servislerini değiştirmeden hazırlanmıştır.

## 1. Kanıtlarla ana sonuç

Sorun yalnız “yerel arşivde veri yok” değildir. **İki ayrı yerel arşiv sınıfı vardır:** kişisel SAT işlemleri ve AODP genel piyasa geçmişinin yerel kopyası. Potansiyel, yalnız kişisel arşivi yerel kaynak olarak değerlendirip sonra doğrudan dış AODP history’ye gider. Piyasa araçlarının eriştiği yerel AODP satış history kaydı bu akışa bağlı değildir.

- Kişisel arşiv: **16761 kayıt**, 13611 gerçekleşmiş alış/satış. Bunların 12035 tanesinde (88.42%) kalite eksik. Gerçek ham kayıtların mevcut kalite alanlarını taramada kurtarılabilir kalite **0** bulundu; bu sadece normalizer’ın dolu bir alanı atması değildir.
- Gerçek normal-kalite/yön/şehir eşleşmesi bulunan Ada otomatik doldurma alanı **31 / 847**; 31’inin tamamı mevcut her dönemde kapsam, işlemli gün ve tazelikten kalır. Yerel kişisel Potansiyel-uygun alan **0**.
- Buna karşılık diskteki genel piyasa history kaydında **17.990 hacimli seri**, Ada kolektör kapsamındaki 1.260 serinin **944’ünde gerçek item_count** var. 28 gün için tüm Ada kolektör kapsamından **300 / 1.260** seri mevcut eşikleri geçer.
- Aktif otomatik doldurmanın 847 yönlü veri gereksiniminin **297’si** aynı eşikleri diskteki AODP history ile geçer. Yönü kaldırınca **263 benzersiz item/şehir/kalite** okuması dış API’ye başvurmadan karşılanabilir. Mevcut Potansiyel bunları okumaz.
- 60/90 gün için kolektörün tuttuğu satış penceresi yetmez: en uzun mevcut seri **29 nokta**; gereken minimum kapsam sırasıyla **42 ve 63 gün**. Son anchor’ın üzerine yazma davranışı nedeniyle sadece beklemek bu eksiği çözmez.

**Önce arşiv bağlantısı ve ölçüm türü ayrımı düzeltilmeli. Bu denetimde hiçbir eşik gevşetilmedi.**

## 2. Kapsam, yöntem ve ölçülerin anlamı

İki kapsam birlikte kullanıldı:

1. Ortak kolektörün ilişkisel Ada kapsamı: **180 item × 7 şehir × kalite 1 = 1.260** genel piyasa serisi. Kennel/binek/malzeme kapsamı dahil, geniş katalogdur.
2. Mevcut V2 Focus-hariç otomatik doldurma kataloğu: **60 üretim seçeneği, 113 benzersiz item; 60 HASAT/sell ve 61 TOHUM/edinim/buy rolü**. Yedi şehre yayılınca **847 yönlü gereksinim**; yön kaldırılınca 791 benzersiz item/şehir/kalite. Kennel yeni otomatik doldurma adaylarına dahil edilmediği için bu kapsam geniş kolektörden küçüktür. Dolu özel slotlarla gerçek komutun kapsamı büyüyebilir.

Gerçek katalog, mevcut modüllerin yalnız bellek içindeki VM kopyasında yüklendi; init, optimizer, kaydetme ve servis endpointleri çağrılmadı. Günlük üretim/kâr hesabına müdahale edilmedi. Mevcut localTradeEvidence ve salesEvidence fonksiyonları **aynı policy ile** salt okunur veriye uygulandı. Pencere dışında kalan günler, eksik kalite ve eksik hacim doldurulmadı.

Aktif AODP checkpoint + journal, journal verisinin açılıştaki byte sınırına kadar okunarak yeniden birleştirildi. Checkpoint sıra 4495; uygulanmış journal sıra 5166; 671 transaction; sıra boşluğu 0, hatalı satır 0, yarım son satır 0 byte. Kesitten sonraki kayıtlar analize alınmadı. Başlangıçta görülen daha eski checkpoint tek başına kullanılmadı.

“Uygun seri” fiyat+hacim referansının giriş kontrollerini geçmesi demektir; pozitif kâr, yeterli bütün girdiler veya adanın nihai yerleşiminin doğrulanması demek değildir. Sunucu **Europe**; diğer sunucular için bu arşivden sonuç çıkarılmadı.

## 3. Kaynak haritası: araçlar aynı arşivi mi kullanıyor?

| Araç / mod | Geçmiş kaynağı / yol | Ölçüm türü |
| --- | --- | --- |
| Flipper tarihsel uç fiyat kontrolü | fetchLongTermIndex → :3001 /api/v1/market/long-term → .price-order-history.json + .aodp-quote-history.json/journal | Emir fiyatları; Sell için satış history ortalaması fallback, Buy için güncel Buy fallback |
| Günün Fırsatları / piyasa fırsat serileri | :3001 /api/v1/market/opportunities ve opportunity-series → aynı packet/AODP repository; attachOpportunitySales → repository.anchor | Emir fiyatı kanıtı; item_count ayrıca satış hareketliliği bilgisi |
| Karar Motoru | fetchLongTermIndex ve fetchDecisionSeries → aynı yerel hub/repository | Fiyat referansı ve saatlik emir gözlemleri |
| Trade History / Trades | :3003 /api/v1/trades + SSE → SAT UserData-EUROPE/Trades.json | Kullanıcının kişisel gerçekleşmiş işlemleri, diğer kişisel olaylar ve süresi dolmuş emirler |
| V2 normal TOHUM/HASAT UV | fetchLongTermIndex → :3001 ortak yerel fiyat arşivi | Fiyat; raw item_count serisini V2 istemcisine taşımaz |
| V2 normal 4H/average ve Günlük Kâr minimum hacim | market-history.js → dış /api/v2/stats/history; tarayıcı RAM cache | API satış history ortalaması/hacmi |
| V2 Satış Potansiyeli | fetchCachedTradeSnapshot → kişisel SAT; eksik ölçümlerde fetchHistoryIndex → doğrudan dış API | Kişisel fiyat/performans + dış genel piyasa history. Yerel repository anchors okunmuyor |
| Ada Planlayıcı V1 / Laborer tarihsel fiyat-hacim | fetchHistoryIndex → dış AODP + RAM cache | Ortak yerel disk history yerine doğrudan API |
| Ada Çıktı / yield history | islandYieldLogs / data/island-yield-logs.json | Üretim, geri dönüş, verim ve örnek sayısı; piyasa satış hacmi değil |
| Diğer yerel kayıtlar | Flipper sepet/monitör durumu, opportunityJournal / opportunity-evidence, karar geçmişi, fixedPrices ve kaydedilmiş ada planları | Kullanıcı kararı, sinyal veya ayar; bağımsız piyasa işlem history kaydı değildir |


**Flipper/UV ile Trade History aynı şey değildir.** Ayrıca UV tarihsel fiyat seçimi en az bir uygun tamamlanmış emir günü veya fiyat fallback’i ile çalışabilir. Trades fiyat önerileri en az beş uygun fiyatlı işlem sayısına bakar; varsayılan “Tümü” filtrelerinde şehir/kalite/zaman toplulaşması daha geniştir. Bu araçlarda fiyat/çizgi görülmesi, Potansiyel’in %70 gün kapsamı + miktar + tazelik şartlarını geçmek anlamına gelmez.

Kaynak kanıtları: [content/js/core/flipper-data.js:2](../content/js/core/flipper-data.js); [content/js/core/decision-data.js:2](../content/js/core/decision-data.js); [content/scripts/quote-service.mjs:92](../content/scripts/quote-service.mjs); [content/js/core/long-term-price.mjs:111](../content/js/core/long-term-price.mjs); [content/js/tools/trades.js:55](../content/js/tools/trades.js); [content/js/tools/island-planner-v2.js:749](../content/js/tools/island-planner-v2.js).

## 4. Arşiv alanları ve kesin ölçüm ayrımı

| Arşiv | Item / sunucu / şehir / kalite | Zaman | Fiyat | Hacim / kaynak |
| --- | --- | --- | --- | --- |
| SAT kişisel işlemler | itemId (mail UniqueItemName / AuctionEntry.ItemTypeId); sunucu Europe klasör bağlamı; clusterIndex → locationName; kalite sadece mevcut instant AuctionEntry.QualityLevel | CsvOutput → occurredAt; gerçekleşmiş işlem zamanı | unitPriceSilver, totalPriceSilver; internal silver / 10.000; ayrıca taxRate, taxSetupRate, distanceFeeSilver | quantity = kişisel gerçekleşmiş miktar; native item_count yok. kind + sourceId; scope personal snapshot bağlamı |
| .price-order-history.json | server, itemId, city, quality, side, priceField | seenAt/bucketAt ve observedAt/receivedAt/processedAt; packet gözlem zamanı | price = gözlenen Buy/Sell book fiyatı | İşlem item_count yok. source market-order-packets; coverage, observationId, evidenceId, validationStatus, reasons, rawEvidence |
| .aodp-quote-history.json → history/current + journal quote/current | server, itemId, city, quality, side | fetchedAt/gözlem zamanı ve ayrı sourceQuoteAt; alım zamanı emir/işlem yaratım zamanı değildir | price, AODP current raw Buy/Sell alanları | İşlem item_count yok. source aodp-current; packet arşiviyle aynı tip quote kanıtı |
| AODP repository anchors + journal anchor | server, item_id, location, quality; satış history, bağımsız Buy book tarafı yok | fetchedAt = toplama zamanı; data[].timestamp = satış bucket günü | data[].avg_price | data[].item_count = genel piyasa gerçekleşmiş ürün adedi; source aodp-sales-history |
| .price-hub.json current book cache | server; books içinde item/şehir/kalite ve order bilgileri | son ingest/client/cache zamanı | Emir fiyatları | Varsa order amount/depth mevcut emir miktarıdır; gerçekleşmiş history item_count sayılamaz |
| Tarayıcı history cache | host + locations listesi + days + timeScale + qualities; map item/city/quality | cache yazma zamanı 30 dk; raw points timestamp ayrı | mean/medianAvgPrice; points.avg_price | points.item_count korunur; kalıcı disk repository ile ortak cache değildir |


SAT ham mail alanları: `UsedQuantity`, `Quantity`, `UniqueItemName`, `InternalTotalPriceWithoutTax`, `InternalUnitPricePaidWithOverpayment`, `InternalTotalDistanceFee`, `TaxRate`, `TaxSetupRate`, `TaxSetupPrice`. **Bu gerçek mail payload’larında kalite alanı yok.** Normalized satırdaki server/scope arşiv sağlayıcı bağlamından eklenir; kişisel kayıtlar genel piyasa kapsamını temsil etmez. Gerçek gerçekleşmiş SAT timestamp’lerinin 0 tanesi offsetsizdi; bu veride timestamp UTC-sonek uyuşmazlığı gözlenmedi.

Saatlik fiyat gözlemi sayısı, quote bucket sayısı, order amount, kişisel quantity ve genel piyasa item_count birbirine çevrilmedi. Aynı AODP işlem geçmişinin disk kopyası ve yeni API yanıtı da ayrı satışlar sayılmaz; gelecekte entegrasyonda bir measurement için tek seri seçilmelidir.

## 5. Gerçek arşiv envanteri

Fiziksel seri: sunucu + item + şehir + kalite, işlem yönü olmadan. “Unknown” kalite ayrı belirsiz gruptur, normal kalite sayılmadı. Aşağıdaki arşivler aynı item/şehirleri paylaşır; seri sayıları **toplanarak benzersiz toplam üretilmez**.

| Kaynak | Fiziksel seri | Yönlü seri | Gerçek miktarlı seri | Potansiyel-uygun (7 / 14 / 28 / 60 / 90) |
| --- | --- | --- | --- | --- |
| SAT tüm itemli kayıtlar | 4941 | — | Süresi dolan/diğer olaylar dahil; piyasa hacmi olarak kullanılmaz | — |
| SAT gerçekleşmiş alış/satış | 4494 | 4746 | 4494 kişisel quantity | 0 / 0 / 0 / 0 / 0 (metadata indeksindeki 585 yönlü seri) |
| SAT kalite+şehir+item+executed filtresinden geçen indeks | Yönlü gösteriliyor | 585 | 1208 tekilleştirilmiş kayıt | 0 / 0 / 0 / 0 / 0 |
| Packet emir fiyatı arşivi | 1451 | 2070 | 0 genel piyasa işlem hacmi | Hacim referansı olarak uygun değil |
| AODP quote history, checkpoint+journal | 29657 | 38092 | 0 genel piyasa işlem hacmi | Hacim referansı olarak uygun değil |
| AODP genel satış anchors | 66563 | Satış history; buy/sell book ayrımı yok | 17990 | 2211 / 2105 / 2102 / 0 / 0 |
| Ada geniş kolektör satış kapsamı | 1260 | — | 944 | 301 / 295 / 300 / 0 / 0 |


SAT 1906 benzersiz item içerir. Ada geniş katalog eşleşmesi 3331 kayıt, 2885 gerçekleşmiş işlem, 505 fiziksel grup; metadata indeksinde 54 yönlü grup vardır. Bunların V2 otomatik doldurma rolü + kalite 1 + yedi şehir ile kesişimi 31’dir. Metadata-uygun 1.576 kaydın tekilleştirilmiş indekste 1.208 olması da ham kayıt sayısının bağımsız örnek sayısı olmadığını gösterir.

Kişisel veri tarih aralığı 2026-05-16T01:46:01.809Z — 2026-10-11T22:10:56.162Z; dosya 13,368,193 byte, son değişim 2026-10-12T00:28:32.002Z. Arşiv yaşının yaklaşık beş ay olması, aynı item/şehir/kalite/yön için günlük kapsam bulunduğu anlamına gelmez.

AODP satış arşivinde 17990 dolu ve 48573 boş/absence anchor bulunur. Ada kapsamı: **944 dolu, 316 boş**. Boş anchor “0 satış kanıtı” değil, son history yanıtında veri bulunmamasının önbelleğidir. Raw satış data zamanı 2026-09-12T00:00:00.000Z — 2026-10-10T00:00:00.000Z; fetchedAt aralığı 2026-10-11T13:52:41.535Z — 2026-10-11T22:01:56.586Z. Yakın fetchedAt, yakın işlem günü demek değildir.

## 6. Dönem yeterliliği ve Yerel / API / Karma oranları

Aşağıdaki dağılım, **gerçek kişisel snapshot ile diskteki son AODP satış verisinin, mevcut resolver semantiğiyle salt okunur değerlendirmesidir**. API sütunu kaynağın AODP satış history olmasıdır; audit sırasında dış API çağrısı yapılmadı. Mevcut resolver disk anchor’ı okumadığı için üretimde bu veri alanları için dış API’ye gider. Yeni canlı API yanıtı farklı/güncel olabilir; burada ölçülmedi.

| Dönem | Kişisel uygun / 847 | Disk satış referansı uygun / 847 | Yerel | API referansıyla karşılanabilir | Karma | Yetersiz | Kaçınılabilir benzersiz upstream veri okuması |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 gün | 0 | 298 | 0 (%0) | 298 (35.18%) | 0 (%0) | 549 (64.82%) | 264 |
| 14 gün | 0 | 295 | 0 (%0) | 295 (34.83%) | 0 (%0) | 552 (65.17%) | 261 |
| 28 gün | 0 | 297 | 0 (%0) | 297 (35.06%) | 0 (%0) | 550 (64.94%) | 263 |
| 60 gün | 0 | 0 | 0 (%0) | 0 (0.00%) | 0 (%0) | 847 (100.00%) | 0 |
| 90 gün | 0 | 0 | 0 (%0) | 0 (0.00%) | 0 (%0) | 847 (100.00%) | 0 |


**Gerçek tarayıcı trafik kullanım oranları kaydedilmiyor:** bu sayılar trafik telemetrisi değil, veri kaynaklarına göre ölçülen kullanılabilirlik oranıdır. Kişisel veri 0 olduğundan bu kesitte başarıyla karşılanan alanların hepsi AODP kaynaklı olmak zorundadır; fakat dış API kaynağından fiilen kaç yanıtın geldiği mevcut loglardan kanıtlanamaz. Bu ayrım yapılmadan “%35 gerçek API trafik oranı” demek yanlış olur.

### TOHUM ve HASAT ayrımı (28 gün)

| Rol | Veri alanı | Aynı item/şehir/yönde kişisel kayıt var | Exact kalite 1 alanı | Disk genel piyasa history uygun alanı |
| --- | --- | --- | --- | --- |
| TOHUM / edinim (buy) | 427 | 152 | 31 | 161 |
| HASAT / satış (sell) | 420 | 77 | 0 | 136 |

HASAT için 77 alanda kişisel satış kaydı bulunmasına rağmen exact normal-kalite serisi **0**. Kişisel satışların büyük kısmının mail_sell olması ve bu payload’ların kalite taşımaması bu sonucu açıklar. Bu alanların kalite bilinse tüm diğer kontrolleri geçeceği varsayılmadı.

### 6.1 Kişisel arşivde ilk eleme nedeni

847 gereksinim paydası; nedenler birbirini dışlayan ilk engel olarak sayıldı. Aynı dağılım beş dönemin tümünde geçerli. Eşleşmeyen şehir/yön satırları **eşleştirme kodu hatası değil**, seçilen ölçüme uymayan gerçek verilerdir.

| İlk engel | Adet | Oran |
| --- | --- | --- |
| Arşivde bu item yok | 224 | 26.45% |
| Kapsam / eksik gün | 31 | 3.66% |
| Aynı item/şehir/yönde veri var, kalite eksik | 198 | 23.38% |
| Kayıt var, gerçekleşmiş piyasa işlemi değil | 35 | 4.13% |
| Item başka şehirde var; seçilen şehirde yok | 312 | 36.84% |
| Bu şehirde yalnız diğer işlem yönü var | 47 | 5.55% |


Kalite eksik grubundaki 198 alan, arşivde aynı item/şehir/yönde kişisel kayıt bulunduğu halde normal kaliteye atanamayan alanlardır. Kalite bilinmediği için diğer eşiklere geçilmez; bu 198 alanın kalite tamamlansa otomatik uygun olacağı **iddia edilmedi**. Eşleşmiş 31 alanın tamamı kapsamdan elenir; bağımsız kontrolde işlemli gün ve tazelikten de kalır.

Gerçek mail_buy 3389, mail_sell 8645: ikisinde de kalite bilgili kayıt **0**. Instant buy 1214 kaydın 1213'ü, instant sell 363 kaydın 363'ü kalite bilgili. 12035 / 13611 (88.42%) executed kaydı kaliteden elenir. Kapsam dışı/süresi dolan/crafting/player kayıt sayısı 3150 / 16761 (18.79%).

### 6.2 Sabit eşiklerin bağımsız eleme oranları

Policy değişmedi: en az ceil(%70 × gün) → **5 / 10 / 20 / 42 / 63 gün**; en az 5 işlemli gün; latest complete UTC bucket ≥ 10 Ekim 2026; günlük fiyat medyanının 0.5–2 katı dışında kalan günler filtrelenir, en az %80 inlier kalmalı; göreli medyan mutlak sapma ≤ %35.

Kişisel eşleşmiş 31 alanda her pencerede: kapsam **31 (%100)**, işlemli gün **31 (%100)**, tazelik **31 (%100)**. Fiyat güvenilirliği aşamasına fiilen ulaşan seri **0**; dolayısıyla “fiyatlar güvenilir, sorun sadece kapsam” sonucu çıkarılamaz. Bağımsız küçük örnek hesaplamalarında outlier/MAD işareti 0 olması kanıtlanmış güvenilirlik değildir.

Disk genel piyasa arşivi için aşağıdaki engeller **örtüşür**, yüzdeler toplanmaz. Payda her satırda 847 yönlü gereksinimdir; ön-koşullar geçmese bile bağımsız fiyat göstergesi ayrıca hesaplandı.

| Dönem | %70 kapsam | 5 işlemli gün | 2 gün tazelik | %80 inlier | MAD %35 |
| --- | --- | --- | --- | --- | --- |
| 7 | 479 (56.55%) | 479 (56.55%) | 545 (64.34%) | 1 (0.12%) | 2 (0.24%) |
| 14 | 419 (49.47%) | 199 (23.49%) | 545 (64.34%) | 6 (0.71%) | 5 (0.59%) |
| 28 | 252 (29.75%) | 112 (13.22%) | 545 (64.34%) | 16 (1.89%) | 6 (0.71%) |
| 60 | 847 (100.00%) | 108 (12.75%) | 545 (64.34%) | 19 (2.24%) | 5 (0.59%) |
| 90 | 847 (100.00%) | 108 (12.75%) | 545 (64.34%) | 19 (2.24%) | 5 (0.59%) |


28 günlük satış ölçümlerinde kapsam/aktif gün/tazelik ön-koşullarını **298** alan geçer; fiyat kapısından sonra **297** kalır. Ön-koşulları geçenlerden sadece **1** alan fiyat nedeniyle elenir. Genel arşivde bu kesitte ana engel tazeliktir; eşikleri fiyat güvenilirliği sorununu gizleyecek şekilde değiştirmek çözüm olarak denenmedi.

## 7. Gereksiz dış API başvuruları ve cache araştırması

### Kanıtlanmış bağlantı eksikliği

[content/js/tools/island-planner-v2.js:751](../content/js/tools/island-planner-v2.js) doğrudan dış AODP host’una gider. [content/js/core/trade-potential-evidence.mjs:74](../content/js/core/trade-potential-evidence.mjs) kişisel eksikleri callback’e gönderir; burada repository.anchor veya genel yerel arşiv okuyucusu yoktur. Aynı raw ölçümler [content/scripts/quote-history-repository.mjs:184](../content/scripts/quote-history-repository.mjs) ile diskte/bellekte durur ve piyasa araçlarında kullanılır.

28 gün: **297 yönlü alan / 263 benzersiz item-şehir-kalite** için bugün geçerli yerel genel piyasa history kaydı varken dış okumaya adaylık vardır. Bu bir **kaçınılabilir veri okuma potansiyeli**; fiilen gerçekleşmiş 263 HTTP isteği değildir. AODP item batch’leri bu alanları bir istekte birleştirir.

| Şehir | 28 günlük alan | Kişisel exact alan | Diskte uygun alan | Kaçınılabilir benzersiz item okuması | Boş anchor alanı |
| --- | --- | --- | --- | --- | --- |
| Bridgewatch | 121 | 1 | 32 | 30 | 9 |
| Fort Sterling | 121 | 3 | 41 | 36 | 12 |
| Lymhurst | 121 | 2 | 32 | 31 | 0 |
| Martlock | 121 | 11 | 66 | 58 | 0 |
| Thetford | 121 | 10 | 59 | 51 | 0 |
| Caerleon | 121 | 1 | 10 | 8 | 48 |
| Brecilien | 121 | 3 | 57 | 49 | 17 |


Boş standart plan, ada şehri = satış şehri ve soğuk browser history cache varsayımında 113 item / 24 batch → şehir başına 5, yedi ayrı şehir senaryosunda 35 HTTP batch. Yalnız **eşikleri geçen** yerel genel arşiv ölçümleri kullanılırsa kalan item sayılarının batch hesabı 26 olur: **yaklaşık 9 batch kaçınılabilir**. Bu trafik ölçümü değil, source kodundaki batch sınırı ve bu gerçek envanterden türetilmiş senaryodur. Dolu özel slot, farklı iki şehir, açık slot olmaması veya sıcak cache bu sayıyı değiştirir.

### Mock, dış ağsız cache tekrarları

Üretim modüllerinin bellek kopyasında fetch mock’uyla tekrarlandı; **0 gerçek dış API isteği**. Test sayıları arşiv yeterlilik metriğine karıştırılmadı.

| Tekrar durumu | İki/üç çağrıdaki fetch sayısı | Sonuç |
| --- | --- | --- |
| positive-cache-same-request | 1 | Pozitif cache çalışıyor |
| empty-history-two-identical-requests | 2 | Ek fetch yeniden üretildi |
| same-cities-different-order | 2 | Ek fetch yeniden üretildi |
| concurrent-identical-requests | 2 | Ek fetch yeniden üretildi |
| quality-isolation-and-cache | 2 | Kalite ayrımı ve ikinci kalite cache doğru |
| same-item-different-periods | 2 | 28/29 gün farklı cache; semantik fark olabilir |


- **Boş history cache’lenmiyor.** summarizeSeries fiyat noktası yoksa null döndürür, setCache çalışmaz; aynı boş ürün tekrar istenir. Backend kolektör ise data:[] absence anchor verisini gün boyunca saklar. [content/js/core/market-history.js:54](../content/js/core/market-history.js) ve [content/scripts/aodp-collector.mjs:140](../content/scripts/aodp-collector.mjs).
- **In-flight paylaşımı yok.** Aynı anda iki identical history çağrısı needFetch’i cache dolmadan hesaplar. Seri request kuyruğu ikinci çağrı sırasında cache’i tekrar kontrol etmez; mock’ta iki fetch. Root resolver tek grup içinde buy/sell item listesini tekilleştirir; bu doğru davranıştır. Sorun eşzamanlı bağımsız tüketiciler içindir; audit bunu gerçek trafik olayı olarak sunmaz.
- **Şehir sırası cache kimliğine dahil.** Aynı şehir kümesinin farklı sırası cities.join(',') ile farklı cacheBucket olur. Pencere/quality string biçimleri ve şehir grubunun genişletilmesi de reuse’u parçalar. 28/29 gün farkı tek başına bug değildir; yeterli raw dönem kapsamından türetme yapılmadığı için iyileştirme alanıdır.
- Cache tarayıcı modül RAM’idir; refresh/separate tab ile repository cache paylaşılmaz. 30 dk pozitif cache çalışır ve host/quality anahtarı farklı sunucu/kalite karışmasını engeller.
- SAT snapshot 30 sn host cache + pending paylaşımı kullanır. Potansiyel startTradeLive başlatmadığından yalnız bu sayfada canlı olay invalidasyonu gelmeyebilir; TTL yine yeniler. Bu sınırlama şu anki sıfır uygunluğun açıklaması değildir: yeni snapshot ve gerçek dosya da 0 verdi.
- Dosya/eşleştirme taramasında metadata-uygun kayıtlarda **eksik şehir 0**, **invalid quality 0**, offsetsiz timestamp **0**. Canonical şehir eşleşmesiyle 31 gerçek normal-kalite alan bulunur; bu veride iddia edilecek genel bir şehir/timestamp eşleştirme arızası kanıtlanmadı.

### ID temsil sorunu

Ham SAT dosyasında **725** numeric Id güvenli JS integer aralığı dışında. Aynı byte’ları yalnız analiz belleğinde Id’leri kayıpsız string olarak okuyunca 16393 literal kimlik, mevcut Number parse ile 15969 kimlik bulunuyor. **68 farklı literal-ID grubu**, 52 farklı normalize payload grubu aynı numeric kimliğe çöküyor. Bu grupların mevcut Ada geniş kapsamındaki sayısı **0**; kaliteye kabul edilen indekste kayıp **0**. Yani gerçek bir genel kimlik riski/ayırt etme kaybı kanıtlandı, fakat bugünkü Ada uygunluğu 0 sonucunu buna bağlamak yanlış olur. [content/scripts/sat-trades/find-trades-file.mjs:107](../content/scripts/sat-trades/find-trades-file.mjs); [content/scripts/sat-trades/silver.mjs:61](../content/scripts/sat-trades/silver.mjs).

## 8. Zamanla yeterli olabilir mi; eksikler gerçekten toplanıyor mu?

**Kişisel kayıtlar büyüyor:** önceki denetimin 16.760’ına karşı bu kesitte 16.761; son değişim 2026-10-12T00:28:32.002Z. Fakat yeni mail kayıtlarının payload’ında kalite yok; eksik kalite sadece bekleyince dolmaz. Watcher yalnız yeni Id’leri ekler; aynı Id’ye sonradan kalite/fiyat/miktar eklenmesi snapshot reload olmadan otomatik güncellenmez. Gözlenen timestamp’ler doğru UTC sonekli; asıl eksik metadata’dır.

**Kişisel günlük kapsam kendiliğinden piyasa kapsamına dönüşmez.** %70 eşik altında 7 günün 5’inde, 28 günün 20’sinde aynı item/şehir/kalite/yön işlemi gereklidir. Kullanıcı o item’i bu yoğunlukta gerçekten işlemiyorsa “arşiv yaşlandı” yeterlilik sağlamaz. İşlem yapılmayan gün, kayıt dışı gün ve eksik metadata ayrı durumlardır; bu denetimde bunlara sıfır satış yazılmadı.

**Genel piyasa verisi gerçekten toplanıyor:** 2026-10-11T22:00:26.611Z — 2026-10-12T00:35:37.419Z journal kesitinde **1260 anchor event / 1260 farklı key** var. Bu, 180 Ada kolektör item’inin yedi şehirdeki 1.260 anahtarıyla aynı kapsamdır; dolu ve absence kayıtları yenilenmiş. Ayrıca 8281 quote ve 8274 current event var. Kolektör yalnız saatlik fiyat kaydetmiyor, gerçek item_count history kaydıni de alıyor.

Fakat history request’i sabit LONG_TERM_STRATEGIES median-28d penceresidir; anchorRefreshMs günlük, setAnchor/apply ise aynı key’in önceki row’unu değiştirir. **90 gün retention, 90 günlük satış serisi saklanıyor demek değildir.** Eski günlük item_count bucket’ları ana repository’de biriktirilmez. Checkpoint de son anchors map’ini saklar; .pre-observation-v2.bak write-once güvenlik yedeği analitik 90 gün arşivi değildir.

Bu nedenle 7/14/28 günlük cache serileri güncel gerçek işlemler gelirse ve kolektör yanıtı güncel bucket içerirse yeterli olabilir. 60/90 gün için değişmeyen aktif collector tasarımında sadece zaman geçmesi yeterli değildir. Dış API’nin daha uzun sorguya vereceği yanıt bu audit’te ölçülmedi; “API 90 gün desteklemiyor” sonucu çıkarılmadı.

Kanıt: [content/scripts/aodp-collector.mjs:127](../content/scripts/aodp-collector.mjs); [content/scripts/quote-history-repository.mjs:77](../content/scripts/quote-history-repository.mjs); [content/scripts/quote-history-repository.mjs:166](../content/scripts/quote-history-repository.mjs); [content/scripts/sat-trades/watcher.mjs:131](../content/scripts/sat-trades/watcher.mjs).

## 9. En az 10 gerçek ürün değerlendirmesi (28 gün)

Normal kalite 1, Europe. Kişisel sütun raw item/şehir/yön kaydı → exact kalite/dedup kaydı → geçerli dönem günü biçimindedir. “Disk uygun” genel AODP satış cache’inin eşikleri geçmesidir; yalnız kişisel kaynağa dayalı yerel sonuç değildir. Fiyat/volume sayıları audit’te filtrelenmiş döneme aittir.

| Ürün | Şehir / yön | Kişisel raw→exact→gün | Kişisel ilk engel | Disk gün / son işlem günü | Disk filtreli miktar | Disk sonucu |
| --- | --- | --- | --- | --- | --- | --- |
| Carrots (T1_CARROT) | Martlock / buy | 20 → 10 → 0 | Kapsam / eksik gün | 27/28 · 2026-10-10 | 3067893 | Uygun |
| Carrot Seeds (T1_FARM_CARROT_SEED) | Martlock / buy | 6 → 0 → 0 | Aynı item/şehir/yönde veri var, kalite eksik | 27/28 · 2026-10-10 | 51446 | Uygun |
| Beans (T2_BEAN) | Martlock / buy | 3 → 3 → 0 | Kapsam / eksik gün | 27/28 · 2026-10-10 | 391426 | Uygun |
| Bean Seeds (T2_FARM_BEAN_SEED) | Martlock / buy | 7 → 0 → 0 | Aynı item/şehir/yönde veri var, kalite eksik | 21/28 · 2026-10-04 | 6674 | Elendi: T |
| Sheaf of Wheat (T3_WHEAT) | Bridgewatch / sell | 0 → 0 → 0 | Arşivde bu item yok | 27/28 · 2026-10-10 | 1179625 | Uygun |
| Brightleaf Comfrey (T3_COMFREY) | Martlock / sell | 1 → 0 → 0 | Aynı item/şehir/yönde veri var, kalite eksik | 27/28 · 2026-10-10 | 318346 | Uygun |
| Hen Eggs (T3_EGG) | Bridgewatch / sell | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 10/28 · 2026-09-23 | 64205 | Elendi: G+T |
| Cabbage (T5_CABBAGE) | Thetford / buy | 2 → 1 → 1 | Kapsam / eksik gün | 27/28 · 2026-10-10 | 6043470 | Uygun |
| Potatoes (T6_POTATO) | Martlock / buy | 5 → 3 → 1 | Kapsam / eksik gün | 27/28 · 2026-10-10 | 3840979 | Uygun |
| Elusive Foxglove Seeds (T6_FARM_FOXGLOVE_SEED) | Thetford / buy | 3 → 1 → 1 | Kapsam / eksik gün | 24/28 · 2026-10-07 | 8770 | Elendi: T |
| Pumpkin (T8_PUMPKIN) | Bridgewatch / sell | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 26/28 · 2026-10-09 | 936950 | Elendi: T |
| Pumpkin Seeds (T8_FARM_PUMPKIN_SEED) | Bridgewatch / buy | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 16/28 · 2026-09-29 | 4526 | Elendi: G+T |
| Cow's Milk (T8_MILK) | Bridgewatch / sell | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 27/28 · 2026-10-10 | 655389 | Uygun |
| Goose Eggs (T5_EGG) | Bridgewatch / sell | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 24/28 · 2026-10-07 | 578327 | Elendi: T |
| Sheep's Milk (T6_MILK) | Bridgewatch / sell | 0 → 0 → 0 | Item başka şehirde var; seçilen şehirde yok | 26/28 · 2026-10-09 | 458439 | Elendi: T |

Özellikle buğday ve inek sütü Bridgewatch cache’inde fiyat+hacim bakımından hazırdır; kullanıcı kişisel verisi yok diye yeni API okumasına aday olurlar. Pumpkin’in 26/28 günlük yoğun history kaydı olmasına rağmen son geçerli bucket 9 Ekim olduğu için **tazelikten** kalır. Tohum history kaydında miktar bulunması tek başına yetmez: pumpkin seed 16/28 gün ve eski veri. Bu ayrımlar “yüksek hacim = kesin yeterli” varsayımını engeller.

## 10. Çözüm önerileri: öncelik sırası, bu aşamada uygulanmadı

| Öncelik | Öneri | Gerekçe / doğrulama koşulu |
| --- | --- | --- |
| P0 | Kişisel SAT ilk kalacak şekilde, yeterli yerel AODP satış anchor verisini canlı API kaynağından önce değerlendiren ortak kanıt okuyucusu | 28 günde 263 benzersiz upstream ölçüm için mevcut geçerli disk veri var. Sunucu/şehir/kalite/yön/zaman/source saklanmalı; quote buckets volume yerine kullanılamaz. API ve cache aynı işlemi iki kez saymamalı. |
| P0 | Browser değil mevcut Node repository üzerinden raw satış data + coverage + fetchedAt sağlayan salt okunur erişim | UV endpoint scalar reference sunuyor, raw item_count yetmiyor. 1.35 GB journal verisini tarayıcıya indirmek doğru çözüm değildir; bellekteki repository ve filtreli cevap kullanılmalı. |
| P1 | 60/90 gün için satış bucket’larını gün/key bazında gerçekten biriktiren saklama tasarımını araştır | Sabit 28 gün refresh + overwrite ile 42/63 gün kapsam oluşmaz. Önce tarihsel birleştirme, duplicate/correction, kalite/source testleri tasarlanmalı; bu audit’te servis değişmedi. |
| P1 | SAT mail kalite kaynağını recorder düzeyinde araştır / eksik kaliteyi görünür bırak | 12.035 executed kayıt kalite bilgisiz; ham mail alanında da yok. Otomatik normal-kalite atamak veya yalnız normalizer’ı değiştirmek kanıt eksikliğini çözmez. Item sınıfından kalite invariance önerilecekse bağımsız oyun/veri sözleşmesi kanıtı gerekir. |
| P1 | Genel histogram, kişisel fiyat ve kişisel performans admission politikalarını ayrı değerlendirmek | Kişisel işlem olmayan gün arşiv boşluğu değildir. Mevcut %70/5/2 değişmeden önce kaynak başına yeterlilik kalibrasyonu ve gerçek kullanıcı davranışı ölçülmeli. Fiyatı kabul edip kapasiteyi başka kaynakla tamamlama da source-separated olmalı. |
| P1 | Boş yanıt negative cache + in-flight paylaşımı + canonical şehir listesi; backend/browser cache ve request bütçesi paylaşımı | Mock tekrarlarında negatif/concurrent/city-order ikinci fetch kanıtlandı. Geçerli pozitif cache ve kalite izolasyonu korunmalı; unavailable volume asla sıfır satışa dönüştürülmemeli. |
| P2 | Kaynak başına provenance ve eleme telemetrisi | Şu an runtime gerçek Yerel/API/Karma trafik oranı ve bir HTTP batch’in gerekçesi kalıcı kaydedilmiyor. Kullanıcı her ölçümün fiyat/volume kaynağını ve ayrı engellerini görebilmeli. |
| P2 | SAT Id değerlerini kayıpsız string taşımak ve güncellenmiş aynı-Id kayıtları test etmek | 68 literal-ID collision grubu kanıtlandı; 52 farklı payload. Mevcut Ada gruplarında neden değil, genel Trade History doğruluğu için düzeltilmeli. |
| P2 | Trades/Flipper/UV fiyat tarihçesi ile Potansiyel-uygun hacim ayrımını arayüzde açıklamak | Beş işlem fiyat önerisi, bir UV referansı veya saatlik grafik, normal kalite/gün kapsamı/gerçek hacim yeterliliği kanıtı değildir. |


## Ek A — Kalite 1 ve role tam eşleşen 31 kişisel Ada serisi

Son kayıt zamanı tam eşleşen tüm arşivden; dönem günü sütunu 7/14/28/60/90 sırasıyla geçerli completed UTC gün sayısıdır. Bunlar miktar taşıyan gerçek kişisel işlemlerdir, genel piyasa değildir. Her satırın ilgili dönemleri %70 kapsam/5 işlemli gün/2 gün tazelikten kalır.

| Item | Şehir / yön | Tekilleştirilmiş kayıt | Son gerçek kişisel kayıt | 7 / 14 / 28 / 60 / 90 gün |
| --- | --- | --- | --- | --- |
| T5_LEATHER | martlock / buy | 8 | 2026-05-26T11:33:14.240Z | 0 / 0 / 0 / 0 / 0 |
| T5_PLANKS | martlock / buy | 9 | 2026-05-25T00:34:49.666Z | 0 / 0 / 0 / 0 / 0 |
| T6_PLANKS | martlock / buy | 1 | 2026-05-16T09:51:02.315Z | 0 / 0 / 0 / 0 / 0 |
| T6_METALBAR | martlock / buy | 1 | 2026-05-16T09:51:11.156Z | 0 / 0 / 0 / 0 / 0 |
| T4_TURNIP | thetford / buy | 5 | 2026-06-29T23:08:21.905Z | 0 / 0 / 0 / 0 / 0 |
| T1_CARROT | thetford / buy | 2 | 2026-06-17T17:32:59.685Z | 0 / 0 / 0 / 0 / 0 |
| T3_LEATHER | thetford / buy | 8 | 2026-05-25T11:34:40.770Z | 0 / 0 / 0 / 0 / 0 |
| T3_PLANKS | lymhurst / buy | 1 | 2026-05-23T19:30:27.550Z | 0 / 0 / 0 / 0 / 0 |
| T4_PLANKS | thetford / buy | 1 | 2026-05-24T22:42:20.289Z | 0 / 0 / 0 / 0 / 0 |
| T3_PLANKS | fortsterling / buy | 2 | 2026-05-25T01:02:20.796Z | 0 / 0 / 0 / 0 / 0 |
| T8_PUMPKIN | thetford / buy | 2 | 2026-05-25T01:25:57.264Z | 0 / 0 / 0 / 0 / 0 |
| T5_PLANKS | lymhurst / buy | 2 | 2026-05-26T14:34:46.926Z | 0 / 0 / 0 / 0 / 0 |
| T6_POTATO | thetford / buy | 2 | 2026-05-26T19:49:44.685Z | 0 / 0 / 0 / 0 / 0 |
| T6_POTATO | martlock / buy | 3 | 2026-09-18T19:17:21.222Z | 0 / 0 / 1 / 2 / 2 |
| T1_CARROT | martlock / buy | 10 | 2026-09-13T13:52:22.607Z | 0 / 0 / 0 / 1 / 1 |
| T8_PUMPKIN | brecilien / buy | 2 | 2026-06-05T00:00:12.070Z | 0 / 0 / 0 / 0 / 0 |
| T8_LEATHER | martlock / buy | 1 | 2026-06-15T07:20:40.838Z | 0 / 0 / 0 / 0 / 0 |
| T5_METALBAR | bridgewatch / buy | 18 | 2026-06-19T14:47:28.426Z | 0 / 0 / 0 / 0 / 0 |
| T5_LEATHER | fortsterling / buy | 3 | 2026-06-19T15:07:01.411Z | 0 / 0 / 0 / 0 / 0 |
| T7_LEATHER | martlock / buy | 1 | 2026-06-22T16:58:49.617Z | 0 / 0 / 0 / 0 / 0 |
| T3_PLANKS | thetford / buy | 2 | 2026-06-28T00:33:44.218Z | 0 / 0 / 0 / 0 / 0 |
| T4_LEATHER | caerleon / buy | 3 | 2026-07-03T18:39:50.930Z | 0 / 0 / 0 / 0 / 0 |
| T5_CLOTH | fortsterling / buy | 1 | 2026-07-04T22:56:03.064Z | 0 / 0 / 0 / 0 / 0 |
| T4_LEATHER | brecilien / buy | 2 | 2026-07-15T20:06:32.932Z | 0 / 0 / 0 / 0 / 1 |
| T7_PLANKS | martlock / buy | 1 | 2026-07-17T17:52:24.196Z | 0 / 0 / 0 / 0 / 1 |
| T5_PLANKS | brecilien / buy | 1 | 2026-08-03T12:10:32.953Z | 0 / 0 / 0 / 0 / 1 |
| T5_METALBAR | martlock / buy | 1 | 2026-08-09T16:42:20.148Z | 0 / 0 / 0 / 0 / 1 |
| T2_BEAN | martlock / buy | 3 | 2026-09-08T17:59:28.872Z | 0 / 0 / 0 / 1 / 1 |
| T5_FARM_CABBAGE_SEED | thetford / buy | 1 | 2026-09-17T21:53:17.451Z | 0 / 0 / 1 / 1 / 1 |
| T5_CABBAGE | thetford / buy | 1 | 2026-09-19T20:38:02.671Z | 0 / 0 / 1 / 1 / 1 |
| T6_FARM_FOXGLOVE_SEED | thetford / buy | 1 | 2026-10-04T19:50:33.184Z | 0 / 1 / 1 / 1 / 1 |

## Ek B — Her otomatik doldurma item’inin kişisel eleme özeti (113 item)

Yedi şehir ve item’in gerçekten kullandığı buy/sell rolleri birlikte sayılır. İlk engel kodları ve adetleri toplamı o item’in 7 veya 14 yönlü alanına eşittir. Beş dönem boyunca aynı ilk engel dağılımı ve yerel uygunluk 0 geçerlidir; exact alanların dönem bazında gün sayıları Ek A’da, genel piyasa dönem farkları Ek C’dedir.

Kodlar: **Y** arşivde item yok; **Q** aynı item/şehir/yönde kayıt var kalite eksik; **K** farklı kalite; **Ş** seçilen şehirde yok; **D** yalnız diğer yön var; **İ** gerçekleşmiş işlem yok; **G** eksik gün; **A** işlemli gün; **T** eski; **O** inlier oranı; **S** MAD sapması; **H** miktar yok. Ş/D uygun source filtresidir, doğrulanmış city-key bug’u değildir.

| Item | Rol | Alan sayısı | Exact alan | Yerel uygun 7/14/28/60/90 | İlk engel: adet |
| --- | --- | --- | --- | --- | --- |
| Carrots (T1_CARROT) | sell/buy | 14 | 2 | 0/0/0/0/0 | Ş:8, D:3, G:2, Q:1 |
| Carrot Seeds (T1_FARM_CARROT_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Arcane Agaric (T2_AGARIC) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, D:1, Q:1 |
| Beans (T2_BEAN) | sell/buy | 14 | 1 | 0/0/0/0/0 | Ş:12, D:1, G:1 |
| Arcane Agaric Seeds (T2_FARM_AGARIC_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Bean Seeds (T2_FARM_BEAN_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Brightleaf Comfrey (T3_COMFREY) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Hen Eggs (T3_EGG) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Baby Chickens (T3_FARM_CHICKEN_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Chicken (T3_FARM_CHICKEN_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Brightleaf Comfrey Seeds (T3_FARM_COMFREY_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Journeyman's Foal (T3_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Journeyman's Horse (T3_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, D:1, Q:1 |
| Journeyman's Ox Calf (T3_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Journeyman's Ox (T3_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Wheat Seeds (T3_FARM_WHEAT_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Thick Leather (T3_LEATHER) | buy | 7 | 1 | 0/0/0/0/0 | Q:5, G:1, D:1 |
| Raw Chicken (T3_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Journeyman's Riding Horse (T3_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Q:6, D:1 |
| Journeyman's Transport Ox (T3_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | D:4, Q:3 |
| Chestnut Planks (T3_PLANKS) | buy | 7 | 3 | 0/0/0/0/0 | Q:3, G:3, D:1 |
| Sheaf of Wheat (T3_WHEAT) | sell/buy | 14 | 0 | 0/0/0/0/0 | Y:14 |
| Crenellated Burdock (T4_BURDOCK) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Crenellated Burdock Seeds (T4_FARM_BURDOCK_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Kid (T4_FARM_GOAT_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Goat (T4_FARM_GOAT_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | İ:7 |
| Adept's Foal (T4_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Adept's Horse (T4_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Adept's Ox Calf (T4_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Adept's Ox (T4_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Turnip Seeds (T4_FARM_TURNIP_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Worked Leather (T4_LEATHER) | buy | 7 | 2 | 0/0/0/0/0 | Q:5, G:2 |
| Raw Goat (T4_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Goat's Milk (T4_MILK) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Adept's Riding Horse (T4_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Ş:1, Q:4, D:2 |
| Adept's Transport Ox (T4_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | Q:4, D:2, Ş:1 |
| Pine Planks (T4_PLANKS) | buy | 7 | 1 | 0/0/0/0/0 | Q:5, G:1, D:1 |
| Turnips (T4_TURNIP) | sell/buy | 14 | 1 | 0/0/0/0/0 | Ş:8, D:3, Q:2, G:1 |
| Cabbage (T5_CABBAGE) | sell/buy | 14 | 1 | 0/0/0/0/0 | Q:7, D:4, Ş:2, G:1 |
| Ornate Cloth (T5_CLOTH) | buy | 7 | 1 | 0/0/0/0/0 | Q:6, G:1 |
| Goose Eggs (T5_EGG) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Cabbage Seeds (T5_FARM_CABBAGE_SEED) | buy | 7 | 1 | 0/0/0/0/0 | Ş:4, Q:2, G:1 |
| Gosling (T5_FARM_GOOSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | İ:7 |
| Goose (T5_FARM_GOOSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Expert's Foal (T5_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Expert's Horse (T5_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Expert's Ox Calf (T5_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Expert's Ox (T5_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Dragon Teasel Seeds (T5_FARM_TEASEL_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Cured Leather (T5_LEATHER) | buy | 7 | 2 | 0/0/0/0/0 | Q:5, G:2 |
| Raw Goose (T5_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Titanium Steel Bar (T5_METALBAR) | buy | 7 | 2 | 0/0/0/0/0 | G:2, Q:4, Ş:1 |
| Expert's Armored Horse (T5_MOUNT_ARMORED_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Expert's Riding Horse (T5_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Q:6, D:1 |
| Expert's Transport Ox (T5_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | Q:3, D:4 |
| Cedar Planks (T5_PLANKS) | buy | 7 | 3 | 0/0/0/0/0 | Q:4, G:3 |
| Dragon Teasel (T5_TEASEL) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Lavish Cloth (T6_CLOTH) | buy | 7 | 0 | 0/0/0/0/0 | Q:5, D:1, Ş:1 |
| Elusive Foxglove Seeds (T6_FARM_FOXGLOVE_SEED) | buy | 7 | 1 | 0/0/0/0/0 | Ş:5, G:1, Q:1 |
| Master's Foal (T6_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Master's Horse (T6_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Master's Ox Calf (T6_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Master's Ox (T6_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, D:1 |
| Potato Seeds (T6_FARM_POTATO_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Lamb (T6_FARM_SHEEP_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Sheep (T6_FARM_SHEEP_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elusive Foxglove (T6_FOXGLOVE) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Hardened Leather (T6_LEATHER) | buy | 7 | 0 | 0/0/0/0/0 | Q:6, Ş:1 |
| Raw Mutton (T6_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Runite Steel Bar (T6_METALBAR) | buy | 7 | 1 | 0/0/0/0/0 | Q:4, G:1, D:1, Ş:1 |
| Sheep's Milk (T6_MILK) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Master's Armored Horse (T6_MOUNT_ARMORED_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, D:1 |
| Master's Riding Horse (T6_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Master's Transport Ox (T6_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:2, D:1 |
| Bloodoak Planks (T6_PLANKS) | buy | 7 | 1 | 0/0/0/0/0 | Q:4, G:1, D:1, Ş:1 |
| Potatoes (T6_POTATO) | sell/buy | 14 | 2 | 0/0/0/0/0 | D:4, Q:8, G:2 |
| Opulent Cloth (T7_CLOTH) | buy | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Bundle of Corn (T7_CORN) | sell/buy | 14 | 0 | 0/0/0/0/0 | Ş:8, Q:4, D:2 |
| Corn Seeds (T7_FARM_CORN_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Grandmaster's Foal (T7_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Grandmaster's Horse (T7_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Firetouched Mullein Seeds (T7_FARM_MULLEIN_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Grandmaster's Ox Calf (T7_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Grandmaster's Ox (T7_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Piglet (T7_FARM_PIG_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Pig (T7_FARM_PIG_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Reinforced Leather (T7_LEATHER) | buy | 7 | 1 | 0/0/0/0/0 | Ş:6, G:1 |
| Raw Pork (T7_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, D:1 |
| Meteorite Steel Bar (T7_METALBAR) | buy | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Grandmaster's Armored Horse (T7_MOUNT_ARMORED_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Grandmaster's Riding Horse (T7_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | İ:7 |
| Grandmaster's Transport Ox (T7_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:2, D:1 |
| Firetouched Mullein (T7_MULLEIN) | sell | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Ashenbark Planks (T7_PLANKS) | buy | 7 | 1 | 0/0/0/0/0 | Ş:5, G:1, Q:1 |
| Baroque Cloth (T8_CLOTH) | buy | 7 | 0 | 0/0/0/0/0 | İ:7 |
| Calf (T8_FARM_COW_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Cow (T8_FARM_COW_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elder's Foal (T8_FARM_HORSE_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elder's Horse (T8_FARM_HORSE_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elder's Ox Calf (T8_FARM_OX_BABY) | buy | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elder's Ox (T8_FARM_OX_GROWN) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Pumpkin Seeds (T8_FARM_PUMPKIN_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Ghoul Yarrow Seeds (T8_FARM_YARROW_SEED) | buy | 7 | 0 | 0/0/0/0/0 | Ş:5, Q:2 |
| Fortified Leather (T8_LEATHER) | buy | 7 | 1 | 0/0/0/0/0 | Ş:6, G:1 |
| Raw Beef (T8_MEAT) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Adamantium Steel Bar (T8_METALBAR) | buy | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |
| Cow's Milk (T8_MILK) | sell | 7 | 0 | 0/0/0/0/0 | Ş:4, Q:3 |
| Elder's Armored Horse (T8_MOUNT_ARMORED_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | Y:7 |
| Elder's Riding Horse (T8_MOUNT_HORSE) | sell | 7 | 0 | 0/0/0/0/0 | İ:7 |
| Elder's Transport Ox (T8_MOUNT_OX) | sell | 7 | 0 | 0/0/0/0/0 | D:3, Ş:4 |
| Whitewood Planks (T8_PLANKS) | buy | 7 | 0 | 0/0/0/0/0 | Ş:7 |
| Pumpkin (T8_PUMPKIN) | sell/buy | 14 | 2 | 0/0/0/0/0 | Ş:8, Q:4, G:2 |
| Ghoul Yarrow (T8_YARROW) | sell | 7 | 0 | 0/0/0/0/0 | Ş:6, Q:1 |

## Ek C — Geniş Ada kolektör kataloğunun her ürünü (180 item)

Her hücre, o ürünün **7 şehrinden kaçının genel piyasa satış cache’inde mevcut eşikleri geçtiğini** gösterir. Buy book veya kişisel satış değildir. 28 günlük engel sütununda her şehir için G/A/T/O/S/H sıfır olmayan bağımsız engeller bir arada gösterilir; toplama uygun disjoint nedenler değildir. ✓ tüm kontrolleri geçer. Bütün 60/90 hücrelerinde kapsam başarısızdır. Bu listede V2 otomatik doldurmada kullanılmayan, fakat ortak Ada kolektörüne dahil 67 ek item de açıkça gösterilir.

| Item | V2 otomatik rol | 7 gün uygun /7 | 14 /7 | 28 /7 | 60 /7 | 90 /7 | 28 günlük şehir engelleri |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Faerie Fire (QUESTITEM_TOKEN_MISTS) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: G+T; Brecilien: T |
| Carrots (T1_CARROT) | sell/buy | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Shadowheart (T1_FACTION_CAERLEON_TOKEN_1) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: G+T; Caerleon: T; Brecilien: T |
| Treeheart (T1_FACTION_FOREST_TOKEN_1) | Kolektör / ek kapsam | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: T |
| Rockheart (T1_FACTION_HIGHLAND_TOKEN_1) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: G+T |
| Mountainheart (T1_FACTION_MOUNTAIN_TOKEN_1) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: G+T |
| Beastheart (T1_FACTION_STEPPE_TOKEN_1) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: G+T |
| Vineheart (T1_FACTION_SWAMP_TOKEN_1) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: G+T |
| Carrot Seeds (T1_FARM_CARROT_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: G+T; Brecilien: T |
| Arcane Agaric (T2_AGARIC) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Beans (T2_BEAN) | sell/buy | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Arcane Agaric Seeds (T2_FARM_AGARIC_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+A+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: G+T |
| Bean Seeds (T2_FARM_BEAN_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+A+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Brightleaf Comfrey (T3_COMFREY) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Hen Eggs (T3_EGG) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T+O; Brecilien: G+T |
| Baby Chickens (T3_FARM_CHICKEN_BABY) | buy | 1 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G |
| Chicken (T3_FARM_CHICKEN_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: G+T |
| Brightleaf Comfrey Seeds (T3_FARM_COMFREY_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: G+T |
| Journeyman's Foal (T3_FARM_HORSE_BABY) | buy | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+A+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: H+G+A+T; Brecilien: ✓ |
| Journeyman's Horse (T3_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: H+G+A+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Journeyman's Ox Calf (T3_FARM_OX_BABY) | buy | 1 | 1 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: S; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+O |
| Journeyman's Ox (T3_FARM_OX_GROWN) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T+O; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T+O |
| Wheat Seeds (T3_FARM_WHEAT_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Thick Leather (T3_LEATHER) | buy | 7 | 7 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Raw Chicken (T3_MEAT) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Journeyman's Riding Horse (T3_MOUNT_HORSE) | sell | 7 | 7 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Journeyman's Transport Ox (T3_MOUNT_OX) | sell | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Chestnut Planks (T3_PLANKS) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Sheaf of Wheat (T3_WHEAT) | sell/buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Crenellated Burdock (T4_BURDOCK) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Crenellated Burdock Seeds (T4_FARM_BURDOCK_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Kid (T4_FARM_GOAT_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Goat (T4_FARM_GOAT_GROWN) | sell | 2 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: G+O; Brecilien: H+G+A+T |
| Adept's Foal (T4_FARM_HORSE_BABY) | buy | 2 | 2 | 3 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: H+G+A+T; Brecilien: ✓ |
| Adept's Horse (T4_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Adept's Ox Calf (T4_FARM_OX_BABY) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+A+T; Lymhurst: T; Martlock: ✓; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T+O |
| Adept's Ox (T4_FARM_OX_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T+O+S; Fort Sterling: H+G+A+T; Lymhurst: T+O+S; Martlock: G+T+O+S; Thetford: T+O; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Turnip Seeds (T4_FARM_TURNIP_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Worked Leather (T4_LEATHER) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Raw Goat (T4_MEAT) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: G+T; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: H+G+A+T |
| Goat's Milk (T4_MILK) | sell | 2 | 2 | 2 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Adept's Riding Horse (T4_MOUNT_HORSE) | sell | 6 | 6 | 6 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Adept's Transport Ox (T4_MOUNT_OX) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: T; Brecilien: ✓ |
| Pine Planks (T4_PLANKS) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Turnips (T4_TURNIP) | sell/buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Cabbage (T5_CABBAGE) | sell/buy | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Ornate Cloth (T5_CLOTH) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Goose Eggs (T5_EGG) | sell | 4 | 3 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: T+O; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Cabbage Seeds (T5_FARM_CABBAGE_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Swiftclaw Cub (T5_FARM_COUGAR_BABY) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: ✓ |
| Tame Swiftclaw (T5_FARM_COUGAR_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Winter Bear Cub (T5_FARM_DIREBEAR_FW_FORTSTERLING_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: G+T; Martlock: G+T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Tame Winter Bear (T5_FARM_DIREBEAR_FW_FORTSTERLING_GROWN) | Kolektör / ek kapsam | 0 | 0 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: ✓; Lymhurst: H+G+A+T; Martlock: G+T+O; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Wild Boarlet (T5_FARM_DIREBOAR_FW_LYMHURST_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+A+T; Martlock: G+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Tame Wild Boar (T5_FARM_DIREBOAR_FW_LYMHURST_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Gosling (T5_FARM_GOOSE_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Goose (T5_FARM_GOOSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Caerleon Greywolf Pup (T5_FARM_GREYWOLF_FW_CAERLEON_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: H+G+A+T; Martlock: T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Greywolf (T5_FARM_GREYWOLF_FW_CAERLEON_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Expert's Foal (T5_FARM_HORSE_BABY) | buy | 2 | 2 | 2 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Expert's Horse (T5_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Baby Moabird (T5_FARM_MOABIRD_FW_BRIDGEWATCH_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Tame Moabird (T5_FARM_MOABIRD_FW_BRIDGEWATCH_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Mystic Owlet (T5_FARM_OWL_FW_BRECILIEN_BABY) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Tame Mystic Owl (T5_FARM_OWL_FW_BRECILIEN_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+A+T+O; Lymhurst: H+G+A+T; Martlock: G+T+O; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Expert's Ox Calf (T5_FARM_OX_BABY) | buy | 0 | 1 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Expert's Ox (T5_FARM_OX_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T+O+S; Fort Sterling: G+T+S; Lymhurst: T+O; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Bighorn Ram Lamb (T5_FARM_RAM_FW_MARTLOCK_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Bighorn Ram (T5_FARM_RAM_FW_MARTLOCK_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T+O; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Baby Swamp Salamander (T5_FARM_SWAMPDRAGON_FW_THETFORD_BABY) | Kolektör / ek kapsam | 1 | 0 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: T; Thetford: ✓; Caerleon: H+G+A+T; Brecilien: G+T |
| Tame Swamp Salamander (T5_FARM_SWAMPDRAGON_FW_THETFORD_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Dragon Teasel Seeds (T5_FARM_TEASEL_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Cured Leather (T5_LEATHER) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Raw Goose (T5_MEAT) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: H+G+A+T |
| Titanium Steel Bar (T5_METALBAR) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Expert's Armored Horse (T5_MOUNT_ARMORED_HORSE) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Swiftclaw (T5_MOUNT_COUGAR_KEEPER@1) | Kolektör / ek kapsam | 4 | 4 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Saddled Winter Bear (T5_MOUNT_DIREBEAR_FW_FORTSTERLING) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: G+T; Martlock: T; Thetford: G+T; Caerleon: T; Brecilien: ✓ |
| Saddled Wild Boar (T5_MOUNT_DIREBOAR_FW_LYMHURST) | Kolektör / ek kapsam | 3 | 3 | 3 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Saddled Greywolf (T5_MOUNT_GREYWOLF_FW_CAERLEON) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: G+T; Martlock: T; Thetford: G+T; Caerleon: G+T; Brecilien: ✓ |
| Expert's Riding Horse (T5_MOUNT_HORSE) | sell | 7 | 7 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Saddled Moabird (T5_MOUNT_MOABIRD_FW_BRIDGEWATCH) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: G+T; Martlock: T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Saddled Mystic Owl (T5_MOUNT_OWL_FW_BRECILIEN) | Kolektör / ek kapsam | 2 | 2 | 2 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Expert's Transport Ox (T5_MOUNT_OX) | sell | 4 | 4 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: T; Caerleon: T; Brecilien: ✓ |
| Saddled Bighorn Ram (T5_MOUNT_RAM_FW_MARTLOCK) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: ✓ |
| Saddled Swamp Salamander (T5_MOUNT_SWAMPDRAGON_FW_THETFORD) | Kolektör / ek kapsam | 3 | 3 | 3 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: ✓; Lymhurst: T; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Cedar Planks (T5_PLANKS) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Dragon Teasel (T5_TEASEL) | sell | 5 | 5 | 5 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Lavish Cloth (T6_CLOTH) | buy | 4 | 4 | 4 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: T |
| Direwolf Pup (T6_FARM_DIREWOLF_BABY) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Tame Direwolf (T6_FARM_DIREWOLF_GROWN) | Kolektör / ek kapsam | 1 | 0 | 1 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elusive Foxglove Seeds (T6_FARM_FOXGLOVE_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Master's Foal (T6_FARM_HORSE_BABY) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: T |
| Master's Horse (T6_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Master's Ox Calf (T6_FARM_OX_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Master's Ox (T6_FARM_OX_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Potato Seeds (T6_FARM_POTATO_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Lamb (T6_FARM_SHEEP_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: H+G+A+T |
| Sheep (T6_FARM_SHEEP_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Elusive Foxglove (T6_FOXGLOVE) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Hardened Leather (T6_LEATHER) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Raw Mutton (T6_MEAT) | sell | 2 | 2 | 2 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: ✓ |
| Runite Steel Bar (T6_METALBAR) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Sheep's Milk (T6_MILK) | sell | 2 | 2 | 2 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: T |
| Master's Armored Horse (T6_MOUNT_ARMORED_HORSE) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Direwolf (T6_MOUNT_DIREWOLF) | Kolektör / ek kapsam | 3 | 3 | 3 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Master's Riding Horse (T6_MOUNT_HORSE) | sell | 4 | 4 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Master's Transport Ox (T6_MOUNT_OX) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Bloodoak Planks (T6_PLANKS) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Potatoes (T6_POTATO) | sell/buy | 4 | 4 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Opulent Cloth (T7_CLOTH) | buy | 4 | 4 | 4 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: T; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Bundle of Corn (T7_CORN) | sell/buy | 7 | 7 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Corn Seeds (T7_FARM_CORN_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Direboar Piglet (T7_FARM_DIREBOAR_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Tame Direboar (T7_FARM_DIREBOAR_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Grandmaster's Foal (T7_FARM_HORSE_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Grandmaster's Horse (T7_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T+O; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Firetouched Mullein Seeds (T7_FARM_MULLEIN_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+A+T; Lymhurst: ✓; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Grandmaster's Ox Calf (T7_FARM_OX_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T+O; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Grandmaster's Ox (T7_FARM_OX_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+A+T+O; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Piglet (T7_FARM_PIG_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: H+G+A+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Pig (T7_FARM_PIG_GROWN) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: H+G+A+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: ✓ |
| Swamp Dragon Pup (T7_FARM_SWAMPDRAGON_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+A+T; Martlock: T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Tame Swamp Dragon (T7_FARM_SWAMPDRAGON_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T+O+S; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Reinforced Leather (T7_LEATHER) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Raw Pork (T7_MEAT) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: T; Brecilien: G+T |
| Meteorite Steel Bar (T7_METALBAR) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: T |
| Grandmaster's Armored Horse (T7_MOUNT_ARMORED_HORSE) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: G+A+T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: ✓ |
| Saddled Direboar (T7_MOUNT_DIREBOAR) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: T |
| Grandmaster's Riding Horse (T7_MOUNT_HORSE) | sell | 2 | 2 | 2 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: G+T; Martlock: ✓; Thetford: T; Caerleon: G+A+T; Brecilien: ✓ |
| Grandmaster's Transport Ox (T7_MOUNT_OX) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: G+T; Brecilien: T |
| Saddled Swamp Dragon (T7_MOUNT_SWAMPDRAGON) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: G+T; Caerleon: G+A+T; Brecilien: T |
| Firetouched Mullein (T7_MULLEIN) | sell | 7 | 7 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Ashenbark Planks (T7_PLANKS) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Baroque Cloth (T8_CLOTH) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: T |
| Calf (T8_FARM_COW_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Cow (T8_FARM_COW_GROWN) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: G+T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Direbear Cub (T8_FARM_DIREBEAR_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elite Winter Bear Cub (T8_FARM_DIREBEAR_FW_FORTSTERLING_BABY) | Kolektör / ek kapsam | 1 | 1 | 1 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: ✓; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Winter Bear (T8_FARM_DIREBEAR_FW_FORTSTERLING_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Direbear (T8_FARM_DIREBEAR_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elite Wild Boarlet (T8_FARM_DIREBOAR_FW_LYMHURST_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Wild Boar (T8_FARM_DIREBOAR_FW_LYMHURST_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elite Greywolf Pup (T8_FARM_GREYWOLF_FW_CAERLEON_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Greywolf (T8_FARM_GREYWOLF_FW_CAERLEON_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T+S; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elder's Foal (T8_FARM_HORSE_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Elder's Horse (T8_FARM_HORSE_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Mammoth Calf (T8_FARM_MAMMOTH_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: H+G+A+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Mammoth (T8_FARM_MAMMOTH_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+A+T; Martlock: H+G+A+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Baby Elite Terrorbird (T8_FARM_MOABIRD_FW_BRIDGEWATCH_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Terrorbird (T8_FARM_MOABIRD_FW_BRIDGEWATCH_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elite Mystic Owlet (T8_FARM_OWL_FW_BRECILIEN_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Mystic Owl (T8_FARM_OWL_FW_BRECILIEN_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elder's Ox Calf (T8_FARM_OX_BABY) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Elder's Ox (T8_FARM_OX_GROWN) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Pumpkin Seeds (T8_FARM_PUMPKIN_SEED) | buy | 1 | 1 | 1 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Elite Bighorn Ram Lamb (T8_FARM_RAM_FW_MARTLOCK_BABY) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Bighorn Ram (T8_FARM_RAM_FW_MARTLOCK_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Baby Elite Swamp Salamander (T8_FARM_SWAMPDRAGON_FW_THETFORD_BABY) | Kolektör / ek kapsam | 1 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+T; Thetford: G; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Tame Elite Swamp Salamander (T8_FARM_SWAMPDRAGON_FW_THETFORD_GROWN) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Ghoul Yarrow Seeds (T8_FARM_YARROW_SEED) | buy | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: T; Martlock: G+T; Thetford: T; Caerleon: H+G+A+T; Brecilien: G+T |
| Fortified Leather (T8_LEATHER) | buy | 6 | 6 | 6 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Raw Beef (T8_MEAT) | sell | 2 | 2 | 2 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: T; Caerleon: T; Brecilien: T |
| Adamantium Steel Bar (T8_METALBAR) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: G+T |
| Cow's Milk (T8_MILK) | sell | 7 | 6 | 7 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: ✓; Martlock: ✓; Thetford: ✓; Caerleon: ✓; Brecilien: ✓ |
| Elder's Armored Horse (T8_MOUNT_ARMORED_HORSE) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: G+T; Lymhurst: G+A+T; Martlock: G+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Saddled Direbear (T8_MOUNT_DIREBEAR) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Elite Winter Bear (T8_MOUNT_DIREBEAR_FW_FORTSTERLING_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Elite Wild Boar (T8_MOUNT_DIREBOAR_FW_LYMHURST_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: G+T; Martlock: G+T; Thetford: G+T; Caerleon: G+T; Brecilien: G+T |
| Elite Greywolf (T8_MOUNT_GREYWOLF_FW_CAERLEON_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: G+T; Lymhurst: G+A+T; Martlock: G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: G+A+T+O |
| Elder's Riding Horse (T8_MOUNT_HORSE) | sell | 1 | 1 | 1 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: G+A+T; Martlock: ✓; Thetford: T; Caerleon: G+A+T; Brecilien: H+G+A+T |
| Elder's Transport Mammoth (T8_MOUNT_MAMMOTH_TRANSPORT) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: H+G+A+T |
| Elite Terrorbird (T8_MOUNT_MOABIRD_FW_BRIDGEWATCH_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Elite Mystic Owl (T8_MOUNT_OWL_FW_BRECILIEN_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: H+G+A+T; Thetford: G+A+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Elder's Transport Ox (T8_MOUNT_OX) | sell | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+A+T; Fort Sterling: G+T; Lymhurst: T; Martlock: T; Thetford: T; Caerleon: H+G+A+T; Brecilien: T |
| Elite Bighorn Ram (T8_MOUNT_RAM_FW_MARTLOCK_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: G+T; Fort Sterling: H+G+A+T; Lymhurst: H+G+A+T; Martlock: G+A+T; Thetford: G+T; Caerleon: H+G+A+T; Brecilien: G+A+T |
| Elite Swamp Salamander (T8_MOUNT_SWAMPDRAGON_FW_THETFORD_ELITE) | Kolektör / ek kapsam | 0 | 0 | 0 | 0 | 0 | Bridgewatch: H+G+A+T; Fort Sterling: H+G+A+T; Lymhurst: G+T; Martlock: G+T; Thetford: H+G+A+T; Caerleon: H+G+A+T; Brecilien: G+T |
| Whitewood Planks (T8_PLANKS) | buy | 5 | 5 | 5 | 0 | 0 | Bridgewatch: ✓; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: G+T; Brecilien: ✓ |
| Pumpkin (T8_PUMPKIN) | sell/buy | 4 | 4 | 4 | 0 | 0 | Bridgewatch: T; Fort Sterling: ✓; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |
| Ghoul Yarrow (T8_YARROW) | sell | 3 | 3 | 3 | 0 | 0 | Bridgewatch: T; Fort Sterling: T; Lymhurst: T; Martlock: ✓; Thetford: ✓; Caerleon: T; Brecilien: ✓ |

## Tekrarlanabilirlik ve korunmuş kapsam

Analiz kodu ve ara özetler proje dışında geçici analiz çalışma alanında tutuldu. Kişisel karakter/counterparty bilgileri, ham Trades.json veya hacimli journal projeye kopyalanmadı. Arşivler salt okunur açıldı; services/status endpoint’i bile prune/watch yan etkileri nedeniyle kullanılmadı. Kaynak/gün/kalite/yön boşlukları uydurulmadı. Audit sırasında dış API/network isteği **0**, gerçek hesap/otomatik doldurma/kaydetme komutu **0**.

Bu aşamanın proje teslimi yalnız docs/island-trade-history-audit.md’dir. Mevcut çalışma alanındaki önceden var olan kod değişiklikleri korunmuştur.

İncelenen temel kaynak kodunun SHA-256 parmak izleri (kesitteki sürüm):

| Dosya | SHA-256 |
| --- | --- |
| content/js/core/trade-potential-evidence.mjs | ef31383e49c94d02970279cb0a2cf0565005e142b843d71172daf91bc8f17198 |
| content/js/core/island-sales-potential.mjs | 1550f462425e563009d4e0b0fb0f275521e89755c7df327932d44767de005cb5 |
| content/js/tools/island-planner-v2.js | d123a295c904ffed257b2103555290db0e68940a43954661294db14fd952194b |
| content/js/core/market-history.js | a5391bdd7b256d1919890d9b9700458ae7f769a6c76aef8d0b9d0ad4c228720e |
| content/js/core/trade-live.js | eb18c5ee9183b48abc29f238a036993be6d408e771f28db13794132ca40b2456 |
| content/scripts/aodp-collector.mjs | 94d02b5ff399e0332e8f0a0b8ca3087a73ff110fa6aa45cf64238ff8a5903e36 |
| content/scripts/quote-history-repository.mjs | 89fb3a6fb8670e172a4316af53dbc277b7f849b9437c52199f64b402b9cfc88b |

