# Günün Fırsatları — Canlı Veri ve Karar Denetimi

## Kapsam ve kanıt sınırı

Bu rapor salt-okunur denetimdir; keşif motoru, eşikler, fiyat arşivi, sıralama ve UI değiştirilmedi. Eski V5 baseline anı `2026-10-12T00:01:59.382Z`; aynı arşiv girdileri üzerinde V6 doğrulaması `docs/opportunity-v6/verification.json` içinde `raw=94`, `groups=74` ve `fullRankingAndReferencesUnchanged=true` olarak kayıtlıdır. Bu, V5 keşif/sunum kodu ve dondurulmuş baseline çıktısının aynı girdi için değişmediğini doğrular. Canlı arşiv karşılaştırması ise ayrı bir deneydir: `2026-10-12T07:11:51.976Z` anına sabitlenmiş snapshot kullanıldı; farklı zamanlı taramalar algoritma regresyonu sayılmadı.

Kullanıcının gördüğü `8 fırsat / 304 izleme adayı` için aynı anda alınmış tarama JSON’u veya `opp-filters` tarayıcı localStorage durumu arşivlenmemiş. Dolayısıyla bu iki ekran sayısını geriye dönük olarak birebir yeniden üretmek mümkün değil. Arşivden yeniden kurulan son sabit tarama 16 uygun ham hücre, 10 rotalı ticari grup, 248 ham potansiyel aday ve UI strateji uygunluğu/gruplamasıyla 235 watch grubu verdi. Bu fark kanıtsız biçimde “filtre” ya da “hata” diye etiketlenmemelidir. `baseline-comparison.json` eski 94 adayın tamamını, iki rota ayağının fiyat/zaman/referans seviyesini ve bugünkü sınıfını tek tek içerir.

## 94 → güncel sonuç

İlk düşüşün bir kısmı zaten sunum gruplamasıdır: 94 ham aday, V5 ticari gruplayıcıda 74 hedef-likidite grubuna iner (20 alternatif rota aynı hedef havuzunu paylaşır). Güncel sabit taramada eski listedeki 94 kimlik şu şekilde ayrıştı:

| Güncel karar | Adet | Yorum |
|---|---:|---|
| Potansiyel/izleme (`ACTION_NOT_VALIDATED`) | 56 | Sinyal kalıntısı var; fiyat/kanıt/yürütme koşulları kesin işlem fırsatı olarak doğrulanmıyor. |
| Spread geçersiz (`INVALID_SPREAD`) | 33 | Güncel gözlem/referans karşılaştırması eski avantajı desteklemiyor. |
| Normal piyasa davranışı | 1 | Anomali/fırsat olarak kalmıyor. |
| Yetersiz geçmiş | 2 | Referans geçmişi uygun karar için yetersiz. |
| Hâlâ uygun fırsat | 2 | T3 Ore—Martlock ve T8 Yarrow—Caerleon kimlikleri. |

Bu nedenler 94 adayı birincil karar olarak tam böler. İkincil özellikler örtüşür: 36 adayın en az bir rota ayağındaki fiyat değişmiş; 86 adayın en az bir kaynak fiyatı altı saatlik tazelik sınırını aşmış; 38 rotada iki fiyat ayağı arasında 60 dakikadan fazla zaman farkı var. 94 için güncel fiyatı tamamen eksik ayak yok; hiçbir adayda referans noktası bütünüyle yok değildi, ancak `INSUFFICIENT_HISTORY`, `reference-insufficient` veya düşük referans seviyesi ayrıca kanıtın zayıf olduğunu gösterir. Bu sayılar birbiriyle toplanmaz; örneğin fiyatı değişen bir aday aynı zamanda eskimiş olabilir.

Altı saatlik eşik, `market-history-config.mjs` içinde `PRICE_STALE_MS=6 saat` olarak tanımlı. Örneğin ilk 94 içindeki gatherer ayakkabısı rotasında Brecilien Sell `12,998` ve Lymhurst Buy `25,006` eski fiyatları aynen duruyor; fakat kaynak zamanları sırasıyla yaklaşık 9 saat 42 dk ve 9 saat 02 dk eski, referans seviyeleri 0/1. Bu “fiyat değişti” değil, “eski ve zayıf kanıt yeni fırsatı doğrulamıyor” durumudur.

### Önceki 94 adayın tek tek karşılaştırması

