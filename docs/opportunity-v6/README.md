# Günün Fırsatları V6 — kontrol ve gerçek işlem kanıtları

V6, V5 fiyat motorunun dışında çalışan kullanıcı kayıt katmanıdır. Fiyat toplama, arşiv, referans, keşif, uygunluk, gruplama ve sıralama değiştirilmedi. Otomatik öğrenme/filtreleme uygulanmaz.

## Kullanım

1. Fırsat detayındaki **Oyun içi kontrol ve gerçek işlem** bölümünü açın. Alış ya da satış tarafını seçip altı sonuçtan birini kaydedin. Tarih varsayılan olarak şimdi; gözlenen fiyat ve emir miktarı isteğe bağlıdır. Diğer taraf ayrıca kontrol edilir.
2. Olumlu bir taraf kontrolünden sonra **Doğrulanan fırsattan işlem başlat** alanında gerçek alış veya açık alış emrinin fiyatını/miktarını girin. Rota kısmen doğrulandıysa arayüz ve başlangıç kaydı bunu açıkça korur. Teorik simülatörün miktarları gerçek işlem olarak aktarılmaz.
3. Gerçek satışlar ve alışlar, emir açma/iptal, vergi/ücret/giderler ayrı olaylardır. İlgili açık emri seçerek her kısmi dolumu kaydedin. Stok ve açık emir kalmadığında işlemi tamamlayın. İşlem iptali stok veya önceki gerçekleşmeleri silmez; önce açık emirler iptal edilmelidir.
4. Ana listenin altındaki **Gerçek kontrol ve işlem performansı** bölümünde eski işlemleri de yönetebilirsiniz. Sunucu, strateji, kaynak/hedef şehir, katalog ürün grubu ve başlangıç fiyatının güncelliği filtreleri bulunur. **Kanıtları JSON olarak indir** tüm tarihsel sinyal/kontrol/işlem kayıtlarını dışa verir; seçili rapor filtresi ham kanıtları azaltmaz.

Eski kişisel bildirimler korunur; V6 taraf kontrolleri ve muhasebe raporuna otomatik aktarılmaz. Eski “İşlem gerçekleşti” bildirimi gerçekleşmiş net kârın kanıtı değildir.

## Kalıcılık ve bütünlük

- Hub GET/POST `/api/v1/opportunity-evidence`; depo `.opportunity-evidence.jsonl`. Fiyat arşivlerinden, SAT Trades.json dosyasından ve yerel ayar yedeğinden ayrıdır. Gerçek kullanıcı günlüğü ve kilidi Git dışında tutulur.
- Kontroller, işlemler ve başlangıç sinyalleri ayrı koleksiyonlar halinde okunur; günlük yalnız eklemeli komutlardan oluşur. SHA-256 zinciri sıralama/içerik bozulmasını kontrol eder. Yazım ve `fsync` tamamlanmadan başarı yanıtı verilmez. Süreç kilidi iki yazıcıyı önler; ölü süreç kilidi güvenli biçimde yeniden alınır.
- İstek kimliği ve komut özeti kalıcıdır. Aynı kimlik/aynı içerik önceki sonucu döndürür; aynı kimlik/farklı içerik reddedilir. Tarayıcı, yanıtı kaybolabilecek isteği göndermeden önce outbox'a kaydeder. Sayfa yenilendiğinde de aynı kimlikle yeniden denenir. Kesin reddedilen hatalı istek düzeltilerek yeniden gönderilebilir.
- Sinyal; sunucu/ürün/kalite/rota/strateji, sinyal zamanı, tüketilen fiyatlar ve kaynak zamanları, referanslar, güven/ekonomi/hareketlilik metadatasını saklar. Sonradan gelen fiyat, önceki sinyali veya işlem başlangıcının taraf doğrulamasını değiştirmez.
- Tamamlanmış satır bozulması depoyu sessizce sıfırlamaz: servis yazım için açılmaz. Çökme sırasında yarım kalan son satır, dosyanın güvenlik kopyası saklandıktan sonra atılır; önceki tam ve doğrulanmış komutlar korunur. Tamamlandığı onaylanan komutlar yeniden oynatılır.

## Muhasebe

Gerçek alış gerçekleşmesinin fiyatı × miktarı ile o gerçekleşmeye ait vergi, emir ücreti ve ek gider stok maliyetine eklenir. Satışlar FIFO alış lotlarını tüketir. Sonraki pahalı alış, önceki satışın maliyetini değiştirmez.

- **Gerçekleşmiş net** = gerçek satış tahsilatı − satılan stoğun FIFO maliyeti − emir açma/iptal sırasında ve ayrı gider kayıtlarında ödenmiş tutarlar.
- **Kalan stok değeri** = satılmamış lotların alış maliyeti. Gelecekteki satış bedeli/kârı değildir.
- **Bağlı sermaye** = kalan stok maliyeti + dolmamış alış emirlerinin fiyat × kalan miktarı. İptal edilmiş işlemde elde kalan stok hâlâ bu sermayeye dahildir.
- **Net nakit hareketi** = gerçekleşmiş brüt satış − gerçek alış bedeli − kaydedilmiş tüm vergi/ücret/giderler. Kısmi satışta gerçekleşmiş netten farklıdır. Stok tamamen satıldığında ve emirler kapandığında bu iki sonuç tutarlı biçimde eşitlenir.
- Açık satış emri gelir/kâr oluşturmaz. Açık alış emri stok oluşturmaz. Emir açılışında ödenen ücret yeniden dolum ücretine eklenmez; her ödemeyi yalnız bir kez girin. Muhasebe vergi oranını tahmin etmez; kullanıcı ödenmiş toplam tutarı girer. Ücret/gider alanında 0, kullanıcının o tutarı ödemediği beyanıdır; sonradan girilecek veya bilinmeyen giderler kayıtlı nete dahil değildir.

