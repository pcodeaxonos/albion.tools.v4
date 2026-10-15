# Potansiyel limit emir motoru — uygulama ve doğrulama

Yöntem: `limit-first-passage-v3`. Gerçek veri kesiti: 2026-10-15T12:46:34.028Z.

## Sonuç

66.563 arşiv serisinin 18767 tanesi dolu. Bu serilerde BUY ve SELL için 2/7/28 gün olmak üzere 112602 karar incelendi. Güncel kesitte kabul edilen emir fiyatı: **0**. Gerçek dolum süresi, başarısız emir paydası ve bağımsız kalibrasyon olmadan Planlayıcı fiyatı üretilmiyor. Bu sonuç başarılı bir dolum tahmini olarak sunulmaz.

## Kullanım ve bağımlılık haritası

`SAT normalizasyonu / kişisel kimlik indeksi + yerel AODP arşivi + Market History + AODP günlük geçmişi + taze emir kotasyonu → potential-price-refresh.js → potential-sale-horizon.mjs → potential-price-snapshot.mjs → Potansiyel Fiyatlar / veritabanı görünümü / Ada Planlayıcı V2`.

`personal-price-evidence.mjs` yalnız gerçekleşmiş kişisel fiyatları ve doğrulanabilen emir bağlantılarını özetler. `trade-potential-evidence.mjs` kimlik, mevcut hacim ölçümü ve eski veri adaptörlerini taşır; bütün limit fiyat çağrıları tek motora gider. `island-sales-potential.mjs` içindeki satış kapasitesi, günlük üretim ve yem ekonomisi ayrı amaçtır ve korunmuştur.

## Fiyat modeli

1. Tamamlanmış kovaları alır. İşlem zamanı ile `fetchedAt`, `observedAt`, `availableAt` ayrı değerlendirilir; kesitten sonraki bilgi dışlanır. Aynı günlük/saatlik hareketin kaynakları alternatif kapsam sayılır. Örtüşen kovalar toplanmaz; eksik gün sıfır değildir.
2. Her tarihsel başlangıçta yalnız o başlangıca kadarki trend ve mutlak günlük değişimle rejim tanımlar. Uyumlu başlangıçların sonraki 28 güne kadar kesintisiz fiyat yollarını, başlangıç fiyatına oranlayarak inceler. Bugünkü çıpa son tamamlanmış piyasa ortalamasıdır; taze kotasyon ayrıca adaydır. Rejim yakınlık eşiği henüz gerçek dolumlarla kalibre edilmemiş politikadır.
3. Adaylar bu yolların 2/7/28 günlük yukarı/aşağı ilk ulaşma sınırları, kişisel işlem fiyatları ve geçerli kotasyonlardan gelir. SELL yüksekten, BUY düşükten aranır. Aynı başlangıç kümesi ve aynı payda bütün ufuklarda kullanılır. Erken ulaşma uzun ufka da dahildir; sansürlü yollar ulaştı sayılmaz. Yüzdelik merdiveni veya süreye bağlı fiyat katsayısı yoktur.
4. En az 20 yol, en az 2 ayrık 28 günlük başlangıç ve en az 0,7 tarihsel ulaşma payı inceleme adayı için aranır. Örtüşen yolların payı bağımsız doğruluk değildir; bağımsız blok sayısı ve Wilson alt sınırı ayrıca saklanır. Bu aday hesapta kullanılmaz.
5. Kullanılabilir emir hedefi için başarısız emirleri de içeren doğrulanmış sabit limit kohortu gerekir. Kimlik, yön, miktar, açılış, gözlem sonu ve tam dolum zamanı ayrıdır. Tam miktarı doldurmayan işlem başarı değildir. Erken iptal / kısa gözlem sansürlüdür. En az 20 uygun emir ve 0,7 Wilson alt sınırı aranır. Ayrıca aynı kimlik, miktar ve süre için bağımsız tutulmuş doğrulama kesitinin kalibrasyonu zorunludur. Eğitimdeki başarılı dolumlar kendilerini kalibre edemez.
6. Kısa sürede kabul edilen aynı sabit emir uzun azami beklemeye de kabul edilir. Bu, aynı kanıt modelinin iç içe geçmiş son tarihleridir. 28 gün daha iyi fiyat garantisi değildir. 30 günlük oyun sınırını aşan emir gözlemleri kullanılmaz; tahmin ufku yalnız 2/7/28, analiz geçmişi 90 gündür.

Risk eşikleri `LIMIT_ORDER_POLICY` içinde merkezidir. 0,7 ölçülmüş doğruluk iddiası değildir. Mevcut kaynaklarda tam emir kohortu / bağımsız dolum kalibrasyonu yoktur; dolum güveni boş kalır. Emir defteri derinliği ve kuyruk sırası mevcut kotasyonlardan çıkarılamaz. Motor bu bilgiye sahipmiş gibi davranmaz. Ekranda miktar seçimi yoktur; mevcut çağrılar 1 birim varsayar, motor API’si pozitif tam miktarı kontrol eder.

## Brecilien T4_MOUNT_HORSE

Son 90 günde kalite bilgisi olmayan 16 SELL dolumu, 157 adet ve 47999–74978 fiyat aralığı bulundu. 50.000–57.000 bandında 9 kayıt ve 56 adet var. 74.978 tekil zirve de mevcut.

Katalog `maxQualityLevel=5` diyor; eksik kalite 1 olarak tamamlanamaz. Bu kayıtlar kalite 1 hedefinden ayrı gerçek kanıt olarak raporlanır. Açılış zamanı ve emir kimliği olmadığı için bunları 28 günlük dolumlara dönüştürmek mümkün değildir. Bilinen kaliteyle eşleşen kişisel seriler genel taramada ayrıca kullanılmıştır.

