# Günün Fırsatları V3 — denetim ve teslim raporu

11 Ekim 2026. Üretim arşivleri silinmedi, yeniden doldurulmadı veya taşınmadı. Servis yeniden başlatılmadı. Mevcut `opportunitiesValidated: true` ayarı ve açık legacy geri dönüş seçeneği korunuyor; yeni davranış güncellenen servis kodu çalıştığında uygulanır. Kullanıcının mevcut CSS, flipper ve fırsat görünümü değişiklikleri korunmuştur; bu çalışma CSS/HTML dosyalarını değiştirmedi.

## 1. Kök nedenler ve kanıt

| Kod konumu | Somut örnek / kanıt | Kök neden ve kullanıcı etkisi | V3 karşılığı |
|---|---|---|---|
| `market-opportunities.mjs`, `buildStrategies`, eski `local-make` dalı; `market-opportunity-scan.mjs`, makas incelemesi | T6_HEAD_LEATHER_ROYAL / Caerleon / Q1: Buy 111114, Sell 474999, eş kaynak zamanı 23:45 UTC; Buy L0, Sell L1, eşleşmiş tarihsel makas örneği 0 | Her pozitif ücret sonrası maker makası uygun stratejiydi. Sonradan hesaplanan “veri yetersiz” makas sınıfı uygunluğu değiştirmiyordu. Çok büyük teorik kazanç, dolum veya olağandışılık kanıtı sanılabiliyordu. | Maker sinyali için mevcut kendi-serisi eşleşmiş L3 makas incelemesinin `unusual` sonucu gerekir. Normal makas elenir. Eşleşmiş geçmiş yoksa ayrı `INSUFFICIENT_HISTORY` gerekçesi verilir; veri eksikliği tek başına izleme sinyali olmaz. |
| `market-opportunities.mjs`, emir ve taşıma kolları; `market-opportunity-review.mjs`, `strategyAdvantage` | T4_RUNE / Martlock / Q1: Buy 9, Sell 7; premium vergi sonrası fark 1.64 silver | Tarihsel hareketin 25 silver tabanı vardı; pozitif emir/rota farkında yalnız `> 0` kullanılıyordu. Yüksek oranlı, küçük nominal avantajlar fırsat oluyordu. | Aynı mevcut 25 silver tabanı ekonomik avantaj için de kullanılır. 25 dahil, 24.999 hariç sınır testi var. Yeni bir piyasa kazanç tahmini eklenmedi. |
| `market-strategy-policy.mjs`, tüketilen fiyat kanıtları; V3 `reviewOpportunityResults` | Rune örneğinde Buy 23:10 UTC, Sell ertesi gün 00:35 UTC: 85 dakika fark | İki taraf ayrı ayrı 6 saatten genç olduğu için birlikte gerçekleştirilebilir bir görüntü sayılabiliyordu. | Çok taraflı fiyatlar mevcut saatlik örnekleme süresinden daha az kaynak zamanı farkı taşımalı. 60 dakika sınırında `INVALID_SPREAD`; 59.94 dakika sınır testinde kabul. Bu, eşzamanlı dolum garantisi değildir. |
| `market-opportunity-quality.mjs`, birincil strateji ve kanıt bileşeni | Eski birincil strateji `advantageSilver * weight` ile seçiliyordu; kaynak execution güveni 1 olduğunda zayıf tarihsel referans kalite bileşeninde ayrışmıyordu | Çok yüksek teorik avantaj daha iyi kanıtlı alternatifi gölgeleyebiliyordu. Alternatif strateji seçilince satırın güven alanları önceki stratejide kalabiliyordu. | Birincil strateji her görünümde ortak kaliteyle seçilir. Seçilen girdilerin güveni satıra yansır. Mevcut %15 kanıt ağırlığı kaynak ve referans arasında eşit paylaşılır; iki alt bileşen açıklanabilir. Bu paylaşım sunum tercihidir, başarı olasılığı değildir. |
| `opportunities.js`, `eligibleListRows` ve `listCounts` | Baseline 970 izleme adayı ana fırsat görünümüne dahil olabiliyordu | Eksik kanıtlı sinyaller doğrulanmış fırsatlarla aynı listeyi dolduruyordu. | Fırsatlar ve “İzlenecek adaylar” ayrı görünümler; İzle eylemi ve eksik kanıt korunur. Şüpheli görünüm ayrı kalır. |
| `market-opportunity-scan.mjs`, sonuç ve tanı sayaçları | Eski fiyat/reference/fresh/anomaly sayaçları örtüşüyordu; V3 elemesi sonrası eski uygunluk sayaçları ilk değerlendirmeye bakmaya devam edebilirdi | Gösterilmeyen hücre ile elenen ekonomik aday karışabiliyor; toplamlar yanlış yorumlanabiliyordu. | Hücreler `trade/watch/rejected` kümelerine ayrılır. `discoveredRejected` keşif denklemini tamamlar. Eski uyumluluk sayaçları da son karar üzerinden hesaplanır. Her hücreye tek ana neden, her stratejiye ayrıntılı kanıt nedenleri atanır. |

