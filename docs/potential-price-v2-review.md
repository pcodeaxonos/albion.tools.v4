# Potansiyel fiyat V2 gerçekçilik denetimi

15 Ekim 2026. Yeni kabul sürümü: `supported-window-price-v2.1`. V2'nin kaynak birleştirmesi, 90 günlük arşivi, SQLite anahtarı, güncellik politikası, TOHUM/HASAT ayrımı ve ekonomi motoru korunur. Eski V2 snapshot'ları yeniden hesaplanana kadar eski yöntem olarak görünür; sessizce V2.1 kabul edilmez.

## Martlock atında önceki hedeflerin kaynağı

Kaynak `output/horse-sales-investigation.json`, Europe / Martlock / `T4_MOUNT_HORSE` / kalite 1. 87 günlük seri, son gözlem **11 Ekim: 25.910 silver / 411 eşya**. Hesap kesimi 15 Ekim 12:00 UTC. Bunlar AODP günlük ortalamalarıdır, tekil işlem fiyatları değildir.

V2 her tamamlanmış dönemin ikinci yüksek gününü seçiyor, bu seviyelerin medyanını alıyordu. Güncelliği son veriden kontrol ettiği halde hedefin son fiyat rejiminde tekrar edip etmediğini kontrol etmiyordu. Şu günlük gözlemler önceki üç sonucu tam olarak yeniden üretir:

| Hedef | Medyana katkı veren dönem | Günlük gözlemler: fiyat / eşya miktarı | Sonuç |
| --- | --- | --- | --- |
| 2 gün | 31 Ağustos–1 Eylül | 31 Ağustos: 38.036 / 726; 1 Eylül: 38.760 / 886 | İkinci yüksek 38.036; 43 dönem seviyesinin medyanı |
| 7 gün | 10–16 Ağustos ve 27 Temmuz–2 Ağustos | 10 Ağustos: 40.881 / 604; 11 Ağustos: 39.291 / 597. 31 Temmuz: 39.867 / 537; 2 Ağustos: 39.344 / 633 | `(39.291 + 39.344) / 2 = 39.317,5`, SELL aşağı yuvarlama: 39.317 |
| 28 gün | 20 Temmuz–16 Ağustos | 25 Temmuz: 42.974 / 638; 21 Temmuz: 42.865 / 657 | İkinci yüksek 42.865; üç dönem seviyesinin medyanı |

Bu fiyatların son 25.910 gözlemine göre farkları yaklaşık **%46,8 / %51,7 / %65,4**. Bu kadar yüksek hedefleri makul saymak için güncel teyit yoktur. Veri miktarı bu gözlemlerin varlığını doğrular; Temmuz fiyatlarının Ekimde yeniden oluşacağını doğrulamaz.

Son yedi gözlem gününün tamamı:

| Tarih | Günlük ortalama | Eşya miktarı |
| --- | ---: | ---: |
| 5 Ekim | 30.119 | 529 |
| 6 Ekim | 27.143 | 552 |
| 7 Ekim | 26.515 | 535 |
| 8 Ekim | 27.245 | 530 |
| 9 Ekim | 27.230 | 600 |
| 10 Ekim | 25.811 | 766 |
| 11 Ekim | 25.910 | 411 |

Bu yedi günün medyanı 27.143, toplam miktarı 3.923'tür. Hiçbir gün önceki hedefleri ±%5 destek bandında teyit etmez. Sonuç yalnız tazelik sorunu değildir; fiyat rejimi değişmiştir. Eski yüksek seviyeleri tekrar geçerli kılacak veri yoktur.

## V2 korunarak yapılan düzeltmeler

