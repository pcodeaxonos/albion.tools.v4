# CSS/component mimari denetimi — 11 Ekim 2026

Başlangıçta 40 CSS/SCSS dosyası ve 284 HTML/JS/template/test dosyası tarandı. Son durumda yeni ortak stiller ve kontroller dahil 42 stil, 287 markup/script dosyası kontrol ediliyor. Üretilmiş `output/css/site.css` kapsamda; bağımlılıklar ve geçici karşılaştırma dosyaları kapsam dışında.

112 eski sınıf adı migrate edildi veya kullanılmadığı doğrulanarak kaldırıldı. Bunların yerini 53 görev temelli base/modifier adı aldı. İsim eşlemeleri ve kaldırılan sınıflar `content/scripts/css-component-migrations.json` içinde; bu dosya runtime compatibility katmanı değildir. Eski sınıflar HTML, JS ve CSS'te tutulmadı.

| İncelenen bileşen kümesi | Canonical sınıflar / stil kaynağı |
| --- | --- |
| Araç form toolbar'ları, yan alanlar, etiketler ve notlar | `tool-form-toolbar`, `tool-form-field`, `form-side-field`, `form-side-label`, `tool-result-note` — `_tool-controls.scss` |
| City/item seçim başlıkları ve sonuç bölüm başlıkları | `choice-field-label`, `result-section-title` — `_tool-controls.scss` |
| Premium/tür/fiyat yönü gibi bölümlü seçimler | `segmented-choice`, `segmented-choice-button`, ikon/etiket ve compact/icon/short modifier'ları — `_segmented-choice.scss` |
| Malzeme fiyat listeleri ve kartları | `material-price-list`, `material-price-card`, text/label/meta/row; single/tiers/auto liste modifier'ları — `_market-resources.scss` |
| Manuel piyasa fiyatları ve tablo hücreleri | `market-price-field`, `market-price-cell`; dense/fluid/unlabelled modifier'ları ve missing/stale durumları — `_market-fields.scss` |
| Piyasa tabloları, eşya bilgileri, sayılar ve bonuslar | `market-table`, `market-item`, name/meta, `market-number`, `market-bonus`, `market-verdict`; fixed/enchant/highlight-best/wrap/inline modifier'ları — `_market-resources.scss` |
| Tarif chip'leri | `recipe-list`, `recipe-chip`, `recipe-chip-icon` ve large modifier — `_market-resources.scss` |
| Enchant/Royal tier matrisi hücreleri ve başlıkları | `material-price-matrix-cell/corner/heading/note` — `_market-resources.scss`; matrise özgü kolon geometrileri araç dosyalarında |

SCSS yaklaşık **210 satır**, derlenmiş CSS yaklaşık **370 satır** azaldı. Markup satır sayısı esasen değişmedi; modifier kullanan yerlerde base sınıf açıkça eklendi. Sayfa stillerindeki kopya price-field ve matrix-cell blokları ortak kaynaklara taşındı. Desktop/split ve responsive seçiciler aynı isimlendirmeye geçirildi. Tekrarlanan kayıp/pahalı fiyat tonu `--color-market-loss` token'ına alındı.

Kullanılmayan `carleon-mat-value`, `enchant-chip`, `enchant-verdict`, `trades-panel-head`, `trades-table-head`, `yield-controls-column` stilleri kaldırıldı. Stilsiz `ava-mat--tier` işareti ve artık gerekli olmayan `pasture-table` class hook'u kaldırıldı. Yinelenen bonus ikon seçicisi temizlendi.

JS tablo erişimleri scoped `[data-market-table]`, fiyat alanı erişimleri `[data-market-price-field]` kullanıyor. Ortak fiyat renderer'ı hook'u üretir. Dinamik `className`, state, sort-header, fieldClass ve yeniden render yolları güncellendi. Mevcut davranış data hook'ları ve `is-active/is-missing/is-stale/is-manual` durumları korundu. Eşya adı render'ları mevcut `itemNameHtml` kopyalama davranışını koruyor.

`AGENTS.md` ortak component convention'ını içeriyor. `npm run css:check`, `npm test` zincirine eklendi. Kontrol:

- Kaldırılan sınıfların geri gelmesini hata olarak yakalar.
- Ortak rolün yeni tool-prefixed varyantlarını, çoklu araç seçici gruplarını ve aynı/yakın declaration bloklarını uyarı olarak raporlar.
- Responsive context'i ayrı değerlendirir; küçük tesadüfi declaration eşitliklerini component saymaz.
- `--all` ile kullanılmayan/dinamik seçici adaylarını gösterir. Dinamik markup nedeniyle bu adaylar otomatik silinmez.

Doğrulama sonuçları:

- `npm run css:build`, `npm run css:check`, `npm test`: geçti.
- `npm run ui:test`: karar motoru ve sayfa başlıkları; 390/1280/1920 px kontrolleri geçti.
- `npm run flipper:ui:test`: 390/768/1280/1920 px; bounded paneller, üç city-picker stili, tarama, detay, clipboard ve sepet kontrolleri geçti.
- Yeni `npm run css:ui:test`: route kayıtlarından türetilen 18 sayfa × 390/1440 px = 36 kontrol geçti. Base/modifier beraberliği, runtime hataları, görünür item isimlerinin Enter/Space/click ile kopyalanması ve görünür manuel fiyat alanlarının güncellenmesi doğrulandı.
- 12 aracın iki viewport'ta önce/sonra tüm görünür `main` elemanlarının ölçü ve stil karşılaştırması aynı çıktı. Son CSS değişikliklerinden sonra etkilenen beş araç tekrar karşılaştırıldı: fark yok. Desktop ve mobil ekran görüntüleri ayrıca incelendi.
- `git diff --check`: geçti.

Tarayıcı testleri mevcut diğer UI testleri gibi Playwright/Chrome ve çalışan yerel sunucu gerektirir. `CSS_UI_BASE_URL`, `CSS_UI_ARTIFACT_DIR` ve isteğe bağlı `CSS_UI_BASELINE_DIR` ile ortam ve önce/sonra karşılaştırması ayarlanabilir.

Bilerek ayrı bırakılanlar: House kartları malzeme ihtiyacı/miktarı gösterir; piyasa fiyat kartları editördür. Royal eşya setleri, station planları ve tier-matris kolonları domain yapılarıdır. Flipper fırsat/detail kartları ve Trade ledger satırları piyasa hesap tablosuyla aynı bileşen değildir. City haritası ve plant ikon seçicisinin içerik/etkileşim yapıları farklıdır; sadece ortak caption'ları birleştirildi. Sabit fiyat filtreleri ve opportunity seçenekleri gibi farklı bağlamlarda tesadüfen eşleşen küçük declaration blokları birleştirilmedi.

Son mimari kontrolünde eski sınıf hatası yok. 22 advisory bulgu ve 190 kullanılmayan/dinamik seçici adayı, semantik inceleme gerektirdikleri için build failure yapılmadı. Redesign veya kasıtlı görsel değişiklik yapılmadı; çalışmaya başlamadan önce mevcut kullanıcı düzenlemeleri korundu.
