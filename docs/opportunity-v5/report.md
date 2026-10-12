# Günün Fırsatları V5 — ticaret kararı, rota grupları ve senaryo

V5 uygulandı ve canlı serviste doğrulandı. V4 fırsat tespiti, tarihsel fiyat referansları ve sıralama modülü değiştirilmedi. Bunların üzerine satış hareketliliği, ticari önceliklendirme, ortak hedefe göre rota gruplama ve kullanıcı miktarına bağlı hesaplama eklendi. Arşiv biçimi, collector kapsamı/bütçesi, mevcut CSS ve diğer kullanıcı değişiklikleri korundu.

## Baseline ve aynı gerçek veri

Değişikliklerden önce çalışan V4 çıktısı `2026-10-11T22:49:00.208Z` zamanında kaydedildi. Kaynak dosyalar `baseline-*.txt`, fiyat girdisi `baseline-scan.json.gz`. Bu fiyat snapshot'ında 99 fiyat kanıtlı aday vardı. İlgili ürünlerin bütün gerekli şehirlerdeki günlük satış geçmişi tek AODP isteğiyle `2026-10-11T22:51:18.559Z` zamanında alındı: 487 ürün/şehir/kalite geçmiş satırı. Bu sorgu yalnız denetim dosyasına yazıldı; üretim arşivine fiyat veya referans oyu eklenmedi.

| Aynı snapshot | V4 | V5 |
|---|---:|---:|
| Tespit edilmiş kaynak adayı | 99 | **99 korunuyor** |
| Gösterim birimi | 99 kaynak kartı | **79 fırsat grubu** |
| İlk 20'de farklı ürün/kalite | 20 | 20 |
| İlk 20'de 25 silver altı birim avantaj | 1 | 3 |
| İlk 20'de aynı hedef kotasyonunun tekrarı | 0 | 0 |

Bu snapshot'ın ilk 20'sinde zaten ortak hedef tekrarı yoktu; ilk 20 tekrarları kaldırıldı diye iddia edilmiyor. **Tam havuzdaki** 17 ortak hedef grubunda 20 ek kaynak alternatifi karttan gruba taşındı. Bütün adayların grup ve alternatifler üzerinden tekrar sayılınca 99 olduğu assert edildi. Sayı azaltımı fırsat elemesi değildir; aynı hedef likiditesine dayanan işlemlerin sunumudur.

İlk 20'de düşük nominal avantaj sayısı artmış olsa da bunlar listeyi yalnız ROI nedeniyle ele geçirmiyor: örneğin %688,57 ROI'li `T5_ROCK_LEVEL2@2` 6. sıradan 9. sıraya; 16.227,76 silver birim avantajlı `T4_MAIN_RAPIER_MORGANA@3` 17. sıradan 3. sıraya geçti. İlk üç adayın birim avantajı yaklaşık 11.008 / 15.694 / 16.228 silver. Düşük birim kazanç korunuyor; miktarla anlamlı olup olmadığı ayrıca hesaplanıyor.

Kaynak, fiyat, strateji, ROI, sermaye, hareketlilik, alternatifler ve açık varsayımlı örnek hesaplarıyla [ilk 20 incelemesi](first20.md) ve [tam sayısal karşılaştırma](comparison.json) kaydedildi. Fiyat ve satış girdilerinin SHA-256'ları karşılaştırma dosyasında bulunur. Önce/sonra aynı fiyat girdisini kullanır; bu canlı ticaret backtest'i değildir.

## Satış hareketliliğinin anlamı

