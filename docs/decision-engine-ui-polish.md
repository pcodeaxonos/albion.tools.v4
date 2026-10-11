# Karar Motoru UI hata düzeltmeleri

Sonraki [alt bölüm düzenlemesi](decision-engine-bottom-layout.md), aşağıdaki 256px kart yüksekliği ve 42px malzeme taşması ölçümlerini güncelledi. Yeni 1920 × 1080 doğrulamasında sayfa, sağ sonuç alanı ve üç analiz kartında taşma 0px.

10 Ekim 2026. Mevcut mockup yerleşimi korunarak yalnızca sunum katmanı düzenlendi.

## Düzeltmeler

- Üst kontrol grubunda modlar 20rem dengeli alan kullanır; miktar 6rem, hedef zaman kalan alanı kullanır. Ürün başlığı güçlendirildi. Alanların grid minimumları ve aralıkları, zaman seçiminin şehir grubuna taşmasını engeller.
- Yenile aksiyonuna inline SVG, görünür çerçeve/yüzey ve kontrollü boşluk eklendi. Şehir armaları ortak bileşenin yeni `city-field--inline` görünümünde formun mevcut yükseklik ve etiket tokenlarını kullanır. Mevcut input/select görünümü değiştirilmedi; diğer şehir alanları bu sınıfı kullanmadıkça etkilenmez.
- Sol başlık/arama/liste boşlukları sıkılaştırıldı. Satır minimumu 4,3rem'den 3,8rem'e indirildi; ikon ve metin hizası korunarak daha fazla sonuç görünür. Seçili yüzeyin yoğunluğu azaltıldı.
- Ana kartta ikon/metin/gerekçe oranları, rakam ve para biriminin baseline hizası düzeltildi. Kısa gerekçeler aynı grid aralığını ve çizgi sistemini kullanır. Gerekçe kartında gövde satır aralığı artırıldı; kanıt satırı ince ayırıcı ve yardımcı tonla ayrıldı.
- Tablo kolonları %21/%16/%13/%13/%10/%27 olarak dengelendi. Sayılar sağa hizalı kaldı; satır padding'i, metin yüksekliği ve hesap dökümü aksiyonu düzenlendi. Tablo 19rem alan kullanır; gerçek veri görüntüsünde dört satır tamamen görünür ve tablonun dikey taşması 0px ölçüldü.
- Alt üç panel aynı 16rem yüksekliği ve başlık sistemini kullanır. Malzeme tablosunun gri yüzeyi kaldırıldı; koyu kart yüzeyiyle bütünleşti. İç malzeme scroll'u ve açılan hesap dökümünün ayrı scroll'u kaldırıldı. Uzun geçmiş listesi kendi ikinci scroll'u yerine kartın scroll'unu kullanır.
- Scrollbar'lar ince ve tema tonunda. Sağ sonuç alanı uzun içerik için tek ana scrollport olarak kaldı. Analiz kartları yalnızca içerik gerçekten taşarsa kayar; malzeme kartındaki yardımcı notlar için ölçülen 42px taşma bu tek kart scroll'u ile erişilebilir. İçerik gizlenmedi.

## Doğrulama

1920 × 1080 başlangıç ve gerçek Europe/Martlock Beef Sandwich sonucu Chrome'da görüntülendi. Son görsel tekrar açılıp incelendi: üst alan daha kompakt, dört alternatif tamamen görünür, alt kartlar aynı üst hizada ve ekran içinde. Veri eksikleri sıfır veya örnek fiyatlarla doldurulmadı.

- [Güncel masaüstü sonucu](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-polish-result-1920.png)
- [Başlangıç ekranı](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-polish-empty-1920.png)
- [Scroll / taşma DOM ölçümleri](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-polish-scroll-audit.json)

Geçen mevcut kontroller: CSS derlemesi; `decision:test` (27 motor senaryosu, adaptör ve grafik); `city:test`; `routes:test` (22 rota); market order history; market opportunities; AODP collector (12 kontrol); masaüstü/mobil UI regresyonu (manuel ücret/focus, arşiv hatası/tekrar deneme dahil); ortak başlık testi (3 sayfa × 3 genişlik = 9 kontrol). Yeni test altyapısı kurulmadı ve test dosyaları değiştirilmedi.

Çekirdek algoritma, adaptör, recipe mechanics ve long-term quotes dosyalarının SHA-256 değerleri önceki revizyonla aynı. Route/nav, AODP/hub ve hesaplama mantığı düzenlenmedi. Ortak başlık görseli ve yapısı korundu.

## Değişen dosyalar

- `content/scss/app/_decision-engine.scss`: ölçüler, tipografi, tablo ve scroll düzenlemeleri.
- `content/scss/_components.scss`: ortak şehir bileşeninin isteğe bağlı inline form görünümü.
- `content/js/tools/decision-engine.js`: yeni ortak şehir görünümünü kullanma ve yenile SVG'si.
- `output/css/site.css`: derlenmiş stiller.
- Bu rapor ve önceki mockup raporuna güncelleme bağlantısı.

Mevcut veri kapsamı sınırları değişmedi: dolum, hacim ve başarı olasılığı bilinmiyorsa bilinmiyor olarak kalır. Eksik craft girdileriyle maliyet üretilmez.
