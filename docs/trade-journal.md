# Ticaret Günlüğü

Rota: `/pages/tools/trade-journal/` (mevcut kanonik `pages/tools` mimarisi), Piyasa menüsü. Trade Dashboard kaynakları değiştirilmedi.

## Veri ve hesap

Mevcut `trade-live.js` üzerinden SAT Trade Hub REST snapshot, status ve SSE kullanılır. Kaynak `UserData-EUROPE/Trades.json`; yalnız `mail_buy`, `instant_buy`, `mail_sell`, `instant_sell` gerçekleşmeleri hesaba girer. Süresi dolmuş emir, crafting ve oyuncu transferi alış/satış sayılmaz. İptal olayı veya işlem zamanına uygun doğrulanmış piyasa referansı mevcut adaptörde bulunmadığından iptal/avantajlı fiyat üretilmez.

Gün sınırı açıkça Europe/Istanbul'dur; mevcut ayarlarda kullanıcı saat dilimi alanı yoktur. Gruplar gün, karakter, item kimliği (tier/enchant dahil), kaynak konumu, kalite ve yön ile ayrılır. Eksik kalite ayrı ve bilinmeyen olarak gösterilir. Kimliksiz veya geçersiz gerçekleşmeler atlanır, arşiv geneli teşhisi gösterilir. Tekilleştirme karakter ve SAT sourceId ile yapılır; benzer fiyat/saat üzerinden birleştirme yapılmaz.

Özetler vergi öncesi gerçekleşmiş tutarlar ve toplam/adet ağırlıklı ortalamadır; kâr değildir. Günün Hikâyesi eşikleri ve sınırları `JOURNAL_STORY_RULES` içinde tutulur. Büyük hacim, çift yön ve yoğun tekrar sırasıyla değerlendirilir; hacim payı, tutar, fill sayısı, son zaman ve kimlik sıralamayı kararlı tutar. En fazla üç olay, kategori başına iki olay ve temel grup başına tek olay seçilir. 1–4 fill günlerinde yalnız mutlak büyük hacim eşiği geçerlidir. Özet olaylardan bağımsızdır. Çift yön kartı iki kaynak grubunun detayını açar ve mevcut okunma durumlarını kullanır. Geç gelen fill günün hikâyesini yeniden hesaplatır. Grafik veya envanter eşleştirmesi yoktur.

## Okunma durumu

Mevcut `/api/v1/user-data` ve `durable-storage.mjs` üzerinden `.albion-tools.sqlite` içinde `albiontools.v4.tradeJournalRead.<SHA-256>` anahtarları kullanılır. Anahtar Europe/personal, SAT arşiv yolu ve grup kimliğinden türetilir. İçerik sürümü gerçek fill kimlikleri, saat, adet ve tutarlardan oluşur. Referans fiyatı veya render sürüme girmez. Yeni/geç gelen fill yalnız ilgili grubun sürümünü değiştirir. Sayfayı ziyaret etmek okundu yapmaz; grup açılması veya elle işaretleme kalıcı kayıt onayından sonra etkili olur.

Mevcut SQLite revision kontrolü korunur; çakışma/yazma hatası görünür ve okundu gibi gösterilmez. Aynı origin pencereleri BroadcastChannel ile, yeniden açılış/odak ve görünür sayfalarda aralıklı sunucu yenilemesiyle eşitlenir. Kalıcı kaynak localStorage değildir. Uygulamanın mevcut yerel tek kullanıcı kapsamı korunur; ayrı auth/collector eklenmez.

## Görseller

Paket dosyaları değiştirilmeden ortak head haritasına eklendi: desktop PNG **2000×200**, mobile WebP **1200×480**. Mobilde ayrı WebP seçilir. Başlık HTML'dir.

## Doğrulama

- `npm run trade-journal:test`: tutar/yön, varyantlar, parçalı fill, duplicate, sürüm, geç kayıt, İstanbul gün sınırı, eksik veri ve temkinli olaylar.
- `npm run trade-journal:ui:test`: 1366×768, 1920×1080, 992×600, 768×900, 390×844, 320×720; menü, gerçek piksel boyutları, ayrıntı, iki pencere, SQLite yeniden açılışı, duplicate SSE, yeni fill, başarısız yazma, boş/hatalı kaynak.
- İsteğe bağlı `JOURNAL_REAL_AUDIT=1` aynı test içinde gerçek SAT arşivini okur; testlerin yazıları geçici ayrı SQLite'a gider. Gerçek kişisel okunma durumuna yazmaz. 17.175 gerçek kayıt ve son günün 9 fill / 8 grubu tarayıcıda doğrulandı. Fixture ekranları ve gerçek arşiv ekranları ayrı adlandırılır.
- CSS derlemesi, `css:check`, `app:test`, `routes:test`, SAT self-test ve tüm araçların 1440×900 / 1280×720 / 992×600 taşma kontrolü geçti.
- Genel `npm test` çalıştırıldı; `item-name:test` içinde eski VM taklidinin `cityNameHtml` export'u eksik olduğu için durdu. Kalan ana gruplar ayrıca çalıştırıldı: fiyat live/history/collector/collection, island stability/forecast, laborer, routes ve flipper geçti. `opportunities:test` şehir markup'ı için `Lymhurst → Brecilien` düz metin beklentisinde; `island:test` `Net kâr / gün` metin beklentisinde başarısız. Bu dosyalar bu görevde değiştirilmedi. Bu grupların sonraki `&&` alt testleri çalışmış sayılmaz.

Tarayıcı ekranları `output/trade-journal-verification/`, genel test kaydı `output/trade-journal-full-test.log`, kalan grup kayıtları `output/journal-check-*.log` altındadır.
