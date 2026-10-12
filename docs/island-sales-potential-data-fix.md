# Ada Planlayıcı V2 — Satış Potansiyeli veri altyapısı düzeltmesi

> Bu rapor veri altyapısı düzeltmesinin önce/sonra kesitidir. Arşiv ve kaynak önceliği korunur; güncel hesaplama TOHUM P25 / HASAT P75 fiyat yöntemi ve günlük net kâr optimizasyonudur. Kapasite/stock davranışının yerini alan kurallar: [Potansiyel fiyat](island-potential-price.md).

Tarih: 12 Ekim 2026. Başlangıç kanıtı: [Trade History audit](island-trade-history-audit.md).

## Sonuç

Önceden dış history yoluna gönderilen **263 benzersiz item/şehir/kalite ölçümünün tamamı artık yerel AODP repository üzerinden karşılanıyor**. Bunlar 297 TOHUM/HASAT değerlendirmesine karşılık geliyor. Aynı gerçek veri kesitinde 28 günlük fiyat ve hacim sonuçlarının tamamı birebir aynı; piyasa güvenilirlik eşikleri değiştirilmedi.

Kaynak sırası kişisel SAT → yerel AODP satış repository → dış AODP olarak uygulandı. Fiyat ve kapasite bağımsız seçiliyor. Kişisel fiyatın üzerine API fiyatı yazılmıyor; kişisel adetler genel piyasa hacmine eklenmiyor. Kaynak değişimi seçimleri veya yerleşimi kendiliğinden değiştirmiyor.

Mevcut repository günlük satış bucket'larını aynı checkpoint/journal içinde biriktiriyor. Ayrı fiyat arşivi, ikinci kolektör veya yeni optimizasyon motoru oluşturulmadı. Migration gerçek eski checkpoint/journal yedeklerini de değerlendirdi; kalıcı checkpoint `salesHistoryVersion: 1` taşıyor. Canlı Ada ürünlerinde en uzun seri **32 gerçek günlük bucket**. Henüz yeterli 60/90 günlük seri yok.

## Ölçüm yöntemi ve sınırlar

- Karşılaştırmanın başlangıç verisi audit'in `2026-10-12T00:39:27.071Z` kesitidir. 180 kolektör ürününün 7 şehirdeki 1.260 satış satırı, aktif planlayıcının 113 ürünü ve 847 yönlü değerlendirmesi kullanıldı. Aynı item/şehir/kalite hem edinim hem satışta kullanılabildiğinden benzersiz fiziksel seri sayısı 791'dir.
- [Tekrar üretilebilir ölçüm JSON](island-sales-potential/data-fix-measurements.json) kaynak kesitlerinin SHA-256 değerlerini içerir. [Doğrulama betiği](../content/scripts/verify-island-history-local.mjs) önceki güvenilir fiyat/hacim sonuçlarını ve uygun ölçümlerin dış callback'e gitmediğini assertion ile kontrol eder.
- [Canlı hub ölçümü](island-sales-potential/data-fix-live.json) güncellenmiş Node endpoint'lerini salt okunur sorgular. 8 yerel HTTP isteğinde kapsamı filtrelenmiş kişisel kayıtlar ve 791 piyasa serisi döndü. Bu doğrulamada dış history ağına **0** istek gönderildi; eksik verinin dış callback'i yalnız spy idi.
- Arka plandaki normal kolektör trafiği bu 0 sayısına dahil değildir. Audit'te de dış API'nin yeni yanıtı ölçülmemişti. Önce/sonra API sayı modelleri canlı trafik veya API başarı garantisi olarak sunulmuyor.

## Önce/sonra kaynak kullanımı

Aynı veri kesiti ve UTC pencere sınırı, toplam 847 TOHUM/HASAT değerlendirmesi:

