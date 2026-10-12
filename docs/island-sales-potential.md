# Ada Planlayıcı V2 — Satış Potansiyeli / Trade History önceliği

> Tarihsel kapasite/stock modu raporu. Güncel yöntem TOHUM P25 / HASAT P75 fiyatıdır; mevcut günlük net kâr motoru kullanılır. Güncel kurallar ve testler: [Potansiyel fiyat](island-potential-price.md).

Otomatik Doldur'a Günlük Kâr'ın yanında Satış Potansiyeli eklendi. Varsayılan dönem 28 gün, pazar payı %10; seçenekler 7/14/28/60/90 gün ve %5/%10/%20. Yeni mod dolu ve kapalı slotları korur; yalnız açık boş slotları doldurur. Boşalt ve Doldur ile çeşit sayısı üzerinden doldurma bu modda devre dışıdır. Kaydetme, geri dönme ve elle boşaltma mevcut akışlarını kullanır.

## Yerel Trade History birincil kaynak

TOHUM/edinim ve HASAT/satış önce mevcut SAT Trade Hub `/api/v1/trades` arşivinden değerlendirilir. Yerel kaynak yeterliyse AODP history çağrısı gönderilmez. Yerelde eksik kalan item/şehir/kalite kombinasyonları birleştirilip yalnız onlar API'den istenir. Aynı ürünün iki yönü eksikse aynı API yanıtı tekrar kullanılır.

Kaynak kişisel, sunucu Europe: mevcut sağlayıcı `UserData-EUROPE/Trades.json` dosyasını keşfeder. Bu kaynak bağlamı ortak `TRADE_ARCHIVE_CONTEXT` ile snapshot/status üzerinde taşınır. Başka sunucu, şehir, kalite veya işlem yönü eşleşmeyen kayıtlar kullanılmaz; eksik kalite 1 varsayılmaz. `mail_buy`, `instant_buy`, `mail_sell`, `instant_sell` gerçekleşmiş işlemlerdir. Süresi dolan emirler, crafting ve oyuncu transferleri fiyat/hacim örneği değildir. Kaynak kimliğiyle yinelenen kayıtlar tek kez kullanılır.

Yerel fiyat ve miktar ayrı değerlendirilir. Fiyat yeterliyken miktar eksikse yerel fiyat korunur, kapasite API'den tamamlanır: **Karma**. API fiyatı yeterli yerel fiyatı geçersiz kılmaz. Kişisel işlem serisiyle genel piyasa serisi birleştirilmez ve miktarları toplanmaz. Güncel fiyat varsa yalnız karşılaştırma gösterilir; seçilen history kaynağının fiyatı kendiliğinden değiştirilmez.

Kişisel kapasite geçmişte kullanıcının gerçekleştirdiği miktardır; pazar payı uygulanmaz. API kapasitesi genel piyasa satış hacmi × seçilen pazar payıdır. TOHUM/yavru, dış yem ve binek malzemesi için gerçek dönem edinim ihtiyacı birlikte toplanıp temin kapasitesine göre sınırlandırılır. API'nin satış hacmi edinim için bir senaryo göstergesidir; kişisel alış ya da alış emri dolumu olarak sunulmaz. Eksik girdi geçmişi güncel fiyat, sıfır maliyet veya sınırsız kapasiteyle doldurulmaz.

Yerel instant işlemler emir kurulum ücreti taşımaz; mail emirleri ve karışık yerel işlem türleri ortak motorun kurulum ücretini kullanır. API ediniminde mevcut TOHUM fiyat yönünün emir davranışı korunur; HASAT API senaryosu satış emri olarak değerlendirilir. Vergi ve gider hesabı ortak motor üzerinden yapılır.

Her sonuç **Yerel / API / Karma** etiketini, fiyat ve kapasitenin ayrı kaynaklarını gösterir. Veri her iki kaynakta da yetersizse **Yetersiz** açıklaması kalıcı olarak gösterilir; sonuç üretilmez ve yerleşim korunur. Mevcut TOHUM/HASAT seçimleri kaynağa göre değiştirilmez. Modu seçmek veya verinin değişmesi arşiv sorgusu/otomatik doldurma başlatmaz; bu akış sadece kullanıcının Potansiyel Otomatik Doldur komutunda çalışır.

