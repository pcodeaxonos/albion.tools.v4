# Günün Fırsatları — Final Teslim

## Tamamlanan son düzeltmeler

- Market Hub, güvenli SIGTERM kapanışından sonra son kaynak koduyla yeniden başlatıldı. Fırsat API'si, fiyat API'si ve ayrı kalıcı tarama tanısı canlı serviste doğrulandı.
- Albion Data Client emir paketlerindeki pozitif tam sayı miktar artık emir başına `observedAmount` ve paket alınma zamanı ile saklanıyor. Eksik miktar `null` kalıyor. Kısmi paket ve bilinmeyen kaynak zamanı nedeniyle bu alan toplam/güncel emir kapasitesi olarak sunulmuyor; oyun içi kontrolde kullanıcı gördüğü fiyatı ve miktarı kaydediyor.
- Tarama ve performans tanıları ana fırsat listesinden kaldırılıp yalnız açıldığında gösterilen pencerelerde tutuluyor. Eski testlerin satır içine gömülü performans raporu varsayımları popup akışına uyarlandı.
- Şehir ve strateji filtresi, tarafların ayrı kontrolü, kalıcı kayıt, gerçek işlem başlangıcı, kısmi gerçekleşme/satış, iptal, FIFO muhasebesi ve performans raporu gerçek snapshot ve geçici test deposuyla uçtan uca çalıştırıldı.
- Playwright 1.64.0 proje `devDependency` ve lockfile'a eklendi; sistem Chrome'u ile masaüstü ve mobil tarayıcı testleri çalıştırıldı.

## Gerçekten çalışan özellikler

- Canlı Hub son taraması: 30.766 hücre, 22 fiyat kanıtlı fırsat, 242 izleme adayı; sunum gruplaması sırasıyla 22 → 14 ve 242 → 233. Bu tarama `scanId=00ca7335-917a-4aea-be31-0dac732c0b98` ve snapshot kimliğiyle kalıcı tanıya yazıldı.
- Son canlı collector turu: 61/61 başarılı HTTP isteği, 18.203 geçerli fiyat tarafı, 272 yeni kaynak-zamanlı fiyat olayı, 17.910 tekrar, 21 eski kaynak zamanı, 16.626 altı saat veya daha eski taraf, 234 yeni saatlik arşiv kaydı. HTTP başarısı yeni piyasa olayı sayısından ayrı tutuluyor.
- Tarama tanısı ve istemci filtre kayıtları fiyat arşivinden ayrıdır; ortak `scanId`, snapshot kimliği, grup öncesi/sonrası sayıları, eleme nedenleri, filtre sonrası gösterilen sayı, collector turu ve ham JSON dışa aktarımı çalışıyor. Kayıt deposu sınırlandırılmış ve yeniden başlatma sonrasında kalıcı.
- Başlangıç snapshot'ı üzerinden şehir/strateji filtresi, fırsat gerekçesi ve iki taraflı oyun içi kontrol; geçici depoda mükerrer isteğe dayanıklı kalıcı kayıt; gerçek alış, kısmi satış, açık emir, dolum, iptal, tamamlanma ve FIFO net sonuç akışı çalışıyor.
- Market Hub'dan alınan oyun paketi miktarı tek emir için gözlem kanıtıdır. Mevcut eski önbelleklerde miktar alanı bulunmadığından bunlar geriye dönük doldurulmadı; son yeniden başlatmadan sonra yeni oyun paketi gelmediği için canlı önbellekte miktar doğrulaması henüz yok.

## Geçen ve geçmeyen testler

- **Geçti:** `npm run opportunities:test` — V3/V4/V5/V6 keşif ve muhasebe regresyonları ile tanı testleri; V5 değişmezliği ve FIFO/kısmi işlem kontrolleri dahil.
- **Geçti:** `npm run prices:collector:test` — 12 AODP collector testi.
- **Geçti:** `npm run prices:collection:test` — 9.508 ürün, 180 ada ürünü ve 61 URL partisi.
- **Geçti:** `content/scripts/test-market-order-history.mjs` — paket miktarının emir başına korunması, bilinmeyen miktarın `null` kalması, kısmi kapsam ve kaynak zamanı ayrımı dahil.
- **Geçti:** `content/scripts/test-opportunity-v6-ui.cjs` — gerçek dondurulmuş fiyat snapshot'ı ve izole geçici işlem deposu; şehir/strateji filtresi, iki ayrı kontrol, kayıp yanıt sonrası aynı kimlikle tekrar deneme, kısmi işlem/satış, iptal, tamamlanma ve FIFO.
- **Geçti:** `content/scripts/test-opportunity-v6-redesign.cjs` — popup görünürlüğü, açılır menü, kart/filtre taşması ve 1920, 1440, 1280, 768 ve 390 px görünüm kontrolleri.
- **Geçti:** `npm run css:check` — emekli sınıf hatası yok; 22 mimari uyarı mevcut ve bu işte CSS eklenmedi.
- **Canlı geçti:** Market Hub `/api/v2/stats/status`, fiyat endpoint'i, `/api/v1/market/opportunity-diagnostics` ve gerçek fırsat taraması. Son collector turu 61 başarılı istekle tamamlandı.
- **İlk denemede başarısız, düzeltilip yeniden geçti:** Playwright testleri eski satır içi rapor seçicisini kullanıyordu. Seçiciler mevcut popup akışına uyarlandı; son masaüstü/mobil tekrarları geçti.
- **Test dışı güvenlik denetimi bulgusu:** `npm audit` dört yüksek önem seviyeli geliştirme bağımlılığı buldu: doğrudan Sass 1.77.8 ve `braces`, `chokidar`, `source-map-js`. Sass sürümü bu teslim kapsamı dışında bırakıldı; çalışma anı bağımlılığı değiller.

## Bilinen dış veri sınırlamaları

- AODP fiyatı kaynak tarafından gecikebilir; yeni HTTP yanıtı fiyatın yeni kaynak zamanı taşıdığını kanıtlamaz.
- Satış geçmişi hareketlilik göstergesidir; emir derinliği, mevcut kapasite veya dolum süresi değildir.
- Oyun paketlerinde ürün, şehir, kalite, yön, fiyat, tek emir miktarı ve sona erme bilgisi bulunabilir. Emir oluşturulma zamanı, tam defter snapshot'ı ve güvenilir silme olayı yoktur; paket alım zamanı kaynak fiyat zamanı değildir. Eksik/eskimiş paket miktarları güncel kapasite sayılmaz.
- Fiyatın, emrin ve miktarın oyun içinde hâlâ geçerli olduğunu kullanıcı ayrı kontrol etmelidir. Kaydedilmemiş veya gerçekleşmemiş satışlardan kesin kâr üretilmez.

## Kullanıma hazır olma durumu

Günün Fırsatları günlük kullanım için hazır. V6 keşif, referans, altı saatlik tazelik, strateji, sıralama ve muhasebe davranışı korunuyor; canlı servis çalışıyor, tarama ve collector kanıtları kalıcı kaydediliyor, oyun içi kontrol ve gerçek işlem akışı doğrulandı. Kararlar mevcut veri sınırlarını ve kullanıcı kontrolünün gerekliliğini açıkça gösteriyor.
