# Ada ekonomisi denetimi — 30 Eylül 2026

## Model kararları ve denetim düzeltmesi

İlk denetimde üç bilinçli model kararı yanlışlıkla hesap hatası olarak sınıflandırılmıştı. Kullanıcının açıklamasına göre bunlar geri yüklendi:

- Şehir bonuslu premium crop için varsayılan ortalama **9.5**; teorik 9.9 kullanılmaz. Bu merkezi yield fonksiyonunun gözlemsel varsayımıdır; eşleşen Ada Çıktı kayıtları yine önceliklidir.
- Mekanik crop/product süresi **22 saat**, ekonomik planlama **24 saatte bir toplama**dır. Çok günlük dönüşüm `ceil(mechanicalHours / 24) × 24` kuralını kullanır: 44 ve 46 mekanik saat → 48 planlama saati. Mekanik süre katalogda korunur; `animalCycleHours` mekanik, `planCycleHours` ekonomik süreyi verir.
- `feedFixed` hayvanlarda favorite feed bilinçli pratik politikadır. Tüm crop/herb alternatiflerini otomatik seçen genişletme geri alındı. Favorite şartı olmayan hayvanlarda önceki crop-only adayları korunur. Favorite yemin katalogdaki azaltılmış miktarı ve `best.feed.unit` düzeltmesi korunur.

## Korunan bug fixleri

Kapsam: `island-economy.js` (V1 optimizasyon/ledger), `island-planner-v2.js` (elle kurulan plan), ortak katalog, yield ve market modülleri. UI/HTML/CSS kapsam dışı. Aşağıdaki tablo ilk denetimde bulunan ve model kararlarıyla çelişmeyen gerçek hataları gösterir.

| Yer | Mevcut formül / sorun | Doğru model | Yaklaşık etki |
|---|---|---|---|
| `effectiveSeedReturn` | Gözlenen dönüş `min(1, return)` | Alt sınır 0; üst sınır yok | %140 dönüşte 9 ekim için 3.6 tohum kredisi kayboluyor |
| V1/V2 favorite yem miktarı | Normal yem adedi favorite için de kullanılıyordu | Favorite seçimi korunarak katalogdaki favorite miktarı kullanılır | Chicken için 18 yerine 9 Wheat |
| V2 `calculateIslandPlan` | İç transfer = yem adedi × alış maliyeti | Yem adedi × seçilen satış yönteminin vergi/setup sonrası net satış değeri | Toplam ada neti değişmez; farm/pasture katkı dağılımı düzelir |
| `effectiveAnimalProductYield` | Premium/free aynı 18 ürün | Merkezi premium ürün verimi × premium/free yield oranı | Free ürün/cycle iki kat yüksek |
| V1/V2 hayvan döngüleri | Egg/milk için de yavru büyüme süresi kullanılıyordu | Mekanik product 22 saat → planlama 24 saat; free büyüme 44 saat → planlama 48 saat | Product ile growth ayrımı korunur; 24/22 throughput artışı yok |
| V1 `animalPathProfits` | Egg/milk için yavru fiyatı zorunlu | Tekrarlayan ürün cycle'ında yavru alımı/iadesi yok | Yavru fiyatı eksikse geçerli ürün yolu kayboluyor |
| V1 `animalPathProfits` | Yavru tam alış + setup gideri; dönüş kredisi setup hariç | Yeniden kullanılan yavru dönüşü net alış maliyetini azaltır | Her dönüş için gereksiz setup gideri |
| V1 `pickBestPath` | Farklı süreli yollar mutlak cycle kârıyla seçiliyor | Aynı zaman bazındaki kârla karşılaştırma | Product/growth ayrılınca yanlış yol seçilebilir |
| `standardAnimalReturn` | Eksik nurture metadata `Number(null)=0` oluyor; livestock focus bonusu atlanıyor | Metadata mevcutsa nurture hesabı, aksi halde katalog `waterBonus` değeri | Chicken %140 yerine %60; hayvan başına 0.8 yavru değeri eksik |
| V1 `pickCheapestMarketFeed/pickCheapestIslandFeed` | Karşılaştırmada `best.unit` kullanılıyor, fakat obje `{feed,crop}`; sonraki adaylar `undefined` ile karşılaştırılıyor | `best.feed.unit` ve adayın gerçek yem miktarı | İlk fiyatlı adayda takılma; piyasaya göre sınırsız fark |

## Doğrulanan mevcut davranış

