# Günün Fırsatları veri güvenilirliği revizyonu

Uygulama mevcut toplama, arşiv, tarama ve kart modüllerine entegre edildi. Sunucu varsayılanı `legacy-shadow`; yeni sonuçların etkinleşmesi için `OPPORTUNITIES_VALIDATED=1` gerekir. Üretim arşivleri bu çalışma kapsamında dönüştürülmedi veya silinmedi.

## Doğrulanan veri akışı ve kök nedenler

| Bileşen | Gerçek dosya / fonksiyon | Bulgu |
|---|---|---|
| AODP toplama | `content/scripts/aodp-collector.mjs`, `createAodpCollector/run` | Sell minimum ve Buy maksimum zaten ayrı okunuyor; ham yanıt metadata olarak saklanmıyordu. |
| AODP saklama | `quote-history-repository.mjs`, `record/apply/checkpoint` | Normal çalışma aynı kaynak zamanını yeniden yazmayı zaten engelliyor. Bu korumayı yok sayan genel bir “toplayıcı her saat aynı fiyatı yazar” iddiası doğru değil. |
| Saatlik arşiv | `order-price-history.mjs`, `record/restore` | AODP bucket/seenAt alım zamanına bağlıydı; kaynak kimliği arşiv sınıfında tekilleştirilmiyordu. Eski arşivde farklı bucket'lar bağımsız oy sayılabiliyordu. |
| Canlı fiyat | `market-opportunity-scan.mjs`, `applyLiveQuote` | Eski kaynak zamanı, yeni fetch saatine fiyat ekleyebiliyordu. Aynı kaynağın düzeltmesi, eski kanıtla çelişki olarak ele alınmıyordu. |
| Yerel upload | `price-hub.mjs`, `ingestMarketUpload/extrema/aggregateRow` | Her ürün/şehir/kalite/taraf paketi eski defteri tamamen değiştiriyordu. Paket tamamlama/kaldırma kanıtı yok. |
| NATS | `aodp-nats-adapter.mjs`, `assessNatsBook/chooseMarketQuote` | NATS zaten kısmi defteri güvenilmez sayıyor ve eksik REST fiyatını doldurmuyor. Defteri değiştirme kusuru NATS adaptörüne atfedilmedi. |
| Kaynak seçimi | `long-term-price.mjs`, `mergedQuotePoints` | Önceden paket kaynağı aynı saatte koşulsuz kazanıyordu. Yeni fırsat akışı iki kaynağın kanıtını birleştirir; diğer araçların uzun vadeli estimator akışı korunur. |
| Referans | `market-opportunities.mjs`, `provisionalReference` | Son fiyata göre geriye doğru %5 bandı ayrılıyor, önceki tek fiyat bile referans olabiliyordu. Uç fiyat geçmişi yanlış bölebiliyordu. |
| Strateji/sıralama | `buildStrategies/analyzeMarketCell/rankMarketOpportunities` | Zayıf ve doğrulanmamış kayıtlar yalnızca skor cezası alıyordu. İşlem için açık uygunluk kapısı yoktu. |
| UI/durum | `tools/opportunities.js`, `opportunity-status.mjs` | Referans ve işlem güveni tek reliability değerinde görünüyordu; tür filtreleri ile primary status filtreleri örtüşüyor. |

Somut regresyon: 08:00 kaynak zamanlı AODP kaydının 10:00 bucket'ında tekrar görünmesi eski referansa ikinci oy ekliyordu. Yeni motor kaynak/kanıt kimliğiyle bunu bir oy sayar. Aynı kaynak zamanındaki farklı fiyatlar `conflicting-event` ile karantinaya alınır. Farklı gerçek zamanlarda aynı fiyat görülmesi engellenmez.

## Yeni model ve referans

Seri kimliği `server + itemId + city + quality + side`; enchant itemId içinde kalır. Sell=`sell_price_min`, Buy=`buy_price_max`.

`market-observation.mjs` kaynak, observedAt, receivedAt, processedAt, coverage, observationId, evidenceId, ham kanıt, gerekçeler ve kanıt ilişkilerini ortak modelde tutar. Yerel paketin kaynak zamanı bilinmiyorsa observedAt null kalır; alım zamanı doğrulanmış piyasa zamanı yapılmaz. AODP'nin reported-top kapsamı tam defter/depth anlamına gelmez.

Durumlar accepted/provisional/quarantined/rejected. Bozuk fiyat ve zamanlar reddedilir; yapısal olarak geçerli büyük sapmalar kanıt bekler. Sapma %50'den itibaren şüphelidir; %100 ve %300 üzerindeki hareketler daha fazla kanıt gerektirir. Kanıt ihtiyacı sırasıyla 2/5/8/12 bağımsız gözlem ve en az karşılık gelen saat yayılımıdır. %300 ve üzerindeki mevcut aşırı fiyat kartı işlem önerisini engeller; doğrulanmış kalıcı rejime geçişten sonraki gözlemler yeni referansa göre değerlendirilir. Minimum 25 gümüş fark ve 100.000 gümüş sıralama etkisi sınırı korunur.

