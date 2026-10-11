# Emir makası gerçekçilik denetimi

Snapshot: 2026-10-10T15:24:07.570Z; checkpoint 24, journal son sıra 775. Önceki kalite raporuyla aynı dondurulmuş journal dahil veri. Üretim dosyaları okunmaz veya yazılmaz.

## Sonuç

Hesap ve kimlik denetiminde 1436 uygun local-make kaydında tutarsızlık bulunmadı. 110 kayıt dağılıma göre aşırı geniş; ilk 100 içinde 52. Büyük makasın hatalı olduğu veya dolacağı bu sonuçtan çıkarılamaz.

Uygun hücre 1709, fiyat tarafı 25210; accepted/E1/L3, uygunluk ve bütün sıralama değişmedi. İlk 100 içinde 94 birincil local-make, ayrıca 1 alternatif local-make var. Aşağıdaki ilk 100 makas sayıları alternatif dahil 95 kayda ait. Sınıflandırma yalnız ayrı tanı artefaktında; motor, UI ve üretim modu değiştirilmedi.

## Hesap denetimi

Mevcut oranlar: alış ve satış emir açma 2.5%; premium satış vergisi 4%, ücretsiz 8%. Premium için B'=Buy+1, S'=max(1,Sell−1), sermaye=B'×1.025, satış geliri=S'×0.935, net=gelir−sermaye, ROI=net/sermaye. Ücretsiz hesapta satış çarpanı 0.895. Mevcut ortak ücret motoru kullanılır.

Bütün tutarlar bir ürün içindir; yığın miktarıyla çarpılmadı. ROI paydası düşük mevcut bid üzerine kurulacak alış emrinin maliyetidir; mevcut ask üzerinden hemen satın alma maliyeti değildir. İki yeni emrin de bir kez dolması, fiyatların korunması ve yeniden emir açılmaması varsayılır. Tekrar açma ücretleri, kuyruğa girme, sermaye bekleme süresi bilinmez. Fiyat/ücret yuvarlaması ve oyundaki fiili emir faturası bu snapshot ile doğrulanamaz; mevcut kesirli hesap korunur.

Kimlik: server, tam itemId (enchant dahil), şehir ve ürün kalitesi iki tarafın seri kimliğinden ve evidenceId önekinden denetlendi. Tarayıcı sunucuyu önce filtreler; hücreler item/şehir/kalite ile, şehirler arası eşler tam item/kalite ile gruplanır. Sunum quality nesnesi ürün kalitesi yerine kullanılmadı; ürün kalitesi hücre ID ve ham seri kimliğinde korundu.

## Kanıt ve sınıflandırma

historical-price-supported: iki tarafın mevcut L3+ referansı var ve fiyat mevcut düz bandında veya doğrulanmış harekette. Bu yalnız tarihsel emir fiyatı desteğidir, gerçekleşmiş satış kanıtı değildir. current-orders-only: iki güncel görünen emir doğrulanmış, bu tarihsel destek yok. extreme-wide-uncertain: tarihsel destek yok ve Sell/Buy dağılımın üst dış çitinin üzerinde. data-calculation-inconsistent: kimlik, fiyat kanıtı veya ücret/ROI denetimi tutarsız.

“Aşırı” tanımı ROI sınırı değildir: 1436 local-make için Sell/Buy Q1=1.22, Q3=2.03, betimsel Tukey dış çiti Q3+3×IQR=4.46. Bir istatistiksel işaret, ekonomik gerçeklik hükmü değildir; listeleme, puan ve güven kapılarını etkilemez. Çit çevresindeki kayıtların sınıf değişimi keyfî bir doğrulama kararına dönüşmez.

| Sınıf | Tüm local-make | İlk 100 |
|---|---:|---:|
| historical-price-supported | 3 | 0 |
| current-orders-only | 1323 | 43 |
| extreme-wide-uncertain | 110 | 52 |
| data-calculation-inconsistent | 0 | 0 |

Tarihsel iki taraflı L3 desteği 3. Tamamlanmış gün satış agregası bulunan 1198, ilk 100 içinde 52. Bunlar kaynakta raporlanan günlük avg_price/item_count; tekil emir dolumu, kuyruk, tam derinlik veya mevcut ask seviyesinde satış kanıtı değildir. Her kaydın günlük aralığı, medyanı, toplam raporlanan miktarı ve ham günleri analysis.json.gz içinde. Eksik veri null; hacim sıfır kabul edilmedi.

