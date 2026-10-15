# Ada Planlayıcı V2 — Potansiyel fiyat yöntemi

> Güncel algoritma ve doğrulama: [Potansiyel fiyat v2](potential-price-v2.md). Aşağıdaki metin önceki sürümün tarihsel kaydıdır.

12 Ekim 2026. Bu belge, önceki satış kapasitesi/stock modu yerine uygulanan güncel P25/P75 fiyat kurallarını açıklar. Yerel repository, 90 günlük birikim, filtreli Node erişimi ve ortak API bütçesi korunmuştur.

## Davranış

TOHUM ve HASAT fiyat düğmelerine ayrı **Potansiyel** seçeneği eklendi. TOHUM seçimi yalnız edinim girdilerini (tohum/yavru, gerekli yem ve binek malzemesi), HASAT seçimi yalnız satış girdisini belirler. Diğer taraftaki Buy/Sell/4H/UV/Sabit seçimi korunur.

Varsayılan geçmiş 28 gün; 7/14/28/60/90 dönem seçenekleri yalnız Potansiyel seçiliyken görünür. Seçim fiyatları yeniler, slotları doldurmaz. Otomatik Doldur açık kullanıcı komutuyla, mevcut günlük optimizer ve ekonomi motoruyla çalışır:

`net kâr/gün = günlük net satış geliri − günlük toplam üretim giderleri`

Geçmiş adetler yalnız fiyatın ağırlığı ve güvenilirlik kanıtıdır. Pazar payı, stok simülasyonu, tarihsel satış/temin kapasitesi ve minimum satış hacmi filtresi Potansiyel optimizasyonunda uygulanmaz. Kullanıcının eski hacim filtresi ayarı silinmez; Potansiyel kapatıldığında mevcut eski davranış devam eder. Dolu ve kilitli slotlar korunur; boşaltarak doldurma ve alternatiflerle boşaltma Potansiyel seçiminde çalışmaz.

Focus, yem aktarımı, üretim/yield/return, vergi ve ücretler mevcut ortak motor üzerinden hesaplanır. Potansiyel özel bir üretim veya optimizasyon motoru oluşturmaz. Eski fiyat yöntemlerinin hesap kodları değiştirilmedi.

## Miktar ağırlıklı fiyat

Ayıklanmış fiyatlar artan sıraya dizilir. Toplam gerçek miktar `Q` için kümülatif miktarı ilk kez `0,25 × Q` sınırına ulaşan fiyat TOHUM P25, `0,75 × Q` sınırına ulaşan fiyat HASAT P75 olur. Bu, ağırlıklı ampirik dağılımın ters CDF tanımıdır; fiyatlar arasında yeni bir fiyat uyduran interpolasyon yapılmaz.

Kişisel kayıtta gerçek execution miktarı kullanılır; emir büyüklüğü kullanılamaz. Miktarı, tarihi, fiyatı, kalite veya bağımsız Id'si güvenilir olmayan kayıtlar fiyat kanıtı olamaz. Aynı server/Id bir kez sayılır; gerçekleşmemiş emirler, crafting ve transferler katılmaz.

Fiyat tam silver hassasiyetine yuvarlanır: edinimde yukarı, satışta aşağı. Geçmiş fiyata canlı Buy/Sell defterinin ±1 tick'i tekrar eklenmez. Ortak motorun ücret ve vergi katmanı normal biçimde uygulanır; tarihsel yöntem normal ücretli emir varsayımını kullanır. Pozitif, güvenli bir silver fiyatı üretilemiyorsa sonuç bilinmiyor kalır.

AODP `avg_price` noktalarında aynı CDF, `item_count` ağırlığıyla hesaplanır. Sonuç açıkça **günlük ortalama fiyat dağılımının dilimi** olarak etiketlenir. Bu değer kişisel tekil işlem yüzdeliği veya gerçek tekil piyasa işlem dağılımı olarak sunulmaz. AODP işlem sayısı bilinmez; yalnız gerçekleşen item adedi ve veri günleri gösterilebilir.

## Kaynaklar ve güvenilirlik

Ortak `resolveTradePotential` resolver'ının varsayılan yolu artık yalnız fiyat üretir:

