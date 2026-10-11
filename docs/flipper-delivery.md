# Flipper teslim raporu — 11 Ekim 2026

## Entegrasyon ve davranış

`/tools/flipper/` Piyasa menüsüne eklendi. Varsayılan Black Market modu ve şehirler arası mod aynı piyasa fiyat servisini kullanır. Canlı fiyat güncellemesi mevcut aday ve sepeti geçersiz kılar; yeni taramada miktarlar tekrar doğrulanır. Registry değişikliği mevcut kullanıcıların navigasyon kataloglarını revision 40 ile yeniler.

ZIP yalnızca tasarım ve görsel referansı olarak kullanıldı. Başlık PNG’si değiştirilmeden kopyalandı ve tarayıcıda doğal boyutu 2000×200 olarak doğrulandı. Ortak head sistemine kaydedildi; görüntü oranı korunur. SVG’ler inline render edilir. Gerçek ürün görselleri ortak item-icon bileşeninden; her ürün adı ortak item-name kopyalama bileşeninden gelir.

Fiyat yönü: kaynak Sell Min → hedef Buy Max. Aynı item kimliği (enchant dahil) ve aynı kalite gerekir. Black Market adayları equipable katalog kayıtları ve tam eşleşen Black Market Buy Max ile sınırlıdır; farklı kaliteye kabul varsayılmaz.

Net/adet = hedef Buy Max × (1 − ortak satış vergisi) − kaynak Sell Min − kullanıcı ek gideri/adet. Emir açılmadığı için setup ücreti uygulanmaz. Bütçeye alış ve ek gider dahildir; ROI bu sermaye maliyetine göre hesaplanır. Sıralama net/adet, sermaye verimliliği, güncellik ve tarihsel kontrol güvenini birlikte kullanır. Bilinmeyen toplam potansiyel uydurulmaz.

Sepet Pareto elemesi kullanan tam sayılı, adet sınırlarına bağlı karma optimizasyonla hesaplanır. Ağırlık ve bütçe birlikte kısıttır. Hedef emir aynı ürün/kalite için farklı kaynaklarda tekrar kullanılamaz. Eski, riskli veya doğrulanmamış adaylar sepete girmez. 10.000 arama durumu sınırı aşılırsa işlem açık hata verir; yaklaşık sonuç en iyi sepet diye sunulmaz.

## Veri sınırlamaları

- Ortak fiyat yanıtları güvenilir emir derinliği içermez. Uygulanabilir adet ve kesin toplam kâr otomatik üretilmez. Kullanıcı kaynak/hedef limitinin küçük değerini oyunda doğrular.
- Yerel item kataloğu ağırlık içermez. Birim kg kullanıcı tarafından doğrulanır; bilinmeyen değer sıfır kabul edilmez.
- Ortak tarihsel arşiv yalnızca normal kaliteyi izler. Diğer kalitelerde tarihsel kontrol eksikliği açıkça belirtilir. Arşiv fiyatı anlık alış/satış yerine kullanılmaz.
- Tarihsel uç sapma, aşırı şehirler arası fark ve eski/eksik gözlem zamanı işaretlenir. Arşiv kapalıysa hesap devam eder ama güven düşer.
- Sepet, görünen fiyat ve doğrulanan limitler değişmediği varsayımıyla **senaryo**dur. Nakliye kaybı ve fiyat hareketi gerçekleşen kârı değiştirebilir. Ek gider/adet bu araçta kullanıcı tarafından girilir.
- Tarama bütün uygun katalog kimliklerini URL uzunluğu sınırına göre gruplar; kapsam büyüdükçe süre artar. Başarısız gruplar eksik tarama uyarısı verir.

## Değişen/eklenen dosyalar

Yeni: `tools/flipper/index.html`, `content/js/tools/flipper.js`, `content/js/core/flipper.mjs`, `content/js/core/flipper-data.js`, `content/scss/app/_flipper.scss`, `content/scripts/test-flipper.mjs`, `content/scripts/test-flipper-data.mjs`, `content/scripts/test-flipper-ui.cjs`, `content/icons/flipper/*.svg`, `content/images/page-heads/desktop/flipper-head-2000x200.png`, bu rapor.

