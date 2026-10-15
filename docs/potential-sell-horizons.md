# V2.1 SELL ufuk düzeltmesi

15 Ekim 2026, 14:35 Europe/Istanbul kesiti. Sayısal kayıt ve tam ret gerekçeleri: `output/sell-horizons-comparison.json`. Aynı gerçek kanıt üzerinde eski uygulama `content/scripts/fixtures/potential-sale-horizon-before-horizons.mjs` ile yeniden çalıştırıldı. Yerel Hub fiyat, satış geçmişi ve oyun geçmişi uçları salt okunur alındı; SAT arşivi mevcut normalizer ve fiyat indeksiyle incelendi. Kullanıcı SQLite'ına veya SAT dosyasına yazılmadı.

## Neden aynı görünüyordu?

İki bağımsız neden vardı. Kart ve liste `price ?? indicativePrice` ile reddedilen hedefin yerine ortak tarihsel referansı yerleştiriyordu. İncelenen dört şehirde eski kabul edilmiş hedeflerin üçü de boştu; aynı görünen rakamlar hesaplanmış potansiyel değildi. Ayrıca kişisel fiyat yolunda süre bilinmediğinde her ufuk aynı son yedi gün P75 adayını kullanıyordu. Bu ikinci durum yeterli kişisel kanıt varsa gerçekten aynı hedef üretebiliyordu.

## Hesaplama

- 2 gün: son yedi günün miktar ağırlıklı P25 seviyesi; kimlik/kalite eşleşen, altı saatten yeni Min Sell varsa mevcut rekabetçi emir tikine kadar sınırlandırılır. Emir tek başına hedef kanıtı oluşturmaz.
- 7 gün: son yedi günün miktar ağırlıklı P75 seviyesi; tekrar, miktar ve yakın rejim teyidi gerekir.
- 28 gün: mevcut 90 günlük dağılımın P90 seviyesi; kişisel gerçekleşmeler ayrı güçlü kanıt olarak değerlendirilir. ATH doğrudan hedef yapılmaz. Eski yüksek rejim, tekil zirve veya güncel tekrar eksikliği kabul edilmez.

Piyasa ortalamaları ile kişisel gerçekleşme miktarları birleştirilmez. Kişisel adaylarda mevcut en az üç bağımsız birim, iki farklı gün, miktar yoğunlaşması ve son yedi gün teyidi korunur. Genel piyasanın bağımsız dönem/kapsam, anomali, güncellik ve büyük sapma kontrolleri korunur. Bilinen emir süresi ufuktan uzunsa o ufkun kişisel desteğine alınmaz; süre bilinmiyorsa gerçekleşme garantisi yoktur. Ufuk politikaları fiyat çarpanı değildir; aynı fiyat ve ters sıralanan ufuklar mümkündür. BUY hesabı değişmedi.

## Gerçek T4_MOUNT_HORSE / Europe / kalite 1 karşılaştırması

Fiyatlar brüt birim gümüştür. Eski ekrandaki referans üç ufukta da aynıydı; eski **kabul edilmiş hedefler dört şehirde de — / — / —** idi. “ATH” yalnız eldeki 90 günlük günlük ortalama arşivinin tepesidir; tüm zamanların tekil işlem ATH'si değildir. Yakın dönem sütunu son yedi tamamlanmış UTC gününün miktar ağırlıklı P25/P75 değeridir.

| Şehir | Son Min Sell gözlemi | Kişisel SELL dağılımı | 90g ortalama ATH | Yakın P25 / P75 | Eski ekrandaki ortak referans | Yeni hedef 2 / 7 / 28 gün | Kabul / ret |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Thetford | 34.608, 11 Ekim; eski | Kayıt yok | 54.317 | 34.515 / 35.587 | 35.295 | 34.515 / 35.587 / — | Yakın seviyeler destekli; 28g 46.765 adayı yakın rejimde tekrarlanmıyor. |
| Martlock | 27.968, 11 Ekim; eski | 1 dolum, P25/P75 27.967; kalite belirsiz | 53.940 | 25.811 / 27.230 | 27.143 | 25.811 / 27.230 / — | 2/7g gecikmeli kanıtla uyarılı kabul; 28g 45.183 sapması teyitsiz. |
| Fort Sterling | 33.985, 12 Ekim; eski | Kayıt yok | 50.960 | 32.339 / 32.981 | 32.536 | 32.339 / 32.981 / — | Yakın seviyeler destekli; 28g 49.205 sapması teyitsiz. |
| Brecilien | 40.105, 12 Ekim; eski | 16 dolum, P25 49.999 / P75 50.949 / P90 53.333 / max 74.978; kalite belirsiz | 50.347 | 33.429 / 37.001 | 35.405 | 33.429 / 37.001 / — | Yakın seviyeler destekli; 28g 47.618 sapması teyitsiz. Son kişisel SELL 5 Ekim. |

Dört şehirde de **güncel Min Sell yok**: eldeki gözlemler altı saat sınırını aşıyor, hedefi sınırlamak için kullanılmadı. Kişisel dağılımlar yalnız gerçekleşmiş SELL kayıtlarıdır; süresi dolmuş emirler dahil edilmedi. Martlock Portal ve diğer şehir/market kimlikleri Martlock Market ile birleştirilmedi. At kişisel postalarında kalite eksik olduğu için bunlar kalite 1 kanıtına bağlanmadı; kimlik tahmini yapılmadı. Bu nedenle tabloda yeni hedeflerin kaynağı doğrulanmış piyasa ortalamalarıdır. Tam kimlikli kişisel SELL kanıtının önceliği kodda ve testlerde korunur.

## Sunum ve saklama

Kart ve liste ana potansiyel alanında yalnız kabul edilen fiyatı gösterir. Hedef yoksa `—`; varsa tarihsel değer ayrı `Ortak referans` satırındadır. Ret nedeni detayda ve erişilebilir durum açıklamasında korunur. Kilitli kart geometrisi, ortak eşya kopyalama ve şehir bileşenleri korunur. Depolama anahtarı/SQLite şeması değiştirilmez; önceki kayıtlar silinmez. Estimator kimliği değiştiğinden eski snapshotlar yenilenene kadar Planlayıcı'ya yeni yöntem fiyatı olarak alınmaz.

## Doğrulama

Geçen kontroller: `test-sell-horizons`, `test-supported-potential` (gerçek geçmiş ve ileriye bilgi sızması denetimi), `test-potential-price`, `test-personal-potential` (gerçek SAT dahil), `test-potential-price-table`, `test-potential-price-refresh`, `test-local-sales-history`, `test-potential-price-view`, izole SQLite ile `test-potential-price-refresh-ui` ve `test-potential-prices-ui`. CSS derlemesi ve `css:check` bileşenleri geçti; mevcut tavsiye uyarıları sürüyor. Referans kartı 992/390/320 genişliklerinde taşma ve ayrı fiyat alanıyla doğrulandı; görseller `output/sell-horizons-reference-*.png`. Tüm proje test paketi çalıştırılmadı.
