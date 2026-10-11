# Karar Motoru teslim raporu

Araç, projenin route standardına uygun `/pages/tools/decision-engine/` adresinde kayıtlıdır. Menü ve kullanım kaydı `decision-engine` kimliğini kullanır. Mevcut fiyat, tarif, ayar ve arşiv servisleri korunarak ortak karar katmanına bağlandı. Üretim ekranında fixture fiyatları kullanılmaz.

## Değiştirilen / eklenen dosyalar

| Alan | Dosyalar |
| --- | --- |
| Sayfa ve UI | `pages/tools/decision-engine/index.html`, `content/js/tools/decision-engine.js`, `content/js/components/decision-icons.js` |
| Karar / veri / metadata | `content/js/core/decision-engine.mjs`, `content/js/core/decision-data.js`, `content/js/core/recipe-mechanics.mjs` |
| Paylaşılan servis uzantıları | `content/js/core/market.js` (sunucu ve iptal sinyali), `content/js/core/long-term-quotes.js` (iptal sinyali), `content/js/core/settings.js` (ayar depolama anahtarı export), `content/scripts/price-hub.mjs` (istekte sunucu uyuşmazlığı kontrolü) |
| Route ve seed | `content/scripts/site-routes.mjs`, `data/site-tools.json`, `content/js/db/store.js` (38→39 geçişinde yalnızca navigasyon tabloları yenilenir) |
| Oyun metadata üretimi | `content/scripts/build-game-recipe-catalog.mjs`, `data/recipe-mechanics.json` |
| Stil / paket ikonları | `content/scss/app/_decision-engine.scss`, `content/scss/main.scss`, `output/css/site.css`, `content/icons/decision-engine/02-search.svg`–`13-trend-down.svg`, `.gitignore` |
| Test / çalıştırma | `content/scripts/test-decision-engine.mjs`, `content/scripts/test-decision-data.mjs`, `content/scripts/test-decision-ui.cjs`, `package.json` |
| Rapor | `docs/decision-engine-delivery.md` |

Çalışma başlangıcında ve çalışma sırasında başka değişiklikler de vardı. Yukarıdaki liste bu aracın değişikliklerini belirtir; diğer değişiklikler bu çalışmanın ürünü olarak sunulmaz. CSS çıktısı mevcut çalışma ağacındaki stillerin tamamından derlenmiştir.

## Gerçek veri kaynakları

- `market.js / fetchPrices`: ortak ayardaki AODP sunucusu ve yerel paket hub; kaynak tercihi korunur, eksik taraf için mevcut alternatif kaynak davranışı sürer. Yeni sunucu parametresi, güncel hub kodunda yanlış sunucunun fiyatını reddeder. Çalışan eski hub sürecinin bu kontrolü alması için normal yeniden başlatılması gerekir; kullanıcıya ait süreç otomatik durdurulmadı.
- `long-term-quotes.js / fetchLongTermIndex`: mevcut 90 günlük saklama katmanından ortak `median-28d` çıktıları. Yalnız `quote-history` referansları anomali karşılaştırmasına alınır; current fallback veya gerçekleşen satış anchor’ı emir geçmişi yerine geçirilmez. Gün kapsamı, saatlik örnek sayısı ve zaman aralığı gösterilir.
- `quote-service / opportunity-series`: sunucu + item + şehir + kalite kimliği doğrulanarak Buy ve Sell gözlemleri ayrı gösterilir. Gösterim serisi mevcut servisin bucket politikasıyla gelir; boş saat veya işlem hacmi oluşturulmaz.
- `catalog.js / getCraftRecipes`: mevcut normalize BOM ve `appliesRr` bilgisi. Metadata yalnız yerel BOM ile birebir uyuşursa otomatik kullanılır.
- Mevcut importer’ın kullandığı [ao-data oyun dökümü](https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json): 6.126 item için açık batch, sabit silver ve base focus alanları çıkarıldı. Kaynak ve gerçek indirme zamanı metadata dosyasında saklanır; bulunmayan alanlar `null` kalır. `--mechanics-only` mevcut malzeme kataloğunu değiştirmez. Beef Sandwich’in gerçek batch adedi 10 ve malzemeleri 36 bread / 72 meat / 18 butter olarak doğrulandı.
- `economyConstants`, Premium ve ortak ayarlar: vergi ve emir ücreti eksikse varsayılan oran eklenmez. Standart royal ekipman craft RR’sinde mevcut şehir/specialty/focus sabitleri, bonus family ve doğrulanmış günlük bonus kaydı kullanılır; kapsanmayan mekaniklerde manuel RR gerekir.

## Hesaplar ve karar politikası

`Q` pozitif tam adettir. `t` katalog satış vergisi, `s` katalog emir ücretidir.

