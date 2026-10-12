# Günün Fırsatları — Veri Güncelliği ve Tarama Kanıtları

Denetim tarihi: 12 Ekim 2026 (Europe/Istanbul). Bu çalışma tarama ve collector tanı kayıtları ekledi; V6 fırsat keşfi, doğrulama, 6 saatlik tazelik sınırı, sıralama, arşiv ve muhasebe kurallarını değiştirmedi.

## V6 baseline ve değişmezlik

İş öncesi baseline [`baseline.json`](baseline.json) içinde saklandı. Dondurulmuş veri snapshot'ı `2026-10-12T00:01:59.382Z`, 94 ham aday ve 74 sunum grubu içeriyor. Sıkıştırılmış ham tarama ve sıralı sonuç SHA-256'ları ile V6 keşif, referans, kalite, sunum ve muhasebe kaynaklarının SHA-256'ları baseline'a yazıldı. Tanı testi bu kaynak karmalarının aynı kaldığını doğruluyor; V6 test paketi de tam sıralama ve referans değişmezliği kontrolünü geçti. Testin değiştirdiği `verification.json` dosyası test sonrasında bayt düzeyinde eski haline getirildi.

Karşılaştırma kuralı: farklı `snapshotId` değerli canlı taramalar algoritma regresyonu diye yorumlanmamalı. Tanı kaydı hem tarama için benzersiz `scanId` hem fiyat ve motor girdilerinden türetilen `snapshotId` saklıyor. Aynı snapshot daha sonraki değerlendirme anında tekrar işlenebilir; zaman ilerledikçe yeni tarama kimliği alır. Aynı snapshot üzerindeki V6 sabit girdili testleri 94/74 baseline'ının sıralama ve referanslarını değiştirmedi.

## Kalıcı tarama tanısı

Market Hub tanı verisini `.opportunity-diagnostics.json` dosyasında, fiyat arşivlerinden ayrı tutuyor. Sunucu taramaları, tarayıcı filtre görünümü ve collector turları ayrı koleksiyonlarda saklanır. Tarayıcı kaydı sunucu `scanId` değerine bağlanır; filtreler, görünüm, düzen, filtre sonrası uygun sayısı ve gerçekten gösterilen sayısı ayrı kalır. Aynı filtre durumunun aynen yinelenmesi tekrar yazılmaz.

Saklama sınırı 30 gün, en çok 240 sunucu taraması, 480 istemci durumu, 240 collector turu ve 1,8 MB'dır. Kayıt atomik geçici dosya ve yeniden adlandırmayla yazılır. HTTP tanı API'si son taramaları, önceki tarama ile sayaç farkını, aynı/farklı snapshot durumunu, grup öncesi/sonrası adetleri, birincil eleme gerekçelerini, örtüşen fiyat kanıtı dağılımını, collector turunu ve NATS telemetrisini verir. Ham JSON indirme düğmesi popup içinde kalır.

Sunucu tarama sayıları ve istemcinin gerçekten gösterdiği sayılar farklı kapsamları ölçer. API ile yaptığım canlı kontrolde tarayıcıdan filtre POST'u gelmediği için canlı `clientStates` kaydı yoktu; istemci kaydı saklama/dedup davranışı otomatik test edildi. Bu boş durum kullanıcı filtresi uygulanmış gibi raporlanmamalı.

## Canlı collector turu

Eski servis yeni tanı endpoint'ini sunmadığından, kullanıcı yönergesindeki güvenli yeniden başlatma uygulandı. Market Hub kendi `SIGTERM` kapanış yordamıyla durdu; bekleyen collector işi, yerel paket geçmişi ve kanıt günlüğü flush edildi. Ardından proje Node 24 çalışma zamanı ile yeniden başlatıldı. Yeniden başlatma yeni gerçek AODP turunu başlattı; aşağıdaki sayaçlar 12 Ekim 2026 `07:41:20Z–07:42:49Z` (Türkiye saatiyle 10:41–10:42) turundan ve onun sonrasında alınan salt okunur API yanıtlarından geliyor.

| Ölçüm | Sonuç |
|---|---:|
| HTTP istekleri / başarılı / başarısız | 61 / 61 / 0 (başarı %100) |
| Fiyat satırı | 66.563 |
| Geçerli fiyat tarafı | 18.135 |
| Kaynak zamanı ilerleyen olay | 109 (%0,60 geçerli taraf başına) |
| Aynı kaynak zamanı ve aynı fiyat tekrarı | 18.001 |
| Aynı kaynak zamanında fiyat düzeltmesi | 4 |
| Mevcut kayıttan daha eski kaynak zamanı | 21 |
| Kaynak zamanı 6 saat veya daha eski | 16.687 |
| Yeni saatlik arşiv kaydı / ek gözlem | 82 / 31 |
| Geçersiz veya reddedilmiş fiyat tarafı | 114.991 |

