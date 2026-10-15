# SELL azami bekleme düzeltmesi

Hesaplama zamanı: 2026-10-15T12:04:28.694Z. Europe, T4_MOUNT_HORSE, kalite 1. Mevcut gerçek yerel arşiv aynı zaman kesitinde V2.1 ve düzeltilmiş yöntemle yeniden hesaplandı; yeni canlı veri çekilmedi.

28 günlük P90 reddedildiğinde arama artık bitmez: gözlenen daha düşük seviyeler azalan sırayla, aynı bağımsız kapsam, yakın rejim, tekrar ve miktar kurallarıyla değerlendirilir. Kabul edilmiş kısa ufuk hedefi daha uzun azami beklemede alternatiftir; aynı kural 2→7 için de geçerlidir. Min Sell yalnız mevcut 2 günlük rekabet kuralında kalır; bütün ufuklara P75/Min Sell tavanı veya bekleme çarpanı eklenmedi. Kişisel kanıt ayrı değerlendirilir, kimlik/kalite ve rejim kontrolleri korunur.

| Şehir | Eski 2 / 7 / 28 | Yeni 2 / 7 / 28 | Reddedilen P90 | Seçilen hedefin yakın desteği |
|---|---|---|---|---|
| Thetford | 34515 / 35587 / — | 34515 / 35587 / 37869 | 46765 | 2 gün, 1474 adet |
| Martlock | 25811 / 27230 / — | 25811 / 27230 / 27245 | 45183 | 6 gün, 3157 adet |
| Fort Sterling | 32339 / 32981 / — | 32339 / 32981 / 34307 | 49205 | 3 gün, 2004 adet |
| Brecilien | 33429 / 37001 / — | 33429 / 37001 / 38484 | 47618 | 2 gün, 2637 adet |

Dört P90 adayı eski yüksek rejimi temsil ettiği ve yakın tekrar/miktar teyidini geçemediği için reddedildi. Yeni 28 günlük hedefler mevcut gözlenen alt fiyat seviyeleridir; 7 günlük hedefleri aşan fark yeni fiyat artışı varsayımından gelmez. Destek mevcut %5 fiyat bandıyla ölçülür; toplam yüksek hacim tek başına kabul sağlamaz.

Dört şehirde Min Sell gözlemleri eski olduğundan kullanılmadı. At için kişisel satışların kalitesi belirsiz veya kayıt yok; kalite 1 kanıtına eklenmedi. Sonuçların kaynağı piyasa ortalamalarıdır, tekil satış garantisi değildir. Martlock gecikmeli kanıtla uyarılı kabul edilir. Adayların her ret/kabul gerekçesi, tarihli destek gözlemleri ve kaynakları output/sell-horizons-comparison.json dosyasındadır. Mevcut detay paneli explanation ve method üzerinden seçim gerekçesini gösterir.

Geçen testler: test-sell-horizons, test-supported-potential (gerçek geçmiş ve ileri bilgi sızması dahil), test-personal-potential (gerçek SAT dahil), test-potential-price, test-potential-price-table, test-potential-price-refresh ve test-potential-price-view. Gerçek dört şehir denetimi eski 7 gün kabul/28 gün boş durumunu ve yeni destekli hedefi assertion ile doğrular. Tüm proje paketi çalıştırılmadı. SQLite şeması ve depolama anahtarı değişmedi; snapshot kabul/son kullanma ve Ada Planlayıcı testleri geçti. Yöntem kimliği yenilendi; eski snapshotlar yenileme sonrasında yeni yöntemle hesaplanır.