### Gerçek yerel arşiv denetimi

12 Ekim 2026 denetiminde arşivde 16,760 kayıt ve 1,576 kalite bilgili kayıt bulundu. Kalitesi/sunucusu/şehri/yönü eşleşebilen 585 seri incelendi. 7/14/28/60/90 günlük pencerelerin hiçbirinde mevcut kapsam ve tazelik eşikleriyle yerel fiyat + kapasite tek başına yeterli çıkmadı. Dolayısıyla mevcut veriniz önce değerlendirilir, fakat gereken seriler bugün API'ye düşebilir. Bunu değiştirmek için eksik kalite veya eksik işlem günleri tahmin edilmedi.

Denetim `node content/scripts/audit-trade-potential.mjs` ile yeniden çalıştırılabilir. Yalnız toplu sayılar raporlar; kişisel işlem/karakter ayrıntıları veya arşiv kopyası projeye kaydedilmez. SAT arşivine yazılmaz.

## Hesaplama

- Önce yerel kişisel Trade History; yetersiz ölçümler için AODP `/api/v2/stats/history`, `time-scale=24`, kalite 1. Sunucu, edinim/satış şehri, kalite ve işlem yönü ayrı anahtarlarla korunur. Saatlik fiyat arşivi hacim olarak kullanılmaz.
- Tamamlanmış UTC günleri kullanılır. En az %70 gün kapsamı, en az 5 işlemli gün ve son iki tamamlanmış gün içinde veri gerekir. Eksik günler sıfır satış sayılmaz; gözlenen hacim eksik günlere doğru büyütülmez.
- Günlük fiyat medyanının yarısından küçük veya iki katından büyük fiyatlı günler fiyat ve hacimden çıkarılır. İşlemli günlerin en az %80'i kalmalı; medyana göre göreli medyan mutlak sapma %35'i aşmamalı.
- HASAT fiyatı medyan ile miktar ağırlıklı fiyatın küçüğüdür; TOHUM/edinim fiyatı ihtiyatlı maliyet için büyüğüdür. Miktarı bilinmeyen kişisel fiyat örnekleri eşit örnek ağırlığıyla değerlendirilebilir; bu ağırlık satış/temin miktarı sayılmaz. Güncel fiyat yalnız karşılaştırma içindir; fiyat sıçraması history tahminini artırmaz.
- Üretim dönemi geçmiş döneme eşittir. Üretim, geri dönüş, girdiler, yem, şehir/Premium bonusları ve vergi ortak ada motorundan gelir. Focus mevcut slotlar dahil bu senaryodan çıkarılır; kayıtlı Focus tercihleri değiştirilmez.
- Aynı çıktının bütün slotları birleştirilir. Kişisel kapasite filtrelenmiş gerçekleşmiş miktar, API kapasitesi filtrelenmiş gerçek `item_count` toplamı × pazar payıdır. Satılabilir miktar = min(yem sonrası dönem arzı, kapasite). Girdilerin toplam dönem temin ihtiyacı da aynı kaynak ayrımıyla sınırlandırılır.
- Dönem neti = satılabilir miktarın vergi ve satış emri kurulum ücretinden sonraki geliri − **bütün dönemin üretim gideri**. Satılmayan üretimin maliyeti de ödenir; stokun geliri sıfırdır. İç yem için ortak motorun satış fırsat değeri ve dağıtım politikası kullanılır.
- Satış süresi = dönem arzı / (dönem kapasitesi / gün). Bu, üretim durdurulduktan sonra partinin satılma süresidir; devam eden aşırı üretim için stokun kendiliğinden biteceği varsayılmaz.
- Sayım araması sabit slotları her adayda içerir. Kapasiteli doğrusal gevşetmenin dual üst sınırıyla dallar elenir; karma başlangıç yalnız aramayı hızlandırır. Ortak motorun profilleri/yem dağıtımı üzerinden skorlanan nihai yerleşim tam ada motoruyla tekrar doğrulanır. Ek kazanç 0.01 gümüşü aşmadığında değişiklik uygulanmaz.
- Alış/satış fiyatı seçenekleri korunur. Potansiyel senaryosunun hem edinim hem satış fiyatları önce yerel history'den gelir; normal günlük kartlar mevcut fiyat seçenekleriyle hesaplanmaya devam eder. Ayrı dönem sonucu bu farkı açıklar.