| Dönem | Önceden API yoluna giden uygun değerlendirme | Artık Yerel | Benzersiz yerel ölçüm | Yerel oranı | API/Karma sonucu* | Yetersiz |
|---|---:|---:|---:|---:|---:|---:|
| 7 gün | 298 | 298 | 264 | %35,18 | 0 / 0 | 549 |
| 14 gün | 295 | 295 | 261 | %34,83 | 0 / 0 | 552 |
| 28 gün | 297 | 297 | 263 | %35,06 | 0 / 0 | 550 |
| 60 gün | 0 | 0 | 0 | %0 | 0 / 0 | 847 |
| 90 gün | 0 | 0 | 0 | %0 | 0 / 0 | 847 |

\* Dış yanıt spy'ı boş olduğu için API/Karma başarı oranı ölçülemez; tabloda replay çıktısı gösterilir. Canlı yerel endpoint ölçümü de aynı geçerli seri adetlerini verdi. 28 günde 528 benzersiz ölçüm hâlâ dış kaynakla desteklenmeye adaydır; dış kaynak da yeterli değilse hesap yapılmaz.

28 günlük 297 değerlendirmede `price` ve `volume` için sıfır toleranslı eşitlik assertion'ları geçti. 7/14 günlük 298/295 güvenilir sonuç da aynı kontrolü geçti.

`Yerel` hem kişisel hem Node'da saklanan genel satış geçmişini kapsar. Arayüz ayrıca fiyat ve kapasite için **Kişisel SAT / Kişisel SAT performansı / Yerel AODP / Dış AODP** ayrımını gösterir. Yerel fiyat + dış piyasa kapasitesi `Karma` olarak gösterilir. İki yerel kaynak kullanıldığında genel etiket Yerel, ölçüm kökenleri ayrı kalır.

## Arşiv kapsamı ve migration

[Kalıcı repository checkpoint ölçümü](island-sales-potential/data-fix-repository.json), `2026-10-12T06:45:55.544Z` checkpoint'i:

| Ölçüm | Audit öncesi | Migration sonrası checkpoint |
|---|---:|---:|
| Toplam server/item/şehir/kalite satış serisi | 66.563 | 66.563 |
| Gerçek pozitif `item_count` içeren seri | 17.990 | 18.384 |
| En uzun gerçek günlük seri | 29 | 32 |
| 7 günlük güvenilir genel piyasa serisi | 2.211 | 2.211 |
| 14 günlük güvenilir genel piyasa serisi | 2.105 | 2.105 |
| 28 günlük güvenilir genel piyasa serisi | 2.102 | 2.102 |
| 60 / 90 günlük güvenilir seri | 0 / 0 | 0 / 0 |

Hacimli seri sayısındaki artış, boş yenilemelerin artık önceki gerçek satış günlerini silmemesinden ve mevcut yedeklerdeki satış günlerinin geri alınmasından kaynaklanır. Genel toplamlar checkpoint ölçümüdür; canlı journal ilerleyebilir. Bunlar kişisel işlemleri içermez.

Canlı aktif planlayıcı kapsamı: 113 ürün, 791 piyasa serisi, 707 pozitif hacimli seri; en eski raporlanan gün 9 Eylül, en yeni gün 10 Ekim. SAT'tan aynı 90 günlük ürün/şehir/kalite kapsamıyla 17 gerçekleşmiş kayıt döndü. Audit'teki 16.761 kişisel kaydın tamamı tarayıcıya taşınmadı. Kişisel kayıtlar mevcut tazelik ve gün sayısı koşullarıyla bu kesitte uygun fiyat/kapasite sağlamadı; bunun yerine kalite varsayılmadı veya eşik gevşetilmedi.

### Günlük birikim davranışı

