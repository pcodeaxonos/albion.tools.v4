# Eşya Piyasası teslimi

Araç: `/tools/item-market/`. Ayrı İzleme Listesi: `/tools/item-market/?view=watch`.

## Uygulanan davranış

- Mevcut sidebar, ortak uygulama açılışı, route kaydı ve kullanım takibi korunarak Piyasa menüsüne Eşya Piyasası eklendi.
- Kilitli kompozisyonun sol arama/kategori ağacı, küçük eşya özeti ve dört renkli kartı, şehir tablosu, yan yana iki geçmiş alanı ve alttaki kalite karşılaştırması uygulandı.
- 9.508 pazarlanabilir katalog varyasyonu 863 temel aileye ayrılır. Arama mevcut ad resolver'ı ve item ID ile çalışır; kategori/alt kategori, katalogdaki tier/enchant ve gerçek kalite sınırları kullanılır. Arama fiyat taraması başlatmaz; sonuçlar sayfalanır.
- Şehir tablosu dört emir alanını ve her alanın kendi tarihini gösterir. Kalite karşılaştırması her şehir/kalite için Buy MAX ve Sell MIN'i ayrı sıralama hedefleriyle gösterir. Sayısal ve zaman değerleri sayı olarak sıralanır; boşlar her iki yönde sonda kalır. Başlıklar klavye ile kullanılabilir ve `aria-sort` taşır.
- 6 saatlik tazelik kuralı korunur. Eski değerler etiketlenir; sıfır, tarihsiz, gelecek tarihli ve placeholder tarihli fiyatlar geçerli fiyat olarak sunulmaz. Black Market için Sell emirleri gösterilmez.
- Günlük, 7/30/90 günlük ortalamalar yalnız mevcut AODP history gözlemlerindeki pozitif adetlerle `Σ(avg_price × item_count)/Σ(item_count)` hesabından gelir. Hacim yalnız kaynak `item_count` veya kişisel gerçekleşme miktarıdır. Veri boşlukları doldurulmaz.
- API Fiyat Geçmişi içinde AODP sell-order history ve yerel Buy MAX/Sell MIN snapshot arşivi ayrı kaynak seçimleridir. Snapshot grafiğinde hacim üretilmez. Şahsi Trade Geçmişim SAT gerçekleşmeleri ve V6/FIFO buy/sell gerçekleşmelerini ayrı etiketli seriler olarak gösterir; emir açma/iptal/varsayımsal işlemler alınmaz. Kaynaklar arasında şehir aç/kapat durumları da bağımsızdır.
- Net Kâr ve Arbitraj Fırsatı mevcut Flipper `evaluateFlip` motorunu kullanır. Güncel fiyat ve tarihsel emir kontrolü bulunmayan eşleşmelerden fırsat üretilmez. Vergi mevcut premium ayarından gelir; taşıma giderinin 0 varsayımı ve miktar/derinlik bilinmezliği sonuç altında açıklanır. Ayrıntılı taşıma hesabına Flipper bağlantısı verilir.
- İzleme kayıtları `server + tam item ID + kalite` kimliğiyle tekildir; şehir başına çoğaltılmaz. Ortak storage modülüyle kalıcıdır. Ayrı görünüm arama, kategori filtreleri, kolon sıralama, detay ve çıkarma sunar; listeyi açmak toplu API taraması başlatmaz.
- Görünen eşya adları ortak kopyalama bileşenini kullanır. Fare ve klavye kopyalama test edildi.

## Bağlanan mevcut altyapı

| Alan | Mevcut modüller |
|---|---|
| Açılış, menü, kullanım | `app-runtime.js`, `routes.js`, `site-routes.mjs`, `usage.js` |
| Katalog ve ad/görsel | `db/store.js`, `db/relations.js`, `market-catalog.mjs`, `item-icon.js`, `item-name.js` |
| Canlı fiyat | `market.js`, `market-primitives.mjs`, mevcut Market Hub ve seçili AODP host |
| API geçmişi ve bütçe/cache | `market-history.js`, `market-history-config.mjs` |
| Yerel saatlik arşiv | Mevcut `/api/v1/market/order-history` okuma endpoint'i |
| Kişisel gerçekleşmeler | `trade-live.js`, `trade-config.mjs`, `opportunity-evidence.mjs` ve V6/FIFO kayıt endpoint'i |
| Kâr hesabı | `flipper.mjs`, `decision-data.js`, `long-term-quotes.js` |
| Kalıcılık ve tablolar | `storage.js`, `table-sort.js`, `calc-sticky.js` |

Collector, fiyat arşivi ve kişisel işlem defteri için yeni bir yazma/toplama altyapısı kurulmadı.

## Katalog kalite düzeltmesi

