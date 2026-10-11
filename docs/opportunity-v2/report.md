# Günün Fırsatları V2 — teslim

11 Ekim 2026. V2 çalışma ağacında tamamlandı; mevcut kullanıcı değişiklikleri ve piyasa arşivleri korundu.

## Davranış

- Ortak karar modülü beş eylemi üretir: Şimdi al, Şimdi sat, Emir açmayı değerlendir, Şehirler arası taşı, İzle. Doğrudan eylemler yalnızca validated motorun uygun fiyat kanıtıyla açılır. Potansiyel, eski, karantina ve yetersiz adaylar işlem önerisi almaz. Eylem düğmesi inceleme panelini açar; oyunda otomatik emir göndermez.
- Yüksek/Düşük Buy/Sell nedenleri ve bir adayın birden çok stratejisi korunur. Karar filtresi alternatif stratejileri de değerlendirir. Taşıma mevcut strateji/şehir/işlem filtrelerine dahil edildi.
- Normal fiyat aralığı, hareketten önceki kabul edilmiş geçmişin yüzde 10–90 dilimidir. Örnek ve zaman koşulları mevcut L3 politikasından alınır. Medyan, güncel fiyat, medyandan sapma, aralığın içinde/altında/üstünde konum ve aralık kenarından sapma gösterilir. Yetersiz geçmişe aralık üretilmez. Ortak quantile hesabı market-primitives içinde paylaşılır.
- Doğrulanmış adaylar önce gelir. Potansiyeller kanıt seviyesi, güncellik, sapma ve ekonomik anlamlılıkla sıralanır; L1 kayıtlar daha güçlü kanıtı geriye itemez. Potansiyellerin alternatif stratejileri korunur. Mevcut tam aday havuzu filtrelenir, 500 sınırı çizimde uygulanır. Karantina ayrı görünümde kalır.
- Normal ve yetersiz makas İzle olarak sınıflanır. Olağandışı makas ancak yeterli eşleşmiş geçmiş ve tarihsel fiyat desteğiyle emir değerlendirmesine dönüşebilir; dolum garantisi verilmez. Tarama koşulundaki kanıt-seviyesi/örnek-sayısı karışıklığı düzeltildi ve uçtan uca tarama regresyonuyla kapsandı.
- Kart ve tablo satırlarında erişilebilir kompakt izleme düğmesi bulunur. İlk/son fiyatlar, ilk/son referanslar ve aralıklar, kaynak zamanları, kanıt kimlikleri, durum ve değişim geçmişi saklanır. Sunum stratejisi değişince izlenen ürün kaybolmaz. Aday taramada bulunamazsa son bilinen fiyat korunur ve listeden çıktığı açıkça belirtilir. İzlemeyi durdurmak geçmişi silmez.
- Dört kullanıcı bildirimi ürün, şehir, kalite, sunucu, strateji, zaman ve o anki fiyat/öneriyle saklanır. Bildirilen fiyat doğruluğu ve gerçekleşen işlem oranı gösterilir. Bunlar kişisel kullanıcı beyanlarıdır; doğrulanmış piyasa verisi, tahmini dolum olasılığı veya kanıtlanmış kârlılık değildir.
- Kişisel kayıtlar tarayıcıdaki `opp-assistant-v2` günlüğünde kalır; mevcut piyasa/veri arşivlerine yazılmaz. Bozuk günlük ve depolama kotası hatası eski kaydı ezmez, arayüz kayıt hatasını bildirir. İzleme araç açıkken gelen taramalarla ve sonraki açılışta güncellenir.

## Doğrulama

- `npm test`: motor/veri/geçmiş, şehir, tooltip, eşya adı kopyalama, canlı fiyat aboneliği, collector/collection, fırsatlar, ada, işçi, rota ve Flipper testleri geçti.
- `npm run opportunities:test`: karar güvenliği, tarihsel makas tarama entegrasyonu, L1/L2 sıralaması, tam havuz/500 sınırı, çoklu strateji, karantina, izleme geçişleri, kullanıcı bildirimi metrikleri, bozuk kayıt ve kota sonrası veri korunması geçti.
- `npm run opportunities:regression:test`: 25.210 arşiv serisinde mevcut taraf doğrulama/karar alanlarında 0 fark. V2'nin yeni normalRange alanı ayrı doğrulanıp eşdeğerlik karşılaştırmasından çıkarılır; yeni alanın eski uygulamada bulunmaması davranış değişikliği sayılmaz.
- Son performans ölçümü: 2.520 seri × 2.160 saat; ilk tarama 3.245 ms, önbellekli tarama 58 ms, heap 98 MB. Sentetik veriler üretim arşivine yazılmadı.
- `npm run opportunities:ui:test`: gerçek Chrome, 1440 px masaüstü ve 390 px mobil; eylemler, izleme düğmesinin kart tıklamasından ayrılması, yeniden yükleme, strateji değişimi sonrası izleme filtresi, fiyat değişimi/listeden çıkma, dört bildirimin kalıcılığı, izleme durdurulunca geçmişin korunması ve temiz konsol geçti. Kart ve izleme geçmişindeki ürün adı gerçek panoda mouse/Enter/Space ile kopyalandı. Mobil yatay taşma yok.
- Chrome'a gerçek proje dosyaları Playwright route üzerinden sunuldu; piyasa yanıtları izole test fixture'larıydı. Bu, canlı sağlayıcı fiyatlarının yeniden doğrulaması değildir. Yerel sunucuya doğrudan Chrome erişimi ortam tarafından engellendi.
- `npm run css:build`, JavaScript sözdizimi ve değiştirilen izlenen dosyalarda `git diff --check` geçti. Çalışma ağacının genel diff kontrolünde önceden mevcut `test-city-picker.mjs` dosyasının EOF boş satırı raporlandı; ilgisiz dosya değiştirilmedi.

Görseller: [masaüstü](desktop.png), [mobil](mobile.png).

## Canlıya geçiş engeli

Canlı yayın yapılmadı. Depoda doğrulanmış bir yayın iş akışı bulunamadı; çalışma ağacında bu görevden önce çok sayıda ilgili ve ilgisiz değişiklik vardı. Bunları topluca commit/push yapmak güvenli bir V2 teslimi oluşturmaz. Ayrıca canlı hub'a ağ erişimi ve çalışan sürecin yönetimi bu ortamda doğrulanamadı; süreç sorgusu CIM erişim hatası verdi. Mevcut fiyat hub'ı zorla durdurulmadı.

Statik arayüz dosyaları ve derlenmiş CSS hazırdır. Normal fiyat aralığı ve makas tarama düzeltmesinin canlı API'ye yansıması, yetkili mevcut hub'ın normal kapatma/kayıt ve yeniden başlatma akışından geçmesini gerektirir. Mevcut validated ayarı değiştirilmedi; arşiv migration veya silme yapılmadı. Test için açılan yerel sunucu kapatıldı.
