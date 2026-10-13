# Albion Tools — Eşya Piyasası / Kilitli Master Tasarım Uygulama Promptu

Mevcut Albion Tools repository'sinde **Eşya Piyasası** aracını uçtan uca uygula. Ekteki `references/master-layout.png` onaylı **master tasarımdır**. Bu bir yeniden tasarım talebi değil. Kilitlenmiş kompozisyonları ve ekran yoğunluğunu koru. Uydurma veri, özellik, ekonomik mekanik, kaynak veya ikinci altyapı üretme. Kodlamadan önce projeyi araştır; kodlama, test ve kısa teslim raporunu aynı çalışma içerisinde bitir.

## 1. Repo denetimi / değişiklik öncesi

- `scripts/site-routes.mjs`, `scripts/build-site-routes.mjs`, `js/core/routes.js`, navigasyon, araç kayıt/usage tracking ve `/tools/.../` yapısını incele. Yeni aracın sayfasını mevcut route/menü düzenine **uygun** ekle; rastgele root-level route yaratma. Piyasa bölümünde **Eşya Piyasası** yer almalı.
- Projedeki item katalog, çeviri/görsel çözümleme, kategori/tier/enchant/quality modeli, ortak UI/SCSS bileşenleri, AODP istemcisi, API bütçe/önbellek/collector, Market Hub, 90 günlük saatlik fiyat arşivi, Günün Fırsatları V6 gerçekleşmiş işlem/FIFO kayıtları ve mevcut kullanıcının şahsi trade verisi olup olmadığını belirle. Gerçek modül/yol adlarını keşfet; burada isim uydurulan dosya yolunu zorla yaratma.
- Gerekli verinin mevcut olup olmadığını **alan, kaynak, server, şehir, kalite ve zaman düzeyinde** doğrula. Katalogda eksik eşya varsa mevcut kataloğun kaynağında gider; ikinci katalog ve ikinci fiyat toplayıcı kurma.
- Kullanıcının mevcut değişikliklerini, piyasa arşivlerini, FIFO/işlem kayıtlarını, sayfa stillerini ve üretim sistemlerini silme/sıfırlama. CSS/JS sorumluluklarına göre mevcut yapıya yerleş; aynı amaca hizmet eden yeni sınıf aileleri veya kopya komponentler oluşturma.

## 2. Referans dosyalar ve sabit görüntü standardı

ZIP içindekiler:
- `references/master-layout.png`: ana sayfa düzeni, oranlar ve görünür bölümler için **birincil referans**.
- `references/search-panel-locked.png`: sol arama ağacı **birebir kompozisyon referansı**.
- `references/city-price-table-locked.png`: şehir fiyat tablosunun **birebir görsel yapısı**.
- `references/item-summary-locked.png`: seçilen eşya özeti/head içeriğinin **birebir yapısı**.
- `references/quality-matrix-rule.png`: şehir x kalite matrisini anlatır; **görünümü kilitli değildir**, veri mantığı kilitlidir.
- `assets/head/esya-piyasasi-head-2000x200.png`: **masaüstü için gerçek 2000 × 200 px PNG** (10:1). `assets/head/esya-piyasasi-head-mobile-1200x480.webp`: **mobil için ayrı, gerçek 1200 × 480 px WebP**. İkisini mevcut proje head/responsive art direction yapısına bağla. Bu ölçüler dosyanın kendisine aittir; CSS scale ile yanlış piksel boyutunu maskeleme. Kaynak kompozisyonu bozma ve mobilde masaüstü 10:1 görselini sırf `cover` ile kullanıp mobil dosyayı yok sayma. **Seçili eşyanın kendi özet paneline** bu görselleri arka plan yapma.
- `assets/icons/*.svg`: 24×24 `currentColor` tek aile ikonları. Mevcut proje ikonları aynı anlamda zaten varsa onları tekrar etmeyip yeniden kullan. Gerçek Albion item görsellerini ve şehir/faction ikonlarını projedeki mevcut asset resolver'dan çek; bu SVG'ler onların yerine geçmez.

