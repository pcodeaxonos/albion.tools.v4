# Günün Fırsatları V4 — teslim ve doğrulama

V4 mevcut fırsat motorunda uygulandı ve **çalışan yerel serviste doğrulandı**. Arşiv biçimi, 90 günlük saatlik saklama, kaynak zamanı ile tekilleştirme, karantina ve kullanıcının diğer değişiklikleri korundu. Sonuçlar fiyat kanıtıdır; gerçekleşmiş işlem veya kâr değildir.

## Canlı servis

İlk kontrolde servis `validated` modundaydı, fakat V3'ün `pipeline`, `resultCounts` ve `collection` alanlarını döndürmüyordu. Çalışan eski süreç PID 46264 idi. `engineMode` tek başına kod sürümünü kanıtlamıyordu.

Collector boşta ve bir sonraki çalışmaya en az 10 saniye varken, konsolda hedef süreç ve sinyal yardımcısı dışında hiçbir süreç bulunmadığı doğrulandı. Yalnız bu koşullarda Ctrl+C gönderildi. Zorla sonlandırma yapılmadı. Eski PID kayboldu, 3001 portu kapandı ve bekleyen paket arşivi yazıldı. Ardından mevcut kök dizin, arşiv ve yapılandırmayla PID 31864 gizli pencerede başlatıldı. Arşiv yüklemesi tamamlandı ve canlı collector yeniden çalıştı.

Son doğrulama: **2026-10-12 01:39:27 Türkiye saati** (`2026-10-11T22:39:27.039Z`). Servis başlangıç damgası `2026-10-11T21:40:21.926Z`; bu damga arşiv yüklemesinden önce atanır, hazır olma süresini ifade etmez. Çalışan sekiz motor modülünün SHA-256 parmak izi diskteki sürümle birebir eşleşti:

`f1a8a9fc4ad05d9f04b8f3bd682630225f904a37421ce24d61e3bb02135fc05e`

| Son canlı tarama | Sayı |
|---|---:|
| İncelenen hücre | 30.195 |
| İşlem yapılabilirliği doğrulanmış | 0 |
| Fiyat kanıtı güçlü, kullanıcı kontrolü gerekli | 99 |
| Ekonomik izleme sinyali | 1.226 |
| Normal / geçersiz / uygun olmayan | 28.870 |
| Yeterli tarihsel referansı olan hücre | 239 |
| Yeterli ve güncel referansı olan hücre | 221 |

Son tamamlanan collector turu 9.509 ürün, 7 şehir, 61 istek: 956 yeni saatlik kayıt, 104 ek kaynak gözlemi, 20.980 tekrar; hata ve bütçe nedeniyle erteleme yok. `invalid: 111086` geçersiz/boş/gelecek tarihli fiyat taraflarının toplamıdır; başarısız HTTP isteği sayısı değildir. Bu taramada geçerli Buy/Sell tarafları toplamı 22.040'tır. Collector'ın boş dakika kontrolü artık ekranda gerçek veri turunu sıfır kayıtla örtmez: `lastDataRun` korunur.

Kanıtlar: [live-proof.json](live-proof.json), [live-after-scan.json.gz](live-after-scan.json.gz), [live-after-status.json.gz](live-after-status.json.gz), başlangıç ve hata günlükleri.

## Değişen karar davranışı

- **Anlık arbitraj:** aynı şehir Sell'den alış → Buy'a satış veya kaynak Sell → hedef Buy. Tarihsel referans zorunlu değil. Ücret sonrası pozitif fark, kaynak zamanı, kapsam, güncellik, karantina ve taraf zaman uyumu değerlendirilir.
- **Fiyat anomalileri:** referans, bağımsız saatlik örnek, zaman yayılımı, stabilite ve hareket doğrulaması korunur. Geçmiş yokluğu anomali veya izleme gerekçesine dönüştürülmez.
- **Emir fırsatları:** tarihi sapma ile desteklenen tek taraflı emir veya olağandışı eşlenmiş makas. Olağan pozitif maker makası fırsat sayılmaz; iki emrin de dolacağı varsayılmaz.

Ekonomik kategori ve tarihsel gereksinim ayrı alanlardır. Örneğin yüksek Sell'e satış emri ekonomik olarak emir fırsatıdır, ancak dayanağı tarihsel anomalidir. İlgili kaynakların kanıtı sıralamada kullanılır; arbitraj tarihsel güveni olmadığı için cezalandırılmaz. Düşük Sell ve alış emri için birim sermaye hesaplanır; referans tasarrufu yeniden satış getirisi gibi sunulmaz. Sahip olunan eşyanın alış maliyeti bilinmiyorsa satışın gerçek ROI'si bilinmiyor olarak kalır.