1. Aynı server/şehir/item/kalite/yönde gerçekleşmiş kişisel SAT işlemleri.
2. Aynı kimlikte yerel AODP satış repository.
3. Yalnız eksik kalan kimlikler için ortak kolektör bütçesiyle dış AODP API.

Yeterli kişisel fiyat değiştirilemez. Kişisel alış ve satışlar ayrı index'lerde değerlendirilir. Kaynak serileri veya hacimleri körlemesine birleştirilmez. Yerel genel fiyat yeterliyse dış istek yapılmaz. Kaynakların hiçbiri yeterli değilse başka fiyat yöntemine sessiz fallback yapılmaz; quote `null`, fiyat bilinmiyor olur.

AODP'nin Sell gerçekleşmeleri TOHUM edinim fiyatına piyasa geçmişi kanıtı olabilir; kişisel alış başarısını veya geçmiş Buy emri gerçekleşmesini kanıtlamaz. Bu açıklama ilgili TOHUM fiyatlarının metadata'sında bulunur.

### Kişisel kabul

- Ayıklama sonrası en az 5 ayrı UTC işlem günü ve 10 bağımsız execution.
- Son uygun execution en fazla 7 günlük; gelecekteki kayıtlar dışlanır. Kişisel dönem gerçek zamandan geriye doğru seçilir; bugünkü gerçekleşmiş işlemler de filtreli SAT endpoint'inden gelir.
- Günlük miktar ağırlıklı medyanlardan sağlam fiyat merkezi belirlenir. Mevcut 2× anomali bandı, %80 inlier ve %35 dispersion değerleri kullanılır. Kişisel inlier payı ve median mutlak sapma miktarla ağırlıklıdır; çok sayıda küçük işlem büyük miktardaki kanıtı yapay biçimde yenemez.
- Seçilen alt/üst fiyat diliminde tek bir execution veya tek bir UTC gün **%50 veya üzeri** miktar taşıyorsa fiyat reddedilir. Bu oranlar “domine etmemeli” şartının somut uygulamasıdır. Sınır fiyatına eşit işlemlerin tamamı destek kümesine alınır; aynı fiyatın farklı günlerde tekrar etmesi kayıt sırasından dolayı yanlış reddedilmez.
- Eksik kaliteye quality 1 atanmaz. Kişisel miktarı bilinmeyen kayda fiyat oyu/miktar 1 atanmaz.

### Genel geçmiş kabulü

Mevcut %70 gün kapsamı, 5 işlemli gün, 2 gün tazelik ve mevcut fiyat güvenilirliği mekanizması korunur. Tamamlanmış UTC günlük noktalar değerlendirilir; eksik günler sıfır satış olarak üretilmez. P25/P75 yalnız ayıklanmış fiyat noktalarından hesaplanır. Elenmiş yeni bir anomali, geriye kalan fiyatları taze gösteremez: ayıklama sonrası işlemli gün ve son geçerli fiyat günü aynı 5 gün / 2 gün kurallarıyla tekrar kontrol edilir.

Cache kimliklerinde server, şehir, item, kalite ve dönem ayrımı korunur. Fiyat kanıtı kendi dönemine ve tazelik süresine göre geçersizleşir; eski dönem cache'i yeni dönem için kullanılmaz. Potansiyel seçili değilse bu resolver ve yeni geçmiş akışı çalışmaz. Eski 4H/UV gibi ayrı seçilen tarihsel yöntemlerin mevcut istekleri korunur.

## Arayüz bilgileri

Sonuç tablosunun altındaki fiyat kanıtları bölümünde her fiyat için:

- Fiyat veya bilinmiyor; P25/P75 ve kaynak Kişisel / Yerel AODP / API.
- Dönem, kullanılan veri günü, biliniyorsa bağımsız execution sayısı ve gerçek item adedi.
- Kişisel son geçerli işlem tarihi veya AODP son geçerli veri günü.
- Kanıt tipi, uygun/yetersiz durumu ve eleme gerekçesi.
- Avantajlı tarihsel fiyatın gelecekteki execution garantisi olmadığı açıklaması.

Item adları ortak `itemNameHtml` yoluyla mouse ve Enter ile tam isim olarak kopyalanabilir. Yeni fiyat seçenekleri ortak segmented-choice bileşenini kullanır; dar panellerde tam etiketleri sarabilen ortak modifier eklendi.