## Veri erişimi

Mevcut 24 ürünlük batch ve 30 dakikalık sunucu/şehir/dönem/kalite önbelleği tekrar kullanıldı. History istekleri ortak, seri bir kuyrukta mevcut MARKET_COLLECTION_POLICY limitlerinden türetilen en az 1.25 saniye aralıkla çalışır. Başarısız veya eksik history geçerli hacim üretmez. Mevcut toplama servisleri ve fiyat arşivleri değiştirilmedi.

Yerel snapshot host'a göre 30 saniye önbelleklenir ve eşzamanlı istekler paylaşılır. Mevcut canlı Trade History olayları geldiğinde önbellek geçersizleşir; yeni SSE bağlantısı veya arka plan sorgulaması başlatılmaz. Arşiv tek geçişte sunucu/şehir/item/kalite/yön anahtarlarıyla indekslenir.

AODP belgesi: https://www.albion-online-data.com/api/ — history yalnız satış emirleri; günlük toplulaştırma 24; limitler 180/dakika ve 300/5 dakika. Bu kuyruk history için yaklaşık 48/dakika sağlar; aynı IP'deki diğer uygulamaların trafiğini kontrol edemez.

## Doğrulama

- `npm run island:test`: Günlük Kâr regresyonları dahil 50 ortak ekonomi kontrolü, 77 yerleşim optimizasyon kontrolü ve yeni history/kapasite/kaynak testleri.
- `ISLAND_TEST_FILTER="Sales potential"` ile dar motor testleri: yem fırsat maliyeti ve ortak profillerin tam motorla eşitliği; dolu slotların korunması; 60 geçerli üretim profili / 16 slot için yaklaşık 2.5–5.2 saniye arama; nihai kârın ortak motorla doğrulanması.
- Yüksek marj/düşük hacim, düşük marj/yüksek hacim, aynı ürünün birden fazla slotu, aşırı üretim/stok, eksik/eski history, ani fiyat sıçraması, düşen güncel fiyat ve tüm maliyetlerin ödenmesi test edildi.
- `test-trade-potential-evidence.mjs`: yerel alış/satış önceliği, yeterli yerelde sıfır API çağrısı, sadece eksik item isteği, yerel fiyat/API kapasite ayrımı, çift saymama, yanlış sunucu/şehir/kalite/yön, eksik kalite, eski/istikrarsız yerel history ve temin sınırları.
- Uçtan uca Potansiyel komutu: her iki yönü yeterli yerel senaryoda **0 API isteği**, dolu/kapalı slot ve TOHUM/HASAT seçimlerinin korunması, geçerli yerel önbellek kullanımı. Yetersiz iki kaynakta hesap uygulanmaz. Birden fazla slotun aynı tohumu tüketmesi ve iç yemin dış temin ihtiyacını azaltması test edildi.
- `npm run sat:trades:test` gerçek 16,760 kayıt üzerinde geçti. Testte eksik `AuctionEntry.Amount` için normalizer'ın belgelenmiş `null` değerine uygun beklenti düzeltildi; üretim normalizer davranışı değiştirilmedi.
- `npm run css:build`, `npm run css:check`, `npm run item-name:test`, mevcut `test-island-v2-volume.mjs` geçti. CSS kontrolü sıfır retired-class hatası, mevcut 22 advisory bulgu verdi.
- Tarayıcıda mod geçişi, 28 gün/%10 varsayılanları, kompakt ortak seçim bileşeni ve yeni moddaki doldurma kısıtları kontrol edildi. Görüntü: `island-sales-potential/controls.png`.

### Gerçek AODP örnekleri