AODP günlük geçmişi Sell piyasası için toplulaştırılmış veri sağlar. İstemcinin market-history yapısı ürün miktarı (`ItemAmount`), silver toplamı ve zaman damgasını taşır. Dolayısıyla `item_count`, **satılmış ürün adedi** olarak değerlendirilir; tekil işlem sayısı veya emir derinliği değildir. [AODP API](https://www.albion-online-data.com/api/), [istemci market-history veri yapısı](https://pkg.go.dev/github.com/ao-data/albiondata-client/lib#MarketHistory).

Yeni özet şu alanları ayrı tutar:

- Bildirilen günlerde satılmış toplam ürün adedi, pozitif satış bildirilen gün sayısı, bildirilen gün başına miktar ve medyan.
- 28 günlük pencerede bildirilen gün sayısı, kapsam, son tamamlanmış gün, kaynağın alınma zamanı.
- Tam / eksik / eski / bilinmeyen geçmiş durumları.
- **İşlem sayısı ve emir derinliği: bilinmiyor (`null`).**

Yalnız tamamlanmış UTC günleri kullanılır. Aynı günün tekrar veya düzeltme verisi iki kere toplanmaz. Eksik günler sıfır satışa dönüştürülmez; günlük ortalamanın paydası bildirilen gün sayısıdır. Güncel API yanıtının içinde eski geçmiş bulunması, geçmişi güncel yapmaz. Çok büyük veya geçersiz sayılar güvenilir miktara dönüşmez.

Arbitraj hedefindeki Buy kotasyonu için kullanılan hareketlilik, **hedef pazarın tarihsel Sell miktarıdır**; aynı Buy emrinin geçmişte veya şimdi bu miktarı karşılayacağını kanıtlamaz. V4 baseline'ındaki 99 birincil adayın yeni sorguda 80'i tam, 17'si eski, 2'si bilinmeyen satış geçmişine sahipti. Üretimde mevcut collector'ın zaten sakladığı günlük geçmiş okunur; yeni toplama programı, bütçe artışı veya kalite genişletmesi yapılmadı.

## Önceliklendirme

V4 puan ağırlıkları yeniden ayarlanmadı. V5 bileşenleri ayrı alanlarda tutar: birim nominal avantaj, ROI, gereken sermaye, fiyat güncelliği, fiyat kanıtı, tarihsel satış miktarı, satış kapsamı ve geçmişin güncelliği.

Tam alış/satış fiyatları bilinen teorik ticaretlerde, sermaye verimini birim kazançla ilişkilendiren parasal öncelik kullanılır:

`sermaye verimli birim indeks = birim net avantaj × ROI / (1 + ROI)`

`fiyat kanıtlı öncelik indeksi = bu indeks × V4 güncellik bileşeni × V4 fiyat kanıtı bileşeni`

`ROI / (1 + ROI)`, ücret sonrası gelir içindeki avantaj payıdır; 0 ile 1 arasında sınırlıdır. Bu nedenle ucuz alış fiyatı ROI'yi büyütse bile parasal indeks birim nominal avantajı aşamaz. 2 silver avantaj ve aşırı yüksek ROI, bu yolla 1.000 silver avantajlı makul bir işlem üzerinde sınırsız puan üretemez. **Bu indeks beklenen veya gerçekleşecek kâr değildir.** Miktar ve dolum olasılığı içermez.

Güncellik, kanıt, sermaye ihtiyacı ve satış hareketliliği için Pareto katmanları kullanılır: bir aday bütün karşılaştırılabilir ölçülerde en az diğer kadar iyi ve birinde daha iyi ise öne geçer. Bilinmeyen satış miktarı, ölçülmüş miktarla sıfır gibi karşılaştırılmaz. Katman içinde parasal indeks sıralar. Bir adayın küçük sermaye ihtiyacı büyük sermayeli fırsatla yapılan karşılaştırmada ayrıca korunur. Satış geçmişi yeni bir rastgele ağırlıkla parasal puana eklenmez veya tahmini satış miktarına çevrilmez.

Gerçek yeniden satış ROI'si bilinmeyen tarihsel tasarruf/satış referansı adayları **referans fiyat fırsatı** olarak ayrıca açıklanır; referans fiyatı otomatik alış maliyeti veya yeniden satış fiyatı yapılmaz. “Toplu miktarla değerlendir” görünümü hesaplanabilir ticaret gruplarını küçük birim avantajdan başlayarak gösterir. Her adayın miktar senaryosu incelenebilir; bu görünüm sabit bir nominal eşik veya en ucuz %25 kotası kullanmaz. Düşük nominal adaylar ana havuzdan silinmez. Mevcut 500 kart gösterim sınırı keşif/filtre havuzunu kesmez.

## Rota gruplama

Gruplama anahtarı: sunucu, ürün, kalite, hedef şehir, ortak hedef Buy zaman damgası, fiyatı, kaynağı ve doğrulama durumu. Kaynak şehirler farklı olsa da aynı hedef kotasyonunu tüketiyorlarsa tek gruptur. Kalite, hedef fiyat veya zaman farklıysa aynı grup değildir.

Filtreler ve strateji seçimi **gruplamadan önce** uygulanır. Böylece şehir veya strateji filtresi bir alternatifi erişilemez yapmaz. Grubun en iyi kaynak rotası parasal avantaj, kaynak güncelliği ve kanıtıyla varsayılan seçilir. Diğer rotalar detay panelinde ayrı butonlardır. Hedef likiditesi veya alternatiflerin kârı toplanmaz. İzleme adaylarının V4 öncelik sırası korunur; eksik kanıt daha fazla parasal puanla doğrulanmış sayılmaz.

Örnek: `T7_FIBER_LEVEL1@1` için Brecilien, Caerleon ve Thetford → Lymhurst rotaları bir gruptur. Birim avantajları yaklaşık 917,80 / 311,80 / 227,80 silver. Bunların aynı hedef Buy miktarını paylaştığı hem kartta hem panelde belirtilir.

## İşlem simülatörü

Mevcut detay paneli, mevcut `.tool-split`, `.form-floating`, `.form-control`, `.form-select` ve `.calc-table` bileşenleriyle genişletildi; yeni CSS veya kontrol görünümü yazılmadı. Yeni ID'ler yalnız etiket erişilebilirliği içindir; JavaScript scoped `data-*` hook'ları kullanır. Ürün adı kopyalama yolu değişmedi.

Kullanıcı miktar, birim alış/satış fiyatı, sabit taşıma/ek gider, birim ek gider ve anlık/emir işlem biçimini seçebilir. Stratejinin tükettiği gerçek fiyatlar ve işlem biçimleri varsayılan gelir. Eksik alış veya satış fiyatı kullanıcı girişi gerektirir. Fiyatlar işlem ücretlerinden öncedir; mevcut katalogdaki Premium/Free vergi ve emir ücretleri ortak ücret fonksiyonlarıyla uygulanır.

Sonuçlar ayrı gösterilir: alış maliyeti, brüt satış geliri, alış/satış emir ücretleri, satış vergisi, satış sonrası net gelir, ek giderler, gereken sermaye, net teorik kâr, senaryo ROI ve hesaplanabiliyorsa başabaş miktarı. Önceden ödenecek satış emir ücreti sermayeye dahil edilir; net kârda ikinci kez düşülmez.

- Miktar boşken toplam kâr/sermaye üretilmez. Pozitif tam sayı gerekir.
- Eksik fiyat veya geçersiz giderde sonuç sınırlandırılır; referansla doldurulmaz.
- Ek giderlerde başlangıçtaki 0 açıkça “gider dahil edilmemiş senaryo” olarak belirtilir.
- `birim marj = ücret sonrası satış geliri − ücretli alış maliyeti − birim ek gider`.
- Sabit gider pozitif ve birim marj pozitifse başabaş `ceil(sabit gider / birim marj)`. Bu net sıfır veya üzeri içindir; miktarın mevcut olduğunu kanıtlamaz. Sabit gider sıfırsa ayrı bir başabaş miktarı, birim marj pozitif değilse de artırılan miktarla başabaş hesabı gösterilmez.
- Sayısal taşma, kesirli/negatif miktar ve geçersiz gider sınırları test edilir.
- Kaynak rotası değişince kullanıcı miktarı/ek giderleri korunur; varsayılan alış fiyatı güncellenir. Grafik yanıtı yeniden çizildiğinde girdiler korunur; eski rota yanıtı yeni rotanın panelini ezemez.
- Girilen miktar bildirilen tarihsel toplamı aşıyorsa bu fark görünür; bir satış kapasitesi veya süre tahminine çevrilmez.

**Örnek:** `T3_ROCK`, Martlock → Bridgewatch, 8,56 silver birim avantaj. Yalnız örnek olarak 100 adet ve 1.000 silver ek gider girilirse net **−144 silver**, başabaş **117 adet** olur. Son 28 bildirilen gündeki 5.123.140 satış adedi, bugün 117 adetlik Buy emri bulunduğunu kanıtlamaz. Yüksek hareketlilik tek başına bu 100 adetlik senaryoyu kârlı yapmaz.

`T4_ROCK_LEVEL1@1` için birim avantaj 22,80; aynı açık varsayımlı 100 adet / 1.000 gider senaryosu 1.280 silver ve başabaş 44 adet verir. Farkın pozitif olması taşımanın süresini/riskini veya yeterli emir miktarını doğrulamaz. İlk 20 dosyasındaki 100 adet **test senaryosudur**, otomatik önerilen miktar değildir. Örneğin birinci adayın bildirilen geçmişi yalnız 72 adettir; 100 adetlik senaryo için satış kanıtı bulunmadığı ayrıca belirtilir.

## Canlı çalışma

V4 süreç yalnız collector boşta ve konsol kendisine özelken güvenli Ctrl+C ile kapatıldı; zorla sonlandırma yapılmadı. Aynı kök dizin, arşiv ve yapılandırmayla V5 sunum modülleri olan süreç PID 35676 başlatıldı. Collector'ın normal arşiv yazımları devam ediyor.

Son doğrulama `2026-10-11T23:16:19.213Z` / **12 Ekim 02:16:19 Türkiye saati**:

- V4 çekirdek parmak izi aynen `f1a8a9fc4ad05d9f04b8f3bd682630225f904a37421ce24d61e3bb02135fc05e`.
- Sunum sürümü 5; üç V5 modülü parmak izi `4809a9a26e3cd3842f1bf65352dea841df553aa669624e110616aeb670c8018d`.
- Gerçek güncel çıktı: **97 kaynak adayı → 76 grup**, bütün 97 aday grup/alternatiflerde korunuyor; işlem kanıtı doğrulanmış aday 0.
- Satış geçmişi: 76 tam, 20 eski, 1 bilinmeyen aday; işlem sayısı ve derinlik alanları `null`.
- Collector `ok`: 9.509 ürün / 7 şehir / 61 istek, 38 yeni saatlik kayıt, 23 ek gözlem, 22.152 tekrar; hata ve bütçe ertelemesi yok.

[Canlı kanıt](live-proof.json), [canlı tarama](live-scan.json.gz), [collector durumu](live-status.json.gz). Bu güncel sayılar baseline'dan farklıdır çünkü piyasa ve zaman ilerlemiştir; fark yeni tespit filtresinden kaynaklanmaz.

## Testler

`npm run opportunities:test`, `opportunities:regression:test`, `prices:collector:test`, `prices:history:test`, `prices:collection:test`, `item-name:test` ve `css:check` geçti. V5 hesaplama/sıralama testleri: vergi ve çift emir ücretleri, gereken sermaye, başabaş sınırları, sıfır sermaye, eksik fiyat/miktar, zarar, giderler, taşma, satış günü tekilleştirme, bilinmeyen/gerçek sıfır ayrımı, ROI sınırı, satış kanıtı karşılaştırması, ortak hedef grupları, kalite/zaman ayrımı, filtrelenebilir alternatifler ve tespit girdilerinin değişmezliği.

25.210 gerçek seride fiyat/referans/doğrulama farkı **0**. V4 tespit/inceleme/sıralama dosyaları baseline ile byte bazında aynı. 2.520 × 2.160 saatlik regresyon yaklaşık 3,77 saniye soğuk / 205 ms sıcak; mevcut sınırlar geçti.

Gerçek donmuş girdilerle Chrome testi: 79 grup, alternatif seçiminde fiyat/sonuç güncellemesi, miktar/giderlerin korunması, ürün adı kopyalamanın parent kartı açmaması, toplam aritmetik, boş miktar ve temiz konsol. Masaüstü ve 390 px mobil panelde yatay taşma yok. [Masaüstü görüntü](scenario-desktop.png), [mobil görüntü](scenario-mobile.png). `css:check`: 0 retired-class hatası, 22 mevcut advisory; V5 CSS değiştirmedi. `git diff --check` geçti.

Yeniden üretim: `npm run opportunities:v5:test`, `npm run opportunities:v5:audit`, `npm run opportunities:v5:ui:test` (Playwright/Chrome mevcut olmalı). Denetim fiyat/satış dosyaları sabittir; UI testi workspace dosyalarını ve bu gerçek snapshot'ı izole Chrome bağlamında kullanır, üretim verisi yazmaz. Bu makinedeki UI testi paketleri Codex'in bundled Node/Playwright yolundan çalıştırıldı; projeye yeni bağımlılık kurulmadı.

## Kalan sınırlar

Tarihsel hareketlilik güncel emir derinliği değildir. Bilinmeyen miktar, gerçekleşme olasılığı, satış süresi, taşıma riski, yeniden emir açma gideri ve kişisel zaman maliyeti uydurulmaz. Kullanıcı istediği ek maliyetleri senaryoya girebilir; hesabın kârı tüm miktarın belirtilen fiyatlarda alınıp satılması koşulundadır. Gerçekleşmiş emir verisi olmadığı için gerçekleşmiş kâr veya kârlılık garantisi iddiası yapılmaz.