## Gerçek veri kontrolü

[Ölçüm JSON](island-sales-potential/potential-price-measurements.json), ilk audit'in 12 Ekim `00:39:27.071Z` gerçek AODP kesitinde, 28 gün için tekrar hesaplandı. Bu public fixture kişisel kayıt içermez; dış callback yalnız spy'dır, dış ağa istek yapılmadı.

| Ölçüm | Sonuç |
|---|---:|
| TOHUM/HASAT fiyat kimliği | 847 |
| Güvenilir yerel fiyat | 296 |
| Benzersiz güvenilir yerel item/şehir/kalite | 262 |
| P25 | 161 |
| P75 | 135 |
| Bilinmiyor | 551 |
| Yeterli yerel ölçümün dış isteğe gönderilmesi | 0 |

Önceki 297 / 263 sayısından bir ölçüm farklıdır: **Martlock T4_MILK HASAT**. 10 Ekim günlük noktası 726 silver / 70 item ile mevcut anomali bandında eleniyor. Son kabul edilen nokta 9 Ekim, 411 silver / 6.433 item. 12 Ekim UTC penceresinde bu tarih 2 günlük tazelik şartının dışındadır. Fiyat bilinmiyor bırakıldı; yeni anomali eski fiyatı tazelemedi. Sayısal güvenilirlik eşikleri düşürülmedi.

Gerçek örnekler; tamamı Yerel AODP günlük ortalama dağılımıdır:

| Item | Yöntem | Silver |
|---|---|---:|
| T1_CARROT | P75 | 500 |
| T1_FARM_CARROT_SEED | P25 | 2.127 |
| T2_BEAN | P75 | 456 |
| T2_FARM_BEAN_SEED | P25 | 2.630 |
| T2_AGARIC | P75 | 454 |
| T3_WHEAT | P75 | 540 |
| T3_FARM_WHEAT_SEED | P25 | 4.615 |
| T3_COMFREY | P75 | 528 |
| T4_TURNIP | P75 | 460 |
| T4_FARM_TURNIP_SEED | P25 | 8.257 |
| T4_BURDOCK | P75 | 507 |
| T5_CABBAGE | P75 | 566 |

## Testler

- `test-potential-price.mjs`: miktar ağırlıklı P25/P75, tam silver, 5 gün / 10 execution / 7 gün, uç fiyatlar, çok sayıda küçük fill, tek büyük fill, gün/işlem/dilim dominansı, duplicate, eksik kalite/miktar/Id, gelecekteki/eski kayıtlar, cache dönem/tazelik, yerel/API fallback ve Buy/Sell yön ayrımı.
- `island:test`: 51 ekonomi ve 77 placement kontrolü ile mevcut fiyat yöntemleri/üretim motoru regresyonları geçti. Yeni integration testinde yalnız 10 tarihsel adet bulunmasına rağmen normal üretim yerleşimi yapıldı; eski 1.000.000 minimum hacim ayarı Potansiyel'de uygulanmadı. Dolu/kilitli slotlar aynı nesne olarak kaldı. Aynı fiyat girdilerinde ortak motorun sonuçları sıfır toleransa yakın eşleşti.
- `test-potential-price-ui.cjs`: izole Chrome, desktop/mobile; TOHUM/HASAT bağımsız seçim, slot değiştirmeme, metadata, tam etiketler, mouse/Enter item kopyalama. İki filtreli kişisel sorgu, sıfır genel/dış history sorgusu. Tüm API'ler testte mock'lanır; gerçek kullanıcı planı veya arşivi yazılmaz.
- `prices:history:test`, `item-name:test`, `flipper:test`, `decision:test`, CSS build/check geçti. CSS: 0 retired-class hatası, mevcut 22 advisory.

Görseller yalnız sentetik UI fixture'ıdır: [masaüstü](island-potential-price/desktop.png), [mobil](island-potential-price/mobile.png). Önceki kapasite/stock helper'ları tarihsel audit testleri için açık legacy seçenekle tutulur; güncel planlayıcı bunları çağırmaz. Aynı günlük optimizer kullanılır.