61 başarılı HTTP yanıtı, 109 yeni kaynak-zamanlı olay üretti. 16.687 eski kaynak zamanı mevcut tazelik kabul kuralına göre otomatik tazelenmedi; bu sayaç yalnızca kaynağın ne kadar eski olduğunu ölçer. `sourceOlderThan6h` mevcut altı saatlik fırsat kapısının ölçümüdür; arşivin kendi daha uzun süreli kabul politikası veya reddedilen/`stale` sayacıyla karıştırılmamalı. Bu turdaki `staleSourceSides=0`, altı saat sınırıyla aynı şey değildir.

Collector sayaçları hem her turda hem son bir saat/gün/hafta toplulaştırmasında okunabilir. Bir turun sayaçlarında HTTP istekleri retry dahil gerçekten gönderilmiş istekleri sayar; arşiv kaydı sayısı ile aynı değildir. Zaman pencereleri kayıtlı son turların toplamını verir.

Collector ayrıca veri gerektirmeyen zamanlanmış turları da `0 istek` olarak kaydeder. Bu yüzden en son tur sıfır gösterebilir; Hub durumundaki `lastDataRun` ve önceki tur kaydı en son fiyat üreten turu gösterir. Canlı kontrolden sonraki tanı sorgusunda dört tur kaydı vardı; 61 istekli fiyat turu korunmuştu ve sonraki due-empty turların sayaçları sıfırdı.

## Market Hub oyun paketi kanıtı

Canlı durum endpoint'i, test anında Albion Data Client'in çalıştığını (`adcProcess=true`), `/marketorders.ingest` üzerinden 34.366 paket alındığını, 7.745 kitap ve 104.500 emir tuttuğunu gösterdi. NATS akışı kapalıydı; NATS kitap sayacı kanıt olarak kullanılmadı.

Albion Data Client'ın çözdüğü emir paketi ürün, şehir, kalite, emir yönü, birim fiyat, miktar, kimlik ve sona erme zamanı içerebilir. Mevcut normalizer miktarı canlı kitap projeksiyonuna taşımıyor; özgün paket satırı `rawEvidence` içinde korunuyor. Paket alım zamanı `seenAt` olarak biliniyor, ancak oyundaki emrin yaratılma/kaynak fiyat zamanı bilinmiyor. Yerel paket akışı ayrıca tam emir defteri snapshot'ı veya silme olayı sağlamıyor. Bu nedenle eksik emir görünmemesi iptal kabul edilmez ve bir paket tarafı tüm şehri/ürünü/kaliteyi güncel göstermez.

Paket geçmişi mevcut kısmi-kapsam ve karantina/doğrulama politikasıyla işleniyor. Kaynak zamanı bilinmeyen kısmi paket fiyatları `source-time-unknown` ve `incomplete-book` gerekçeleriyle provisional kalıyor; gerçek kaynak zamanlı AODP fiyatını veya iki taraflı tam fiyat kanıtını taklit etmiyor. Testler miktar ve fiyatın paket kanıtından ayrıştırılabildiğini, oluşturulma zamanının bulunmadığını ve NATS akışının hiçbir zaman tam kitap sayılmadığını doğruluyor. Yeni dinleyici veya oyun etkileşimi eklenmedi.

## Canlı tarama örneği ve sayaç tutarlılığı

Yeni servis üzerinde bir kez `GET /api/v1/market/opportunities?server=europe` çağrıldı. Tarama `scanId=ced8baf1-b4aa-4c9e-b250-5cad258132f8`, `snapshotId=f3a415119516273cef53cfa4badf927d222588584d3ab2c816901ffbd4c7b4af` ve `2026-10-12T07:43:01Z` zamanıyla kalıcı tanıya yazıldı.

| Tarama metriği | Sonuç |
|---|---:|
| İncelenen hücre | 30.749 |
| Referanslanabilir hücre | 18.631 |
| Tarama funnel'ındaki taze hücre | 1.180 |
| Keşfedilen | 2.069 |
| Fiyat kanıtlı / doğrulanmış fırsat | 22 |
| İzleme | 242 |
| Birincil pipeline reddi | 30.485 |
| Fırsat grubu öncesi → sonrası | 22 → 13 |
| İzleme grubu öncesi → sonrası | 242 → 232 |