Entegrasyon: `content/scripts/site-routes.mjs`, üretilen `data/site-tools.json`, `content/js/db/store.js` (navigasyon seed revision), `content/scss/app/_tool-heroes.scss`, `content/scss/main.scss`, derlenmiş `output/css/site.css`, `package.json`, `.gitignore` (Flipper SVG’lerini takip et).

Depoda önceden bulunan diğer değişiklikler bu teslimin kapsamına dahil değildir.

## Doğrulama

- CSS derlemesi başarılı.
- Route testi: 23 route round-trip ve statik çıktı başarılı.
- Flipper motoru: net kâr, premium/non-premium vergi, fiyat yönü, kalite/enchant, eksik/eski/gelecekteki zaman güvenliği, uç fiyat, negatif kâr, bilinmeyen miktar/ağırlık, bütçe/kapasite, süre dolumu ve hedef emir tekrar kullanımı kontrolleri başarılı.
- Optimizasyon 406 bütçe/kapasite kombinasyonunda exhaustive arama ile aynı en iyi sonucu verdi.
- Veri adaptörü: ortak servis, referans ayrımı, kalite kapsamı, arşiv kesintisi, fiyat kaynağı kesintisi, server değişikliği ve iptal testleri başarılı.
- Chrome UI: 1920, 1280, 768 ve 390 px; yatay taşma, panel/sepet çakışması, masaüstü yan yana/mobil alt alta düzen, ürün detay seçimi, pano kopyalama, senaryo sepeti ve PNG boyutu başarılı.
- Ortak item-name ve price-live testleri başarılı; mevcut decision engine’in 27 fixture testi başarılı.

UI testleri yalnızca test sürecinde verilen sentetik fiyatlarla çalışır; bu fiyatlar uygulamaya dahil değildir. Gerçek piyasa kârlılığı bu testlerden çıkarılamaz. Playwright için Node 22+ ve erişilebilir Chrome gerekir; bu makinede bundled Node runtime kullanıldı.

## Standart sol/sağ düzen revizyonu

Filtreler `toolPageHtml` ile standart `.tool-split > .left > .controls.tool-split-controls` alanına taşındı. Özet metrikler, fırsatlar, ürün detayı ve sepet `.right > .result.tool-split-result` içinde kalır. Masaüstünde ortak kolon genişliği ve sticky davranışı; 992 px altında filtrelerin sonuçlardan önce sıralanması kullanılır. Form alanları ortak `.form-section`, `.form-floating`, `.form-control`, `.form-select`/autocomplete ve `.form-actions` bileşenleriyle render edilir. Üst yatay filtreye ait grid ve sticky CSS kaldırıldı.

Bu revizyon: `content/js/tools/flipper.js`, `content/scss/app/_flipper.scss`, `output/css/site.css`, `content/scripts/test-flipper-ui.cjs`, bu rapor. CSS derlemesi ve 1920/1280/768/390 px tarayıcı kontrolleri başarılı; test ayrıca sol/sağ yerleşim, mobil sıralama, sticky davranış ve ortak seçim bileşeni kullanımını doğrular.

## Mod seçiminin kaldırılması ve ayarlı şehir seçimi

Mod alanı kaldırıldı. Kaynak ve hedef ortak `cityFieldHtml`/`bindCityField` üzerinden seçilir; liste, düğme, arma veya diyagonal harita görünümü ve şehir sırası Ayarlar’dan alınır. Hedef Black Market ise uygun ekipman kataloğu taranır; diğer hedeflerde şehirler arası tarama yapılır. Black Market hedef seçiminin içinde yer alır ve arma görünümünde ZIP SVG’si inline gösterilir.

Ortak şehir bileşenine `syncPeers: false` bağlama seçeneği eklendi. Flipper kaynak ve hedefi bu seçenekle bağımsız tutar; diğer araçların mevcut senkronizasyon davranışı korunur. Özel hedef kayıtları opsiyonel harita konumu ve inline arma görseli sağlayabilir; şehir kataloğuna piyasa hedefi eklenmez.