- Şimdi al: `sell_price_min × Q`.
- Buy Order: `manuel limit × Q × (1 + s)`. Dolum bilinmiyor; koşullu senaryo.
- Şimdi sat: `buy_price_max × Q × (1 − t)`.
- Sell Order: `manuel limit × Q × (1 − t − s)`. Setup peşin maliyettir; satıştan sonraki vergi net senaryoda yer alır. Tekrar ilan / iptal maliyeti modellenmez.
- Craft batch: `ceil(Q / batchYield)`; her malzeme tarif miktarı × batch sayısı. Fazla üretimin varsayımsal satış geliri ihtiyaç maliyetinden düşülmez.
- Envanter fırsatı: sahip olunan malzeme miktarı × güncel buy teklifinin vergi sonrası değeri. Envanter bedava sayılmaz.
- Craft toplamı: yeni malzeme temini + envanter fırsatı + doğrulanmış/girilmiş toplam craft ücreti + focus tüketimi × focus fırsat bedeli.
- Geri dönüş: yalnız uygun malzemelerde `tarif miktarı × batch × RR`; bunun buy teklifinden vergi sonrası satılabilmesi ayrı koşuldur. Birincil sıralama geri dönüş satış geliri düşülmeden yapılır; `toplam − geri dönüş net değeri` ayrı koşullu efektif maliyettir. Bu, bilinmeyen satış derinliğinin kesin tasarruf gibi sunulmasını önler.
- Craft into: `floor(eldeki adet / tarifte gereken adet)` tam batch; kalan stok korunur. Dönüşüm getirisi = eldeki stoğun şimdi net değeri + output net anında satış değeri − craft efektif maliyeti. Ek net değer, bu sonuç ile stoğun şimdi satışı arasındaki farktır.
- Önce uygulanabilirlik/tazelik/anomali filtresi, sonra maliyet veya net gelir sıralaması. Altı saatten eski, zamanı belirsiz, gelecekte tarihli veya eksik fiyat kesin karara girmez. Uç fiyat eşiği ve %0,5 yakın maliyet eşiği `DECISION_POLICY` içinde adlandırılmıştır. Yakın maliyette tek adımlı anında yol seçilir.
- Emir dolumu, zaman tahmini ve istatistiksel başarı oranı üretilmez. Aciliyet değişimi deterministiktir; dolumu bilinmeyen emirler bütün zaman tercihlerinde koşullu fırsat olarak kalır. Güven ifadesi sayısal olasılık değil, eksik veri / yalnız güncel gözlem / geçmiş referans / manuel senaryo açıklamasıdır.

## Destek sınırları

Bu sürüm otomatik tüm craft ekonomisini çözen eksiksiz bir sistem değildir. Gerçek veriyle çözülemeyen bölümler gizlenmemiştir:

- İstasyonun oyuncuya/istasyona özgü gerçek toplam ücretini sunan mevcut veri servisi yok. Kullanıcının oyundan doğruladığı toplam ücret gereklidir; boş değer sıfıra dönüşmez. Metadata’daki sabit oyun ücretinden daha düşük toplam reddedilir.
- Consumable/refining/özel şehir RR’si ve uzmanlık sonrası gerçek focus tüketimi her item için ortak katalogda doğrulanmış değildir. Uygun royal ekipman modeli dışında RR, gerçek focus tüketimi ve focus fırsat bedeli manuel girilir. Base focus ayrı bilgi olarak gösterilir ve uzmanlık sonrası gerçek tüketim diye kullanılmaz.
- Kalite 1 desteklenir. Şehirler arası taşıma/risk/süre çözümü olmadığı için UI aynı şehir yollarını karşılaştırır; motor farklı craft/satış şehrinde ilgili sonucu engeller.
- Üst üründe seçilen tek doğrudan tarif değerlendirilir. Seçici en fazla 20 doğrulanmış üst tarifi listeler; bütün üst ürünlerin global optimumu iddia edilmez.
- Recursive inspection helper’ında döngü/derinlik koruması vardır; çok seviyeli ara ürün satın al/craft optimizasyonu UI’da desteklenmez.
- Journal/yan ürün geliri, otomatik bekletme kazancı, order depth, likidite, dolum süresi ve başarı olasılığı hesaplanmaz. HOLD güvenilir sinyal yok açıklamasıdır.
- Manuel craft override’ları açıkça senaryo olarak işaretlenir ve temizlenebilir. Anlık fiyat override’ı eklenmedi; gerçek fiyatlar ve manuel emir limitleri karşılaştırılır.
- Geçmiş görselleştirme Buy/Sell gözlem tablolarıdır; sahte/boş grafik yoktur. Paket PNG dekorları ve örnek marka logosu kullanılmadı; mevcut site markası korunur.
- Gerçek servis smoke testinde seçimden karara süre 1.140 ms ölçüldü. Bu tek ortam ölçümüdür; ağ kesintisi veya yavaş upstream için 3 saniye garantisi verilmez. İstekler iptal edilebilir, loading/error/retry durumları görünürdür.