Üretilen sayfa mevcut Albion Tools sidebar ve üst başlık çevresinde açılmalı. Koyu tema, ince cyan çizgiler, yeşil alış, kırmızı satış, cyan ortalama, mor güncellik, altın aktif sekme dili sabittir. Alt alta yığılan geniş kartlar oluşturma; master örnekteki **tek bakışta okunabilen yoğun paneli** koru.

## 3. Kilitli arama paneli

- Küçük sol panel: üstte eşya arama metin kutusu, `×` temizleme, sağda bağımsız altın arama butonu.
- Altında `Tümü / Silah / Zırh / Araç / Tüketim / Kaynak` hızlı sekmeleri.
- Altında referanstaki gibi koyu **accordion + ağaç** kategoriler; küçük satır ikonları, dal çizgileri, aktif ana kategori vurgusu, aç/kapat oku. `references/search-panel-locked.png` oranlarını, hiyerarşisini, renklerini bozma.
- Sorgu eşyanın katalogdaki adları ve item ID ile çalışsın; mevcut Türkçe/İngilizce ad resolver'ını kullan. Kademeli kategoriler, tier/enchant/kalite varyantları **yalnız oyunun izin verdiği değerlerle** filtrelenir. Eşya varyasyonlarını solda tek temel aile olarak göster; sağda mevcut item head'ine bağlı kompakt tier/enchant/quality seçimi açılabilir. Kilitli head yüksekliğini artırma.
- İlk açılışta daha önce belirlenen son görüntülenen eşyalara erişim bulunabilir; **Favoriler kesinlikle yok**. Var olmayan sonuç için anlaşılır boş durum. Arama yapılırken bütün katalog için piyasa API taraması başlatma.

## 4. Kilitli seçili eşya head'i

`references/item-summary-locked.png` temel kompozisyonuna sadık kal:
- Solda **küçük gerçek item görseli**, adı, türü, T4/kalite gibi küçük seçim rozetleri, varsa katalogdan gelen **kısa gerçek açıklama**. Bilinmeyen açıklama uydurma. Geniş arka plan resim kullanılmaz.
- Sağda sırayla dört kompakt renkli kart: **En Düşük Alış** (yeşil, fiyat + şehir), **En Düşük Satış** (kırmızı, fiyat + şehir), **Günlük Ortalama** (cyan, fiyat + gerçekleşen hesabın pencere açıklaması), **Son Güncelleme** (mor, göreli süre + tam tarih/saat).
- Head fiyatlarının veri kökeni UI açıklamalarında şeffaf olsun: `buy_price_min` ve `sell_price_min` gibi AODP order-side alanlarını projedeki ortak resolver ile doğru eşleştir; kullanıcı açısından “anında alma/satma” fiyatlarıyla ters göstermemek için tooltip'lerde gerçek alan anlamını açıkla. Karar vermeden önce repo'daki mevcut isimlendirmeyi kontrol et; başlıkların sabit görünümünü bozma.
- Güncellenme zamanı API yanıtının çekilme anı değil, **gösterilen değerin gerçek kaynak zaman damgası**dır. Ortalamayı yalnız gerçek fiyat geçmişinden, açıkça belirtilen şehir/kapsam ve dönemle üret. Eksikse `—`.
- Ana sayfada İzleme Listesi tablosu/kartı bulunmaz. Eşyada küçük ve semantik **İzle / İzlemeden çıkar** aksiyonu olabilir; dört kartın kompozisyonunu bozmaz.

## 5. Kilitli ŞEHİR FİYAT TABLOSU

`references/city-price-table-locked.png` panelinin kompozisyonunu esas al: sıkı satır, cyan grid, şehir crest'leri, aktif satırın altın vurgusu, hacim yatay barı, uygun veri varsa küçük sparkline; yukarıda `Satın Alış (Buy) / Satış (Sell) / Net Kâr / Arbitraj Fırsatı` sekmeleri ve sağda Gümüş(Silver) + yenile.