- Plot başına 9 ekim ve 9 pasture hayvanı merkezi veriden geliyor.
- Standart water/focus crop hasadını değil seed return'ü; nurture offspring dönüşünü etkiliyor. Kullanıcı gözlemleri ayrı bağlamlarda tutuluyor, gözlenen verime tekrar şehir bonusu eklenmiyor.
- Egg/milk yolu yetişkin hayvanı tüketmiyor ve her cycle yeni yavru maliyeti yazmıyor. İlk yetişkin sermayesi ve ilk büyütme süresi, sürekli üretim kârına dahil değil.
- Meat yolu yetişkini tüketen büyütme/yavru/yem/offspring hesabından ayrı ürün satışı yapıyor. Katalogda chicken/goose eggs, goat/sheep/cow milk, pig için secondary product yok.
- V2 market sides intent'e göre ayrılıyor: instant input sell-min; instant output buy-max; emirlerde bir silver fiyat adımı ve ilgili setup uygulanıyor. Sabit fiyatlar input/output rolleriyle ayrı ve emir fiyatı kabul ediliyor.
- V1 alışta max(spot, geçmiş medyan), satışta geçmiş medyan (yoksa spot) kullanıyor. Bu gerçekleşebilir anlık fiyat değil, mevcut açıkça tanımlı tahmin politikası; değiştirilmedi.
- Yem arzı, hayvan maliyeti ve satışlar aynı **planlama** süresinde karşılaştırılır. Çok günlük hayvan cycle'ında farm toplama sayısı `animalPlanningHours / cropPlanningHours` olur.
- V1 zincirde tüketilen yemin seed maliyeti hayvan tarafında, fazlanın seed maliyeti farm tarafında sayılıyor. Toplamda çift sayım yok. Ayrılan farm/pasture plotları kapasite kısıtına giriyor; kaybedilen crop kârı ayrıca gider olarak çıkarılmıyor.
- V2 iç transferler eşit artı/eksi olarak dengeleniyor. Toplam gerçek satışlar eksi dış alımlar; kendi yemini bedava saymak yerine satıştan çıkan ürünlerin alternatif değeri hayvan katkısına aktarılmalı.
- Ayrı “elde mevcut stok” modu yok. Sabit input fiyatı mevcut stok/maliyetsiz stok anlamına gelmiyor.

## Kanıtlar ve sınırlar