## Doğrulama

Node 24.19.0 ile:

- `npm run decision:test`: 27 karar/metadata fixture’ı ve veri adapter kontrol grubu geçti. Buy/sell tarafı, fee ayrımı, batch rounding, recursive guards, RR/focus, fırsat maliyeti, eksik/eski/anormal veri, mod ayrımı, geçersiz adet, eşit/yakın maliyet, dolumu bilinmeyen emir, aciliyet, transfer bilinmezliği, gerçek Beef Sandwich BOM/batch ve gözlem/fetch zamanı ayrımı kapsandı.
- Adapter grubu: kalite izolasyonu, Buy/Sell referans ayrımı, iptal sinyali, arşiv hatasıyla kısmi devam, geçmiş sunucu kimliği ve katalog oranları geçti.
- `content/scripts/test-decision-ui.cjs`: 1920×1080 ve 390×844, en uzun gerçek item adı, çok haneli miktar/fiyat, boş item/geçmiş, mod değişimi, eksik craft, bilinmeyen order, geçersiz adet, bağlantı hatası/yeniden deneme geçti; JS hatası ve mobil sayfa yatay taşması yok. Fixture’lar yalnız test interception’ında kullanılır.
- `DECISION_LIVE=1` ile aynı tarayıcı testinde fixture interception yapılmadan gerçek hub/AODP fiyatı alındı. Eksik istasyon ücreti craft sonucunu doğru biçimde engelledi.
- `npm run routes:test`: 22 route geçti; nav/usage kimliği runtime kataloğunda bulundu.
- `npm run css:build`: başarılı.
- Market order history ve market opportunities regresyonları geçti; AODP collector’ın 12 kontrolü geçti.
- Bu çalışmanın değiştirilen dosyalarında `git diff --check`: temiz. Çalışma ağacındaki başka değişikliklere ait whitespace uyarıları bu araç kapsamında değiştirilmedi.

Tarayıcı testinde Playwright yalnız test bağımlılığı olarak bundled runtime `NODE_PATH` üzerinden kullanıldı; uygulamaya framework veya yeni runtime dependency eklenmedi.


## UI revizyonu — 2026-10-10

- Ürün araması sabit genişlikli sol panelde; sonuç listesi kendi alanında kayar. Tier/enchant ve seçili durum görünür.
- Seçili ürün, mod, adet, şehir ve zaman sağ üstte; order limiti ve craft girdileri Hesaplama Ayarları altında.
- Ana karar, maliyet/getiri, en yakın uygulanabilir seçenek farkı, bekleme belirsizliği ve veri kalitesi öne çıkarıldı. Avantaj doğrulanırsa yeşil; karşılaştırılabilir alternatif yoksa mavi; yetersiz veri turuncu.
- Alternatiflerde toplam, birincile fark, koşullu dolum açıklaması ve açılır hesap dökümü var. Ücretler/varsayımlar ve veri kaynakları sonuç altında açılır.
- Boş, yükleniyor ve hata durumları düzenlendi. Algoritma ve servis dosyaları bu UI revizyonunda değiştirilmedi.
- Değişen dosyalar: content/js/tools/decision-engine.js, content/scss/app/_decision-engine.scss, content/scripts/test-decision-ui.cjs, output/css/site.css, bu rapor.
- Doğrulama: 27 motor senaryosu; adaptör kontrolleri; 22 rota; market order history; market opportunities; 12 AODP collector kontrolü; CSS derlemesi; masaüstü/mobil arayüz (uzun isim, büyük adet, eksik craft, koşullu order, geçersiz adet, bağlantı hatası ve tekrar deneme).
- Ekran görüntüleri test bağlamında izole fiyat fikstürleriyle üretildi; üretim uygulamasına örnek fiyat eklenmedi.
- Onaylı mockup dosyası bu eklerde bulunmadığından birebir piksel karşılaştırması yapılamadı. Dolum süresi, derinlik ve başarı olasılığı için mevcut servislerde yeterli veri yok; tahmin üretilmedi. Önceki hesaplama kapsam sınırları geçerlidir.

## Onaylı mockup uygulaması

Onaylı referans artık erişilebilir. Son UI uygulaması, gerçek veri ekran görüntüleri, görsel farklılıklar ve test sonuçları [mockup revizyon raporunda](decision-engine-mockup-revision.md) yer alır. Bu bölüm, önceki UI revizyonunun referans bulunamadığına ilişkin notunu günceller.
