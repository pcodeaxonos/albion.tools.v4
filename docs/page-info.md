# Ortak sayfa bilgisi

`content/js/components/page-info.js`, navigation tarafından her `.page-head` için otomatik kurulur. Hero kullanmayan başlıklara `data-page-info-head` eklenir. Sayfalarda popup HTML’i veya açma/kapatma kodu yazılmaz.

- İçerik kaynağı: `<section data-info>…</section>` veya `<p data-info>…</p>`. Mevcut `data-page-info` aynı şekilde desteklenir.
- İsteğe bağlı başlık: `data-info-title="Masraflar"`.
- İsteğe bağlı renk: `data-info-tone="buy|sale|warning|neutral"`.
- Başlık açıklamaları ve başlıktaki tooltip bilgileri ortak alana alınır. İşlem düğmeleri başlıkta kalır.
- Açılışta kaynakların güncel içeriği okunur. Açık popup kaynak DOM değişikliklerini izler. Sayfa yeniden çizildiğinde önceki popup temizlenir; açık durum korunur.
- Düz metin cümlelere ayrılır. Linkler ve `itemNameHtml` içeren içerikler korunur; kopyalanan kaynak ID’leri temizlenir.
- Flipper gibi yapılandırılmış içerik için `pageInfoCardsHtml` kullanılabilir; kartlar yine `data-info` kaynağında tutulur.

Görünüm, SVG ikon, dialog yapısı ve etkileşimler tek bileşen ve `_page-info.scss` üzerinden değiştirilir.
