# Karar Motoru — onaylı mockup uygulaması

10 Ekim 2026. Referans: `karar-motoru-assets-with-mockup.zip` içindeki `approved-beef-sandwich-mockup.png` (1536 × 1024). Görsel açılıp incelendi; doğrulama ekranları gerçek Chrome ile 1920 × 1080 boyutunda alındı.

## Uygulanan kompozisyon

- Sol ürün paneli %20, sağ sonuç alanı %80. Aynı üst hizada; sol liste bağımsız kayar ve panel yüksekliğini doldurur. Gerçek katalog ikonları, tier/enchant, kategori ve mavi seçim vurgusu kullanılır.
- Ürün kimliği, iki mod, miktar, hedef zaman, gerçek şehir armaları ve küçük yenile aksiyonu tek yatay panelde. Ortak form görünümleri korunur. Manuel ayarlar panelin altında kompakt açılır alandadır.
- Ana karar %65, gerekçe %35; aynı yükseklikte. Büyük aksiyon ve toplam, öneri ikonu ve sağında üç kısa gerekçe bulunur. Doğrulanmış ekonomik avantaj yeşil, tek hesaplanabilir seçenek mavi, eksik karar turuncudur.
- Altı sütunlu alternatif tablosu: seçenek, toplam, anlık işleme göre fark, süre, güven/veri durumu ve yorum. Sabit sütunlar boş/sonuç durumunda kaymaz. Önerilen satır hafif yeşil yüzey ve ince çerçeveyle işaretlenir; bu vurgu alternatiflere karşı hesaplanmamış bir tasarruf iddiası değildir.
- Alt analizler %42 fiyat geçmişi, %33 malzeme maliyeti, %25 piyasa özeti. Gerçek saatlik gözlemler zaman ekseninde gösterilir; eksik saatler birleştirilmez. Ortalama fiyat/hacim serisi üretilmez. Girdiler eksikse tarifin gerçek batch adetleri ve mevcut fiyatlar görünür, toplamlar hesaplanmış gibi gösterilmez.
- Ürün seçilmemiş, yükleniyor ve hata durumlarında aynı panel iskeleti korunur. Mobilde alanlar sıralanır; geniş tablo kendi içinde kayar.

## Görsel kontrol ve ölçümler

Referans, başlangıç ekranı ve gerçek verili sonuç ekranı görüntü olarak incelendi. İlk görüntüde alt grafik ekran dışına taşıyordu; tablo/panel yükseklikleri düzeltildi. Son ölçümler:

| Alan | 1920 × 1080 ölçümü |
| --- | --- |
| Sol / sağ sütun | 321,59 / 1286,41 px — %20 / %80 |
| Karar / gerekçe kartı | 825,77 / 444,66 px — %65 / %35 |
| İki karar kartının yüksekliği | 203,75 px, eşit |
| Alt üç panel | 529,55 / 416,08 / 315,22 px — %42 / %33 / %25 |
| Analiz alanı başlangıcı | Boş ve sonuç ekranında aynı: 826,11 px |
| Analiz alanı alt kenarı | 1050,11 px; üçü de 1080 px ekran içinde |

Ana karar, dört alternatif ve üç analiz paneli birlikte görünür. Uzun hesap dökümleri, gözlem listesi ve veri kaynağı ayrıntıları kendi kaydırma/açılır alanlarında erişilebilir. Sayfa içeriği gizlenerek taşma bastırılmadı.

Ekran görüntüleri:

- [Başlangıç — 1920 × 1080](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-live-empty-1920.png)
- [Gerçek verili Beef Sandwich — 1920 × 1080](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-live-result-1920.png)
- [Ölçümler ve ekrandaki gerçek veri metni](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-live-layout.json)
- [Mobil etkileşim testi görüntüsü](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-mobile.png) — yalnızca izole tarayıcı testinde fiyat fikstürü kullanır.

Gerçek veri görüntüleri API yanıtları değiştirilmeden, Europe/Martlock, kalite 1, 100 adet ile alındı. Beef Sandwich'in anlık alış toplamı 398.200 gümüş, Sell teklifi 3.982, Buy teklifi 2.509 idi. Bunlar kodda sabit fiyat olarak kullanılmaz.

## Referanstan kalan farklar ve nedenleri

- Projenin mevcut sol menüsü ve ortak PNG başlığı korundu. Mockup'ın üst navigasyonu, şehir açılır menüsü ve Wiki düğmesi için ikinci bir shell/nav kurulmadı. Bu nedenle tam ekran piksel eşleşmesi iddia edilmiyor; içerik kompozisyonu referansa göre uygulandı.
- Ortak form tipografisi ve şehir seçimi kullanılır. Şehir armaları mevcut ortak bileşenin isteğe bağlı `style: 'crests'` seçeneğiyle gösterilir; diğer sayfaların kullanıcı tercihi değişmez.
- Mockup'taki Beef Sandwich T5 ve örnek tarif yerine gerçek katalogdaki T8 ürün, Bread / Raw Beef / Cow's Butter tarifi kullanıldı.
- Gerçek senaryoda istasyon ücreti/RR ve bir malzeme fiyatı eksik: craft toplamı/avantajı uydurulmadı. Bu yüzden mockup'taki CRAFTLA/301.500 yerine ANINDA AL/398.200 görünür. Manuel alanlar doldurulursa mevcut motor normal şekilde hesaplar.
- Mockup'ın 3–6 saat/10 dakika süreleri, güven noktaları, günlük hacmi ve trend yüzdeleri gerçek kaynaklarla doğrulanamadığı için kopyalanmadı. Güven alanı hesaplanabilir/koşullu/eksik/uç fiyat durumunu anlatır; başarı olasılığı değildir.
- Gerçek arşivde az sayıda gözlem var; mockup'ın kesintisiz üç çizgisi yerine mevcut Buy/Sell noktaları ve yalnızca ardışık saatlerin bağlantıları gösterilir. Eksik saatler ve üçüncü ortalama seri üretilmez.