Yetersiz arşiv hakkında yeni bir yazma hatası bulunmuş gibi davranılmadı. Mevcut `quote-history-repository.mjs:114` kaynak zamanı ilerlemeyen aynı AODP fiyatını yeni bağımsız saatlik oy yapmıyor; `recordEvidence` aynı saat içindeki yeni kaynak olaylarını ve düzeltme çatışmalarını saklıyor. Bu doğru davranıştır. Kaynak zamanı ilerleyen aynı fiyat ise gerçek bağımsız güncelleme sayılır; fiyatın mutlaka değişmesi şart değildir.

Önceki denetimlerde saptanan ilk fiyata kilitlenme, onaylanmış hareketlerin referanstan düşmesi ve aynı saat içindeki ek kanıt kaybı mevcut başlangıç kodunda zaten düzeltilmişti. Bunlar yeniden icat edilmedi. 25.210 gerçek serinin eski fonksiyonel referans uygulamasıyla eşdeğerlik testinde fiyat, referans ve doğrulama alanlarının tamamı korundu. V3 yalnız açıklayıcı `referenceState` ekler.

## 2. Veri akışı

1. Market Hub yerel emir paketlerini alır. Paket alım zamanı kaynak emir zamanı değildir; bilinmeyen/eksik kapsam işlem kanıtı kabul edilmez.
2. AODP collector katalog ve şehir kapsamını ortak collection planından alır. Politika hedefleri A/B/C için 15 dakika / 1 saat / 4 saattir; scheduler 1 dakikalık tick ve istek bütçesiyle işler. Mevcut kapsam testi 9508 katalog ürünü, 180 ada ürünü ve 61 URL batch doğruladı. Bunlar her ürünün her 15 dakikada yeni piyasa fiyatı üreteceği anlamına gelmez.
3. Buy için maksimum alış, Sell için minimum satış kendi source timestamp alanıyla işlenir. Eksik/sıfır/negatif/sonlu olmayan fiyat, geçersiz/gelecek zaman ve kapsam dışı kimlikler elenir. Arşiv geçerlilik penceresi 90 gündür; fırsat güncelliği ayrı 6 saatlik politikadır.
4. Collector fırsat filtrelerini okumadan repository'ye yazar. `sourceQuoteAt/observedAt` kaynak zamanı; `fetchedAt/receivedAt` yerel alım zamanı; `bucketAt/seenAt` arşiv örnekleme zamanıdır. Saatlik temsilci, ek kaynak olayları, current fiyat ve ham/audit kanıtı ayrıdır. Aynı olay tekrarları yeni güven oyu üretmez; düzeltme çelişkileri karantinaya gider.
5. Journal ve checkpoint birlikte replay edilir. AODP gerçekleşmiş satış ortalamaları ayrı anchor'dır; Buy/Sell emir gözlemi gibi arşive eklenmez. 90 gün saklama ve mevcut ham/karantina saklama politikaları korunmuştur.
6. Referans mevcut median-28d gözlem politikasını ve normal fiyat aralığını kullanır. Güncel hareket kendi baseline'ına katılmaz. L3 mevcut 12 bağımsız gözlem, en az 24 saat yayılım ve %80 stabilite koşulunu korur. V3 durumları: hiç geçmiş yok, örnek yetersiz, bağımsız gözlem/zaman yayılımı yetersiz, eski, güvenilir, şüpheli/karantinada. Aynı kaynak olayının tekrarları ayrı güven kanıtı değildir.
7. `discoverStrategiesForRow` bütün değerlendirme kararlarının ekonomik sinyalini ortak `strategyAdvantage` ücret hesabıyla çıkarır; kaynak güveni başarısızlığı bu hesabı engellemez. Tarihsel yön, %12/25 silver hareket ve normal aralık; ters makas/rota için pozitif ücret sonrası avantaj; maker için kendi tarihsel olağandışı makas kanıtı kullanılır.
8. Doğrulama mevcut V2 kaynak, kapsam, kabul/karantina, L3, hareket onayı ve güncellik kapılarını korur. V3 ekonomik büyüklük, normal aralık ve çok taraflı zaman uyumunu ayrıca uygular. Eksik güven kanıtı olan gerçek sinyal İzle olur; yapısal, ekonomik ve karantina başarısızlıkları elenir.