**25 silver genel ekonomik tabanı kaldırıldı.** Mevcut tarihsel hareket tespitindeki %12 ve 25 silver gürültü koşulları değiştirilmedi; bunlar her arbitrajın ekonomik anlamlılığına uygulanmıyor. Tarihsel düşük fiyatlı ürünlerde bu eski hareket koşulu hâlâ sinyal kaçırabilir. Bu sınırlama raporlanıyor; dağılım kanıtı olmadan yeni bir tarihsel eşik üretime konmadı.

Dört sonuç `outcome` ve `outcomeCounts` ile açıkça ayrılır. Mevcut istemcileri koruyan `stage: trade`, `resultCounts.trade`, `counts.verified` ve `pipeline.validated` eski alan adları **fiyat doğrulaması** anlamındadır; gerçek işlem kanıtı değildir. Yeni ana ekran bu alanları “fiyat kanıtlı” diye sunar. Mevcut kaynaklarda istenen miktar, yürütülebilir emir derinliği ve gerçekleşmiş emir kanıtı bulunmadığından işlem doğrulanmış kümesi sıfırdır. Yalnız bir uygulanabilirlik puanı bu etiketi açamaz.

Ana kart: ürün ve rota, sebep, miktar/fiyat kontrolü eylemi, birim net teorik avantaj, ROI veya referans avantajı, sermaye ve eksik işlem kanıtı. Ayrıntı paneli kaynak fiyatlarını, kaynak zamanlarını, referans örneklerini ve maliyet temelini gösterir. Kartlar “Şimdi al” yerine “Alış fiyatını ve miktarı kontrol et” gibi eylemler kullanır. Boş sonuçta ekonomik sinyal yokluğu, veri yetersizliği, eski veri, eksik doğrulama veya filtrelerin dışlaması ayrılır. Item adları mevcut `itemNameHtml` yolunda copyable kalır; yeni CSS, kontrol ID'si veya tasarım sistemi eklenmedi.

Bir hücrenin birden fazla stratejisi tek aday olarak tutulur; strateji filtresi ilgili alternatifini seçer. Farklı kaynak şehirleri farklı rota işlemleridir, ancak aynı hedef Buy miktarını paylaşabilirler. Bu varyasyonlar bağımsız toplam kâr olarak toplanamaz; ilk 20 raporunda tekrar sayıları açıklanır.

## Aynı gerçek veride önce / sonra

V3 başlangıç kaynakları `baseline-*.txt` olarak çalışma ağacından yakalandı. Bağımsız üretim motoru yazılmadı; yalnız denetim sırasında yakalanan modüller aynı girdilerle çalıştırıldı. Fiyat, referans ve yan doğrulama alanlarının değişmediği; soğuk ve sıcak sonuçların aynı olduğu ve sayaçların hücreleri böldüğü assert edildi.

| Veri | Hücre | V3 fiyat kanıtlı | V4 fiyat kanıtlı | V3 izle | V4 izle | V4 işlem doğrulanmış |
|---|---:|---:|---:|---:|---:|---:|
| Donmuş 11 Ekim snapshot | 25.874 | 59 | 107 | 1.073 | 1.093 | 0 |
| Yeni arşiv, ilk canlı inceleme | 29.538 | 53 | 105 | 988 | 1.003 | 0 |
| Yeni kaynak sorgusu ile inceleme | 29.608 | 57 | 105 | 1.019 | 1.032 | 0 |

Her satırdaki önce/sonra aynı girdidedir. Satırlar arasında collector çalıştığı ve zaman ilerlediği için sayılar farklıdır; bu fark yalnız yeni sorguya atfedilmez. Donmuş girdide V3'ün kabul ettiği hiçbir hücre V4'te kaybolmadı. Ek 48 fiyat kanıtlı hücre pozitif fakat 25 silver altındaki arbitrajlardır. Yanlış fiyat tarafı, negatif vergi sonrası fark, karantina veya saatler arası uyumsuzluk gevşetilmedi.

### Nominal eşik duyarlılığı

| Varsayımsal minimum birim avantaj | Donmuş aday | Yeni arşiv adayı |
|---|---:|---:|
| Pozitif | 107 | 105 |
| 1 silver | 105 | 98 |
| 5 silver | 93 | 89 |
| 25 silver | 59 | 53 |
| 100 silver | 35 | 27 |

Bu bir ölçüm tablosudur; eşikler üretime uygulanmadı. Donmuş dağılımda P25 10,48, medyan 31,36, P90 957,69 silver; yeni arşivde 11,12 / 25,04 / 384,11 silver. Düşük birim avantajın yüksek yüzdesi, taşıma için yeterli toplam kazanç kanıtı değildir. Miktar doğrulanmadan ancak toplu miktar ve toplam maliyet kontrolüyle değerlendirilebilir. Sıralama nominal avantaj, yüzde getiri, güncellik ve ilgili kanıtı mevcut dağılımla birlikte kullanır; doldurma kotası yoktur. Ekranın mevcut 500 satır sunum sınırı keşif havuzunu sınırlamaz; tüm adaylar filtrelenebilir havuzda kalır.