- Kimlik: `server + item + şehir + kalite`, günlük alt kimlik: UTC gün. `avg_price`, `item_count`, orijinal timestamp, source ve `fetchedAt` korunur.
- Aynı günün daha yeni alınan kullanılabilir kaydı öncekinin yerini alır. Mükerrer veya düzeltme kayıtlarında adetler toplanmaz. Eski alınma zamanına sahip bir yanıt yeni düzeltmeyi geri alamaz. Eksik/geçersiz fiyat veya hacim içeren bir yenileme, önceki tam gözlemi silmez; farklı yanıtların fiyat ve adet alanları tek gözlem olarak birleştirilmez.
- Yanıtta bulunmayan günler oluşturulmaz. Boş yenileme daha önce bilinen günleri silmez. Fiyat ve işlem sayısı eksikliği hesaplama sırasında gerçek eksiklik olarak kalır.
- 90 tamamlanmış UTC gününün gerçek kayıtları saklanır; varsa bugünün raporlanmış bucket'ı hesaplara alınmadan korunur. Retention günlük timestamp'e göre uygulanır, yalnız son fetch zamanına göre değil.
- Kolektörün mevcut 28 günlük sorgusu devam eder. Her yenileme pencereyi büyüten gerçek günleri aynı repository'ye ekler. Bir serinin 60 günlük %70 kapsam için en az 42, 90 günlük kapsam için en az 63 tamamlanmış veri günü olması gerekir; 5 işlemli gün, 2 gün tazelik ve fiyat kontrolleri ayrıca geçmelidir. 32 günlük maksimum tüm ürünlere ait değildir ve süre sonunda uygunluk garantisi vermez.
- Migration v1 anchor'larını, write-once checkpoint ve journal yedeklerindeki gerçek satış olaylarını içeri alır. Quote geçmişi, kişisel kayıtlar ve journal sıra numarası geri alınmaz. `salesHistoryVersion: 1` sonraki başlangıçlarda pahalı migration'ın yeniden yapılmasını önler.
- Transaction append ve checkpoint dosyası fsync edilir; checkpoint/rotation rename ile değiştirilir. Checkpoint öncesi journal aynı sıra numarasıyla yeniden okunursa tekrar sayılmaz. Yalnız son satırdaki tamamlanmamış crash tail, orijinali yedeklenerek güvenli flush öncesi temizlenir; tam satırdaki JSON hatası ve sequence gap hata olmaya devam eder.

Kontrollü zaman testinde 100 günlük ardışık **sentetik** kolektör yenilemesi, 90 gerçek test bucket'ına ulaştı; 28/60/90 hesapları geçti. Bu test gerçek kullanıcıda 90 gün bulunduğu iddiası değildir. Aynı gün düzeltmesi, tekrar, restart, retention, backup migration ve torn-tail recovery ayrıca test edildi.

## API ve cache

Yerel history endpoint'i server/item/şehir/kalite/dönem ile filtreli, salt okunur erişim sağlar. Watched/discovery durumunu değiştirmez veya API çağrısı başlatmaz. Dış kaynak yalnız ayrı `external=1` isteğiyle kolektörün ortak request queue, cooldown/retry ve `collectionPlan` bütçesine girer. Budget 429 ise tarayıcıdan doğrudan API'ye kaçış yoktur. Hub erişilemezse geçerli kişisel ölçümler kullanılabilir; eksikler Yetersiz kalır.

Server'lar ayrı tutulur. Node yalnız yapılandırmada tanımlı server host'una çıkabilir; istemci bir dış host seçemez. Talep üzerine diğer server için alınan satış verisi de aynı çok-server repository ve ortak bütçeyi kullanır; otomatik kolektörün atanmış server'ı değişmez.

| Kontrol | Önce dış fetch sayısı | Sonra dış fetch sayısı |
|---|---:|---:|
| İki aynı pozitif sorgu | 1 | 1 |
| İki aynı boş history sorgusu | 2 | 1 |
| Aynı şehirler farklı sırada | 2 | 1 |
| Eşzamanlı iki aynı sorgu | 2 | 1 |
| Farklı kalite 1 ve 2 | 2 | 2 |
| Farklı dönem 28 ve 29 | 2 | 2 |

Bu tablo ağsız transport testidir. Pozitif TTL 30 dakika, negatif TTL 5 dakika, yerel snapshot TTL 30 saniyedir. Backend cache ve in-flight paylaşımı farklı tarayıcı sorgularını da birleştirir. UTC gün geçişi ayrı cache kimliğidir. Hata yanıtları boş history diye cache'lenmez; tekrar denenebilir.