Referans hesaplaması kronolojiktir. Yeni fiyatın değerlendirilmesinde yalnızca önceki kabul edilmiş istikrarlı rejim kullanılır. Karantina/provisional fiyatlar eski rejimin medyanına girmez. Büyük hareket sonradan yeterli kanıtla doğrulanabilir. En az 24 gözlem ve 72 saat süren yeni rejim, sonraki gözlemlerin referansı olur; geçiş zamanı, eski/yeni merkez ve kanıtlar korunur. 28 günlük pencere ve 90 günlük arşiv saklama devam eder.

Güven seviyeleri 0–4; minimum gözlem/zaman koşulları 1, 5/6 saat, 12/24 saat, 24/72 saattir. Seviye 3 ve üzeri ayrıca en az %80 rejim istikrarı ister. Reference confidence ve execution confidence ayrı alanlardır; bunlar kalibre edilmiş gerçekleşme olasılığı değildir. Derinlik, miktar ve dolma ihtimali üretilmez.

Yerel kısmi paket emir ID'leriyle birleştirilir. Pakette görünmemek kaldırılma kanıtı değildir. Saklanan emirler tarihsel kanıttır; halen aktif oldukları doğrulanmış sayılmaz. Mevcut güvenilir expiry temizliği korunur. REST çıktısı book_coverage ve active_orders_verified metadata taşır. Kısmi/bilinmeyen yerel defter yeni fırsat referansına kesin ekstrem olarak katılmaz.

## Fırsat, UI ve sıralama

Stratejiler ilgili Buy/Sell taraflarının referans seviyesi, kabul durumu ve tazeliğiyle açılır. Güncel Sell stratejisi ilgisiz eski Buy nedeniyle kapanmaz. İki taraflı ve şehirler arası stratejiler gerekli tarafların tümünü denetler. Vergi/premium/setup, Sell−1 ve Buy+1 hesapları değişmedi; teorik emir farkı gerçekleşmiş kâr değildir.

Uygunluk sıralamadan önce uygulanır. Dengeli/güncellik/önem modları, deterministik ID eşitlik çözümüyle korunur. İlk 500 doğrulanmış kayıt uygun kayıtlar arasından seçilir. İzleme/şüpheli/yetersiz kayıtlar ayrı diagnostics dizisinde, mevcut durum ve tür filtreleriyle erişilir. Varsayılan yeni motor listesi yalnızca uygun kayıtları gösterir. Detay tooltips referans ve işlem güvenini ve Türkçe dışlama gerekçelerini açıklar. Yeni sayfa veya CSS tasarımı eklenmedi.

Evaluated/verified/monitored/suspicious/insufficient sayaçları tür filtrelerinden bağımsızdır ve yeni motorda değerlendirilmiş hücreleri böler. Kart primary status resolver'ı tek durum döndürmeye devam eder.

## Shadow değerlendirme sonucu

Değerlendirme zamanı: 2026-10-10T15:10:04.835Z. Snapshot arşivleri salt okunur değerlendirildi; canlı journal dahil değil. Diğer iki sunucuda kayıt bulunmadı.

| Ölçüm | Sonuç |
|---|---:|
| Değerlendirilen hücre | 1744 |
| Eski hareket/fırsat adayı | 22 |
| Yeni hareket adayı (uygunluk öncesi) | 16 |
| Yeni doğrulanmış fırsat | 0 |
| Şüpheli güncel hücre | 10 |
| Pencere içi karantina gözlemi | 31 |
| Referansı değişen Buy/Sell serisi | 432 |
| Referansı değişen hücre | 375 |
| Eski fırsat olup yeni uygunluğu karşılamayan | 22 |
| Yeni uygun olup eskide kaçan | 0 |
| Karşılaştırma süresi | 674 ms |

Referans seviyeleri (Buy/Sell tarafları, eksik taraflar dahil): seviye 0: 2555; seviye 1: 835; seviye 2: 95; seviye 3: 3. İlk 20 sıralama, tür dağılımları, en çok etkilenen hücrelerin gerekçeleri ve referans farkları JSON raporunda saklandı. False-negative ölçümü null; etiketli gerçeklik verisi yok.

## Kanıt örnekleri ve testler

- Fixture: `content/scripts/fixtures/roast-pork-anomaly.json`. Europe/Brecilien/T7_MEAL_ROAST, önceki 4.377/4.367 → referans 4.372; Sell minimum 2.999.383, maksimum 15.323.568, Buy maksimum 4.100, minimum 2.000. Milyonluk minimum karantinada kalır; referansa ve işlem stratejisine girmez. Maksimum Sell ile karıştırılmaz.
- Korunan sentetik hareket: güçlü geçmişten sonra iki ayrı saatte yaklaşık %36,4 Sell yükselişi, satış emri stratejisi üretir. Gösterilen fark kâr oranı veya gerçekleşmiş kazanç değildir.
- 8.000'e kalıcı yükseliş ve 2.000'e kalıcı düşüş yeni rejime geçer; tek milyonluk uç fiyat geçmez.
- 601 hücre testinde 600 zayıf kayıt, tek doğrulanmış fırsatın ilk 500 kotasını işgal etmez.