E1/accepted burada kaynak zamanı bilinen reported-top fiyat kanıtıdır. İki uç zamanları farklı olabilir; bir anda aynı defterin iki tarafının birlikte görüldüğünü iddia etmiyoruz. Zaman farkı her kayıt için artefakta yazıldı. reported-top tam defter değildir. Tekil gerçekleşmiş işlem, derinlik ve dolma olasılığı kanıtı bu veri kümesinde yok.

## İlk 100 içinde en yüksek ROI (20 kayıt)

| Sıra | Ürün / şehir / kalite | Buy | Sell | Buy zamanı / Sell zamanı (UTC) | L Buy/Sell | Net / ürün | Teorik ROI % | Sınıf |
|---|---|---:|---:|---|---|---:|---:|---|
| 8 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D4@4 / Lymhurst / 1 | 1131 | 39750000 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 37165088.77 | 3203058.59 | extreme-wide-uncertain |
| 7 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | 1134 | 12698990 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/1 | 11872391.34 | 1020512.85 | extreme-wide-uncertain |
| 27 | T7_FARM_OX_BABY / Brecilien / 1 | 1120 | 1399999 | 2026-10-10T13:25:00.000Z / 2026-10-10T13:25:00.000Z | 0/1 | 1307849.10 | 113822.51 | extreme-wide-uncertain |
| 3 | T6_OFF_JESTERCANE_HELL@3 / Martlock / 1 | 1151 | 499984 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 466303.30 | 39490.46 | extreme-wide-uncertain |
| 38 | T4_ARMOR_PLATE_ROYAL@3 / Lymhurst / 1 | 1151 | 319984 | 2026-10-10T13:05:00.000Z / 2026-10-10T13:05:00.000Z | 0/0 | 298003.30 | 25237.41 | extreme-wide-uncertain |
| 9 | T7_2H_TOOL_SICKLE / Caerleon / 1 | 55001 | 10000000 | 2026-10-10T14:20:00.000Z / 2026-10-10T14:50:00.000Z | 0/1 | 9293622.01 | 16484.76 | extreme-wide-uncertain |
| 5 | T7_OFF_JESTERCANE_HELL@1 / Martlock / 1 | 1453 | 211111 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 195897.50 | 13144.40 | extreme-wide-uncertain |
| 64 | T4_LEATHER_LEVEL2@2 / Brecilien / 1 | 17 | 2548 | 2026-10-10T14:20:00.000Z / 2026-10-10T14:20:00.000Z | 1/1 | 2362.99 | 12807.56 | extreme-wide-uncertain |
| 93 | T5_ARMOR_GATHERER_FISH / Brecilien / 1 | 106 | 12194 | 2026-10-10T12:55:00.000Z / 2026-10-10T12:55:00.000Z | 0/0 | 11290.78 | 10294.76 | extreme-wide-uncertain |
| 29 | T4_2H_SHAPESHIFTER_KEEPER@1 / Brecilien / 1 | 1112 | 119994 | 2026-10-10T13:20:00.000Z / 2026-10-10T13:20:00.000Z | 0/0 | 111052.63 | 9734.41 | extreme-wide-uncertain |
| 70 | T4_SHOES_LEATHER_SET3@3 / Brecilien / 1 | 1118 | 77767 | 2026-10-10T13:35:00.000Z / 2026-10-10T12:25:00.000Z | 1/0 | 71564.23 | 6239.39 | extreme-wide-uncertain |
| 58 | T5_MEAL_OMELETTE_DRAGONAREA@1 / Martlock / 1 | 1159 | 57998 | 2026-10-10T12:55:00.000Z / 2026-10-10T12:55:00.000Z | 0/1 | 53038.19 | 4460.74 | extreme-wide-uncertain |
| 16 | T4_MEAL_STEW@3 / Brecilien / 1 | 1112 | 35000 | 2026-10-10T14:50:00.000Z / 2026-10-10T14:50:00.000Z | 1/1 | 31583.24 | 2768.46 | extreme-wide-uncertain |
| 17 | T4_2H_FIRESTAFF@2 / Thetford / 1 | 1168 | 31201 | 2026-10-10T15:05:00.000Z / 2026-10-10T15:05:00.000Z | 1/1 | 27973.78 | 2334.60 | extreme-wide-uncertain |
| 44 | T6_ARTEFACT_OFF_ORB_MORGANA / Lymhurst / 1 | 482 | 11993 | 2026-10-10T14:00:00.000Z / 2026-10-10T14:00:00.000Z | 1/1 | 10717.44 | 2164.81 | extreme-wide-uncertain |
| 15 | T5_FARM_HORSE_BABY / Brecilien / 1 | 5002 | 122221 | 2026-10-10T13:55:00.000Z / 2026-10-10T13:55:00.000Z | 1/1 | 109147.63 | 2128.43 | extreme-wide-uncertain |
| 79 | T6_POTION_BERSERK@1 / Bridgewatch / 1 | 1117 | 23000 | 2026-10-10T12:55:00.000Z / 2026-10-10T12:55:00.000Z | 0/0 | 20358.11 | 1776.53 | extreme-wide-uncertain |
| 61 | T5_MEAL_ROAST / Martlock / 1 | 156 | 2791 | 2026-10-10T14:35:00.000Z / 2026-10-10T15:00:00.000Z | 0/1 | 2447.72 | 1521.03 | extreme-wide-uncertain |
| 18 | T4_2H_ARCANESTAFF_HELL / Martlock / 1 | 2001 | 29198 | 2026-10-10T14:25:00.000Z / 2026-10-10T14:25:00.000Z | 0/0 | 25247.15 | 1230.34 | extreme-wide-uncertain |
| 28 | T7_LEATHER / Brecilien / 1 | 1112 | 14996 | 2026-10-10T14:25:00.000Z / 2026-10-10T14:25:00.000Z | 0/1 | 12879.50 | 1128.96 | extreme-wide-uncertain |