Tarama arşive yazmaz. `pipeline.newArchiveObservations` bu nedenle `null` (bu taramada toplama ölçülmedi) kalır. Servisin ayrı `collection` alanı son collector çalışmasının zamanını, yeni saatlik gözlemlerini, ek kanıtlarını ve duplicate sayısını taşır. Arşiv sayısını eski bir taramaya veya başka bir toplama dönemine mal etmez. Duplicate artışı tek başına yerel tarama hatası sayılmaz; collector başarısı HTTP/işleme hatalarından ayrı belirlenir.

## 3. Türler ve karar anlamı

| Sinyal | Tüketilen fiyat | Ekonomik anlam / olası V2 eylemi | Gerekli kanıt |
|---|---|---|---|
| Düşük Buy | Buy | Referansa göre düşük tekliften alış emrini değerlendir; tasarruf, gerçekleşmiş kâr değildir | L3, aşağı hareket, onay, kaynak/kapsam/güncellik |
| Yüksek Buy | Buy | Görünen alış emrine şimdi sat; envanter edinim maliyeti bilinmez | L3, yukarı hareket, onay, kaynak/kapsam/güncellik |
| Düşük Sell | Sell | Şimdi al; referansa göre alış tasarrufu | L3, aşağı hareket, onay, kaynak/kapsam/güncellik |
| Yüksek Sell | Sell | Satış emri açmayı değerlendir; dolum bilinmez | L3, yukarı hareket, onay, kaynak/kapsam/güncellik |
| Ters makas | Aynı şehir Sell → Buy | Görünen satıştan alıp alışa satmanın vergi sonrası birim farkı | İki kabul edilmiş kapsamı/zamanı bilinen taze fiyat ve zaman uyumu |
| Şehirler arası taşıma | Kaynak Sell → hedef Buy | Taşıma öncesi ücret sonrası birim fark | İki tüketilen fiyatın kaynak/kapsam/güncellik ve zaman uyumu; yol maliyeti bilinmez |
| Maker alt stratejisi | Aynı şehir Buy+1 / Sell−1 | İki emir dolarsa teorik avantaj; emir açmayı değerlendir | Görünen emir güvenine ek olarak mevcut eşleşmiş L3 tarihsel olağandışı makas kanıtı |

Bütün ekonomik türler korunur. Aynı item/şehir/kalite satırında alternatif stratejiler bulunabilir; bunlar ayrı hücre/fırsat sayılmaz. Taşıma için alternatif hedefler karşılaştırılabilir. Bilinmeyen miktar, derinlik, hacim, dolum ihtimali ve yol maliyetine sayısal değer atanmaz. İzleme adayları doğrudan işlem eylemi alamaz.

## 4. Aynı gerçek veri üzerinde önce / sonra

Donmuş snapshot: **11 Ekim 2026 03:41:41 İstanbul** (`2026-10-11T00:41:41Z`), journal sequence 2539. Kaynak dosya boyutları/hash'leri `docs/market-spread-review/snapshot/manifest.json` içinde. Disk-backed repository constructor'ı çağrılmadan checkpoint ve kesintisiz journal bellekte restore edildi. Baseline metinleri değişiklik öncesi scan/review ve başlangıçtaki temiz core sürümleridir; üretim motoru olarak kullanılmazlar.

| Ölçüm | V2 baseline | V3 |
|---|---:|---:|
| İncelenen item/şehir/kalite hücresi | 25874 | 25874 |
| Ekonomik/hareket aday sayacı | 2271 | 2266 |
| Uygun / doğrulanmış strateji hücresi | 1061 | 59 |
| Ayrı izleme hücresi | 970 | 1073 |
| En az bir yeterli referansı olan hücre | 68 | 68 |
| Kaynak fiyatı / referans / taraf doğrulaması değişen hücre | — | 0 |

Eski aday sayacı uygun strateji veya anomaliyi sayıyordu; V3 keşfi doğrulamadan önce ekonomik sinyali sayar. Bu nedenle iki aday sayacının anlamı tamamen aynı değildir. 1061 → 59, kesin yanlış pozitif oranı değildir: normal veya kanıtsız makas, küçük nominal avantaj ve uyumsuz zamanları fırsattan ayıran politika değişimidir.