- [Resmi farming rehberi](https://albiononline.com/news/guide-farming): favorite tüketimi yarıya indirir; büyüme 44 saat/premium 22 saat; ürün için yetişkin tekrar beslenir; focus offspring içindir; şehir bonusları.
- [Wild Blood resmi notları](https://forum.albiononline.com/index.php/Thread/187518-16-October-2023-Wild-Blood-Update/): farm animal nutrition artışı ve ürün temel ortalamasının 9'a düşmesi.
- [Oyundan çıkarılmış ham item verisi](https://github.com/ao-data/ao-bin-dumps/blob/master/items.json), projenin mevcut veri kaynağı: chicken/goat/goose/sheep/cow yetişkin `productiontime=79200`, `nutritionmax=864`, bitki/herb nutrition 48, favoritebonus 1. Baby chicken growtime 158400. Meat crafting amount 18; yetişkin tüketiliyor. 30 Eylül 2026 tarihinde okundu; hareketli kaynak olduğu için ileride tekrar doğrulanmalı.

Butcher istasyonu kullanım ücreti, işlem yeri, ayrı butcher focus/RRR ve taşıma maliyeti mevcut plan parametreleri değil. Mevcut ada city-bonus varsayımı bunların tam modeli değildir; doğrulanmamış oran eklenmedi. Seed/offspring >100% kredisi mevcut replacement-value amortismanıdır: fazla tohumu gerçekten satmanın farklı bid/ask/vergi sonucu ayrıca modellenmiyor; nakit satış geliri garantisi değildir. Tam stok/sermaye muhasebesi yeni özellik gerektirir.

## Chicken → Hen Eggs ve Wheat: yeniden üretilebilir senaryo

Canlı piyasa önerisi değildir. Otomatik testte kullanılan deterministik fiyatlar: Fort Sterling ada/satış, premium, focus yok, 22 saat mekanik / 24 saat günlük planlama cycle'ı, input anında alım, output anında satış. Wheat sell-min ve buy-max 100; seed sell-min 1,000; egg buy-max 200; adult chicken varsayımsal başlangıç alımı 5,000. Vergi %4, setup yok. Favorite-feed politikası nedeniyle Wheat seçiliyor; daha ucuz alternatifler bu hayvana otomatik seçilmez. Wheat bu şehirde bonus almaz; Chicken ürün bonusu %10.

| Ara değer | 1 pasture / 9 yetişkin Chicken | 1 farm / 9 Wheat ekimi |
|---|---:|---:|
| Başlangıç sermayesi | 9 × 5,000 = 45,000; cycle gideri değil | İlk 9 seed = 9,000; aşağıda dönüşle amortize |
| Mekanik cycle | 22 saat ürün üretimi | 22 saat büyüme |
| Ekonomik/planning cycle | 24 saat; günde bir toplama | 24 saat; günde bir toplama |
| Nutrition | Hayvan başına 864; toplam 7,776 | — |
| Yem | Wheat, efektif 48 × 2 = 96 nutrition/adet | — |
| Yem adedi | 864 / 96 × 9 = 81 | — |
| Yem alış fiyatı | 100 | — |
| Market yem gideri | 8,100 | — |
| Kendi yeminin net satış alternatifi | 100 × (1 − .04) = 96/adet; toplam 7,776 | Tüketilen ürünün kaybedilen net satışı |
| Base yield | 18 egg/hayvan (free: 9) | 9 Wheat/ekim (free: 4.5) |
| City bonus | %10 | %0 |
| Toplam çıktı | 9 × 18 × 1.1 = 178.2 egg | 9 × 9 = 81 Wheat |
| Seed return | Ürün cycle'ında uygulanmaz | %60; beklenen 5.4 seed |
| Amortize seed gideri | 0 | 9 × 1,000 × (1 − .6) = 3,600 |
| Output fiyatı | 200 | 100 |
| Vergi / setup | %4 / %0 | %4 / %0 |
| Brüt satış | 35,640 | 8,100 |
| Vergi | 1,425.6 | 324 |
| Net revenue | 34,214.4 | 7,776 |
| Net profit / plot / cycle (market yemi) | 26,114.4 | 4,176 |
| Net profit / plot / cycle (kendi yeminin alternatif maliyeti) | 26,438.4 | 4,176 farm katkısı |
| 24 saat profit (market yemi) | 26,114.4 | 4,176 |
| 24 saat ekonomik katkı (kendi yemi) | 26,438.4 | 4,176 |

**A — iki Wheat plot:** `2 × (7,776 − 3,600) = 8,352 / planlama cycle = 8,352 / 24h`.

**B — bir Wheat + bir Chicken ürün plot:** 81 Wheat tamamen iç tüketilir. Dışarıya yalnız egg satılır. `34,214.4 − 3,600 = 30,614.4 / planlama cycle = 30,614.4 / 24h`.

Katkı dağılımı: farm `+7,776 − 3,600 = 4,176`; pasture `34,214.4 − 7,776 = 26,438.4`. Toplam yine 30,614.4. Transferin +7,776 ve −7,776 tarafları birbirini götürür. Kaybedilen ikinci crop plotunun 4,176 kârını B'den ayrıca çıkarmak çift sayım olur; karşılaştırma zaten aynı iki plotla yapılır.

Fark `B − A = 22,262.4 / planlama cycle = 22,262.4 / 24h`. Matematiksel neden: egg geliri, iki farm'ın kaybedilen crop satışını ve bir farm seed tasarrufunu aşar. Bu fiyatlarda iki market-yemli pasture daha da kârlı olabilir; B'nin A'yı geçmesi B'nin küresel optimum olduğunu göstermez. Ayrı optimizer testinde egg fiyatı 70 seçilince karma plan hem iki crop hem iki market-pasture alternatifini geçer.

## Uygulama ve doğrulama

Kanıtlanan hesap hataları ortak yield, cycle ve yem fonksiyonlarında; V1 plan/ledger ve V2 hesap akışlarında düzeltildi. Yeni oyun sabiti eklenmedi; mevcut katalogdaki normal/favorite yem adetleri, premium/free verimleri ve cycle saatleri kullanıldı. UI/HTML/CSS değiştirilmedi.

`node --experimental-vm-modules content/scripts/test-island-economy.mjs` veya `npm run island:test` gerçek katalogla çalışır. Test ortamı yalnız navigation/UI başlatmasını kapatır; üretim hesapları ve veri modülleri gerçek koddan yüklenir. Geri yüklenen model kararları ve korunan bug fixleri için 18 test senaryosu geçti. Testler 9.5 gözlemsel yield, 24 saatlik günlük plan, favorite-feed politikası, çok günlük yem arzı, `best.feed.unit`, %140/%200 dönüşler, free/premium ürün ayrımı ve çift sayım kontrolünü kapsar. Testler dış ağa ve canlı markete bağlı değildir. Bu ortamda npm sarmalayıcısı çıktı vermeden başarısız olduğu için doğrulama doğrudan yukarıdaki Node komutuyla yapıldı.

V1 ada-yemi ledger satırı mevcut **seed-cost zincir PnL** anlamını korur; tek pasture'ın net alternatif-maliyet marjı olarak okunmamalıdır. V1 global optimizasyon tüm plotları karşılaştırır. V2 katkısı net satış alternatifiyle, ada toplamı ise dış nakit akışıyla hesaplanır. V2 kullanıcı yerleşimini değerlendirir; kendi stokları/alternatif yem karışımlarını küresel olarak optimize eden yeni bir model eklenmedi. İlk hayvan yatırımı, ilk büyüme beklemesi, focus'un başka kullanım fırsatı ve piyasa emirlerinin gerçekleşme riski günlük steady-state kâra dahil değildir.