## Korunan hesaplama ve testler

Revizyon başında ve sonunda SHA-256 değerleri karşılaştırıldı: `decision-engine.mjs`, `decision-data.js`, `market.js`, `recipe-mechanics.mjs` ve `long-term-quotes.js` değişmedi. Route/nav, bonus motoru ve ücret hesapları düzenlenmedi.

Geçen kontroller:

- `npm run css:build`.
- `npm run decision:test`: 27 motor senaryosu, veri adaptörü ve yeni grafik testi. Grafik testi eksik saatler, geçersiz gözlemler, tek gözlem ve sahte ortalama/hacim olmamasını doğrular.
- `npm run routes:test`: 22 rota.
- `node --experimental-vm-modules content/scripts/test-city-picker.mjs`: senkronizasyon, açık arma seçimi ve varsayılan kullanıcı tercihinin korunması.
- Market order history, market opportunities, AODP collector (12 kontrol).
- `test-decision-ui.cjs`: %20/%80, %65/%35 ve %42/%33/%25 oranları, hizalar, tek yatay kontrol bloğu, 1080 px sınırı, boş/sonuçta sabit konumlar; mobil taşma, uzun gerçek ürün adı, büyük adet, iki mod, eksik craft, bilinmeyen order, geçersiz adet, bağlantı hatası/tekrar deneme.
- UI'da manuel ücret/RR ile 126.100; focus girdileri ile 126.160 doğrulandı; temizleme tekrar eksik veri durumuna döndü. Bu fiyat fikstürleri yalnızca test bağlamında bulunur.
- `test-page-heads.cjs`: Karar Motoru, Günün Fırsatları ve Farming için 1920/1280/390 px'de toplam 9 ortak başlık kontrolü.
- Gerçek servislerle ayrı tarayıcı çalıştırması ve iki 1920 × 1080 ekran görüntüsü; JS hatası yok.

## Bu revizyonda değişen dosyalar

- `content/js/tools/decision-engine.js`: sunum ve geçmiş paneli UI state'i.
- `content/scss/app/_decision-engine.scss`: referansa göre panel yerleşimi ve yüzeyler; başlık görseli CSS'ine dokunulmadı.
- `content/js/components/decision-history.js`: gerçek gözlemler için sunum bileşeni.
- `content/js/components/city-picker.js`: ortak bileşene isteğe bağlı stil parametresi.
- `content/scripts/test-decision-ui.cjs`, `content/scripts/test-decision-history.mjs`, `content/scripts/test-city-picker.mjs`: ilgili doğrulamalar.
- `package.json`: grafik testini mevcut `decision:test` komutuna ekleme; yeni bağımlılık yok.
- `output/css/site.css`: derlenmiş stil.
- Bu rapor ve `docs/decision-engine-delivery.md` içindeki yeni rapor bağlantısı.

Çalışma alanındaki diğer mevcut değişiklikler korunmuştur. Önceki teslim raporunun algoritma kapsam sınırları geçerlidir; mockup'ın erişilemediğine ilişkin önceki UI notu bu raporla güncellenmiştir.

## Tamamlama kontrolü — 10 Ekim 2026

Son kontrolde geçmiş panelinin hata/yeniden deneme akışı tamamlandı. Arşiv hatası artık hem grafikte hem açık gözlem dökümünde görünür; ayrı geçmiş yenile düğmesiyle fiyat hesaplamasını yeniden başlatmadan tekrar denenir. Başarılı deneme iki hata durumunu da temizler. Aynı anda açılan gözlem dökümü mevcut arşiv isteğini paylaşır; ürün değişimi sırasında eski isteğin sonucu yeni döküme yazılmaz.

Bu kontrolde `content/js/tools/decision-engine.js`, `content/scripts/test-decision-ui.cjs` ve bu rapor güncellendi. `npm run decision:test` (27 motor senaryosu + adaptör + grafik) ve masaüstü/mobil tarayıcı regresyonu geçti. Yeni tarayıcı senaryosu arşiv 503 hatasını hem panelde hem dökümde doğrular; tekrar denemeden sonra iki hata görünümünün temizlendiğini kontrol eder. Algoritma, servisler ve görsel yerleşim değiştirilmedi.

Tanımlanan UI revizyonunda açık uygulama işi kalmadı. Önceki bölümde belirtilen gerçek veri kapsam sınırları geçerlidir; bilinmeyen hacim/dolum süreleri veya eksik manuel craft girdileri sahte değerlerle tamamlanmaz.

## Son UI polish

Hizalama, tablo yoğunluğu, üst kontrol grubu ve nested scroll düzeltmelerinin son ölçümleri/görüntüleri [UI polish raporundadır](decision-engine-ui-polish.md). Yukarıdaki mockup uygulaması ölçümleri önceki revizyona aittir; güncel görsel için bu yeni rapor kullanılmalıdır.