- Gerçek AODP snapshot'ından `sell_price_min`, `sell_price_max`, `buy_price_min`, `buy_price_max` + **her birinin ayrı tarihini** kullan. Buy/Sell emir yönü ve kullanıcının alış/satış eylemi karıştırılmasın. Panelin satır/sütun anlamı gerçek alanlara bağlansın ve aktif sekmeye göre renk/başlık net olsun.
- 7 / 30 / 90 gün ortalamaları **kaynak verisi gerçekten erişilebiliyorsa** sabit, kompakt kolonlar olarak yer alsın. Ortalama penceresini, kaynağını ve ağırlıklandırmasını belgeleyip UI tooltip'inde açıkla. AODP historical `avg_price` ve `item_count` mevcutsa doğru miktar-ağırlıklı ortalama (geçerli `item_count>0` gözlemleriyle) değerlendirilir; verisi olmayan periyot `—`. Veri olmayan aralık asla interpolasyon veya başka fiyat türünden doldurulmaz.
- Günlük hacim yalnız ilgili kaynaktan **gerçek miktar/item_count** alınabiliyorsa gösterilsin. AODP güncel prices alanında hacim yoktur; hacim, toplam satış ilanı sayısı veya tahminmiş gibi gösterilmez. Kaynak boşsa hacim ve bar `—`.
- Black Market'i yalnız desteklenen fiyat türleriyle göster; onu sıradan şehir marketiyle eşitleyip sahte Buy/Sell üretme.
- `Net Kâr` ve `Arbitraj Fırsatı` sekmeleri mevcut Karar Motoru/Flipper'ın doğrulanmış hesap motoruna entegre edilebiliyorsa işlevsel olsun; eksik veride kâr veya fırsat icat etme. Entegrasyon uygun değilse durumunu açıklayan, hesap iddiasında bulunmayan boş/etkisiz durum göster. Kullanıcının istemediği yeni işlem/otomatik emir verme özelliği yaratma.
- **Tüm uygun sütun başlıkları sıralanabilir**. Tıklayınca artan/azalan; aktif ok; sayısal sort `localeCompare` ile yapılmaz; tarihler timestamp, şehir adı locale-aware alfabetik, hacim miktar bazlıdır. Eksik, eski/geçersiz olan veriler uygun şekilde işaretlenir, eksikler iki yönde de sonda, eşit değerlerde stabil sıra. Bütün satır beraber taşınır.
- Güncellik: fiyatın her alanı kendi `..._date` verisine sahiptir. Mevcut 6 saatlik karar tazeliği eşikleri korunur; incelenen eski fiyatlar gizlenmek yerine eski etiketiyle görülebilir. `0`, placeholder timestamp, tarih yok gibi durumlar geçerli fiyat sayılmaz. Uç fiyatları doğrulamadan “avantaj” ilan etme.

## 6. API Fiyat Geçmişi + Şahsi Trade Geçmişim

Başlıklar **tam bu şekilde ve birbirinden ayrı** kalacak:
1. `API Fiyat Geçmişi`
2. `Şahsi Trade Geçmişim`