Kaynak oyun dump'ındaki `@maxqualitylevel` mevcut katalogda eksikti. Bineklerin de örneğin Riding Horse için 5 kalite desteklediği kaynakta doğrulandı. Bu alan mevcut `data/items.json` dosyasına eklendi; tüm eski alanlar ve ID'ler karşılaştırılarak korundukları doğrulandı. 12.237 kaydın 11.971'inde kaynak eşleşmesi var; pazarlanabilir 9.508 kaydın tamamında kalite sınırı doğrulandı. Eşleşmeyen diğer kayıtlar `null` kalır.

Kaynak URL'leri ve veri klasörü ortak `game-data-source.mjs` içindedir. Normal katalog üretimi alanı korur. `npm run data:item-quality` yalnız mevcut katalog kayıtlarını bu alanla zenginleştirir. Katalog üreticisinin eskiden `content/data` hedefleyen yolu, kullanılan gerçek `/data` klasörüyle aynı kaynak tanımına bağlandı.

## Görsel ve ekran kontrolü

- Masaüstü dosyası gerçek **2000×200 PNG**, mobil dosyası gerçek **1200×480 WebP**. Tarayıcı doğal ölçüleri doğrulandı; her iki dosyanın SHA-256 değeri ZIP'teki kaynakla aynı. Ortak responsive head haritası mobil dosyayı seçer.
- 26 SVG dosyası XML olarak ayrıştırıldı; `0 0 24 24` viewBox ve `currentColor` doğrulandı. Kullanılan ikonlar inline SVG olarak çizilir.
- Chrome: **1920×1080, 1688×896, 1440×900, 1280×720, 390×844**.
- Dört masaüstü ölçüsünde ana `.app-content` yüksekliği ile scroll yüksekliği eşit. Beş ölçüde yatay sayfa taşması yok. Mobilde kontroller ile sonuç paneli örtüşmez ve sayfa normal olarak kayar.
- Daha dar/kısa ekranlarda, mevcut sidebar ve Brecilien dahil 8 şehir korunurken veriyi kesmemek için kategori ağacı ve tablolar kendi yerel scrollportlarını kullanır. 1280px'de eşya özeti kompakt olarak iki satıra geçer; dört kart korunur. Bu değişiklikler fiziksel sığma içindir.
- Grafikler gerçek gözlem noktalarıyla çizilir; eksenler panelin gerçek boyutuna göre hazırlanır. Pürüzsüz, sentetik fiyat/işlem noktaları oluşturulmaz.

Gerçek kaynaklı teslim ekranları:

- [1920×1080](screenshots/live-1920x1080.png)
- [1688×896](screenshots/live-1688x896.png)
- [1440×900](screenshots/live-1440x900.png)
- [1280×720](screenshots/live-1280x720.png)
- [390×844](screenshots/live-390x844.png)
- [Mobil detay](screenshots/live-mobile-detail.png)

`fixture-*` ve `watch-list.png` dosyaları yalnız otomatik test verilerini gösterir; canlı fiyat ekranı olarak sunulmaz.

## Veri eksikleri ve sınırlar

Gerçek kaynak kontrolü `europe / T4_MAIN_SWORD / Normal` için yapıldı: API grafiğinde 100 gerçek gözlem ve 100 adet barı bulundu; seçili kapsamda kayıtlı kişisel gerçekleşme ve yerel snapshot noktası bulunmadı. Bu iki durumda boş durum gösterildi. Sonuçlar tüm katalog veya tüm kullanıcı geçmişinin boş olduğunu iddia etmez. Makinece okunabilir kanıt: [verification.json](verification.json).

Katalogda kısa açıklama bulunmayan eşyalar için açıklama üretilmez. API geçmişi kesin gerçekleşmiş oyuncu ticareti veya piyasanın toplam hacmi olarak etiketlenmez. SAT ve V6 aynı gerçek işlemi ayrı ayrı içeriyorsa iki kaynak iki ayrı kayıt olarak görünür; doğrulanamayan çapraz kaynak eşleştirme yapılmaz.

## Test sonuçları

**Geçti:**

