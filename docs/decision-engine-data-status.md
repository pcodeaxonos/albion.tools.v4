# Veri Durumu ve tam viewport doğrulaması

Son düzeltme: kapalı sonuç artık sabit tablo/kart yüksekliklerinin toplamı yerine kalan gerçek viewport yüksekliğini grid içinde paylaşır. 1920 genişlikte 1080, 1000, 953 ve 900px yüksekliklerde `html`, `body`, `.app-content` ve `.decision-result` taşması 0px. Eski sabit yükseklikler yeniden uygulanınca 900px viewport'ta sağ sonuçta 161px taşma oluştu. Ayrıntılar açıldığında doğal yükseklik ve kaydırma geri gelir. [Yükseklik karşılaştırması](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-viewport-heights.json). Aşağıdaki kart ölçüleri önceki düzenlemeye aittir; güncel tüm alan ölçümleri bağlantıdaki JSON'dadır.

10 Ekim 2026. Kartların altındaki açıklamalar analiz panellerinin üstündeki tek satırlık, ikonlu Veri Durumu şeridine taşındı. Ücretler, craft varsayımları, fiyat kaynakları, tazelik, 28 günlük referans ve gözlem dökümü aynı açılabilir ayrıntı alanında toplandı. Tekrarlayan geçmiş açıklaması kaldırıldı. Gerçek uyarılar, bilinmeyen değerler ve veri kaynakları korundu.

## Scroll incelemesi

1920 × 1080 gerçek Chrome viewport'u, Europe/Martlock, T8 Beef Sandwich, 100 adet ile ölçüldü. API verileri taklit edilmedi. Sidebar ve ortak head dahil tüm yükseklik zinciri incelendi; tüm `auto`/`scroll` alanları JSON'a kaydedildi. İlk incelemede önceki görüntüdeki scrollbar mevcut sürümde yeniden üretilemedi; bu nedenle geçmiş scrollbar'ın kaynağına ilişkin kesin bir iddia yoktur.

Yeni sürümde alt açıklamalar ve iki ayrı alt başlık yerine tek şerit kullanılması, toplam kapalı içerik yüksekliğini azaltır. Analiz panelleri 1053px'de sona erer; sağ sonuç alanının alt sınırı 1072px'dir. Yeni `overflow: hidden` kuralı eklenmedi. Mevcut sidebar kabuğunun önceden var olan kuralı değiştirilmedi.

| Alan | scrollHeight | clientHeight | Taşma |
| --- | ---: | ---: | ---: |
| html / body / app-shell | 1080 | 1080 | 0 |
| Sidebar | 1080 | 1080 | 0 |
| Sidebar nav | 970 | 970 | 0 |
| app-content / main | 1080 | 1080 | 0 |
| Head | 99 | 99 | 0 |
| page-body | 981 | 981 | 0 |
| tool-split / sağ sütun / sağ sonuç | 973 | 973 | 0 |
| Ürün listesi | 857 | 857 | 0 |
| Alternatifler | 302 | 302 | 0 |
| Analiz kartlarının her biri | 234 | 234 | 0 |

Görünür alanların tümünde scrollbar için ayrılan genişlik de 0px. Kapalı hesaplama ayarlarının iç paneli 719/398px'dir; kapalı `<details>` içinde olduğundan normal ekranda görünmez. Diğer kapalı autocomplete/status/tooltip alanları 0/0px'dir. Ayrıntılar ve gözlem dökümü açıldığında sağ sonuç alanı 1991/973px olur ve 1018px kaydırılarak sonuna erişilir; bu beklenen detay davranışıdır.

- [1920 × 1080 güncel ekran](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-data-status-1920.png)
- [Tüm scroll alanlarının ölçümleri](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-data-status-scroll.json)

## Değişen dosyalar ve testler

- `content/js/tools/decision-engine.js`: notların ortak Veri Durumu alanında birleştirilmesi.
- `content/scss/app/_decision-engine.scss`: kompakt şerit ve ayrıntı alanı; eski alt başlık kurallarının kaldırılması.
- `output/css/site.css`: derlenmiş stiller.
- `content/scripts/test-decision-ui.cjs`: yeni detay erişimi, normal viewport taşması ve notların kartlardan kaldırılması kontrolleri.
- Bu rapor.

Node 24 ile 27 motor senaryosu, veri adaptörü ve geçmiş grafik testleri geçti. CSS derlemesi, JavaScript sözdizimi, 22 rota, masaüstü/mobil UI regresyonu ve 9 ortak başlık kontrolü geçti. Motor, veri servisleri ve ortak head yapısı değiştirilmedi. Görüntü ayrıca açılıp incelendi; sağda scrollbar görünmüyor.