## İlk 100 içinde en yüksek net silver (20 kayıt)

| Sıra | Ürün / şehir / kalite | Buy | Sell | Buy zamanı / Sell zamanı (UTC) | L Buy/Sell | Net / ürün | Teorik ROI % | Sınıf |
|---|---|---:|---:|---|---|---:|---:|---|
| 8 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D4@4 / Lymhurst / 1 | 1131 | 39750000 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 37165088.77 | 3203058.59 | extreme-wide-uncertain |
| 7 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | 1134 | 12698990 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/1 | 11872391.34 | 1020512.85 | extreme-wide-uncertain |
| 9 | T7_2H_TOOL_SICKLE / Caerleon / 1 | 55001 | 10000000 | 2026-10-10T14:20:00.000Z / 2026-10-10T14:50:00.000Z | 0/1 | 9293622.01 | 16484.76 | extreme-wide-uncertain |
| 4 | T6_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | 150008 | 1799996 | 2026-10-10T14:35:00.000Z / 2026-10-10T14:35:00.000Z | 0/1 | 1529236.10 | 994.57 | extreme-wide-uncertain |
| 27 | T7_FARM_OX_BABY / Brecilien / 1 | 1120 | 1399999 | 2026-10-10T13:25:00.000Z / 2026-10-10T13:25:00.000Z | 0/1 | 1307849.10 | 113822.51 | extreme-wide-uncertain |
| 99 | T8_MAIN_DAGGER_HELL@1 / Martlock / 1 | 320000 | 1700000 | 2026-10-10T14:40:00.000Z / 2026-10-10T11:45:00.000Z | 1/1 | 1261498.04 | 384.60 | extreme-wide-uncertain |
| 40 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D1@1 / Lymhurst / 1 | 600015 | 1599957 | 2026-10-10T14:35:00.000Z / 2026-10-10T14:35:00.000Z | 0/0 | 880942.46 | 143.24 | current-orders-only |
| 67 | T6_MAIN_HOLYSTAFF_AVALON@3 / Lymhurst / 1 | 251497 | 1111108 | 2026-10-10T12:25:00.000Z / 2026-10-10T12:25:00.000Z | 0/0 | 781099.59 | 303.00 | current-orders-only |
| 25 | T6_ARMOR_PLATE_FEY@3 / Martlock / 1 | 244455 | 1089996 | 2026-10-10T14:20:00.000Z / 2026-10-10T13:30:00.000Z | 0/1 | 768577.93 | 306.74 | current-orders-only |
| 51 | T4_2H_DOUBLEBLADEDSTAFF_CRYSTAL@3 / Caerleon / 1 | 100111 | 869998 | 2026-10-10T12:45:00.000Z / 2026-10-10T12:45:00.000Z | 1/0 | 710832.40 | 692.72 | extreme-wide-uncertain |
| 100 | T8_MAIN_DAGGER_HELL / Martlock / 1 | 178000 | 859993 | 2026-10-10T11:50:00.000Z / 2026-10-10T11:45:00.000Z | 0/1 | 621641.49 | 340.72 | extreme-wide-uncertain |
| 3 | T6_OFF_JESTERCANE_HELL@3 / Martlock / 1 | 1151 | 499984 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 466303.30 | 39490.46 | extreme-wide-uncertain |
| 33 | T7_MOUNT_HORSE / Brecilien / 1 | 225962 | 666666 | 2026-10-10T14:00:00.000Z / 2026-10-10T14:00:00.000Z | 2/1 | 391719.70 | 169.13 | current-orders-only |
| 30 | T4_CAPEITEM_FW_BRECILIEN@3 / Martlock / 1 | 110002 | 498999 | 2026-10-10T14:40:00.000Z / 2026-10-10T13:15:00.000Z | 1/0 | 353810.05 | 313.79 | extreme-wide-uncertain |
| 50 | T6_ARMOR_PLATE_AVALON@1 / Caerleon / 1 | 51009 | 399996 | 2026-10-10T12:45:00.000Z / 2026-10-10T14:20:00.000Z | 0/1 | 321710.07 | 615.30 | extreme-wide-uncertain |
| 38 | T4_ARMOR_PLATE_ROYAL@3 / Lymhurst / 1 | 1151 | 319984 | 2026-10-10T13:05:00.000Z / 2026-10-10T13:05:00.000Z | 0/0 | 298003.30 | 25237.41 | extreme-wide-uncertain |
| 39 | T6_2H_HAMMER_AVALON@1 / Thetford / 1 | 58804 | 374799 | 2026-10-10T13:05:00.000Z / 2026-10-10T13:05:00.000Z | 0/0 | 290161.01 | 481.39 | extreme-wide-uncertain |
| 20 | T4_ARMOR_PLATE_FEY@4 / Martlock / 1 | 123340 | 429982 | 2026-10-10T13:45:00.000Z / 2026-10-10T13:45:00.000Z | 1/1 | 275607.71 | 218.00 | current-orders-only |
| 49 | T5_ARMOR_PLATE_AVALON@2 / Caerleon / 1 | 40003 | 337994 | 2026-10-10T12:45:00.000Z / 2026-10-10T14:20:00.000Z | 0/0 | 275019.35 | 670.71 | extreme-wide-uncertain |
| 2 | T8_MEAL_SANDWICH_FISH@2 / Martlock / 1 | 47222 | 329838 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/1 | 259994.02 | 537.14 | extreme-wide-uncertain |