Audit'in 7 şehir senaryosunda eski 24-item taşıma modeli soğuk cache ile 35 dış batch üretirdi. Sadece 263 uygun ölçümü yerelden almak bu modelde 26 batch'e düşerdi (9 gereksiz batch, %25,71). Yeni URL uzunluğuna göre batch'leyen ortak kolektör yolu bu kesitte kalan 528 ölçümü **7 dış URL batch'ine** sığdırır; toplam model azalması %80'dir. Bu bir cold-cache modelidir, gerçek canlı dış çağrı ölçümü değildir. Uygun 263 ölçümün dış isteğe dahil edilme sayısı gerçek replay assertion'larında **0**.

## Ayrı kişisel güvenilirlik politikaları

Genel piyasa fiyat/hacim politikasında %70 veri günü, en az 5 işlemli gün, son 2 gün tazelik, %80 fiyat inlier'ı, 2× fiyat bandı ve %35 maksimum median sapması aynen korundu.

Kişisel **fiyat** politikasında pazarın günlük %70 gözlem koşulu uygulanmaz: kişisel kullanıcı her gün işlem yapmayabilir. En az 5 ayrı gerçekleşmiş işlem günü, aynı tazelik ve aynı robust fiyat kontrolleri gerekir. Miktarı bilinmeyen fiyatlar yalnız fiyat oyu olabilir; hacim sonucu üretilmez. Bu açık politika ayrımı genel piyasa eşiklerini gevşetmez ve gerçek kesitte uygun kişisel seri icat etmedi.

Kişisel **performans/kapasite** için miktarların tamamı bilinen gerçek pozitif tamsayılar olmalı; günlük kapsam/tazelik/fiyat kontrolleri ayrıca geçmelidir. Hacim kişisel performanstır, genel piyasa hacmi veya pazar payı değildir. Kişisel ve genel hacimler hiçbir zaman toplanmaz.

Eksik kalite `null` kalır; quality 1'e dönüştürülmez. SAT integer `Id` token'ları JSON sayı ayrıştırmasından önce string olarak korunur. String içindeki CSV/JSON metinlerine dokunulmaz. Gerçek 16.761 kayıt normalizasyonu, watcher reload ve duplicate suppression testleri geçti; bitişik Int64 fixture'ları farklı Id olarak korunuyor. Audit'te bulunan 725 güvensiz numeric Id ve 68 collision grubu artık ham dosya okuma yolunda sayı yuvarlamasına uğramaz.

Son salt okunur Id doğrulamasında kullanıcı arşivi 10 yeni kayıtla 16.771 satıra ilerlemişti: 16.771 Id'nin tamamı string, 16.403 farklı Id ve 368 tekrarlanan Id satırı bulundu. Audit'in kayıpsız 16.393 farklı Id sayısına tam 10 yeni Id eklenmiş oldu; eski numeric parse yolundaki 15.969 sayısına dönülmedi. Potansiyel evidence index'i aynı server/Id'yi bir kez sayar; duplicate testlerinde hacim artmaz. Bu son kişisel sayım, önce/sonra piyasa fiyat karşılaştırmasının sabit veri kesitinden ayrıdır.

## Gerçek ürün örnekleri — 28 günlük aynı kesit

Tüm satırlarda fiyat/hacim kaynağı Yerel AODP, dış isteğe dahil edilme 0 ve önceki güvenilir sonuçla eşitlik doğrulandı. Adet genel piyasa satış adedidir; edinim yönünde temin senaryosunun girdisidir.

| Ürün | Şehir | Yön | Fiyat | Adet | Veri günü |
|---|---|---|---:|---:|---:|
| T1_CARROT | Martlock | HASAT | 460 | 3.067.893 | 27 |
| T1_FARM_CARROT_SEED | Martlock | TOHUM | 2.170 | 51.446 | 27 |
| T2_BEAN | Martlock | HASAT | 428 | 391.426 | 27 |
| T2_FARM_BEAN_SEED | Brecilien | TOHUM | 2.767,1094 | 4.267 | 27 |
| T2_AGARIC | Martlock | HASAT | 431,5654 | 238.251 | 27 |
| T3_WHEAT | Bridgewatch | HASAT | 498 | 1.179.625 | 27 |
| T3_FARM_WHEAT_SEED | Bridgewatch | TOHUM | 5.088 | 24.639 | 27 |
| T3_COMFREY | Martlock | HASAT | 465 | 318.346 | 27 |
| T4_TURNIP | Fort Sterling | HASAT | 406 | 3.201.024 | 27 |
| T4_FARM_TURNIP_SEED | Fort Sterling | TOHUM | 8.429,0062 | 24.348 | 27 |
| T4_BURDOCK | Martlock | HASAT | 495 | 276.612 | 27 |
| T5_CABBAGE | Martlock | HASAT | 501 | 1.332.556 | 27 |