- Her ikisinin fiyat grafiğine ilgili kaynaktan **miktar/hacim sütunları** entegre et: sol eksen silver fiyat, sağ eksen adet hacim. Hacim verisi olmayan grafikte **sahte bar üretme**; uygun boş durum/etiket kullan. Çizgi/nokta tipi, çözünürlük ve alan yerleşimi mevcut veri ve gerçek kullanım testine göre seçilebilir; master'ın iki paralel grafik alanını desktop'ta koru. 7/30/90 gün dönemleri veri varsa sunulabilir; kullanıcının geçmişten fazlası varmış gibi davranma.
- `API Fiyat Geçmişi`: mevcut yerel 90 günlük saatlik Buy MAX/Sell MIN **piyasa snapshot arşivi** ile AODP `/api/v2/stats/history/...` **sell-order tarihi** kaynaklarının farklı olduğunu koru. Farklı gözlem türleri için ayrı seri/etiket kullan; yanıltıcı birleştirme yapma. Resmi history `time-scale` 1/6/24 saat ölçeklidir. `avg_price` ve `item_count` alanlarının kapsamını doğrulayarak grafiğe bağla; history'yi “kesin gerçekleşmiş oyuncu ticareti” diye etiketleme.
- `Şahsi Trade Geçmişim`: yalnız projede gerçekten kaydedilmiş gerçekleşmiş **kişisel alış/satış işlemlerini**, miktarı, fiyatı, şehri, zaman damgasını kullan. Günün Fırsatları V6/FIFO ile veya mevcut kullanıcı trade kayıtlarıyla doğrulanabiliyorsa entegre et. Emir açma/iptal, AODP fiyat snapshot'ı, izleme adayı veya varsayımsal senaryo, gerçekleşmiş kişisel trade değildir. Böyle kaynak bulunmazsa `Kayıtlı şahsi trade verisi yok` göster, örnek noktalar üretme.
- Aynı tarih aralığındaki boş saatleri örnek/işlem gibi oluşturma, farklı sunucu/şehir/kalite ve Buy/Sell serilerini karıştırma. Grafik tooltip'leri tarih/saat + birim + kaynak gösterir. Şehir çizgileri aç/kapat yapılabilir; başlangıçta uygun gerçek şehirlerin tamamı açık olabilir, çizgi karmaşasında okunabilirliğini test et.

## 7. Şehir bazlı kalite karşılaştırması

- Şehirler **satırlarda**, desteklenen Normal / Good / Outstanding / Excellent / Masterpiece kaliteleri **sütunlarda**. Referansın piksel kompozisyonu birebir zorunlu değil; master alt bölümünde tek kompakt tablo olarak görünür. Panel açılıp kapanabilir, varsayılan kapalı olması yönündeki eski kararı master görselin görünürlük ihtiyaçlarıyla uyumlu değerlendir (açıldığında layout kaydırmasın).
- Her **şehir x kalite** hücresinde yalnız **Max Buy Order** (`buy_price_max`) ve **Min Sell Order** (`sell_price_min`) göster. Tekrarlı `Alış:` / `Satış:` etiketleri kullanma; yan yana yeşil/kırmızı değer + ikon/tooltip/erişilebilir başlık kullanılabilir. Eksikte `—`.
- Şehir sütunu ve iki bağımsız kalite fiyatının tümü sıralanabilir. Aynı kalite hücresindeki iki ölçütün ayrı sıralama hedefi olmalı (ör. görünür kompakt ikon/menü veya iki sayısal sütun başlığı mantığı), hiçbir tıklama yalnız süs olarak kalmamalı.

## 8. Ayrı İzleme Listesi (bu ana sayfaya gömülmeyecek)

- Önceden kilitlenen işlevin ayrı ekranını veya projedeki uygun ayrı görünümünü uygula: geniş liste; arama, uygun kolonlarda artan/azalan sıralama, filtreler, detay geçişi, listeden çıkarma.
- Her kayıt temel eşya değil, **tam varyasyon**dur: `server + item ID (tier/enchant dahil) + kalite`. Şehir bir gösterim/filtre boyutudur; kullanıcı açıkça ayrı şehir izlemeyi istemediyse eşya kaydını şehir başına otomatik çoğaltma. Aynı varyasyon ikinci kez eklenemez.
- Favoriler diye ikinci sistem kurma. Mevcut saklama/persist altyapısını kullan; API limitlerini aşacak biçimde tüm izleme listesine kontrolsüz eş zamanlı istek yağdırma.

## 9. Ekrana sığma, performans ve CSS