## 68 referansın nedenleri ve gerçek darboğaz

25.874 hücrede **32.920 fiyat tarafı** bulunur. Hücre ve taraf sayıları birbirine eklenmemelidir. L3 şartı 12 bağımsız saatlik referans örneği, 24 saat zaman yayılımı ve en az %80 stabilitedir; mevcut son fiyat kendi referansını doğrulamaz.

| Eksik koşul, örtüşen taraf sayıları | Donmuş | Yeni sorgulu arşiv |
|---|---:|---:|
| Önceki kabul edilmiş referans örneği yok | 17.836 | 17.851 |
| 12 referans örneğine ulaşmıyor | 32.720 | 37.616 |
| 24 saat yayılımına ulaşmıyor | 30.776 | 31.901 |
| Stabilite koşulunu geçmiyor | 18.526 | 19.231 |
| Kaynak fiyatı eski | 19.775 | 25.271 |
| Son kaynağın zamanı/kapsamı yetersiz | 831 | 1.210 |

Sıfır geçmişte stabilite de sıfırdır; bu tabloyu “18.526 olgun seri oynak” diye yorumlamak yanlıştır. Birincil sebebe göre ayrık donmuş taraf dağılımı: 17.836 önceki referans yok; 14.884 örnek yetersiz; 98 zaman yayılımı yetersiz; 25 stabilite; 13 eski; 64 bütün bu koşulları geçen taraf. Ayrıca yalnız kaynakta bağımsız olay sayısı bakımından 32.659 taraf 12 olaya ulaşmıyor; kabul edilmiş olay bakımından 32.692. **Eksik örnekler esas neden; olgun serilerin stabilitesi ana darboğaz değil.** Kaynak olay sayısı ile saatlik referans oyu ayrıca ayrılır: aynı saat içinde farklı olaylar izlenebilir, ama referansa bir saatlik oy verilir.

Yeni arşivde yeterli hücre 205'e, yeni sorgulu incelemede 209'a, son çalışan serviste 239'a çıktı. Bu artış, yeni bağımsız kaynak olayları ve geçmişin zaman içinde olgunlaşmasıyla oluşuyor; tekrar anketlerini yeni referans saymakla değil.

Collector 61 fiyat isteğiyle tüm aktif kataloğu 15 dakikada tarayabiliyor; bütçe 144/dakika ve 240/5 dakika. Son tam gerçek turda 20.980 tekrarın karşısında 956 yeni saatlik ve 104 ek olay var. İlk 20 ürününe yönelik tek yeni istekte 98 satır/196 fiyat tarafı geldi: 137 geçerli tarafın **133'ü aynı kaynak olayı**, 4'ü yeni kaynak zamanı; 3 fiyat değişmiş. Bu küçük örnek seçilmiş aday örneğidir, tüm piyasanın oranı değildir. Buna rağmen tam collector turundaki tekrarlar da aynı darboğazı doğruluyor: **API'yi sık sorgulamak piyasa istemcilerinin yeni kaynak fiyatı üretmesini sağlayamıyor.**

REST toplaması kalite 1 ve aktif 7 şehirle sınırlı; paket akışı diğer kaliteleri yalnız görüldükçe kapsıyor. Zamanı/kapsamı bilinmeyen paketler güvenilir referans oyuna dönüşmüyor. İstek bütçesi ve aktif kapsam bu nedenle genişletilmedi; daha fazla tekrar istek yapay güven sağlamaz. 90 günlük arşiv ile motorun 28 günlük referans penceresi farklı amaçlarla aynen korundu. Büyük journal'ın yükleme süresi ayrıca servis yeniden başlatma maliyetidir; yeni bir boş arşivle veya kayıt silerek örtülmedi.

## İlk 20 ve yeni gözlem kontrolü

[first20.md](first20.md) donmuş ve yeni arşivden **20'şer adayı** tek tek değerlendirir; [first20.json](first20.json) sayısal girdileri taşır. Ürün, rota, strateji, kaynak, her tarafın zamanı, örnek sayısı, vergi sonrası fark, yüzde, sermaye, tekrar varyasyonları ve yeni sorgu sonucu yer alır. Donmuş ilk 20'de 18, yeni arşivde 14 farklı ürün var. Yeni arşivde altı kaynak şehirdeki `T4_ROCK_LEVEL1@1` aynı hedef Buy'ın kapasitesini paylaşır; ayrı gerçekleşmiş kazançlar gibi toplanamaz.