- İkinci yüksek/düşük sıra istatistiği artık tüm sürelerde sabit iki güne dayanmaz: destek sırası `max(2, ceil(gözlenen gün × .25))`. Tam 28 günde en az yedi tekrarlı günlük seviye gerekir. İki gün / 28 gün kapsamı artık avantajlı hedef sayılmaz.
- Bir dönemin hedef kanıtına katılması için en az %50 zaman kapsaması gerekir. Günlük AODP noktası 24 saat, saatlik/6 saatlik paketler kendi gözlenen süreleri kadar sayılır. Kişisel kanıt ayrı gerçekleşme günleri olarak etiketlenir; genel piyasa saat kapsaması sayılmaz. Kapsama eksikse fiyat kaybolmaz, yalnız referans olarak saklanır.
- Destek bandında en az iki bağımsız gün, dönem miktarının en az %10'u gerekir; tek gün destek miktarının %75'inden fazlasını taşırsa dönem kabul edilmez. `item_count` işlem sayısına dönüştürülmez. ±%5 yakınlık bandı fiyat seviyelerini gruplar; bu bir tahmin doğruluğu yüzdesi değildir.
- Hedef ayrıca son yedi gözlem gününde en az iki gün ve günlerin %25'i tarafından, yeterli miktarla teyit edilmelidir. Güncel emir, son günlük ortalama veya yakın medyana göre avantaj yönünde %25'ten büyük fark inceleme gerektirir; bu durumda en az üç yakın gün ve günlerin yarısı gerekir. Fiyatı güncel Sell'e kesen bir `MIN` sınırı yoktur. Yeterince tekrarlanan gerçek kanıt büyük emir sapmasını savunabilir.
- Yakın rejim kontrolünde ham geçerli günlük gözlemler de korunur: anomali ayıklaması yeni düşük/yüksek rejimi gizleyemez. Kişisel yüksek/düşük hedefler büyük genel piyasa sapmasını teyitsiz biçimde aşamaz; kişisel kanıt ayrı kalır.
- Desteklenmeyen aday (`candidatePrice`), yakın referans (`referencePrice`), 90 günlük referans (`historicalPrice`), desteklenen hedef (`potentialPrice`) ve Planlayıcı fiyatı (`price`) ayrıdır. Kabul edilmeyen adayın `price` ve `potentialPrice` alanları boştur. İnceleme göstergesi yakın dönem referansını korur. Diyalog aday, referans ve desteklenen hedefi ayrı etiketler; süresi dolan snapshot detayında Planlayıcı kabulü de doğru gösterilir.

Bu eşikler merkezi, değiştirilebilir kanıt kabul politikasıdır. Geriye dönük sonuçlara göre optimize edilmiş satış olasılıkları veya kalibre edilmiş başarı oranları değildir. 2 günün iki bağımsız günlük desteği, 7/28 günün daha geniş kapsam ve tekrar şartları farklı süre senaryolarını temsil eder; gerçek emir dolum süresi ölçülmez. Süre uzadıkça fiyatın artacağı zorlanmaz.

## Aynı kesitte eski V2 ve düzeltme

| Gerçek örnek / süre | Eski V2 Planlayıcı fiyatı | V2.1 Planlayıcı fiyatı | Korunan yakın referans | Kabul |
| --- | ---: | ---: | ---: | --- |
| Martlock at / 2 gün, 15 Ekim kesimi | 38.036 | — | 27.143 | Yalnız referans |
| Martlock at / 7 gün | 39.317 | — | 27.143 | Yalnız referans |
| Martlock at / 28 gün | 42.865 | — | 27.143 | Yalnız referans |
| Bridgewatch `T8_PUMPKIN` / 2 gün, 12 Ekim kesimi | 451 | 450 | 465 | Gecikmeli, uyarıyla kullanılabilir |
| Bridgewatch `T8_PUMPKIN` / 7 gün | 474 | 474 | 465 | Gecikmeli, uyarıyla kullanılabilir |
| Bridgewatch `T8_PUMPKIN` / 28 gün | — | — | 465 | Yalnız referans; tek bağımsız dönem |

Martlock 28 günlük yeni ham aday 40.750'ye inse de yakın rejimde hâlâ desteklenmez ve kabul edilmez. Sonucu güzel göstermek için 27.143 bir hedefe çevrilmemiştir. Kabağın iki günlük küçük farkı, sınırdaki eksik gözlem kapsamının artık tam gün sayılmamasından gelir. Kabağın yedi günlük hedefinin bandına 3–8 Ekim arasındaki altı gün (472, 465, 463, 455, 467, 465) ve toplam 224.959 eşya destek verir. Bu miktar genel piyasa ortalamalarının miktarıdır; 474 silver'dan gerçekleşmiş eşya miktarı veya satış başarısı değildir.

## Geriye dönük kontrol ve sınırlar