- Esas hedef 1920×1080 ve kullanıcının referansındaki yaklaşık 1688×896 görünümde **ana çalışma alanında fazladan dikey sayfa scrollbar'ı yaratmamak**; sabit ekran yüksekliğine göre grid/panel satırlarını ölçüp ayarla. Grafik/tabloları okunamayacak font boyutuna küçültme. 1440×900 ve 1280×720 testinde gerekirse mobil/kompakt sunum, açılır bölüm veya kontrol edilmiş yerel scroll kullan; hiçbir veri kesilip kaybolmasın. Kategori ağacının çok uzun hâlini accordion/sanal liste/pagination ile yönet. Mobilde item seçimi ve detay erişilebilir kalmalı.
- Renkler semantiktir; rastgele yeni badge/süs ekleme. Grafik SVG/canvas kütüphanesi projede varsa onu kullan; bağımsız ağır bir chart framework yükleme. `prefers-reduced-motion`, tooltip erişilebilirliği, klavye sıralama kontrolü, odak halkaları, gerçek `aria-sort` dikkate alınmalı.
- **Hardcode yapma.** Tasarım mockup rakamları (76.440 vb.) gerçek piyasa verisi değildir; JS/HTML içine canlı fiyatmış gibi yazma. Sunucu ve zaman dilimi mevcut proje ayarından gelir. Sayfa tamamen boş veriyle de düzgün görünür.
- Repo'daki SCSS/CSS standardizasyonunu bozma. Yeni sınıf/selector üretmeden önce mevcut base/modifier'ları bul; tekrar eden markupları bileşenleştir. Mevcut responsive kırılma noktalarını kullan. Görsel asset path ve cache stratejisi repo yapısına uygun olsun.

## 10. Doğrulama ve teslim koşulları

Tamamlamadan önce şunları gerçek testlerle kontrol et:
- Arama ve kategori ağacı, eşya aileleri, tier/enchant/kalite varyant eşleştirmeleri, eksik katalog adları.
- Üç farklı kaynak türü: canlı emir snapshot'ı, API sell-order history, şahsi gerçekleşmiş trade; veriler bilinçli olarak karşılıklı kirletilemesin.
- `0`, eksik tarih, eksik kalite, hiç fiyat olmayan şehir, çok eski gözlem, aşırı fiyat, veri yokken boş grafik/hacim; API kesintisi, cache ve limit durumları.
- 7/30/90 ortalamalarının doğru örnek ağırlığı; gerçek sayı/tarih sıralaması (artan ve azalan), boşların sonluğu; iki fiyatlı kalite hücresinin bağımsız sort'u.
- İzleme Listesi varyasyon bazlı kalıcılık/tekillik; ana ekranda favori/izleme listesi widget'ı bulunmaması; sayfa refresh sonrası durum.
- Head dosyalarının disk üzerindeki gerçek ölçülerinin **masaüstü PNG `2000 x 200`**, **mobil WebP `1200 x 480`** olması; iki dosyanın da doğru responsive kullanımının ve 24×24 SVG'lerin XML geçerliliği / `currentColor` kullanımının kontrolü. Eski 2048×160 ölçüsü veya dosyası kullanılmaz.
- Build, test, CSS derleme, mevcut Piyasa/Ada Planlayıcı/Günün Fırsatları/Flipper regresyonları; Chrome/Playwright desktop ve mobil ölçülerde (1920×1080, 1688×896, 1440×900, 1280×720, 390×844) görsel ve işlev kontrolü. Mevcut fiyat arşivlerini/collector'ı değiştirmeden test koş.

**Teslim yanıtı:** Değişen dosyalar, bağlı mevcut altyapı modülleri, gerçek verinin bulunamadığı yerler, fonksiyonel/doğrulanamayan özellikler ve geçen testleri kısa maddeler hâlinde bildir. Final ekranın 1920×1080 ve 1688×896 screenshot'larını üret. Yeni veriler veya işlevler için onay olmadan sahte veri/özellik üretme. Tasarımı master görselden farklılaştırmak gerekiyorsa yalnız fiziksel sığma veya gerçek veri zorunluluğu için, farkı gerekçelendir.