V3 sonuçları: **59 işlem + 1073 izle + 24742 elenen = 25874 hücre**. Keşif denklemi: **59 + 1073 + 1134 keşfedilip elenen = 2266**. Doğrulanmış hücrelerin birincil stratejileri 57 taşıma ve 2 yüksek Sell'dir. Eski uygun hücrelerden 1002'si V3 işlem kümesinden çıkmıştır; elenen ve izleme sonuçları ayrıntılı karşılaştırmada kayıtlıdır.

59'un içinde T6_MOUNT_DIREWOLF / Brecilien / Q1 ve T7_MEAT / Fort Sterling / Q1 yüksek Sell stratejileri korunur. Direwolf Sell 648981, önceki referans 559990 ve L3'tür; eski ve ilgisiz Buy tarafı bu tek taraflı eylemi engellemez. T7_MEAT / Thetford Sell 500, referans 431.5 ve L3 olsa da ilgili onay/işlem kanıtı tamamlanmadığı için İzle kalır.

Makine çıktıları:

- `summary.json`: sayaçlar, ana nedenlerin ayrık dağılımı, tarafların referenceState dağılımı ve ölçüm süreleri.
- `comparison.json.gz`: her hücrenin aşaması/ana nedeni, ekonomik strateji incelemeleri, ham karar nedenlerinin sayısal dağılımı, eski uygun satırların önce/sonra kanıtları, V3 işlemler, izleme adayları ve prefix replay zaman çizelgeleri. Bu dosya gerçek örnek veri içerir; sentetik test örnekleri içermez.
- `baseline-*.txt`: yalnız denetlenebilir eski kaynak kopyaları. Replay sırasında geçici modüller oluşturulur ve silinir; ikinci üretim motoru yoktur.

12 temsilî gerçek şehir/taraf/tier/kalite serisinde prefix replay yapıldı. Her değerlendirme anında hem kaynak hem yerel alım zamanı o andan ileride olan kayıtlar dışlanır. Tek taraflı tarihsel replay'dir; tam piyasanın gerçekleşmiş emir/dolum replay'i değildir. Aynı fiyat serilerini değiştirmeden baseline ve V3 karşılaştırılır.

## 5. Testler ve performans

Geçen kontroller:

- `npm run opportunities:test`: mevcut yönler, ücretler, V2 karar güvenliği, 67 strateji matrisi, gözlem/karantina/journal/restore, browser VM kart/filtre akışı ve yeni V3 senaryoları.
- 17 V3 senaryo grubu: yeni ürün, stabil ve sıfır fırsatlı piyasa, normal hareket, gerçek onaylı anomali, yapay uç fiyat, büyük yüzde/küçük silver, eski fiyat, zaman uyumsuzluğu, aynı kaynak fiyatı tekrarları, gerçek/sahte ters makas, taşıma, eksik işlem kanıtı, çok stratejili tek hücre, 25 silver ve 1 saat sınırları, doğrulanmamış taşıma sinyali ve gelecek fiyatın referanstan dışlanması.
- `npm run opportunities:regression:test`: 25210 gerçek seride değişen fiyat/referans/doğrulama kararı **0**. Açıklayıcı aralık/state karşılaştırmadan ayrı tutulur. 2520 seri × 2160 saat performans testi: 3842 ms cold, 173 ms warm, 1260 doğrulanmış hücre, 500 listelenen; mevcut 30 saniye/5 saniye limitleri geçti.
- `npm run prices:history:test`, `npm run prices:collector:test`, `npm run prices:collection:test`: 90 gün retention, saatlik dedupe, kaynak zamanı ayrımı, aynı fiyatın ilerleyen kaynak zamanı, geçersiz ve sıfır veriler, kapsam/yan/kalite izolasyonu, scheduler ve istek bütçesi geçti.
- `npm run css:check`: 0 retired-class hatası; 22 advisory bulgu mevcut çalışma ağacındaki shared-component/selector benzerlikleridir. Bu çalışmada CSS değiştirilmedi.
- `git diff --check` geçti. Ürün adlarının kart, tablo, detay ve izleme geçmişi yolları mevcut `itemNameHtml` bileşenini kullanmaya devam eder.

