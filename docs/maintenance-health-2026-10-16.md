# Genel bakım ve sağlık kontrolü — 16 Ekim 2026

Mevcut kullanıcı değişiklikleri korunarak iki uygulama hatası düzeltildi. Hesaplama formülleri, fiyat kabul kuralları, tasarım, rotalar ve veritabanı şeması değiştirilmedi. Gerçek veritabanına yalnızca salt okunur bağlantıyla bakıldı; yazma, aktarım ve yedekten kurtarma testleri geçici SQLite dosyalarında çalıştırıldı.

## Düzeltilen sorunlar

- `content/js/core/durable-storage.mjs`: Bir yazmayı bekleyen birden fazla `flushDurableWrites()` çağrısı, sonraki düzenlemeyi eşzamanlı gönderebiliyordu. Bekleyen çağrı artık yeni başlamış yazmayı da bekliyor. Kontrollü regresyonda sonraki düzenleme için istek sayısı **3 → 1**; son değer korunuyor ve aynı istemciden kaynaklanan revision çakışması oluşmuyor. `content/scripts/test-durable-storage.mjs` eklendi ve `package.json` içindeki `data:test` zincirine alındı.
- `content/js/core/flipper-data.js`: İlk taramanın döndürdüğü zaman damgası ile önbelleğe yazdığı zaman damgası ayrı üretiliyordu. Tek `fetchedAt` değeri iki yerde kullanılıyor. Fiyatlar, puanlar, ücretler ve önbellek süresi değişmedi. `test-flipper-data.mjs` saati kontrollü ilerleterek milisaniye farkını deterministik yakalıyor.
- `test-item-name.mjs` ve `test-opportunity-quality-ui.mjs`: Güncel şehir ve filtre bileşenlerini boş stub ile değiştiren eski test bağlantıları onarıldı. `fixtures/city-presentation-vm.mjs` gerçek ortak şehir bileşenlerini yükler. Şehir kimliği, dil ve rota sırası doğrulanır; mevcut hesaplama beklentileri gevşetilmedi.
- `test-tool-viewport.cjs`: Mobil ve kısa masaüstü kapsamı, tarayıcı runtime hata kontrolü ve `finally` içinde geçici SQLite/bağlam temizliği eklendi. Eksik genel API stub yerine kanonik boş kanıt verisi kullanıldı; fırsat servisi yokluğu açık 503 yanıtıyla sınanıyor.

## Temizlik ve performans

Flipper'daki yinelenen zaman damgası üretimi kaldırıldı; şehir testi bağımlılıkları ortak fixture üzerinden yükleniyor. Kullanılmadığı kanıtlanamayan üretim kodu veya bağımlılık silinmedi. Yeni bağımlılık eklenmedi.

Ölçülen iyileşme yukarıdaki eşzamanlı yazma senaryosunda 3 isteğin 1'e düşmesidir. Uygulama açılış süresi veya genel bellek tüketimi için önce/sonra hızlanma iddiası yoktur. Mevcut performans regresyonu 25.210 karşılaştırmada **0 sonuç farkı** verdi; 2.520 serilik ölçüm 5.101 ms soğuk / 108 ms sıcak, yaklaşık 142 MB heap bildirdi. Bunlar bu çalışmanın hız kazanımı değildir.

## Doğrulama

- **Geçti:** Node 24.19.0 ile tam `npm test`; veri/backup/restore, katalog, karar, seçim, şehir, tooltip, kopyalama, fiyat geçmişi/toplama, fırsatlar, ada, laborer, 26 rota ve Flipper kontrolleri.
- **Geçti:** `app:ui:test`: 22 sayfanın açılış sırası ve konsol kontrolü; admin oluşturma/düzenleme, reddedilen yazmanın korunması, tarayıcı depolaması kapalı kullanım, yeni profilden yükleme ve ada planı checkpoint/retry davranışı.
- **Geçti:** Ek `trade-journal:test`, `item-market:test`, `potential:personal:test`, `opportunities:regression:test`, `result-controls:ui:test` ve `potential:refresh:test`. Sonuç kontrolleri 1440/992/390 px'te sınandı.
- **Geçti:** İlk masaüstü viewport paketi, 1440×900 / 1280×720 / 992×600.
- **Geçti:** Genişletilmiş viewport paketi: 23 araç × 6 boyut, toplam 138 açılış. 1440×900 / 1280×720 / 992×600 / 992×480 / 390×844 / 320×740. Yatay taşma, masaüstü sayfa taşması, kırpılan floating label veya tarayıcı runtime hatası bulunmadı. Mobil dikey sayfa kaydırması korundu. Bu paket başlangıç/boş durumları sınar.
- **Geçti:** Sass derlemesi ayrı dosyaya yapıldı; mevcut `output/css/site.css` ile hash eşit. CSS mimarisinde 0 hata; 21 tavsiye ve 194 kullanılmayan/dinamik selector adayı var.
- **Geçti:** 348 JS/MJS/CJS dosyasında sözdizimi; üretim JS dosyalarının yerel importları; 26 sayfa ve derlenmiş CSS'teki 216 statik asset referansı. Eksik referans bulunmadı. Kontrol edilen 8 masaüstü PNG başlık görseli 2000×200.
- **Geçti:** Gerçek SQLite `PRAGMA quick_check = ok`; 116 veri anahtarı ve 20.830 tablo satırı gözlendi. Bu kontrol tüm arşiv içeriğinin anlamsal doğruluğu iddiası değildir.

## Kalan konular ve sınırlar

- `opportunities:v6:ui:invariance`, bakım öncesinde de `market-opportunity-scan.mjs` için eski hash referansıyla uyuşmadı. Bu dosyaya ve baseline'a dokunulmadı; kontrol gevşetilmedi.
- `css:ui:test` ve `item-market:ui:test`, sandbox içinde `ERR_NETWORK_ACCESS_DENIED` ile durdu. Bu iki senaryo başarılı sayılmıyor. İzole açılış, viewport, sıralama ve potansiyel fiyat UI kontrolleri ayrı sonuçlardır.
- Yedekleme testindeki ilk `EPERM` ve izole açılış testindeki ağ engeli, aynı testler sandbox dışında çalıştırıldığında ortadan kalktı.
- Dış AODP servisine canlı yük testi yapılmadı; gerçek fiyat arşivleri yenilenmedi. Uzun süreli bellek profili ve bütün dolu liste/dialog kombinasyonları bu doğrulamanın kapsamı değildir.
- CSS adayları dinamik kullanımları nedeniyle otomatik silinmedi; fiyat/karar algoritmalarında geniş refactoring yapılmadı.

Sonraki bakım için öncelikler: (1) iki yerel sunucuya bağımlı UI testini geçici veriyle tamamen izole etmek, (2) V6 tarihsel invariance baseline'ını değişiklik geçmişiyle ayrıca değerlendirmek, (3) CSS adaylarını gerçek dinamik durum kapsamıyla tek tek doğrulamak.

Yerel test kayıtları: `output/maintenance-health/*.log`. Commit veya push yapılmadı.