## Rapor paydaları ve öğrenme verisi

Kontrol edilen fırsatlar sunucu, ürün, kalite, kaynak/hedef rota ve strateji kimliğiyle ayrı sayılır. Tekrar kontrol tarihleri yeni kontrol kayıtlarıdır; aynı fırsatı tekrar tekrar başarı paydasına eklemez. Taraflar birbirinin kanıtı değildir.

Fiyat oranı her fırsat/tarafın **son açık fiyat değerlendirmesini** kullanır: doğru / (doğru + değişmiş). Kontrol edilemedi, emir bulunamadı, miktar yetersiz veya işlem yapılabilir gibi ayrı sonuçlar bir fiyat değerlendirmesi uydurmaz. Miktar problemi ayrı tutulur; sonraki fiyat kontrolü miktar sorununu kendiliğinden çözmez. Eksik/hiç kontrol edilmeyen fırsat başarısız sayılmaz. Tüm tarihler, gözlenen fiyat/miktar, gerçekleşmeler ve sinyaller dışa verilen kanıtlarda korunur.

Güncellik aralığı sinyal anı eksi kullanılan en eski fiyat kaynak zamanıdır: 0–1, 1–6, 6–24, 24+ saat veya bilinmiyor. Ürün grubu mevcut katalogdan alınır. Bu bağlar, 20–30 gerçek kontrol sonrasında fiyat uyumu, miktar problemleri, strateji dönüşümü ve teorik/gerçek sonuç farklılıklarını incelemeye yeterlidir; henüz istatistikten bir başarı vaadi üretilmez.

## Doğrulama

- `npm run opportunities:test`: mevcut V3/V4/V5 testleri + V6 bağımsız taraf, değişmiş fiyat, miktar, açık/kısmi/iptal/tamamlanmış işlem, kalan stok, negatif net, FIFO, idempotency, ayrı OS sürecinde yeniden yükleme, günlük bütünlüğü ve HTTP testleri.
- `npm run opportunities:v6:ui:test`: gerçek dondurulmuş snapshot üzerinde Chrome; kayıp yanıt + sayfa yenileme + mükerrerlik, gerçek işlem akışı, masaüstü/mobil taşma kontrolü, kopyalanabilir ürün adları, filtreler, JSON indirme ve yeniden açılan depo.
- Mevcut V5 Chrome testi, `opportunities:regression:test` (25.210 karşılaştırmada 0 fark), `item-name:test`, `prices:collector:test` geçti. `css:check`: 0 emekli sınıf hatası; 22 mevcut advisory.
- `baseline-scan.json.gz` ve `baseline-ranked.json.gz` V6 öncesi canlı V5 verisidir: 2026-10-12 00:01:59 UTC, 94 aday / 74 grup. V6 testi aynı girdinin tüm sıralanmış JSON çıktısını byte düzeyinde karşılaştırır; yalnız sayıya veya ilk 20'ye bakmaz. 11 V5 kaynak modülü SHA-256 ile aynı kaldı. Kanıt: `verification.json`.
- Güvenli hub yeniden başlatması sonrası V6 API ve V5 motor/presentation parmak izleri canlı doğrulandı: `live-proof.json`. Daha sonraki canlı snapshot 97 aday / 77 grup içeriyor; bu yeni fiyat girdisidir, aynı snapshot karşılaştırması değildir. Üretim V6 deposunda 0 kontrol / 0 işlem bulunur; test verileri yalnız geçici depolara yazıldı.

Node 22+ gereklidir. Bu makinedeki PATH Node 16 olduğundan testler paketlenmiş Node 24 ile çalıştırıldı. Chrome testleri Playwright gerektirir.

## Değişen dosyalar

V6 yeni çekirdek: `content/js/core/opportunity-evidence.mjs`.
Yeni kompakt UI: `content/js/components/opportunity-evidence.js`; entegrasyon: `content/js/tools/opportunities.js`.
Yeni kalıcı depo/API: `content/scripts/opportunity-evidence-repository.mjs`; mevcut hub'a ayrı route eklenmesi: `content/scripts/price-hub.mjs`.
Test/baseline/canlı kanıt scriptleri: `test-opportunity-v6.mjs`, `test-opportunity-v6-ui.cjs`, `capture-opportunity-v6-baseline.mjs`, `verify-opportunity-v6-live.mjs`.
`package.json`, `.gitignore` ve bu doküman/kanıtlar eklendi. V6 için yeni CSS veya derlenmiş CSS değişikliği gerekmedi. Kullanıcının mevcut CSS, collector, arşiv, SAT ve diğer yerel değişiklikleri korunuyor.

## Kalan sınırlar

Kayıtlar yerel hub'a bağlıdır; hub kapalıyken kalıcı başarı mesajı verilmez. Oyun içi sonuçlar ve ödeme tutarları kullanıcı beyanıdır; otomatik oyun/SAT dolum importu yoktur. Bilinmeyen alış maliyeti veya miktarla net kâr üretilmez. İptal edilmiş işlemde kalan stoğun satış/zarar yazımı otomatik yapılmaz. Tamamlanmış olayları düzenleme/silme veya otomatik düzeltme akışı yoktur; kayıtlar tarihsel kanıt olarak korunur. Depo JSON dışa aktarılabilir; fiyat/ayar yedeğine karıştırılmadığı için ayrıca yedeklenmelidir. Otomatik öğrenme, piyasa filtreleri ve sıralama değişikliği yoktur.