Geçen kontroller: `npm run opportunities:test` (eski davranış/shadow regresyonu, durum matrisi, 12 yeni güvenilirlik test grubu); `test-market-order-history.mjs`; `test-aodp-collector.mjs` (12 kontrol); `test-market-collection.mjs`; `test-decision-engine.mjs` (25 fixture). JS sözdizimi ve değiştirilen dosyaların diff whitespace kontrolü geçti. Görsel tarayıcı testi yapılmadı; CSS/yerleşim değiştirilmedi.

Performans: 2.520 seri × 2.160 saat sentetik arşiv; 1.260 uygun hücre, 500 listelenen, 760 limit sonrası kayıt. İlk tarama 25.189 ms, değişmeyen seri taraması 84 ms; ölçülen heap 144 MB. İlk tarama hâlâ pahalıdır. Seri revision'ları referans önbelleğini yalnızca ilgili seri değiştiğinde geçersiz kılar; pencere sınırları ayrıca önbelleği düşürür. Ham nokta ve timestamp önbellekleri boyut sınırına sahiptir. Server scan cache 30 saniye, shadow karşılaştırma saatte en çok bir kez; yalnızca son özet saklanır.

## Migration ve rollback

Arşiv konteyneri version 1 korunur; observationVersion 2 metadata eklenir. Eski kayıtlar restore sırasında tekrar normalize/tekilleştirilir. Bilinmeyen kapsam/zaman uydurulmaz. Yazmadan önce mevcut snapshot ve repository journal için write-once `.pre-observation-v2.bak` yedeği hazırlanır; yedekleme başarısızsa yazma durur. JSON bozulması constructor/restore hatası üretir; sessiz onarım ve üzerine yazma yapılmaz.

`migrate-market-observations.mjs` ayrı bir export dizinine doğrulanmış dönüştürülmüş snapshot ve birebir `.original` byte yedekleri üretir. Kaynak arşivleri değiştirmez; canlı journal export'a dahil edilmez. Aynı veri/zamanla tekrar dönüşümün idempotent olduğu, bozuk input'un durduğu ve orijinal byte'larla rollback yapılabildiği fixture üzerinde doğrulandı. Canlı export kullanılacaksa önce hub durdurulmalı ve snapshot/journal birlikte tutarlı bir checkpoint alınmalıdır.

Kod geri dönüşünde hub kapatılarak eski kod ve eşleşen snapshot/journal yedekleri geri yüklenebilir. Yeni veriyi ayrıca korumadan yedek üstüne geri dönülmemelidir. Bu çalışma üretim rollback veya migration çalıştırmadı; arşivlere yazmadan bellek içi shadow değerlendirme yaptı.

## Değiştirilen / eklenen dosyalar

Çekirdek: `content/js/core/market-observation.mjs`, `market-book.mjs`, `order-price-history.mjs`, `market-opportunities.mjs`, `market-opportunity-scan.mjs`, `market-opportunity-shadow.mjs`, `opportunity-status.mjs`.

Toplama/sunucu: `content/scripts/aodp-collector.mjs`, `quote-history-repository.mjs`, `price-hub.mjs`, `quote-service.mjs`, `archive-backup.mjs`, `migrate-market-observations.mjs`, `evaluate-market-observations.mjs`.

UI: `content/js/tools/opportunities.js`. Testler: `test-market-observation.mjs`, `test-market-observation-performance.mjs`, `test-market-opportunities.mjs`, `test-opportunity-status.mjs`, `test-market-order-history.mjs`, Roast Pork fixture. Komut entegrasyonu: `package.json`. Raporlar: bu dosya ve `market-observation-shadow.json`.

Başlangıç çalışma alanında mevcut olan başka değişiklikler geri alınmadı veya bu revizyonun parçası sayılmadı.

## Üretim kararı ve belirsizlikler

Öneri: shadow modu sürdürülmeli; yeni motor hemen tek yetkili sonuç üreticisi yapılmamalı. Mevcut arşivde yeterli zaman yayılımı ve kaynak kapsamı nadir. Etiketli gerçek hareketler olmadan fırsat sayısının düşmesi, doğruluk veya yanlış negatif başarısı kanıtı değildir. Gerçek hareket fixture'ları sentetiktir. Kısmi yerel defter için tamlık/removal protokolü hâlâ mevcut değil. Gözlem kimliği verilmeyen AODP kayıtlarında kaynak zamanı konservatif event kimliği olarak kullanılır; açık evidenceId varsa kaynaklar arası ortak kanıt korunur, aynı zamanlı kayıtlar bağımsız sayılmaz. Canlı journal dahil karşılaştırma ve üretim yükü gözlemi etkinleştirme öncesi tamamlanmalıdır.