## İstenen ürünler (tüm uygun şehir/enchant varyantları)

| Sıra | Ürün / şehir / kalite | Buy | Sell | Buy zamanı / Sell zamanı (UTC) | L Buy/Sell | Net / ürün | Teorik ROI % | Sınıf |
|---|---|---:|---:|---|---|---:|---:|---|
| 3 | T6_OFF_JESTERCANE_HELL@3 / Martlock / 1 | 1151 | 499984 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 466303.30 | 39490.46 | extreme-wide-uncertain |
| 7 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3 / Lymhurst / 1 | 1134 | 12698990 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/1 | 11872391.34 | 1020512.85 | extreme-wide-uncertain |
| 8 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D4@4 / Lymhurst / 1 | 1131 | 39750000 | 2026-10-10T14:40:00.000Z / 2026-10-10T14:40:00.000Z | 0/0 | 37165088.77 | 3203058.59 | extreme-wide-uncertain |
| 9 | T7_2H_TOOL_SICKLE / Caerleon / 1 | 55001 | 10000000 | 2026-10-10T14:20:00.000Z / 2026-10-10T14:50:00.000Z | 0/1 | 9293622.01 | 16484.76 | extreme-wide-uncertain |
| 40 | T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D1@1 / Lymhurst / 1 | 600015 | 1599957 | 2026-10-10T14:35:00.000Z / 2026-10-10T14:35:00.000Z | 0/0 | 880942.46 | 143.24 | current-orders-only |
| 606 | T7_2H_TOOL_SICKLE / Martlock / 1 | 35798 | 67961 | 2026-10-10T11:25:00.000Z / 2026-10-10T11:25:00.000Z | 1/1 | 26848.63 | 73.17 | current-orders-only |

T7_2H_TOOL_SICKLE ile T7_2H_TOOL_TRACKING ayrı ürünlerdir. Önceki ilk 20 kaydı T7_2H_TOOL_SICKLE / Caerleon; “Tracking Sickle” adıyla iki kimlik birleştirilmedi. T8 token D3@3 ve D4@4 ayrı enchant/ürün kimlikleri; Jester Cane enchant varyantları ayrı incelendi. Tüm seçilmiş kayıtların ham ve normalleştirilmiş zaman çizelgeleri timelines.json.gz içinde.