12 Ekim 2026 00:32–00:42 Türkiye saati civarında Europe / Bridgewatch / kalite 1 için alınan yanıtlar `content/scripts/fixtures/island-sales-*-live.json` dosyalarında saklandı. Tamamlanmış 28 UTC günlük örnekte süt hacmi 690,892, esas geçmiş fiyatı 364.5; bal kabağı hacmi 1,006,473, geçmiş fiyatı 465. Güncel bal kabağı satış fiyatı 440, süt 518 idi. Bal kabağı tohumu fiyatı eksikti: motor sıfır maliyet varsaymadan bu üretimi eledi.

Önceki API satış senaryosunun bu gerçek fiyat/history örneğiyle bir mevcut süt slotu korunup üç açık slota süt eklendiğinde ortak motor doğrulaması yaklaşık 2,191,931 gümüş dönem neti, 1,643,948 gümüş ek net, 7.35 gün parti satış süresi verdi. Bu önceki senaryo güncel yem maliyetini kullanır; yeni Trade-first akışında edinim fiyatı/kapasitesi de history'den seçildiği için aynı kâr garanti edilmez. Bu bir hesap doğrulamasıdır; gerçekleşmiş kullanıcı satışı değildir.

## Doğrulanamayan varsayımlar / sınırlar

Pazar payı, gelecekteki fiyat/hacmin geçmişe benzemesi, referans üretim verimi ve günlük toplama düzeni tahmindir. AODP bütün piyasanın eksiksiz işlem defteri değildir; günlük toplulaştırmada tekil anormal işlemler ayırt edilemez. %70 kapsam, iki günlük tazelik ve fiyat sapması eşikleri ihtiyatlı ürün politikalarıdır; deneysel satış verisiyle kalibre edilmiş garantiler değildir.

Canlı doğrulama iki ürün, bir şehir, bir sunucu ve 28 günlük pencereyle sınırlıdır. Diğer şehir/sunucu ve özellikle 60/90 günlük yeterli kapsam garanti edilmez; yetersiz veri yerleşimi engeller. Elde önceden birikmiş kullanıcı stoku için mevcut modelde veri yoktur; gösterilen stok seçilen üretim partisinin kapasite fazlasıdır. Yeni mod ortak motorun mevcut yem dağıtım politikasını kullanır; bu politika ayrıca yeniden yazılmadı. Fiyat seçenekleriyle günlük kartlar ve history senaryosu farklı sonuç verebilir.

## Değişen dosyalar

- `content/js/core/market-history.js`: timestamp/count noktalarının korunması, kaliteye göre önbellek okuması, history kuyruğu.
- `content/js/core/trade-potential-evidence.mjs`: yerel indeks, alış/satış kanıtı, ölçüm bazında öncelik ve eksik veriler için API planlaması.
- `content/js/core/trade-config.mjs`, `content/js/core/trade-live.js`, `content/scripts/trade-hub.mjs`: ortak arşiv kaynak bağlamı, isteğe bağlı snapshot önbelleği.
- `content/js/core/island-sales-potential.mjs`: kanıt, güvenilir fiyat, dönem satış/stoğu ve sonuç modeli.
- `content/js/core/island/sales-bound.js`: ortak yem dağıtımıyla hızlı skor ve kapasiteye duyarlı üst sınır.
- `content/js/tools/island-planner-v2/optimizer.js`: isteğe bağlı skor/üst sınır ve karma başlangıç.
- `content/js/tools/island-planner-v2.js`: ortak motora senaryo fiyatı, yeni mod, güvenli uygulama ve açıklanabilir sonuç.
- `content/scss/app/_segmented-choice.scss`, `output/css/site.css`: ortak yoğun seçim boyutu.
- `content/scripts/test-island-economy.mjs`, `content/scripts/test-island-sales-potential.mjs`, `content/scripts/test-trade-potential-evidence.mjs`, `content/scripts/fixtures/island-sales-*-live.json`, `package.json`: regresyon ve gerçek veri testleri.
- `content/scripts/audit-trade-potential.mjs`, `content/scripts/sat-trades/self-test.mjs`: kişisel detayları kaydetmeden gerçek arşiv kapsam denetimi ve doğru normalizer sözleşmesi kontrolü.
- Bu rapor ve arayüz görüntüsü.

Çalışma alanındaki önceden mevcut diğer değişiklikler korunmuştur.
