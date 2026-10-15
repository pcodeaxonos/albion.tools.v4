# Potansiyel fiyat v2 — 15 Ekim 2026

> Bu sürümün gerçekçilik denetimi ve V2.1 düzeltmesi: [Kanıt ve fiyat rejimi incelemesi](potential-price-v2-review.md). Aşağıdaki ilk V2 hedefleri güncel Planlayıcı kabulü değildir.

Estimator kimliği `supported-window-price-v2`. Önceki kayıtlar aynı SQLite/storage anahtarında korunur; eski BUY ve SELL estimator kayıtları yeni hesap gibi kabul edilmez. Güncelleme mevcut kayıt yolunu kullanır. TOHUM/HASAT seçimi, ekonomi motoru, Focus ve net kâr hesabı değişmez.

## Hesaplama

Ortak uygulama `content/js/core/potential-sale-horizon.mjs` içindedir. Son 90 tamamlanmış UTC gün içindeki 2/7/28 günlük, örtüşmeyen dönemler değerlendirilir. Her dönemde SELL için ikinci yüksek, BUY için ikinci düşük günlük seviye alınır: tek günlük uç değer hedef olamaz. En az üç bağımsız dönemden gelen seviyelerin medyanı dönem hedefidir. Süreler bir değer artış katsayısı kullanmaz; birbirine veya güncel emre eşitlenmez. İki günlük dönemde iki ayrı gün gerektiğinden sonuç özellikle temkinlidir.

Genel piyasa noktalarında `avg_price` miktar ağırlıklı ortalama, `item_count` eşya miktarıdır. Saatlik ortalamalar günlük miktar ağırlıklı ortalamaya çevrilir. Bunlar tekil işlem dağılımı veya işlem sayısı değildir. Kişisel işlemler ayrı kimliklerle tekilleştirilir; günlük P75/P25 gerçek işlem dağılımından gelir, ardından aynı bağımsız dönem kuralları uygulanır. Daha avantajlı ve kabul edilebilir kişisel hedef seçilebilir; genel piyasa kanıtı ayrı `marketEvidence`, kişisel kanıt ayrı `personalEvidence` olarak korunur. İkisinin kapsamı veya miktarı toplanmaz.

Yerel fiyat rejimini koruyan yedi günlük komşuluk medyanının 2× bandı dışındaki günlük noktalar elenir. Günlük dağılımın medyan mutlak sapması/medyan oranı `.35` üstündeyse hedef yerine tarihsel referans saklanır. Yakın dönem medyanı ve trend metadata olarak korunur; trend bir fiyat artırma katsayısı değildir. Fiyat hedefleri gerçekleşme olasılığı veya ölçülmüş doğruluk yüzdesi içermez.

Kanıt kabulü en az beş farklı gün ve üç bağımsız dönem gerektirir; kişisel kanıtta ayrıca on bağımsız işlem gerekir. %70 doluluk şartı yoktur. Bu koşullara ulaşmayan pozitif geçmiş, açıkça tarihsel referans olarak tutulur ve Planlayıcı fiyatına dönüşmez.

## Kaynak kapsamı

Kişisel arşiv, oyun Market History paketleri ve yerel genel arşiv birlikte okunur. Paket adaptörü birden fazla timescale satırından sonuncuyu seçip diğerlerini kaybetmez. Kaynak ve timescale başına günlük kapsam karşılaştırılır: daha fazla gözlenen saat, eşit kapsamda daha fazla bilinen miktar tercih edilir. Saatlik ve onu içeren altı saatlik paketler alternatif kanıttır, miktarları eklenmez. Aynı güne ait farklı kaynakların miktarları da eklenmez. Kimliği eşleşmeyen sunucu/şehir/eşya/kalite kayıtları adaptörde dışlanır; kişisel BUY/SELL ayrıdır.

Tam 90 günlük yerel kapsam varsa dış istek yoktur. Eksik kapsamda mevcut ortak AODP geçmiş istemcisiyle tek günlük seri grubu alınır; ufuk başına tekrar, yeni API bağımlılığı veya ayrıca saatlik dış sorgu yoktur. API hatası yeni snapshot yazılmadan yükselir; mevcut kalıcı kararlar korunur.

## Güncellik ve Planlayıcı