**T6_OFF_JESTERCANE_HELL@3|Martlock|1:** Buy 1151 → yeni alış 1152, Sell 499984 → yeni satış 499983; sermaye 1180.80, satış geliri 467484.10. Referans gözlem sayısı Buy/Sell 0/0; yayılım saat 0.00/0.00. Tamamlanmış satış agregası 0 gün, raporlanan miktar bilinmiyor; günlük ortalama aralığı bilinmiyor–bilinmiyor, medyan bilinmiyor; güncel ask aralık içinde bilinmiyor. Bu karşılaştırma ask seviyesinin geçmiş bağlamını verir; düşük bid üzerinden alışın dolacağını kanıtlamaz.
**T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D3@3|Lymhurst|1:** Buy 1134 → yeni alış 1135, Sell 12698990 → yeni satış 12698989; sermaye 1163.38, satış geliri 11873554.71. Referans gözlem sayısı Buy/Sell 0/1; yayılım saat 0.00/0.00. Tamamlanmış satış agregası 2 gün, raporlanan miktar 3; günlük ortalama aralığı 14000000.00–20200000.00, medyan 17100000.00; güncel ask aralık içinde hayır. Bu karşılaştırma ask seviyesinin geçmiş bağlamını verir; düşük bid üzerinden alışın dolacağını kanıtlamaz.
**T8_RANDOM_DUNGEON_ELITE_DRAGON_TOKEN_D4@4|Lymhurst|1:** Buy 1131 → yeni alış 1132, Sell 39750000 → yeni satış 39749999; sermaye 1160.30, satış geliri 37166249.06. Referans gözlem sayısı Buy/Sell 0/0; yayılım saat 0.00/0.00. Tamamlanmış satış agregası 3 gün, raporlanan miktar 3; günlük ortalama aralığı 25000000.00–54000000.00, medyan 50000000.00; güncel ask aralık içinde evet. Bu karşılaştırma ask seviyesinin geçmiş bağlamını verir; düşük bid üzerinden alışın dolacağını kanıtlamaz.
**T7_2H_TOOL_SICKLE|Caerleon|1:** Buy 55001 → yeni alış 55002, Sell 10000000 → yeni satış 9999999; sermaye 56377.05, satış geliri 9349999.06. Referans gözlem sayısı Buy/Sell 0/1; yayılım saat 0.00/0.00. Tamamlanmış satış agregası 9 gün, raporlanan miktar 117; günlük ortalama aralığı 64055.00–69988.00, medyan 67825.00; güncel ask aralık içinde hayır. Bu karşılaştırma ask seviyesinin geçmiş bağlamını verir; düşük bid üzerinden alışın dolacağını kanıtlamaz.

Özel yorum: T8 D4@4 tokenın 39.750.000 ask fiyatı geçmiş günlük ortalamaların 25–54 milyon aralığında; milyonluk satış seviyesi sırf büyüklüğü nedeniyle hatalı ilan edilemez. D3@3 için iki gün/üç ürün 14–20,2 milyon ortalama mevcut. İkisinde de yaklaşık 1.100 silver yeni alış emrinin dolum kanıtı yok; milyonluk teorik farkın kritik belirsizliği budur. T7 Sickle 10 milyon ask ise 9 günlük 117 ürünün 64.055–69.988 günlük ortalamalarından çok uzak; eski düşük fiyatlı satışlar bugünkü yüksek askı doğrulamaz. T6 Jester Cane @3 için tamamlanmış satış agregası ve L3 desteği yok. Bu bağlamlar ayrı tutulmalı; hepsi tek “yüksek ROI” etiketiyle aynı kesinlikte önerilemez.

Her tablodaki mevcut iki taraf accepted/E1 ve reported-top. Kaynak zamanı tablodadır; L seviyesi ayrıca verilir. Posted Buy/Sell, sermaye, satış geliri, ücret sonrası net, ROI, kaynak evidenceId, referans/gözlem sayısı/zaman yayılımı ve bütün varsayımlar analysis.json.gz içinde. Emir miktarı, dolma süresi/olasılığı ve yüksek ask seviyesinde gerçek alıcı olup olmadığı bilinmiyor.

## Sıralama etkisi