Önceki `output/sell-horizons-comparison.json` kaydı 38.484 kararını açıklıyor: 47.618 ilk aday reddedilmiş, tarihsel alt seviye fallback’i 38.484’e kadar inmiş. `%5` destek bandı 37.001 ve 37.472 ortalamalarını yeterli saymış. Bunlar hedefteki tekil dolumlar değildir. Kalitesi eksik kişisel satışlar eşleşmemiştir. Yeni motor bu toleransı ve fallback’i kaldırır.

## Gerçek geçmiş testleri

95 uzun geçmişli seri, 3738 BUY/SELL–süre kesiti. Yüksek/düşük hacim, yükselen/düşen, dalgalı, kişisel geçmişli ve kişisel geçmişsiz örnekler JSON raporunda bulunur. Bütün kesitlerde ilerideki satırlar eklenince sıkı geçmiş kararının değişmediği kontrol edildi.

**Sıkı zaman testi:** arşivdeki fiyatların alınma zamanları geçmiş kesitlerden sonra olduğu için kabul edilebilir ulaşma tahmini kapsamı 0. Gerçek dolum ölçümü 0; hiçbir sonuç dolum başarısı sayılmadı.

**Aşağıdaki tablo yalnız güncellenmiş arşivden yapılan keşif analizidir.** Alınma zamanı çıkarılmış geçmişte, sonraki günlük ortalamanın hedef seviyesini görüp görmediği incelenir. Bu, o gün çalıştırılmış modelin başarısı veya dolum olasılığı değildir. Eksik gelecek günleri başarı oranının paydasına katılmaz. Eski sürüm karşılaştırması dondurulmuş Git HEAD V2.1 kişisel motorudur; uygulama tarafından çalıştırılmaz.

| Yön | Gün | Kesit | Yeni aday / tam gelecek | Seviyeye ulaştı | Eski hedef / tam gelecek | Eski seviyeye ulaştı |
|---|---:|---:|---:|---:|---:|---:|
| BUY | 2 | 698 | 579 | 388 (67.0%) | 631 | 530 (84.0%) |
| BUY | 7 | 696 | 491 | 336 (68.4%) | 483 | 400 (82.8%) |
| BUY | 28 | 475 | 228 | 162 (71.1%) | 0 | 0 (—) |
| SELL | 2 | 698 | 579 | 413 (71.3%) | 587 | 384 (65.4%) |
| SELL | 7 | 696 | 491 | 357 (72.7%) | 368 | 212 (57.6%) |
| SELL | 28 | 475 | 228 | 171 (75.0%) | 1 | 1 (100.0%) |

BUY 2 ve 7 günlük keşif oranları merkezi 0,7 eşiğinin altında kaldı. Bununla gerçek dolum kalibrasyonu yapılamaz. Eski ve yeni modellerin hedef zorluğu ve kapsamı farklıdır; ham oran karşılaştırması üstünlük kanıtı değildir. Bütün başarısız kesitler, fiyat sapmaları ve eksik kapsam `output/limit-order-verification.json` içindedir.

## Temizlik ve geçiş

P25/P75/P90 hedef seçimi, süreye özel lookback kuralları, tarihsel alt seviye fallback’i, rekürsif kısa süre fiyat aktarımı, kotasyonu tek başına güvenilir sayan `potential-order-candidate.mjs`, yinelenen kişisel/piyasa percentile ve saatlik min/max hesaplayıcıları kaldırıldı. Eski üç estimator fixture’ı, eski destek/süre testleri ve eski doğrulama scriptleri kaldırıldı. Tek karşılaştırma fixture’ı yalnız audit için tutuldu.

BUY fiyatını 90 anahtarı altında bütün sürelere paylaşma kaldırıldı. Her iki yönde de 2/7/28 ayrı saklanır. Eski yöntem kayıtları kabul edilmez. Aynı aktif kayıt yenilenirken eski yöntemin orijinal kaydı aynı SQLite-backed snapshot deposunda salt audit kaydı olarak korunur; karar tablosuna girmez. Ham SAT, piyasa arşivleri ve kullanıcı verileri silinmedi.

## Planlayıcı ve testler

Planlayıcı ve veritabanı `potentialPriceDecision` kabulünü paylaşır. TOHUM/HASAT, Focus, maliyet, vergi, sabit fiyat önceliği ve net kâr/gün akışı korunmuştur. Eksik dolum güveni fiyatı ve kârı boş bırakır; dolu/kilitli slotlar değişmez. Kabul edilen fiyatın aktarımı ekonomi testinde ayrıca kontrol edilmiştir.

Test özeti: 23/26 komut geçti. Motor, kişisel kayıt, hacim, yenileme, tablo, piyasa geçmişi, SAT, ada ekonomisi/yerleşim/üretim, CSS, tercihler ve masaüstü/mobil Potansiyel Fiyatlar / Planlayıcı kontrolleri çalıştırıldı.

Kalan hatalar: `user-data` ve `catalogs` geçici SQLite yedeğini yeniden adlandırırken Windows `EPERM`; tüm araç masaüstü viewport taraması Ticaret Günlüğü’nde 1440×900, 1280×720 ve 992×600 boyutlarında taşma bildiriyor. Bu görevde o sayfanın devam eden değişikliklerine müdahale edilmedi. Mevcut kullanıcı SQLite dosyasında salt okunur `PRAGMA integrity_check`: `ok`.

Çalıştırma: `npm run potential:supported:test`, `npm run potential:audit`; geniş doğrulama: `node content/scripts/verify-limit-order-integration.mjs`. Gerçek SAT audit/self-test için gerçek `LOCALAPPDATA` yolu gerekir; Windows sandbox varsayılanı farklı olabilir. Testlerde kullanılan SQLite depoları izole geçici dosyalardır.