`content/scripts/audit-potential-price-v2.mjs`, dört gerçek şehir serisinde her yedi günde bir, yalnız kesimden önceki tamamlanmış verilerle **112 kesit** hesaplar. Tüm gelecek satırlar da fonksiyona verildiğinde sonuç ve kanıtın tamamen aynı kaldığı doğrulanır. Kesim sonrasına taşan saatlik/6 saatlik dönemler dışlanır. Gelecekteki veriler anomali ayıklamasına, kaynak metadata'sına veya rejim hesabına giremez.

| Süre | Kesit | Eski V2 hedef sayısı | V2.1 hedef sayısı | Sonraki ortalamalarda seviyeye erişim: eski / V2.1 |
| --- | ---: | ---: | ---: | ---: |
| 2 gün | 44 | 44 | 29 | 12 / 11 |
| 7 gün | 40 | 36 | 20 | 10 / 8 |
| 28 gün | 28 | 0 | 0 | Ölçülemez |

Yeni model daha az hedef kabul ediyor. Bu tablo satış başarısı veya kesin tahmin iyileşmesi kanıtı değildir; günlük ortalamaların sonraki hareketiyle sınırlı bir karşılaştırmadır. 28 gün için üç bağımsız 28 günlük eğitim dönemi + sonraki 28 günü aynı 90 günlük arşiv sağlayamaz. 28 günlük başarı iddiası yoktur. Ayrıca arşiv noktalarının sonradan düzeltilmiş olup olmadığı bilinmez; bu nedenle olay anındaki veri erişilebilirliği tam yeniden oynatılamaz.

Tüm günlük gözlemler, eski V2 medyanına katkı veren dönemler, miktarlar, ret gerekçeleri ve 112 kesit `output/potential-price-v2-review.json` dosyasındadır. İnceleme mevcut arşivleri okur; yeni API verisi indirmez, gerçek SQLite kayıtlarını değiştirmez.

## Eski iki test

Ekonomi testi eski `Net kâr / gün` metnini arıyordu; güncel günlük defter `Net kâr/zarar` dipnotu kullanıyor. Test artık dipnotu ve sayısal netin ekonomi sonucuyla eşleşmesini doğrular. Devamındaki eski fixture, kişisel kaynaktan sonra genel arşivlerin hiç okunmamasını ve açık `clearSlots: true` isteğine rağmen dolu slotların korunmasını bekliyordu. Kaynak kapsamı kontrolü şimdi birleştirme sözleşmesine uygun; her piyasa kimliğinin ortak API'nin normal partileriyle yalnız bir kez sorgulandığı doğrulanır. Dolu/kilitli slotları koruma testi varsayılan doldurma eylemini çağırır. Üretim kodundaki doldurma davranışı değişmez.

Galeri testi 55 farklı geçersiz süre kullanıyordu. Şimdi katalogdan 55 ayrı geçerli eşya ve ortak 2/7/28 süreleri kullanır; 50+5 sayfalama hâlâ test edilir. Eski sayfa seçici ortak `data-pagination-page`, erişilebilir arama etiketi güncel gerçek etiketle eşleştirilir. Görünüm tercihi kart olarak kaydedildiğinde şehir seçici testi önce liste görünümüne geçer. Filtre, kopyalama, diyalog, tüm şehir seçici stilleri ve responsive kontroller korunur.

## Çalıştırılan kontroller

- `npm run potential:supported:test`: geçti; gerçek audit, anomali/seyrek/kısmi kanıt, miktar, büyük emir sapması, kişisel rejim çatışması, gelecek veri, kaynak adaptörü, snapshot/Planlayıcı kabulü, SQLite yazma hatası ve yeniden okuma, galeri/responsive/kopyalama dahil.
- `npm run island:test`: geçti; 52 ekonomi ve 77 placement kontrolü ile satış potansiyeli, işlem kanıtı, fiyat ve tablo kontrolleri.
- `npm run css:check`: geçti; 0 retired-class hatası, 21 mevcut advisory.
- `git diff --check`: geçti.

Tam günlük dönem kanıtı audit için isteğe bağlıdır. Normal snapshot'lar tüm 90 günü her süre için tekrar kopyalamaz; kısa yöntem, referans, gün/dönem sayıları, miktar ve yakın rejim desteği saklanır. AODP günlük zaman kovasının 24 saatlik olması, o günün tüm piyasa işlemlerinin yakalandığı anlamına gelmez; gözlenen miktarlar bu sınırla yorumlanır.