Birincil gerekçeler: eski fiyat 20.097; yetersiz geçmiş 6.300; geçersiz spread 1.195; bağımsız gözlem azlığı 241; işlem doğrulaması eksik 242; karantinada 622; normal piyasa davranışı 2.030; doğrulanmış fırsat 22. Bu aşamalar farklı huni düzeyleri içerdiğinden her sayaç toplanıp birbirinden çıkarılmamalı. Tarama snapshot'ında fırsat/izleme adaylarının 394 benzersiz ana fiyat kanıtı ayağının 152'si 6 saatten yeni, 234'ü 6 saat veya daha eski, 8'i kaynak zamanı bilinmeyen/future kanıtıydı; 60 dakikayı aşan taraf-zaman uyumsuzluğu yoktu. Bu dağılım yalnız dönen fırsat/izleme adaylarının ana kanıt ayaklarını kapsıyor, incelenen tüm hücreleri değil.

API yanıtındaki `potential` uyumluluk alanı bu canlı taramada boştu; V6 arayüzü izleme adaylarını `potentialCandidates` ve satırdaki `potential` işaretinden okuyor. Tanı API'si de aynı `potentialCandidates` dizisini sayıp 242 izleme kaydetti. Filtre sonrası gösterilen sayaç istemciden ayrı POST ile gelir; API-only tarama bu alanı doldurmaz. Bu yüzden sunucu keşfi, gruplama ve kullanıcı filtresi ayrı raporlanıyor. Eski uyumluluk alanının 0 görünmesi V6 izleme havuzunun 0 olduğu anlamına gelmiyor.

Bu canlı örnekte 94 → 8 eski ekran karşılaştırması yeniden üretilemez: eldeki 94/74 kayıt bir frozen baseline snapshot'ıdır; canlı tarama başka kaynak verisi, başka zaman ve başka çıktı sayısı üretti. Baseline 94 adayının her biri güncel girdilerle eşlenmedi; bunu yapabilmek için baseline'ın aday seviyesindeki tam fiyat kanıtlarının aynı item/şehir/kalite/taraf anahtarı ve canlı kaynak verisiyle ayrı bir audit girdisi olarak işlenmesi gerekir. Bu rapor farklı zamanlı çıktıyı algoritma regresyonu diye göstermiyor. Tanı sistemi sonraki 94 → yeni sayı geçişini aynı snapshot mı farklı snapshot mı olduğunu, sayım hunisini, elenen nedenleri, gruplamayı ve filtre sonrası istemci sayısını kaydederek kanıtlayacak.

## Doğrulama

- `npm run opportunities:test` — V3, V4, V5, V6 ve tanı testleri dahil tamamı geçti.
- `npm run prices:collector:test` — 12 collector testi geçti.
- `npm run prices:collection:test` — katalog ve 61 istek partisi kapsam testi geçti.
- `npm run opportunities:diagnostics:test` — 10 tanı, kalıcılık, kaynak zamanı ve paket kanıtı testi geçti.
- `npm run css:check` — mimari test geçti, retired class hatası yok. Bu işte CSS değişmedi.
- Canlı Market Hub yeniden başlatma, collector turu, durum endpoint'i, tanı endpoint'i ve tarama kaydı doğrulandı.

## Değişiklik ve sınırlamalar

Değişen uygulama dosyaları: `content/scripts/opportunity-diagnostics-repository.mjs`, `content/scripts/aodp-collector.mjs`, `content/scripts/quote-service.mjs`, `content/scripts/price-hub.mjs`, `content/js/tools/opportunities.js`, `content/scripts/test-opportunity-diagnostics.mjs` ve `package.json`. Baseline ve bu rapor `docs/opportunity-freshness-audit/` içindedir. Var olan fiyat arşivine tanı kaydı yazılmadı; canlı collector'ın normal gerçek AODP güncellemesi arşivde yeni saatlik gözlem oluşturabilir.

Oyun paketi gözlemi emrin oyun içi kaynak zamanını ve tam defter durumunu kanıtlamaz. Mevcut `NATS marketorders.deduped` akışı da snapshot/silme sağlamadığından güvenilir kitap doğrulamasına dönüşemez. Tarihsel 94 aday ile yeni canlı taramayı bire bir yeniden eşleştiren tam aday-seviyesi canlı karşılaştırma yapılmadı; farklı snapshot sonuçları bu nedenle piyasa değişimi ve algoritma etkisi olarak ayrıştırılamaz. Tarama ve collector kayıtları bu ayrımı ileriye dönük olarak saklar.