## Doğrulama ve regresyon

Başlangıçta ada testleri, kolektörün 12 kontrolü ve collection-plan testi geçti. Market history suite mevcut VM harness'ta `OpportunityEvidenceRepository` tanımı eksik olduğu için çalışmadı; gerçek repository yerine harness'a salt test stub'ı eklenerek düzeltildi. Varsayılan eski Node ile Flipper data testi `signal.throwIfAborted` eksikliğinde durdu; projenin Node >=22 şartını sağlayan bundled Node 24.19.0 ile değiştirmeden geçti.

Son doğrulamalar:

- `island:test`: 51 ekonomi, 77 placement kontrolü; günlük fiyat yöntemleri, Buy/Sell/4H/UV, yem aktarımı, seed/offspring maliyeti, Focus ve kapalı/yerleşik slotların korunması; Potansiyel fiyat/edinim/satış kapasitesi ve gerçek fixture kontrolleri geçti.
- `prices:history:test`: market order geçmişi, UTC, kimlik, retention, hub ingest/routes; yeni daily archive, migration, duplicate, düzeltme, restart, torn-tail, readonly filtre, bilinmeyen kalite; browser/backend negatif cache ve in-flight testleri geçti.
- `prices:collector:test` ve `prices:collection:test`: existing kolektör, quote referansları, URL limitleri, 429 retry ve katalog kapsamı geçti.
- `sat:trades:test`: gerçek 16.761 kayıt, miktar/total normalizasyonu, watcher duplicate suppression geçti.
- `flipper:test`, `decision:test`, `item-name:test`, `css:check`: geçti. CSS kontrolünde 0 retired-class hatası ve mevcut 22 advisory var.
- Potansiyel seçme/render etme tek başına history akışını başlatmıyor. Günlük mod auto-fill için yeni SAT/AODP sales-history endpoint'lerine 0 çağrı assertion'ı var. Yerleşim yalnız açık auto-fill komutunda değişiyor; yetersiz veri veya iptal yerleşimi koruyor.

Potansiyel hesabının feed/economy/optimizer motorları bu altyapı adımında değiştirilmedi. Kaynak ve ölçüm kökeni açıklamaları arayüze eklendi; item-name ortak kopyalama yolu korunuyor. Büyük journal başlangıcında audit ring'in her satırda kopyalanması da saptandı; aynı son audit kayıtları transaction başına bir kez sınırlandırılarak replay maliyeti azaltıldı.

## Kalan veri eksikleri

28 günlük 550 değerlendirme / 528 benzersiz ölçüm hâlâ en az bir güvenilir ölçümden yoksun. İlk audit'in eksik kalite, yanlış şehir/yön, eski veri, kapsam ve fiyat sapması teşhisleri geçerlidir. Dış kaynak yalnız eksikleri deneyecek; başarısız veya yetersiz yanıttan fiyat, sıfır maliyet ya da sınırsız hacim çıkarılmayacak.

60/90 gün için storage artık birikebilir; mevcut gerçek verinin gerekli kapsamı karşıladığı iddia edilmiyor. Arşiv günleri biriktikçe aynı politika otomatik tekrar değerlendirilebilir; kullanıcı seçimleri veya ada yerleşimi bu yüzden otomatik değişmez. Yeni toplama servisi kurmak veya piyasa eşiklerini düşürmek yerine mevcut kolektörün gerçek günlük sonuçlarını korumak yeterlidir.
