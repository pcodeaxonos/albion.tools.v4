# V2.1 kişisel gerçekleşme kanıtı

15 Ekim 2026, 12:00 UTC kesiti. Mevcut SAT `UserData-EUROPE/Trades.json` salt okunur incelendi: 17.215 kayıt, 3.460 gerçekleşmiş posta BUY ve 8.776 gerçekleşmiş posta SELL. Trade Dashboard ve Ticaret Günlüğü ile aynı normalizer, watcher ve `/api/v1/trades` kaynağı kullanılır; yeni işlem arşivi veya kalıcı işlem kopyası yoktur.

Posta kayıtlarında kalite yoktu ve fiyat indeksi tümünü dışlıyordu. `data/items.json` içinde `maxQualityLevel === 1` olan eşyalar için kalite artık katalogla doğrulanır: 7.467 gerçekleşme geri kazanıldı. Geri kalan 4.769 postanın kalite kimliği belirsizdir; çok kaliteli eşyalarda kalite tahmin edilmez. Eksik zaman, miktar, eşya, şehir ve kimlik kontrolleri korunur. Süresi dolmuş emir, crafting ve oyuncu transferleri gerçekleşme sayılmaz.

Anlık işlemlerde `AuctionEntry.Id` emir bağlantısı olarak korunur. Kimliği aynı emrin dolumları fiyat ve miktara katkı yapar ama bağımsızlık sayısını artırmaz. Posta içeriğinde emir kimliği yoktur: bu dolumlar UTC gün başına en fazla bir muhafazakâr kanıt birimidir; bunlara bağımsız emir denmez. Kaynak kayıt kimliğiyle tekrarlar ayıklanır. Dolum miktarı için emir miktarı değil gerçekleşen miktar kullanılır. Emir süresi `Expires` veya işlem aralıklarından türetilmez.

Genel piyasanın üç dönem ve kapsam koşulları korunur. Kişisel kanıtta son yedi günde en az üç kanıt birimi, en az iki farklı gün ve miktar desteği aranır; tek birim veya gün destek miktarının %75'ini aşamaz. BUY P25 / SELL P75 güncel, emir bazında miktar ağırlıklı fiyatlardan hesaplanır. Az örnekli kabul `medium` güven taşır; eşikler başarı olasılığı değildir. Daha az kanıt ayrı kişisel referans ve ret nedeni olarak görünür. Kabul edilen kişisel hedef, daha az avantajlı olsa da fiyatı belirler; genel piyasa miktarıyla toplanmaz.

Yakın piyasa ve güncel emirle %25 üzeri avantajlı sapmada en az üç gün güncel kişisel tekrar gerekir. İki kat bandını aşan çelişki incelemede kalır. Eski genel piyasa kişisel kanıtı veto etmez; eski kişisel yüksek fiyat güncel aday yapılmaz. Kişisel kabul süresi, destek birimlerinin güncellik penceresinden çıkacağı en erken zamanda sona erer. Kapasite, stok veya pazar payı sınırı eklenmedi; yoğunlaşma kontrolü yalnız kanıt kalitesidir.

2/7/28 ufukları korunur. Başlangıç ve tamamlanma zamanı doğrulanmış emirlerde ölçülen süre ufukla karşılaştırılır; ufuktan uzun emir o ufkun kişisel fiyat desteği sayılmaz. İncelenen gerçek SAT arşivi bu süreleri sağlamıyor. Aynı kişisel fiyatın üç ufukta görünmesi ölçülmüş satış süresi veya o ufukta kesin satış anlamına gelmez; detayda açıkça belirtilir. BUY/TOHUM fiyatının HASAT ufkundan bağımsız mevcut ortak kullanımı korunur.

Detay diyaloğu dolum sayısı, bağımsız kanıt birimi, kimliği bilinen emir, bağlanamayan dolum, toplam/güncel miktar, fiyat aralığı, son işlem, süre durumu ve piyasa hedefine fiyat farkını gösterir. Mevcut ortak diyalog, kopyalanabilir eşya adı, şehir, tablo/kart ve kaydırma yapıları kullanılır.

## Gerçek arşiv karşılaştırması

Rapor: `output/personal-potential-verification.json`. `connectedBefore` eski kalite bağlantısıyla görülebilen kişisel hedef; `before` kalite sorunu giderilmiş aynı gerçek işlemlerde eski V2.1 algoritmasının sonucu; `after` yeni değerlendirmedir. Bu karşılaştırma kişisel katkıyı izole eder. Yerel piyasa API'si erişilemediği için bu üç gerçek örneğe yeni genel piyasa/emir verisi eklenmedi; sentetik entegrasyon testleri piyasa çelişkisini ayrıca kapsar.

| Eşya / şehir / yön | Ufuk | Eski bağlantı | Aynı kanıt, eski algoritma | Yeni | Planlayıcı |
| --- | --- | --- | --- | --- | --- |
| T8_MILK / Martlock / SELL | 2 | boş | 489 | 520 | Gecikmeli, uyarıyla |
| T8_MILK / Martlock / SELL | 7 / 28 | boş | boş | 520 | Gecikmeli, uyarıyla |
| T1_FARM_CARROT_SEED / Brecilien / BUY | 2 / 7 / 28 | boş | boş | 2.163 | Kullanılabilir |
| T4_TURNIP / Brecilien / SELL | 2 / 7 / 28 | boş | boş | 440 | Kullanılabilir |

Süt: 23 dolum, 9.277 toplam eşya, 350–530 fiyat aralığı, son işlem 12 Ekim; güncel destek 1.090 eşya / dört birim. Tohum: sekiz dolum / 100 eşya; güncel destek 50 eşya / üç birim. Şalgam: beş dolum / 1.539 eşya; güncel destek 1.039 eşya / üç birim, son işlem 15 Ekim. Bu kayıtların hiçbirinde ölçülmüş emir süresi yoktur. Kabul edilmeyen tüm gerçek kimlikler ve ret nedenleri JSON raporunda tutulur.

## Doğrulama

`npm run potential:personal:test`: önceki V2.1 fixture karşılaştırması, gerçek SAT denetimi, kısmi dolum/kimlik tekilleştirme, az örnek, baskın miktar, eski kişisel fiyat, piyasa ve güncel emir çelişkisi, eski piyasanın veto etmemesi, ölçülmüş/eksik süre, 2/7/28 ufuk ve Planlayıcı snapshot geri okuma.

Mevcut supported-potential, potential-price, refresh/batch, database projection, local-sales-history, SAT self-test ve Ticaret Günlüğü testleri geçti. İzole SQLite kullanan yenileme ve galeri tarayıcı testleri geçti; galeri testi mevcut açık referans gösterimine uygun güncellendi ve kişisel detay alanları eklendi. Masaüstü/mobil ekran görüntüleri `output/personal-potential-detail-*.png`. CSS mimari kontrolleri geçti (mevcut tavsiye uyarıları sürüyor). Canlı kullanıcı SQLite'ına veya SAT dosyasına yazılmadı; bütün proje test paketi çalıştırılmadı.

Estimator sürümü değişti; önceki SQLite kayıtları silinmez, yeniden yenilenene kadar eski yöntem olarak görünür. Çalışan Trade Hub yeni normalizerı yüklemek için yeniden başlatılmalı; ardından mevcut fiyat yenileme yolu yeni snapshotları aynı anahtara yazar. Yeni depolama veya veri migration gerekmiyor.
