# Eşya Piyasası yeniden test raporu

## Düzeltilen sorunlar

- Küçük harfle yazılan item ID araması doğru tier/enchant varyantını seçiyor. Kategori ağacı ve arama temizleme durumu tutarlı güncelleniyor.
- Kalite tablosu kilitli kompozisyondaki beş kalite sütununu koruyor. Her sütunda yeşil Max Buy Order ve kırmızı Min Sell Order birlikte gösteriliyor; B/S kontrolleri iki ölçüyü bağımsız, çift yönlü sıralıyor. Eksik değerler sonda kalıyor.
- İzleme listesi depolama hatasında eski kayıtları koruyor; listeden silmek son görüntülenen eşyayı kaybettirmiyor.
- İstek sürerken sunucu değişirse eski sunucunun fiyatları gösterilmiyor ve yükleniyor durumu kapanıyor.
- API ve şahsi geçmişin dönem/şehir seçimleri bağımsız. Eksik veya hatalı kaynak dizileri güvenli işleniyor; eski başarısız istek yeni önbelleği silemiyor.
- Kâr görünümü doğrulanmış referansı ortak Flipper motorunun yapısal alanından kontrol ediyor.
- Masaüstü panel yükseklikleri gerçek içerikten hesaplanıyor; boş durum satırı gereksiz boşluk/scroll üretmiyor. Grafik etiketleri gerçek çizim boyutunda okunuyor.
- Mobil başlık eylemi başlıkla aynı satırda; açıklama ikinci satırda. Arama paneliyle çakışma giderildi. Black Market mevcut ortak görselini kullanıyor.

## Doğrulama

Geçti: `item-market:test`, `item-market:ui:test`, `flipper:test` (406 kapsamlı optimizasyon örneği dahil), `prices:history:test`, `routes:test`, `css:build`, `css:check`, `css:ui:test`, `git diff --check`.

CSS kontrolü: 0 emekli sınıf hatası; mevcut 21 mimari öneri. Ortak sıralayıcının eski tek başlıklı tabloları ayrıca DOM testinde doğrulandı.

UI testleri: 1920×1080, 1688×896, 1440×900, 1280×720, 390×844. Masaüstünde sayfa taşması, hiçbir boyutta yatay sayfa taşması yok. 1920/1688 ekranlarında iki fiyat tablosunun sekiz şehir satırı tamamen görünüyor. Mobilde normal sayfa kaydırması ve yerel tablo kaydırması korunuyor.

Ek kontroller: fare/klavyeyle item adı kopyalama, gerçek sayısal sıralama, kalite başına bağımsız alış/satış sıralaması, kota hatasında liste geri alma, yenilemede liste kalıcılığı, kaynak izolasyonu, API hatası/sunucu değişimi, pozitif doğrulanmış kâr örneği, bağımsız grafik dönemleri, desktop PNG 2000×200 ve mobile WebP 1200×480 doğal ölçüleri.

Canlı kaynaklar ve kontrollü test verileriyle ayrı ekran görüntüleri alındı; kontrollü görüntüler üretim verisi olarak kullanılmıyor. Canlı ekranlar yalnızca mevcut kaynakların döndürdüğü değerleri gösteriyor. Önceki tam proje çalışmasında saptanan görev dışı Island ve Flipper UI başlangıç hataları için [ilk teslim raporuna](DELIVERY.md) bakınız; bu rapor tüm proje testlerinin yeşil olduğunu iddia etmez.

## Dosyalar ve kanıtlar

Bu kontrol turu: `content/js/tools/item-market.js`, `content/js/core/item-market.mjs`, `item-market-data.js`, `flipper.mjs`, `content/js/utils/table-sort.js`, `content/js/components/price-volume-chart.js`, `content/scss/_components.scss`, `content/scss/app/_tool-controls.scss`, `_item-market.scss`, `output/css/site.css`; ilgili item-market/Flipper test dosyaları ve bu rapor.

- [UI test çıktısı](test-results-recheck-ui.txt)
- [Ortak bileşen UI çıktısı](test-results-recheck-shared-ui.txt)
- [Canlı masaüstü](screenshots/live-1920x1080.png)
- [Kontrollü 1688×896 kompozisyon](screenshots/fixture-1688x896.png)
- [Canlı mobil](screenshots/live-390x844.png)
- [Mobil sonuç bölümü](screenshots/live-mobile-detail.png)
- [İzleme listesi](screenshots/watch-list.png)

Tüm görüntüler `screenshots/` klasöründedir; otomatik ölçüm özeti `verification.json` dosyasındadır.
