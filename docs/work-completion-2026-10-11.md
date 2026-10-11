# Yarım kalan işlerin kontrolü — 11 Ekim 2026

Mevcut çalışma ağacındaki Karar Motoru, piyasa gözlem/fırsat sistemi, ortak eşya adı kopyalama, canlı fiyat abonelikleri ve başlık değişiklikleri incelendi.

Tamamlanan eksikler:

- Piyasa toplama testi sabit tarihli emirleri gerçek saate göre değerlendiriyordu. NATS adaptörünün mevcut `now` enjeksiyonu kullanıldı; emir süresi testi artık çalıştırma tarihine bağlı değil.
- Karar Motoru tarayıcı testi eşya adına tıklayarak seçim bekliyordu. Paylaşılan kopyalama davranışı bu tıklamayı bilinçli olarak seçimden ayırır. Seçimler görsele taşındı; gerçek panoda tam ismin mouse, Enter ve Space ile kopyalandığı ve satırın seçilmediği doğrulandı.
- Paket tanımında Node gereksinimi yoktu. Kullanılan modern API'ler için Node 22+ gereksinimi paket ve lockfile'a eklendi; kontrol Node 24.19.0 ile yapıldı. Sistem PATH'inde bulunan Node 16 bu proje için uygun değil.
- Mevcut testler için `npm test`, `item-name:test`, `prices:live:test`, `ui:test` ve `opportunities:regression:test` komutları eklendi.
- Yerel arşiv migration `.bak` dosyaları kaynak kontrolünden hariç tutuldu; yedekler silinmedi.
- Son piyasa kanıtlarının eksik [teslim raporu](market-final/report.md) tamamlandı.

## Yeniden doğrulama

`npm test` motor/veri/geçmiş, şehir seçici, tooltip, kopyalama, canlı fiyat, emir geçmişi, collector/collection, fırsat, ada ekonomi/stability/forecast, işçi ve rota kontrollerini çalıştırır. `npm run opportunities:regression:test` mevcut dondurulmuş arşiv üzerinde eşdeğerliği ve sentetik performansı denetler. `npm run css:build` CSS çıktısını üretir.

Üç komut da başarılı tamamlandı. Eşdeğerlikte 25.210 karşılaştırma ve 0 fark; performansta cold 3.966 ms / warm 60 ms ölçüldü. Değiştirilen test dosyalarının sözdizimi ve `git diff --check` kontrolü temizdir.

`npm run ui:test` için Playwright erişilebilir olmalı ve `npm run serve` ile yerel sunucu çalışmalıdır. Farklı port kullanılırsa `DECISION_TEST_ORIGIN` ve `HEAD_TEST_ORIGIN` aynı sunucuya ayarlanmalıdır. Bu kontrolde port 3012 ve bundled Playwright (`NODE_PATH`) kullanıldı. Masaüstü/mobil Karar Motoru testi ve 1920/1280/390 genişliklerinde üç aracın toplam 9 ortak başlık kontrolü geçti.

Veri kapsamına ilişkin bilinmeyen dolum, emir derinliği ve manuel craft girdileri önceki raporlardaki gibi korunur. Eksik veriler örnek fiyatla doldurulmadı.