CSS derlemesi, ortak şehir testleri (bağımsız uçlar dahil), Flipper motoru ve Chrome UI testleri geçti. UI testleri mod alanının bulunmadığını, Black Market’in varsayılan hedef olduğunu, tüm şehir görünüm ayarlarını, hedef değiştirmeyi ve tüm kaynakları seçmek için kaynağı temizlemeyi doğrular.

## Sabit ekran yerleşimi

Masaüstünde sonuç alanı ekran yüksekliğine bağlı üç grid satırı kullanır: özet metrikler, fırsat/detay panelleri ve sepet. Tarama izleme alanı sol kolonun altında bulunur. Boş, taranmış ve sepet oluşturulmuş durumlar aynı panel koordinatları ve boyutlarını korur. Dış sayfada scrollbar oluşmaz; uzun içerik için fırsat listesi, detay, sepet ve gerektiğinde sol kontroller kendi sınırlı scrollportlarını kullanır. Sayfa taşması clipping veya overflow:hidden ile gizlenmez.

CSS derlemesi ve Chrome UI kontrolleri başarılı. Tarama öncesi/sonrası ve sepet sonrası panel geometrisi eşit; 1920/1280 px masaüstü, 1440×900, 1280×720 ve 992×600 ekranlarda dış scroll yok. 100 ek fırsat satırı panel geometrisini değiştirmiyor. Mobilde standart alt alta düzen ve erişilebilir sayfa kaydırması korunur.

## Fırsat sıralaması

Liste başlığındaki ortak seçim alanı altı seçenek sunar: dengeli puan (varsayılan), net kâr/adet, ROI, veri güncelliği, alış maliyeti ve veri güveni. Kâr, ROI, puan ve güven azalan; maliyet ve veri yaşı artan sıralanır. Bilinmeyen değerler sona gider. Eşit değerlerde net kâr/adet, ardından güncellik ve kayıt kimliği belirleyicidir. Riskli kayıtların dengeli puanı sıfır kalır; eşit puan artık veri geliş sırasına bağlı değildir. Emir derinliği bilinmediğinden toplam kâr sıralaması sunulmaz.

Sıralama tanımları ve saf karşılaştırıcı `content/js/core/flipper.mjs` içinde paylaşılır. Seçim değişikliği mevcut kayıtları yeniden sıralar; tarama, filtreler, seçili ürün, doğrulanmış limitler ve hesaplanmış sepet korunur. Değişen dosyalar: motor, araç UI, Flipper SCSS, derlenen CSS, motor/UI testleri ve bu rapor.

CSS derlemesi, altı sıralama yönü, bilinmeyen değerler, eşitlikler ve girdinin değişmemesi testleri geçti. Chrome testleri net kâr ve ROI seçimlerinin farklı ürünleri başa taşıdığını, seçili ürünü/sepeti koruduğunu ve yeniden tarama yapmadığını doğruladı. Mevcut masaüstü ve mobil yerleşim kontrolleri de geçti.

## Tarama izleme alanı

Tarama paragrafı kaldırıldı. Ortak `toolPageHtml` sol `summary` alanında, filtre kutusunun altında ve masaüstünde kolonun altına hizalı bir izleme paneli bulunur. Durum, ilerleme, eşleşen fiyat çifti sayısı, son tarama saati ve bilinmeyen emir adedi sabit satırlarda gösterilir. Hazır, taranıyor, tarihsel kontrol, tamamlandı, eksik tarama, yeniden tara ve hata durumları renk ve kısa etiketlerle ayrılır. Açıklamalar ve hata nedenleri ortak `data-app-tooltip` bileşenine taşındı; klavye odağı ve Escape desteklenir. Emir miktarı hâlâ API'den bilinmez; kesin toplam kazanç üretilmez.

Bu revizyonda `content/js/tools/flipper.js`, `content/scss/app/_flipper.scss`, `output/css/site.css`, `content/scripts/test-flipper-ui.cjs` ve bu rapor değişti. CSS derlemesi ve Chrome UI testleri geçti: sol alt konum, tooltip klavye erişimi, hazır/tamamlandı/yeniden tara/hata durumları, sayaç ve ilerleme, tarama/sepet sonrası sabit geometri, mobil düzen ve masaüstünde dış scroll bulunmaması doğrulandı.