8 local-make sunum kalite puanı 1. P90 normalizasyonu net ve ROI bileşenlerini doyuruyor; taze E1 fiyatlar da güncellik/kanıt bileşenini 1 yapabiliyor. Böylece zayıf tarihsel destek ve bilinmeyen dolum ile azami sunum puanı birlikte bulunabiliyor. Bu hesap hatası değil; puanı gerçekleşebilirlik güveni gibi okumak yanıltıcı. Özellikle token/Jester/Sickle kayıtları kanıtlanmış milyonluk kâr olarak önerilemez.

Öneri: mevcut ekonomik öncelik puanını ve ayrı recommendationEvidence/classification bilgisini birlikte göster; “Görünen emirler doğrulandı; iki emrin dolması bilinmiyor” de. Tarihsel emir desteğini günlük satış agregası bağlamından ve tekil dolum kanıtından ayrı tut. Belirsizleri erişilebilir bir görünümde koru. Gizli risk çarpanı, ROI tavanı veya eleme eklenmedi; bu denetim sırasında yeni sıralama uygulanmadı.

## Ek kanıt ve çözülemeyenler

Mevcut AODP collector günlük sales-history anchor topluyor; aynı sunucu/şehir/item/kalite için tamamlanmış gün avg_price ve item_count bağlamını fırsata taşımak güvenli olabilir. Beklenen etki: yüksek ask ile tarihsel gerçekleşmiş ortalamaların ayrışmasını görünür kılmak. Risk: günlük ortalamayı tekil gerçekleşme veya güncel likidite sanmak; bu yüzden Buy/Sell bağımsız gözlemine dönüştürülmemeli, E1/L3 üretmemeli.

Mevcut fiyat toplayıcısının tercih edilen ürün planında bu belirsiz kayıtları önceliklendirmek daha fazla gerçek kaynak zamanına sahip uç fiyat sağlayabilir. Tekrarlanan aynı timestamp bağımsız kanıt değildir. Yerel hub için protokol gerçekten sağlıyorsa emir kimliği, miktar, değişiklik/silme ve snapshot tamamlanma bilgisini ayrı kapsamla saklamak gerekir. Emir silinmesi satış değildir. Eksik kapsamdan tam ekstrem veya hacim çıkarılmamalı. Bu analiz toplayıcı davranışını değiştirmedi ve yeni servis eklemedi.

Mevcut snapshot ile iki yeni emrin dolacağı, fiili kuyruk/derinlik, satış süresi, güncel yüksek ask seviyesinde alıcı, rekabet/repricing maliyeti çözülemez. Günlük satış agregası bulunması bunları çözmez. Tekil fiili emir/işlem kayıtları olmadan beklenen kâr veya gerçekleşme olasılığı hesaplanamaz.

## Sınıflanan kök nedenler ve doğrulama

Veri eksikliği: tekil dolum/derinlik/kuyruk verisi yok. Kaynak kapsamı: reported-top ve günlük agregalar; tam defter değil. Algoritma/politika: local-make matematiğinde veya kimlik eşleşmesinde bu snapshot üzerinde hata bulunmadı; kalite puanının kanıtlayabildiğinden daha güçlü ekonomik kesinlik olarak yorumlanması sunum semantiği riski. Aşırı katı politika saptanmadı; hiçbir güven eşiği değiştirilmedi.

Sınıflandırma 67.07 ms. Bu tarama değil, dondurulmuş sonuçların tanı analizi; üretim cold/warm yoluna eklenmedi. Yeniden üretim: node content/scripts/audit-market-spread-realism.mjs. 1.709 sıralı hücre ve 25.210 taraf sonuçları değişmediği assertion ile denetlendi. node content/scripts/test-market-spread-realism.mjs ve npm run opportunities:test başarılı: kimlik/enchant/kalite/sunucu, premium/ücretsiz ücret/ROI, destek/eksik destek/aşırı makas/tutarsız hesap, saf değerlendirme; mevcut strateji/gözlem/yaşam döngüsü/kalite/kart regresyonları ve geçici migration/rollback kontrolleri. Testlerin migration kontrolü geçici test dosyalarındadır; üretim migration çalıştırılmadı. Optimizasyon eşdeğerliği yeniden geçti: 25.210 karşılaştırma, 0 değişiklik. Performans regresyonu yeniden geçti: 2.520 seri × 2.160 saat sentetik test, cold 3.643 ms, warm 101 ms, heap 54 MB; bu test sentetik verisi gerçek audit sonuçlarına katılmadı. Validated modu ve üretim arşivlerine dokunulmadı.