Merkezi `SALE_ESTIMATE_POLICY` başlangıç eşikleri: 0–2 gün güncel, 3–7 gün gecikmeli, sonrası eski. Hesaplanabilirlik, kanıt kalitesi, güncellik ve `plannerUsable` ayrı alanlardır. Gecikmeli fakat yeterli kanıt kullanılabilir; Planlayıcı mevcut eski fiyat tanısını ve uyarısını gösterir. Eski veri hedef/referans olarak incelenebilir ancak `price` boş kalır. BUY snapshot da tazelik süresi sonunda geçersizleşir; başarısız yenileme eski iyimser BUY fiyatını tutmaz.

Güncel Sell − 1 yalnız rekabet sinyalidir. BUY + 1 bekleyen emir adayı, Sell fiyatı ise anında satın alma senaryosudur; bu alanlar tarihsel hedefi değiştirmez ve gerçekleşmiş işlem kanıtı sayılmaz. Mevcut detay diyaloğu kaynak, kanıt türü, destekleyen gün/dönem, referans, güncellik, hesaplama ve Planlayıcı kabulünü gösterir; sayfa kompozisyonu korunur.

## Aynı gerçek kesitte eski/yeni

Kaynak: mevcut `output/horse-sales-investigation.json`; Europe, Martlock, `T4_MOUNT_HORSE`, kalite 1. 12 Ekim ve sonrası kesilerek 87 gün, son veri 11 Ekim bırakıldı. Hesaplama 15 Ekim 2026 12:00 UTC. Yeni dış veri indirilmedi.

| Süre | Eski hedef | Yeni hedef |
| --- | --- | --- |
| 2 gün | boş | 38.036 |
| 7 gün | boş | 39.317 |
| 28 gün | boş | 42.865 |

Üçü de gecikmeli ve uyarıyla kullanılabilir. Sabit sentetik 100 silver geçmişte güncel Sell 81 olduğunda eski model 80'e sınırlanırken yeni hedef 100, güncel rekabet sinyali 80 olur. Tek günlük 10.000/1 uçları 100 hedefini değiştirmez. Tekrarlı haftalık sentetik dağılımda üç ufuk ayrı değerler üretir.

Gerçek Martlock serisinde her yedi günde bir, yalnız kesimden önceki günlerle dört başlangıç tarihi ve üç ufuk, toplam 12 geçmiş kesiti karşılaştırıldı. İki ve yedi günlük ufuklarda eski/yeni dört kesitte de hedef üretti; yeni seviyeye ulaşan sonraki günlük ortalama dört kesitten ikisinde gözlendi. 28 günlük ufukta her iki model de dört kesitte yalnız referans verdi: üç bağımsız 28 günlük dönem ve sonraki 28 günü aynı 90 günlük arşiv içinde sağlamak mümkün değil. Tam sonuçlar `output/supported-potential-verification.json` içindedir.

Bu kontrol sonraki fiyat hareketini karşılaştırır; gerçekleşmiş emir miktarı, kuyruk, derinlik veya satış başarısını ölçmez. Günlük ortalamalardan bilinmeyen yüksek tekil işlem fiyatları türetilmez. Arşiv günlerinin daha sonra düzeltilmiş olup olmadığı bilinmediğinden, test geçmişte o anda alınabilecek verinin kusursuz bir tekrar oynatımı değildir.

## Doğrulama sınırları

`npm run potential:supported:test`: algoritma, aynı kesitte eski/yeni, gelecekteki dönemleri dışlayan geriye dönük kontrol, anomali, seyrek/gecikmeli/eski kanıt, kapsam/çift sayım, kişisel ayrımı, kaynak adaptörü, güncel emir bağımsızlığı, snapshot sürümü, Planlayıcı kabulü, yenileme ve gerçek SQLite kullanan izole tarayıcı yazma/yeniden okuma kontrolleri.

Ek olarak 77 yerleşim kontrolü, veri migration/restart/conflict/retry/backup/restore testi, piyasa emir geçmişi, filtre/sıralama ve CSS mimari kontrolleri çalıştırıldı. Canlı SQLite `PRAGMA integrity_check` salt okunur kontrolde `ok` döndü.

Geniş ekonomi testi `test-island-economy.mjs:650` içindeki mevcut `Net kâr / gün` metni beklentisinde kalır. Eski galeri testi 55 farklı gün süresini fixture olarak üretir; mevcut 2/7/28 filtresi üç kayıt bıraktığından 50 kayıt beklentisi başarısızdır. Bunlar yeşil olarak raporlanmaz. Yenileme arayüzü, kart görünümü ve SQLite geri okuma ayrı tarayıcı testiyle doğrulanır.