Gerçek büyük snapshot'ın son koşusunda baseline 6.39 saniye, V3 cold 7.70 saniye ve V3 warm 6.51 saniye ölçüldü; tam süreler `summary.json` içindedir. Daha fazla ekonomik karar ve tanı metadata'sı maliyet getiriyor. Bu çalışma performans iyileştirmesi iddia etmez. Sentetik cache regresyonu geçti; gerçek snapshot için kesin latency/SLO çıkarılamaz.

## 6. Kalan sınırlar ve değişen dosyalar

Emir derinliği/miktarı, dolum, kuyruk, gerçek satış değeri ve taşıma maliyeti/süresi/riski hâlâ yok. Gerçekleşmiş işlemler olmadığı için kesin yanlış pozitif, kaçırılan kârlı işlem, başarı oranı veya gerçek kârlılık hesaplanmaz. Kontrollü testlerde bilinen anlamlı anomali/ters makas/rota korunur; gerçek elenen hücrelerin hangisinin fiilen kârlı olacağı bilinmez.

Eş kaynak zamanlı tarihsel Buy/Sell çiftleri seyrektir; maker için güvenilir olağandışılık bulunamaması gerçek fırsat yok demek değildir. Referans kapsamı yalnız 68 hücredir ve bu V3 karar değişikliğiyle yapay olarak büyütülmedi. Bir saatlik zaman uyumu mevcut saatlik örneklemeye dayanan koruyucu koşuldur; bağımsız olarak yenilenen fakat hâlâ yürürlükte olan eski emirleri kaçırabilir. Snapshot miktar/dolum verisi bu ayrımı çözmez. %15 kanıt ağırlığının eşit kaynak/referans paylaşımı istatistiksel kalibrasyon değildir; açık sunum tercihidir.

| Dosya | Bu çalışmanın sorumluluğu |
|---|---|
| `content/js/core/market-opportunity-review.mjs` | Ortak ücret sonrası avantaj hesabı, güven kapılarından bağımsız ekonomik keşif, V3 sonuç incelemesi, merkezi neden kodları |
| `content/js/core/market-opportunity-scan.mjs` | Tarihsel makas sonucunu uygunlukta kullanma, ayrık sonuç kümeleri, strateji tanıları ve tutarlı sayaçlar |
| `content/js/core/market-opportunities.mjs` | Ortak ekonomik hesabı kullanma, açık referans durumu ve ortak strateji etiketleri |
| `content/js/core/market-observation.mjs` | Ham/bağımsız gözlem sayıları; mevcut %80 stabilite değerini named policy'ye taşıma; güven eşikleri değişmez |
| `content/js/core/market-strategy-policy.mjs` | Strateji etiketlerinin ve mevcut ağırlık anahtarlarının ortak kaynağı |
| `content/js/core/market-opportunity-quality.mjs` | Kaynak/referans kanıt bileşenleri, kaliteye göre birincil seçim ve seçilen fiyatların güven alanları |
| `content/js/tools/opportunities.js` | Mevcut görünümler içinde ayrı İzlenecek adaylar sekmesi, pipeline ve toplama dönemi tanısı; mevcut yerel değişiklikler korunur |
| `content/scripts/quote-service.mjs` | Son collector çalışmasının arşiv/dedupe sayacını ayrı dönem metadata'sıyla sunma |
| `content/scripts/test-opportunity-v3.mjs` | 17 senaryo, nominal/zaman sınırları, arşivi değiştirmeme ve sayaç denklemleri |
| `content/scripts/audit-opportunity-v3.mjs` | Donmuş gerçek snapshot baseline/V3 karşılaştırması ve geleceği dışlayan prefix replay |
| `content/scripts/test-market-opportunity-quality.mjs` | Referans kanıt bileşeni ve ilk gözlemin otomatik maker fırsatı olmaması |
| `content/scripts/test-opportunity-quality-ui.mjs` | İzleme sinyalinin ana listeden ayrılması; kullanıcının önceki test ekleri korunur |
| `content/scripts/test-market-optimization-equivalence.mjs` | Yalnız yeni açıklayıcı state'i karşılaştırmadan ayırır; bütün eski fiyat/doğrulama alanlarını karşılaştırmaya devam eder |
| `package.json`, `docs/opportunity-v3/*` | V3 test/audit komutları, baseline kanıtları, gerçek karşılaştırma ve bu rapor |

Tekrar üretim: `npm run opportunities:test`, `npm run opportunities:regression:test`, `npm run opportunities:v3:audit`. Audit mevcut donmuş `docs/market-spread-review/snapshot` dosyalarını gerektirir; canlı arşiv dosyalarını yazmaz.