| Kimlik (ürün · kaynak · kalite) | Eski net/adet | Güncel karar | Kaynak Sell eski → güncel (yaş) | Hedef Buy eski → güncel (yaş) | Ek kanıt |
|---|---:|---|---|---|---|
| `T6_SHOES_GATHERER_WOOD · Brecilien · Q1` | 11.007,76 | `ACTION_NOT_VALIDATED` | 12998→12998 (582 dk eskimiş) | 25006→25006 (542 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T3_MOUNT_OX · Fort Sterling · Q1` | 1.434,80 | `ACTION_NOT_VALIDATED` | 3466→3466 (552 dk eskimiş) | 5105→5105 (582 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_ARTEFACT_2H_ROCKSTAFF_KEEPER · Bridgewatch · Q1` | 15.694,40 | `ACTION_NOT_VALIDATED` | 40000→40000 (612 dk eskimiş) | 58015→58015 (592 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_SHOES_CLOTH_SET2 · Brecilien · Q1` | 449,84 | `ACTION_NOT_VALIDATED` | 898→898 (592 dk eskimiş) | 1404→1404 (617 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_ROCK_LEVEL2@2 · Caerleon · Q1` | 497,60 | `INVALID_SPREAD` | 688→688 (362 dk eskimiş) | 1235→1235 (642 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_HEAD_CLOTH_SET1@2 · Thetford · Q1` | 3.212,16 | `ACTION_NOT_VALIDATED` | 7992→7992 (682 dk eskimiş) | 11671→11671 (687 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ORE_LEVEL2@2 · Caerleon · Q1` | 565,64 | `INVALID_SPREAD` | 1699→1717 (397 dk eskimiş) | 2359→2359 (682 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T7_FIBER_LEVEL1@1 · Brecilien · Q1` | 917,80 | `ACTION_NOT_VALIDATED` | 4079→4079 (582 dk eskimiş) | 5205→5205 (622 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ARMOR_CLOTH_SET2 · Fort Sterling · Q1` | 605,76 | `ACTION_NOT_VALIDATED` | 6264→6264 (517 dk eskimiş) | 7156→7156 (512 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ROCK · Brecilien · Q1` | 42,28 | `ACTION_NOT_VALIDATED` | 23→23 (617 dk eskimiş) | 68→68 (642 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ROCK_LEVEL1@1 · Lymhurst · Q1` | 28,24 | `ACTION_NOT_VALIDATED` | 62→62 (607 dk eskimiş) | 94→94 (642 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_ROCK_LEVEL1@1 · Thetford · Q1` | 22,80 | `INVALID_SPREAD` | 6→9 (82 dk) | 30→30 (642 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_MEAL_STEW_AVALON · Lymhurst · Q1` | 684,00 | `INVALID_SPREAD` | 30996→30995 (237 dk) | 33000→33000 (467 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_HEAD_CLOTH_SET1@1 · Brecilien · Q1` | 302,12 | `ACTION_NOT_VALIDATED` | 991→991 (742 dk eskimiş) | 1347→1347 (727 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_MAIN_RAPIER_MORGANA@3 · Caerleon · Q1` | 16.227,76 | `ACTION_NOT_VALIDATED` | 99986→99986 (657 dk eskimiş) | 121056→121056 (607 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_SOUL · Caerleon · Q1` | 16,36 | `INVALID_SPREAD` | 71→61 (347 dk) | 91→91 (27 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_ROCK_LEVEL1@1 · Caerleon · Q1` | 92,84 | `INVALID_SPREAD` | 463→460 (362 dk eskimiş) | 579→579 (577 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_RANDOM_DUNGEON_SOLO_TOKEN_D2@2 · Caerleon · Q1` | 570,92 | `INVALID_SPREAD` | 4999→4999 (362 dk eskimiş) | 5802→5802 (632 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T8_SHARD_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN · Caerleon · Q1` | 380,28 | `ACTION_NOT_VALIDATED` | 3909→3907 (367 dk eskimiş) | 4468→4468 (602 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_RELIC · Brecilien · Q1` | 128,20 | `INVALID_SPREAD` | 587→585 (297 dk) | 745→745 (627 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_HIDE_LEVEL1@1 · Thetford · Q1` | 42,88 | `ACTION_NOT_VALIDATED` | 128→128 (697 dk eskimiş) | 178→178 (657 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_ROCK_LEVEL2@2 · Thetford · Q1` | 11,16 | `INVALID_SPREAD` | 9→9 (82 dk) | 21→21 (642 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T7_MEAL_OMELETTE · Lymhurst · Q1` | 657,77 | `NORMAL_MARKET_BEHAVIOR` | 4659→4658 (412 dk eskimiş) | — | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_ROCK_LEVEL2@2 · Lymhurst · Q1` | 6,16 | `INVALID_SPREAD` | 14→14 (27 dk) | 21→21 (642 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_FARM_HORSE_BABY · Martlock · Q1` | 1.840,68 | `ACTION_NOT_VALIDATED` | 57687→57687 (577 dk eskimiş) | 62008→62008 (562 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ROCK_LEVEL1@1 · Brecilien · Q1` | 21,24 | `INVALID_SPREAD` | 69→69 (362 dk eskimiş) | 94→94 (642 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_ARMOR_CLOTH_SET3 · Fort Sterling · Q1` | 545,68 | `ACTION_NOT_VALIDATED` | 9422→9422 (622 dk eskimiş) | 10383→10383 (577 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T8_FIBER · Brecilien · Q1` | 460,00 | `INVALID_SPREAD` | 6932→6932 (582 dk eskimiş) | 7700→7702 (237 dk) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_FARM_HORSE_BABY · Brecilien · Q1` | 812,60 | `INVALID_SPREAD` | 99997→99997 (557 dk eskimiş) | 105010→105011 (12 dk) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_ROCK · Lymhurst · Q1` | 80,48 | `ACTION_NOT_VALIDATED` | 316→316 (722 dk eskimiş) | 413→413 (712 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_FIBER_LEVEL1@1 · Caerleon · Q1` | 311,80 | `INVALID_SPREAD` | 4685→4684 (362 dk eskimiş) | 5205→5205 (622 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T3_MOUNT_HORSE · Lymhurst · Q1` | 89,00 | `INSUFFICIENT_HISTORY` | 12103→12650 (102 dk) | 12700→12698 (317 dk) | fiyat değişti, zaman farkı >60 dk |
| `T4_RELIC · Caerleon · Q1` | 42,76 | `INVALID_SPREAD` | 299→282 (347 dk) | 356→334 (22 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_RUNE · Thetford · Q1` | 33,48 | `INVALID_SPREAD` | 123→123 (682 dk eskimiş) | 163→162 (402 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_RUNE · Fort Sterling · Q1` | 20,04 | `ACTION_NOT_VALIDATED` | 123→115 (22 dk) | 149→138 (197 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_ORE_LEVEL1@1 · Lymhurst · Q1` | 40,28 | `ACTION_NOT_VALIDATED` | 145→145 (737 dk eskimiş) | 193→193 (737 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_HIDE_LEVEL1@1 · Caerleon · Q1` | 134,76 | `INVALID_SPREAD` | 2655→2654 (362 dk eskimiş) | 2906→2906 (582 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T7_HIDE · Brecilien · Q1` | 128,36 | `ACTION_NOT_VALIDATED` | 3799→3799 (582 dk eskimiş) | 4091→4091 (577 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ROCK · Lymhurst · Q1` | 12,28 | `ACTION_NOT_VALIDATED` | 53→53 (647 dk eskimiş) | 68→68 (642 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ROCK_LEVEL2@2 · Fort Sterling · Q1` | 23,12 | `ACTION_NOT_VALIDATED` | 118→118 (652 dk eskimiş) | 147→147 (642 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_FIBER · Martlock · Q1` | 86,04 | `ACTION_NOT_VALIDATED` | 969→969 (622 dk eskimiş) | 1099→1099 (617 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_LEATHER · Martlock · Q1` | 28,84 | `ACTION_NOT_VALIDATED` | 311→311 (577 dk eskimiş) | 354→354 (552 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_FIBER · Caerleon · Q1` | 75,04 | `INVALID_SPREAD` | 980→979 (362 dk eskimiş) | 1099→1099 (617 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T2_METALBAR · Bridgewatch · Q1` | 7,80 | `ACTION_NOT_VALIDATED` | 21→21 (762 dk eskimiş) | 30→30 (737 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_WOOD_LEVEL2@2 · Caerleon · Q1` | 303,36 | `INVALID_SPREAD` | 15000→15000 (362 dk eskimiş) | 15941→15941 (642 dk eskimiş) | en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_2H_LONGBOW@2 · Lymhurst · Q1` | 1.143,00 | `ACTION_NOT_VALIDATED` | 19977→19977 (722 dk eskimiş) | 22000→22000 (687 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_FIBER_LEVEL1@1 · Thetford · Q1` | 227,80 | `ACTION_NOT_VALIDATED` | 4769→4769 (662 dk eskimiş) | 5205→5205 (622 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ORE_LEVEL1@1 · Caerleon · Q1` | 99,48 | `ACTION_NOT_VALIDATED` | 609→516 (12 dk) | 738→738 (732 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T7_CORN · Bridgewatch · Q1` | 30,56 | `ACTION_NOT_VALIDATED` | 412→412 (597 dk eskimiş) | 461→461 (562 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_METALBAR_LEVEL1@1 · Thetford · Q1` | 58,80 | `ACTION_NOT_VALIDATED` | 330→330 (737 dk eskimiş) | 405→405 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_RUNE · Thetford · Q1` | 5,68 | `INVALID_SPREAD` | 26→27 (307 dk) | 33→33 (652 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T7_MULLEIN · Caerleon · Q1` | 29,32 | `ACTION_NOT_VALIDATED` | 491→492 (362 dk eskimiş) | 542→542 (562 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T3_ROCK · Martlock · Q1` | 8,56 | `INVALID_SPREAD` | 50→40 (42 dk) | 61→61 (642 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_PLANKS · Lymhurst · Q1` | 23,96 | `ACTION_NOT_VALIDATED` | 937→937 (547 dk eskimiş) | 1001→1001 (557 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_ORE_LEVEL1@1 · Fort Sterling · Q1` | 397,36 | `ACTION_NOT_VALIDATED` | 5978→5978 (757 dk eskimiş) | 6641→6641 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_RELIC · Lymhurst · Q1` | 39,20 | `ACTION_NOT_VALIDATED` | 676→676 (597 dk eskimiş) | 745→745 (627 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T2_METALBAR · Lymhurst · Q1` | 3,08 | `ACTION_NOT_VALIDATED` | 19→19 (607 dk eskimiş) | 23→23 (602 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_FIBER · Fort Sterling · Q1` | 60,04 | `ACTION_NOT_VALIDATED` | 995→995 (667 dk eskimiş) | 1099→1099 (617 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_PLANKS · Fort Sterling · Q1` | 26,96 | `ACTION_NOT_VALIDATED` | 934→934 (597 dk eskimiş) | 1001→1001 (557 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T8_YARROW · Caerleon · Q1` | 12,08 | `VALIDATED_OPPORTUNITY` | 490→490 (12 dk) | 523→512 (62 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_ORE · Lymhurst · Q1` | 108,32 | `ACTION_NOT_VALIDATED` | 988→988 (762 dk eskimiş) | 1142→1142 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T8_ORE · Lymhurst · Q1` | 316,00 | `ACTION_NOT_VALIDATED` | 6980→6980 (762 dk eskimiş) | 7600→7600 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_CORN · Fort Sterling · Q1` | 15,56 | `ACTION_NOT_VALIDATED` | 427→427 (592 dk eskimiş) | 461→461 (562 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_ORE_LEVEL1@1 · Lymhurst · Q1` | 159,36 | `INVALID_SPREAD` | 2088→2204 (397 dk eskimiş) | 2341→2341 (757 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_FOXGLOVE · Caerleon · Q1` | 17,56 | `INVALID_SPREAD` | 521→519 (362 dk eskimiş) | 561→541 (62 dk) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T3_FIBER · Thetford · Q1` | 13,88 | `INVALID_SPREAD` | 61→60 (82 dk) | 78→77 (22 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T2_MOUNT_MULE · Lymhurst · Q1` | 217,80 | `INVALID_SPREAD` | 4875→4895 (412 dk eskimiş) | 5305→5305 (747 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_RANDOM_DUNGEON_SOLO_TOKEN_D1@1 · Lymhurst · Q1` | 77,60 | `ACTION_NOT_VALIDATED` | 2356→2356 (652 dk eskimiş) | 2535→2535 (702 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T7_ROCK_LEVEL1@1 · Thetford · Q1` | 64,80 | `ACTION_NOT_VALIDATED` | 2748→2748 (662 dk eskimiş) | 2930→2930 (707 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T3_ORE · Martlock · Q1` | 7,72 | `VALIDATED_OPPORTUNITY` | 47→50 (42 dk) | 57→59 (82 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_ROCK_LEVEL2@2 · Thetford · Q1` | 11,12 | `ACTION_NOT_VALIDATED` | 130→130 (682 dk eskimiş) | 147→147 (642 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_SOUL · Brecilien · Q1` | 10,68 | `INVALID_SPREAD` | 165→176 (297 dk) | 183→183 (662 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_RUNE · Fort Sterling · Q1` | 2,48 | `INVALID_SPREAD` | 34→34 (602 dk eskimiş) | 38→36 (402 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T5_FIBER · Brecilien · Q1` | 4,96 | `ACTION_NOT_VALIDATED` | 332→332 (577 dk eskimiş) | 351→351 (542 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T3_ROCK · Lymhurst · Q1` | 4,56 | `INVALID_SPREAD` | 54→46 (22 dk) | 61→61 (642 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T6_ORE · Martlock · Q1` | 41,32 | `ACTION_NOT_VALIDATED` | 1055→1055 (732 dk eskimiş) | 1142→1142 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_WOOD · Lymhurst · Q1` | 6,40 | `INVALID_SPREAD` | 320→315 (97 dk) | 340→341 (327 dk) | fiyat değişti, zaman farkı >60 dk, referans seviyesi <3 |
| `T8_ORE · Martlock · Q1` | 68,00 | `ACTION_NOT_VALIDATED` | 7228→7228 (732 dk eskimiş) | 7600→7600 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_ORE · Brecilien · Q1` | 9,16 | `ACTION_NOT_VALIDATED` | 1019→1019 (582 dk eskimiş) | 1071→1071 (632 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_HIDE_LEVEL2@2 · Caerleon · Q1` | 62,96 | `INVALID_SPREAD` | 2482→1850 (407 dk eskimiş) | 2651→2651 (717 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_FIBER · Thetford · Q1` | 5,72 | `ACTION_NOT_VALIDATED` | 73→73 (692 dk eskimiş) | 82→82 (637 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_METALBAR_LEVEL3@3 · Martlock · Q1` | 42,00 | `INSUFFICIENT_HISTORY` | 7158→7749 (257 dk) | 7500→7500 (737 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_ORE_LEVEL3@3 · Martlock · Q1` | 21,04 | `ACTION_NOT_VALIDATED` | 4898→4898 (732 dk eskimiş) | 5124→5124 (737 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_RUNE · Bridgewatch · Q1` | 1,68 | `ACTION_NOT_VALIDATED` | 30→30 (682 dk eskimiş) | 33→33 (652 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_ORE_LEVEL2@2 · Thetford · Q1` | 19,36 | `ACTION_NOT_VALIDATED` | 1076→1076 (737 dk eskimiş) | 1141→1141 (762 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_ORE_LEVEL3@3 · Brecilien · Q1` | 25,04 | `INVALID_SPREAD` | 4894→4889 (312 dk) | 5124→5124 (737 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_ROCK_LEVEL1@1 · Bridgewatch · Q1` | 0,80 | `INVALID_SPREAD` | 28→16 (142 dk) | 30→30 (642 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_METALBAR_LEVEL3@3 · Bridgewatch · Q1` | 17,00 | `ACTION_NOT_VALIDATED` | 7183→7183 (762 dk eskimiş) | 7500→7500 (737 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T6_ORE · Caerleon · Q1` | 12,32 | `INVALID_SPREAD` | 1084→1034 (362 dk eskimiş) | 1142→1142 (732 dk eskimiş) | fiyat değişti, en az bir ayak >6 sa, zaman farkı >60 dk, referans seviyesi <3 |
| `T4_ORE · Martlock · Q1` | 3,04 | `ACTION_NOT_VALIDATED` | 68→68 (732 dk eskimiş) | 74→74 (762 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T4_METALBAR · Thetford · Q1` | 3,00 | `ACTION_NOT_VALIDATED` | 213→213 (737 dk eskimiş) | 225→225 (762 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T2_ORE · Martlock · Q1` | 0,04 | `ACTION_NOT_VALIDATED` | 23→23 (677 dk eskimiş) | 24→24 (707 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T5_ORE_LEVEL1@1 · Lymhurst · Q1` | 1,48 | `ACTION_NOT_VALIDATED` | 707→707 (762 dk eskimiş) | 738→738 (732 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
| `T2_FISH_SALTWATER_ALL_COMMON · Martlock · Q1` | 0,80 | `ACTION_NOT_VALIDATED` | 508→508 (742 dk eskimiş) | 530→530 (772 dk eskimiş) | en az bir ayak >6 sa, referans seviyesi <3 |
## Yeniden kurulan güncel fırsat grupları

Kullanıcının tam 8 kartı arşivlenmediğinden, aşağıdaki liste 07:11:51Z sabit taramasının filtrelenmemiş ticari gruplarıdır; ekrandaki “8” ile birebir aynı olduğu iddia edilmez. Salt-okunur AODP sorgusu `2026-10-12T07:17Z` civarında yapıldı. Kaynak API fiyatları emir derinliği veya gerçekleşmiş satış garantisi değildir. Net/adet ve ROI, o sabit taramadaki eski fiyat eşleşmesinden; canlı Sell/Buy ise yeniden sorgu anındaki AODP en iyi fiyat alanlarından gelir. Kaynak zamanları eskimişse güncel HTTP yanıtı fiyatın güncel olduğu anlamına gelmez.

| Ürün · rota (Q1) | Eski tarama net/adet · ROI · sermaye | Tarama Sell / Buy | AODP yeniden sorgu: Sell / Buy (kaynak zamanı) | Satış hareketliliği | Karar |
|---|---|---|---|---|---|
| T7 Slowfield Potion · Brecilien → Thetford | 671.16 · 8.40% · 7,989 | 7,989 (04:35) / 9,021 (05:20) | 7,989 (04:35) / 9,021 (05:20) | 245.8 birim/raporlanan gün; 14/28 gün; son gün 10 Eki; adet derinliği yok | Sinyal fiyatça aynı, iki ayak da 6 saat içinde; rota taşıma zamanı/riski ve emir miktarı doğrulanmamış. |
| T4 Wood Level 1 · Brecilien → Fort Sterling | 75.52 · 94.40% · 80 | 80 (06:10) / 162 (05:30) | 80 (06:10) / 162 (05:30) | 46,232.1/gün; 27/28; son gün 10 Eki; emir derinliği yok | Çok yüksek yüzde ucuz sermayeden kaynaklanıyor; toplam değer miktara bağlı. İtem adı katalogda çevrilmemiş. |
| T4 Soul · Brecilien → Lymhurst | 30.20 · 49.51% · 61 | 61 (06:50) / 95 (06:50) | 61 (06:50) / 95 (06:50) | 939,011.6/gün; 27/28; son gün 10 Eki; emir derinliği yok | Fiyat eşleşmesi sürüyor; raporlanan satış miktarı mevcut derinlik/gerçek dolum değildir. |
| T3 Ore · Martlock → Thetford | 6.64 · 13.28% · 50 | 50 (06:30) / 59 (05:50) | 50 (06:30) / 59 (05:50) | 253,093.5/gün; 27/28; son gün 10 Eki; derinlik yok | Birim avantajı düşük; miktar ve taşıma maliyeti olmadan ekonomik toplam iddia edilemez. |
| T4 Rune · Brecilien → Fort Sterling | 0.76 · 15.20% · 5 | 5 (06:50) / 6 (06:50) | 5 (07:10) / 8 (07:15) | 1,475,000/gün; 27/28; son gün 10 Eki; derinlik yok | Canlı hedef Buy değişmiş; fark artmış görünse de yeni zaman damgası/karşı teklif oyunda doğrulanmalı. 0.76 eski birim avantajı toplu adet olmadan anlamlı kâr değildir. |
| T6 Wood Level 1 · Brecilien → Fort Sterling | 107.72 · 6.93% · 1,555 | 1,555 (06:10) / 1,732 (05:30) | 1,555 (06:10) / 1,732 (05:30) | 17,450.4/gün; 27/28; son gün 10 Eki; derinlik yok | Fiyat eşleşmesi sürüyor; kaynakların 40 dk zaman farkı ve taşımacılık giderleri var. |
| T4 Relic · Brecilien → Martlock | 7.60 · 2.42% · 314 | 314 (06:50) / 335 (06:45) | 314 (06:50) / 335 (06:45) | 197,994/gün; 27/28; son gün 10 Eki; derinlik yok | Düşük birim/ROI; miktar, maliyet ve rota doğrulaması olmadan öncelikli işlem sayılmaz. |
| T4 Wood Level 3 · Martlock → Fort Sterling | 66.12 · 1.62% · 4,083 | 4,083 (05:40) / 4,322 (05:30) | 4,083 (05:40) / 4,322 (05:30) | 8,077.7/gün; 27/28; son gün 10 Eki; derinlik yok | Marj düşük; toplam sermaye ve rota gideri önemli. İtem adı katalogda çevrilmemiş. |
| T8 Yarrow · Caerleon → Brecilien | 1.52 · 0.31% · 490 | 490 (07:00) / 512 (06:10) | 490 (07:00) / 512 (06:10) | 83,765/gün; 27/28; son gün 10 Eki; derinlik yok | Gerçek fiyat sinyali sürüyor ama 1.52/adet; hacim ortalaması dolum kanıtı değildir. |
| T5 Wood Level 1 · Martlock → Lymhurst | 0.52 · 0.10% · 539 | 539 (06:30) / 562 (05:35) | 539 (06:30) / 562 (05:35) | 59,278.7/gün; 27/28; son gün 10 Eki; derinlik yok | 0.52/adet, işlem ücreti/taşıma ile kolayca silinebilir; toplu miktar ve canlı dolum olmadan karar verilemez. İtem adı katalogda çevrilmemiş. |

Üstteki tablonun 07:11 anında ilk onunda taşıma fırsatları birim avantajı 0.52–7.60 silver olan beş ürün içeriyor. Bunların görünmesi sıralamanın pozitif teorik avantajı aday olarak göstermesinden kaynaklanıyor; toplam kazanç veya sermaye getirisi miktar girilmeden hesaplanmıyor. Buna karşılık çok ucuz T4 Wood Level 1’in %94.4 ROI’si yalnızca birim başı sermaye oranıdır; 80 silver sermaye/adet ve 75.52 silver teorik farkla her miktarda uygulanabilir emir olduğu anlamına gelmez. Hedef şehirdeki aynı Buy havuzunu kullanan alternatif rotaların satış kapasitesi bağımsız toplanmamalıdır.

Kart ekranında daha önce görülen T7 Meal Pie (Caerleon → Fort Sterling, yaklaşık +468 silver/adet, %10.4, sermaye 4,493) 07:04 civarı sabit taramada vardı. AODP yeniden sorgusunda Caerleon Sell 4,493 kaynak zamanı 01:10Z, Fort Sterling Buy 5,168 zamanı 01:05Z çıktı. Bu yaklaşık 6 saat 7–12 dakika eski veri olduğundan 07:11 taramasında altı saatlik tazelik sınırını aşarak listeden düşmesi beklenen piyasa-güncellik etkisidir; fiyat farkı kârlı güncel emir kanıtı değildir.

Tüm satış hareketliliği alanları AODP `item_count` geçmişinden türetilen raporlanan satış birimleridir (günlük ortalama/coverage); işlem adedi, emir defteri derinliği, elde edilebilir miktar veya kullanıcı işlemi değildir. Bu adayların hiçbirinde gerçekleşmiş emir miktarı/dolumu kanıtı yoktur. Cross-city rotalarda taşıma masrafı, süre ve risk hesapta yoktur. Kesin kâr veya gerçekleşme süresi vaat edilemez.

## 304 izleme adayı sayacı ve nedenleri

Saat 07:04:20Z’de (görünen 304 sayısına en yakın arşiv anı) yeniden kurulan ham taramada 324 potansiyel satır, 289 `monitored` ölçüm hücresi ve 16 doğrulanmış ham hücre vardı. Arayüz watch görünümündeki strateji seçimi ve ortak Buy havuzu gruplaması 311 karta indirdi; tarihsel stratejilerde varsayılan %12 sapma filtresi eklenince sayı daha da değişebilir. Bu nedenle `potential`, `monitored` ve ekrandaki watch kart adedi aynı sayaç değildir. 304 değeri arşivdeki 324 ham adayla eşit değil ve o ekranın filtreleri kaydedilmediği için 304’ün tam dağılımı kanıtlanamıyor.

07:04:20Z ham 324 adayın potansiyel gerekçe etiketleri (örtüşür, toplanamaz): en az bir ayak stale 136; referans yetersiz 183; hareket doğrulanmamış 136; gözlem doğrulanmamış 175; yürütme doğrulanmamış 271. Her adayda birden fazla etiket olabilir. Örneğin 118 satırda sell gözlemi, yürütme, referans ve hareket birlikte doğrulanmamış; 86 satırda iki rota ayağı da stale/yürütme doğrulamasız. Bu satırlar “başarısız işlem” değildir; izleme/aday sinyalidir. Ekonomik sinyali olmayan satırlar arasında pozitif ama referans/hareket onayı alamayanlar ve stale fiyatlardan kalan pozitif farklar bulunuyor. Watch statüsü işlem emri veya doğrulanmış kâr anlamına gelmiyor.

## Collector ve kaynak tazeliği

Salt-okunur arşiv replay’inde son 24 saatte 350,664 audit olayı ve 249 bağımsız `quote`/`current` gözlemi bulundu (yaklaşık 10.4 yeni quote olayı/saat). Bunlar HTTP istek sayısı değildir; tek HTTP sorgusu çok kimlik içerebilir veya hiç yeni bağımsız kaynak zamanı üretmeyebilir. Collector’ın başarılı HTTP sayacı ve reddedilen stale/duplicate yanıt sayacı kalıcı arşivde saklanmadığından HTTP başarı → yeni olay oranı ölçülemiyor. Yerel fiyat hub’ı audit anında 127.0.0.1:3001 üzerinde erişilebilir değildi; collector başlatılmadı, üretim verisine yazılmadı.

38,385 mevcut quote kaydının en son alma zamanı 07:05:32Z idi. 07:11:52Z’ye göre `fetchedAt` yaşı <1 saat 351, <6 saat 2,559; kaynak `sourceQuoteAt` yaşı <1 saat 320, <6 saat 1,403, <24 saat 18,164 idi. Dolayısıyla 36,982 kaydın kaynak zamanı 6 saatten eski; 20,221’i 24 saatten eski. Yakın zamanda tekrar sorgulanmış olmak, fiyat kaynağının yeni olduğu anlamına gelmez. Bu fark 6 saat tazelik kuralını geçen aday sayısını etkiler.

## Sayaç tutarlılığı ve bulgular

Tarama sayaçları farklı aşamaları anlatır: 30,728 değerlendirilmiş pazar hücresi; 16 doğrulanmış ham fırsat; sunum gruplamasında 10 rota grubu; 07:11:52Z’de 248 ham watch/potansiyel ve 235 gruplu watch satırı; `monitored` 290 referans kapsama hücresi. `monitored` aynı şeyin fırsat veya UI kart adedi değildir. Kullanıcı 8 kart görmüşse, bu 10 gruptan en az iki tanesinin ekran filtresi/aktif tarama anına göre dışlanmış olması muhtemel; kayıp browser state bunu kanıtlamaya yetmez. 07:04:20Z’de doğrulanmış ham 16 hücre/10 grup, 07:11:52Z’de yine 16/10 idi; aynı zaman damgası olmadan 324→248 watch değişimi algoritma farkı değil, verinin altı saatlik yaş sınırından geçmesidir.

Gerçek hata/ölçüm açığı: kullanıcı ekran sayaçları için scan snapshot ve local filter state birlikte saklanmıyor; collector kalıcı logunda HTTP isteği, HTTP başarısı, aynı source timestamp/price tekrarları ve stale dönüşler ayrı sayılmıyor. Bu, 8/304’ün tam nedeni ile yeni bağımsız fiyat olayı başına istek oranını geriye dönük kanıtlamayı engelliyor. Piyasa kaynaklı değişim: 94 adayın 86’sında en az bir fiyat ayağı stale olmuş; bazı fiyatlar değişmiş, bazıları aynen kalsa da güncellik/referans şartını kaybetmiş. Fırsat keşfi veya sıralama regresyonu göstergesi yok; aynı dondurulmuş snapshot V5/V6 eşitliği mevcut doğrulama kaydında geçiyor.

Gerekli gelecek düzeltmeler (bu denetim aşamasında uygulanmadı): her tarama yanıtıyla `scannedAt`, ham aday/uygun sayaçları, gruplama öncesi/sonrası sayıları ve etkin filtrelerin salt-okunur snapshot’ını saklamak; collector’a HTTP isteği/başarısı, yeni source timestamp, aynı olay, eski yanıt ve reddedilen yanıt sayaçları eklemek. Bunlar sonraki denetimde ekran sayaçlarını ve collector verimliliğini ispatlayabilir. Bu raporun amacıyla fiyat arşivi, keşif, eşik, sıra ve UI değişmedi.

## Tek tek kayıtlar ve doğrulama kanıtları

- [94 adayın tam karşılaştırma verisi](baseline-comparison.json)
- [V5/V6 frozen-snapshot doğrulama kaydı](../opportunity-v6/verification.json)
- [V5 baseline manifesti](../opportunity-v6/baseline.json)
- [Albion Data Project fiyat API’si](https://europe.albion-online-data.com/api/v2/stats/prices/)