- `npm run item-market:test`: gerçek aile/varyasyonlar ve kalite modeli; dört fiyat alanı/tarihi; bilinmeyen kalite ve yabancı item/şehir reddi; sıfır/eksik/placeholder/gelecek/eski tarih; Black Market; miktar ağırlıklı dönemler; kaynak izolasyonu; SAT gerçekleşmeleri; V6/FIFO olayları; izleme tekilliği; stabil sayısal sıralama.
- `npm run item-market:ui:test`: arama ve API taramaması; varyasyonlar; bütün uygun şehir ve kalite başlıklarının Enter/Space ile iki yönü; kopyalama; izleme ekleme/yenileme/çıkarma; API kesintisi; gerçek adet barları; snapshot hacimsizliği; kişisel/API kaynak ve şehir anahtarlarının bağımsızlığı; beş ekran boyutu; head ölçüleri ve responsive seçimi; gerçek kaynaklı screenshot'lar.
- `css:build`, `css:check`, `routes:build`, `routes:test`, `git diff --check`. CSS denetimi: **0 retired-class hatası**, 21 mevcut/advisory bulgu.
- Ana regresyon paketinin açılış, Karar Motoru, şehir, tooltip, item-name, canlı fiyat, fiyat geçmişi, collector, collection ve Günün Fırsatları V3/V4/V5/V6/diagnostics bölümleri.
- Ayrı çalıştırılan Ada yerleşimi (77 kontrol), satış potansiyeli, trade/potential fiyatları, Ada stabilitesi (28 kontrol), forecast, Laborer (45 kontrol), Flipper motoru (406 optimizer örneği) ve Flipper veri testleri.
- Chrome Günün Fırsatları V6 ve ortak CSS/bileşen regresyonları.

**Mevcut başarısızlıklar:**

1. `npm test`, `test-island-economy.mjs:648` satırında `Net kâr / gün` metnini arayan assertion'da durur. Değiştirilmemiş ve HEAD'de de aynı olan Ada detay kodu `Net kâr/zarar` üretir. Bu nedenle bütün ana paket yeşil değildir.
2. `flipper:ui:test`, 1920px kontrolünden sonra **1280px** fırsat listesi yatay taşma assertion'ında durur (`test-flipper-ui.cjs:136`). Test, entegrasyon öncesi `HEAD:output/css/site.css` ile tekrar çalıştırıldı ve aynı noktada başarısız oldu. Flipper'ın mevcut yerleşimi değiştirilmedi.

Flipper veri testinde ilk çalıştırmada cache zaman damgaları arasında 1 ms fark nedeniyle bir assertion başarısız oldu; tekrar çalıştırmada motor ve veri testleri geçti.

Kanıt metinleri: [UI](test-results-ui.txt), [ana regresyon](test-results-regression.txt), [Flipper eski CSS kontrolü](test-results-flipper-baseline.txt), [V6 Chrome](test-results-opportunities-ui.txt), [ortak UI](test-results-shared-ui.txt).

Testlerin yeniden ürettiği görev dışı V6 rapor/screenshot dosyaları başlangıç durumuna geri getirildi. Başlangıçtaki kullanıcı değişiklikleri korundu.

Son test ve düzeltmeler: [Yeniden test raporu](RECHECK.md).

## Değişen/eklenen dosyalar

| Sorumluluk | Dosyalar |
|---|---|
| Sayfa ve davranış | `tools/item-market/index.html`, `content/js/tools/item-market.js` |
| Veri modeli ve mevcut servis adaptörü | `content/js/core/item-market.mjs`, `content/js/core/item-market-data.js` |
| Ortak grafik bileşeni | `content/js/components/price-volume-chart.js` |
| Mevcut fiyat katmanı | `content/js/core/market.js`, `market-primitives.mjs`, `market-history.js`, `market-history-config.mjs`; `content/scripts/price-hub.mjs` içindeki endpoint sabitinin ortak tanıma bağlanması |
| Katalog, route ve başlangıç verisi | `content/js/db/schema.js`, `store.js`, `content/scripts/site-routes.mjs`, `data/site-tools.json`, `data/items.json` |
| Kaynak üretimi | `content/scripts/game-data-source.mjs`, `fetch-game-data.mjs`, `update-item-quality-metadata.mjs` |
| CSS | `content/scss/app/_item-market.scss`, `_market-resources.scss`, `_tool-controls.scss`, `_tool-heroes.scss`, `content/scss/main.scss`, `output/css/site.css` |
| Testler/komutlar | `content/scripts/test-item-market.mjs`, `test-item-market-ui.cjs`, `test-market-order-history.mjs` VM ortamına ortak endpoint sabitinin aktarılması, `package.json` |
| Asset'ler | `content/images/page-heads/desktop/esya-piyasasi-head-2000x200.png`, `content/images/page-heads/mobile/esya-piyasasi-head-mobile-1200x480.webp`, `content/icons/item-market/*.svg`, `.gitignore` |
| Teslim kanıtı | `docs/item-market/` içindeki rapor, test metinleri, verification, master/prompt referansı ve screenshot'lar |

Kaynak doğrulaması: [AODP API belgesi](https://www.albion-online-data.com/api/) sell-order history'nin 1/6/24 saat ölçeklerini tanımlar. Kalite sınırları mevcut kataloğun [ao-bin-dumps oyun verisi kaynağından](https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json) alındı.