Yeni sorgu `2026-10-11T21:32:14.153Z` zamanında 14 ürünü bütün aktif şehirlerde kontrol etti. Yeni arşivin ilk 20'sinin hepsi kapsandı; **18'inde** net teorik fark pozitif, kaynak tazeliği uygun ve taraf zaman farkı bir saatin altında kaldı. İki adayda fiyat farkı pozitif kalmasına rağmen zaman uyumu kayboldu:

- `T6_SHARD_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN`, Fort Sterling → Lymhurst: yeni teorik fark 365,24 silver, fakat zaman uyumsuzluğu nedeniyle `INVALID_SPREAD`.
- `T5_ROCK_LEVEL2@2`, Caerleon → Bridgewatch: 127,12 silver pozitif fark var; yeni kaynak saatleri uyumsuz, bu rota doğrulanmış fiyat adayı olarak korunmuyor.

Tüm bu ilk 20 gözlemler AODP sağlayıcısından geliyor; ikinci bağımsız sağlayıcı doğrulaması yok. İlk incelemede hiçbir tüketilen taraf 6 saat sınırını aşmıyordu, fakat birkaç aday 1–4 saatlik kaynak fiyatı içeriyordu. En yüksek yüzde farklarının bazıları düşük sermayeli taş/malzeme ürünleridir; toplam miktar ve maliyet kontrolü olmadan yüksek ROI tek başına taşıma kararı vermez. Ayrıntılı rapor alt çeyrekteki nominal farkları ayrıca belirtir.

Makul adayların kaçırılabildiği yerler: kaldırılan genel 25 silver arbitraj tabanı; kaynaklar arasında bir saat sınırını aşan fakat yeniden kontrolle gerçek olabilecek rota; tarihsel örnek/yayılım ve hareket koşulları; tek tarafın eski olması; eksik kaynak zamanı/kapsamı. Bunların hiçbirinden bilinen gerçekleşmiş kârlı işlem veya ölçülmüş yanlış negatif oranı çıkarılamaz.

## Testler ve kalan sınırlamalar

- `npm run opportunities:test`: mevcut doğrulama, strateji, spread, UI, V3 ve yeni V4 senaryoları geçti.
- `npm run opportunities:regression:test`: 25.210 gerçek seride fiyat/referans/doğrulama farkı **0**. 2.520 × 2.160 saat sentetik veri, yaklaşık 5,46 saniye soğuk / 356 ms sıcak; mevcut sınırları geçti.
- `npm run prices:collector:test`, `prices:history:test`, `prices:collection:test`: geçti; bağımsız olay, tekrar, saatlik/90 gün saklama, yeniden yükleme, kapsam, bütçe ve ücret yönleri korundu.
- V4 durdurma testi: devam eden tek collector isteği biter ve yazım tamamlanır; yeni istek başlamadan `stop()` çözümlenir. Hub artık buna await eder; journal yazımı başarısızsa kapanış abort edilir.
- `npm run css:check`: 0 retired-class hatası, 22 mevcut advisory. Item adı kopyalama testi ve V4 karar kartı testi geçti. `git diff --check` geçti.
- Donmuş snapshot'ta 12 gerçek seri kaynak ve alım zamanına göre prefix replay edildi; gelecek veri prefix'e giremez. Bu tarihsel fiyat sinyali replay'idir; emir dolum/backtest veya gerçekleşmiş kâr testi değildir.
- Donmuş ve yeni arşiv önce/sonra auditleri, dört sonuç sayacı, soğuk/sıcak eşitliği, yan referans değişmezliği ve gerçek canlı SHA-256 eşleşmesi geçti. Audit süreleri diğer görevlerle eşzamanlı ölçüldü; bunlardan hızlanma iddiası yapılmıyor.

Miktar, derinlik, hacim, dolum olasılığı, taşıma maliyeti/süresi/riski ve envanter alış maliyeti hâlâ bilinmeyen girdilerdir. Tek kaynağın geçmişi olmayan hatalı uç kotasyonunu gerçek emirden kesin ayırmak mümkün değildir; olgun geçmişte karantina ve hareket doğrulaması korunur, geçmişsiz arbitraj da kullanıcı kontrolü gerektirir. İşlem doğrulanmış etiketi için mevcut kaynakların sağlamadığı ek yürütme kanıtı gerekir.

Yeniden üretim: `npm run opportunities:v4:audit`; yeni arşiv için `node content/scripts/audit-opportunity-v4.mjs --live`; isteğe bağlı yeni veri yakalama ve bellekte değerlendirme için capture scripti ardından `--refresh`; rapor için `node content/scripts/report-opportunity-v4.mjs`; canlı doğrulama için `node content/scripts/verify-opportunity-v4-live.mjs`. Audit ve refresh üretim arşivine `flush`/`checkpoint` çağırmaz; denetim belgelerini yazar. Son canlı collector'ın normal üretim yazımları ise devam eder.
