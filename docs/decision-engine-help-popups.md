# Karar Motoru açıklama düzeni

Akordiyonlar kaldırıldı. Kısa açıklamalar ortak `initTooltips` bileşeniyle gösterilir; uzun craft açıklamaları ve hesap dökümleri native `app-dialog` içinde açılır. Kaynaklar/ücretler, gözlem dökümü ve hesaplama ayarları popup kullanır. Escape, ortak dış kapatma düğmesi ve backdrop kapatma desteklenir. Tooltip'ler klavye odağında da açılır.

Açıklamalar paragraf yerine kısa ikonlu maddeler ve etiket/değer satırları kullanır. Doğrulanan girdiler yeşil, eksik/koşullu bilgiler turuncu, veri bölümleri mavi başlıklarla ayrılır. Gerçek fiyatlar, zamanlar, referans kapsamı ve hesaplama sınırları korunur. Motor ve veri servisleri değiştirilmedi.

Normal ekran kalan viewport'u paylaşır; popup yalnızca kendi iç sheet alanında kaydırılır. Gerçek Europe/Martlock Beef Sandwich seçimiyle 1920×1080'de tüm görünür scroll alanlarında taşma 0px ölçüldü.

## Görseller ve ölçümler

- [Normal ekran](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-popup-page-1920.png)
- [Kaynaklar ve ücretler popup](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-sources-popup-1920.png)
- [Hesaplama ayarları popup](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-settings-popup-1920.png)
- [Tooltip](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-tooltip-1920.png)
- [Tüm scroll alanları](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-popup-scroll.json)

## Doğrulama

CSS derlemesi, JavaScript sözdizimi ve 27 motor senaryosu/adaptör/grafik testleri geçti. Masaüstü/mobil UI regresyonu geçti: tooltip odağı, popup kapatma, popup mobil genişliği, normal ekranın farklı viewport yüksekliklerinde taşması, sticky başlık, manuel ücret/focus, arşiv hatası/tekrar deneme ve geçersiz miktar. Gerçek veri popup görselleri açılıp incelendi.

Değişen dosyalar: `content/js/tools/decision-engine.js`, `content/scss/app/_decision-engine.scss`, `output/css/site.css`, `content/scripts/test-decision-ui.cjs` ve bu rapor.
