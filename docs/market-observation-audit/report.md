# Günün Fırsatları — kanıt temelli shadow incelemesi

Validated modu açılmadı; migration çalıştırılmadı; güven eşikleri ve üretim arşivleri değiştirilmedi. Bu çalışma yalnızca teşhis betikleri ve docs çıktıları üretir.

## Sonuç

0 fırsatın ana nedeni eldeki bağımsız, kapsamı bilinen gözlemlerin azlığı ve yerel paketlerin işlem kanıtı sayılmaması. Önceki rapor canlı journal'ı dışarıda bırakmış: seviye 3 taraf sayısı 3 yerine 19. Ayrıca ilk fiyata kilitlenme ve onaylanan hareketlerin referans sayacından düşmesi gerçek algoritmik sorunlar. Bunlar hatalı engelleme potansiyeli gösteriyor; mevcut veride kaç gerçek kârlı fırsat kaçırıldığı kanıtlanmış değil.

## Snapshot ve yöntem

İlk rapor zamanı: 2026-10-10 15:10:04.835 UTC. Tekrar zamanı: 2026-10-10 15:24:07.570 UTC (18:24:07.570 İstanbul). Snapshot + journal + paket arşivi iki kez okunup SHA-256 eşitliği doğrulandı; journal son satırı tam ve 25–775 sırası kesintisiz. Checkpoint 24; 751 journal işlemi; son yazım 15:12:46.963 UTC. Snapshot dosyası snapshot.json.gz, kaynak hash'leri manifest.json. Üretim repository constructor'ı çağrılmadan journal bellek içinde replay edildi.

Checkpoint karşılaştırması eski 22 adayı aynen üretti. Journal karşılaştırması aynı dondurulmuş dosyalar üzerinde eski/yeni motorlara aynı zaman ve veriyi verdi. İlk 22'nin canlı karşılıkları ayrıca izlendi. Kaynak dosyaların capture sonrasında canlı servis tarafından değişmesi bu replay'i etkilemez. Referans karşılaştırmasında eski motorun saat bucket zamanları ile yeni motorun kaynak zamanları ayrı gösterilir.

| Ölçüm | İlk raporun checkpoint'i | Journal dahil |
|---|---:|---:|
| Gerçek item/şehir/kalite/taraf serisi | 2.586 | 25.210 |
| Eski motor adayı | 22 | 766 |
| Yeni motor hareket adayı | — | 853 |
| Doğrulanmış fırsat | 0 | 0 |
| Referans L3+ | 3 | 19 |
| En az 12 bağımsız önceki gözlem + 24 saat | 6 | 32 |
| Bu grupta tüm geçmiş medyanı çevresinde ≥%80 stabil | 5 | 25 |
| L3+, taze ve kabul edilmiş güncel taraf | 0 | 14 |

853 hareket adayı güven kapılarını geçmiş fırsat değildir. Önceki 3.488 sayısı 1.744 hücrenin iki taraf yuvasıydı; 902 boş tarafı da sayıyordu. Doğru payda 2.586 gerçek seridir.

## Güven kapıları — ilk 22 aday

Stratejinin kullandığı taraflar dikkate alındı; bir satır birden fazla kapıya yazılabilir. İşlem kapısı yalnızca executionConfidence; tazelik ayrı ölçülür (işlem güveni tazelikten de etkilenebilir). Karantina da işlem kapısıyla örtüşebilir.

| Kapı | İlk snapshot | Journal'da aynı 22 |
|---|---:|---:|
| Referans | 22 | 21 |
| İşlem | 22 | 18 |
| Tazelik | 0 | 0 |
| Karantina | 0 | 1 |
| Diğer | 0 | 0 |
| Birden fazla neden | 22 | 17 |

İlk snapshot: 22 referans+işlem. Journal: 16 referans+işlem; 1 referans+işlem+karantina; 4 yalnız referans; 1 yalnız işlem. Journal'da karantinadaki aday T7_FARM_PIG_GROWN / Brecilien / Buy. Bu tablo yalnız ilk 22'nin nedenlerini sayar; 766 yeni eski-motor adayının tümüne genellenemez.

## 22 adayın ayrıntıları

Tüm satırlar Europe. Ürün adı yanında kanonik item kimliği ve kalite verilir. B/S sütun biçimi: **güncel fiyat / yeni referans / referans gözlem sayısı / zaman yayılımı (saat) / referans seviyesi (güven) / işlem güveni**. Sayı, referansa gerçekten katılan önceki bağımsız gözlem sayısıdır; güncel gözlem hariçtir. İlk snapshot'taki eski referans B/S ayrı sütunda. Journal eski referansı ayrıca aşağıdaki satır ayrıntılarındaki eski karşılaştırmayı temsil etmez; tam makine verisi analysis.json içindedir.

| # | Ürün / şehir / kalite | Strateji | İlk Buy | İlk Sell | Eski ref B/S | Journal Buy | Journal Sell | Journal kapıları |
|---|---|---|---|---|---|---|---|---|
| 1 | Pumpkin (T8_PUMPKIN) / Thetford / Q1 | Satış emri açma (place-sell-order) | 444 / 438,5 / 2 / 24,67 / L1 (0,25) / 0 | 605 / 480 / 7 / 47,08 / L2 (0,5) / 0 | 438,5 / 480 | 444 / 441 / 4 / 70,58 / L1 (0,25) / 0 | 605 / 479 / 16 / 66,25 / L3 (0,75) / 0 | işlem |
| 2 | Elite Bighorn Ram (T8_MOUNT_RAM_FW_MARTLOCK_ELITE) / Brecilien / Q1 | Satış emri açma (place-sell-order) | 2.200.002 / — / 0 / 0 / L0 (0) / 0 | 3.799.999 / 3.799.999 / 1 / 0 / L1 (0,25) / 0 | — / 3.100.000 | 2.200.002 / 2.200.002 / 2 / 5 / L1 (0,25) / 0 | 3.799.999 / 3.799.999 / 4 / 51,75 / L1 (0,25) / 0 | referans, işlem |
| 3 | Cured Leather (T5_LEATHER) / Brecilien / Q1 | Düşük Buy fiyatından alış emri (place-buy-order) | 1.001 / 1.355 / 3 / 43 / L1 (0,25) / 0 | 1.443 / 1.519 / 3 / 38,58 / L1 (0,25) / 0 | 1.355 / 1.530 | 1.001 / 1.355 / 3 / 43 / L1 (0,25) / 0 | 1.443 / 1.451,5 / 6 / 70,33 / L2 (0,5) / 0 | referans, işlem |
| 4 | Sheep (T6_FARM_SHEEP_GROWN) / Brecilien / Q1 | Alış ve satış emrini birlikte kurma (local-make) | 8.538 / 8.532,5 / 2 / 55,33 / L1 (0,25) / 0 | 11.997 / 9.912,5 / 2 / 50,75 / L1 (0,25) / 0 | 8.532,5 / 9.912,5 | 8.538 / 8.538 / 4 / 73,67 / L1 (0,25) / 0 | 11.997 / 9.912,5 / 2 / 50,75 / L1 (0,25) / 0 | referans, işlem |
| 5 | Bundle of Corn (T7_CORN) / Thetford / Q1 | Satış emri açma (place-sell-order) | 456 / 453,5 / 2 / 28,08 / L1 (0,25) / 0 | 564 / 478,5 / 4 / 49,08 / L1 (0,25) / 0 | 453,5 / 478,5 | 456 / 457 / 4 / 45,92 / L1 (0,25) / 0 | 481 / 479 / 8 / 66,92 / L2 (0,5) / 1 | referans |
| 6 | Calf (T8_FARM_COW_BABY) / Martlock / Q1 | Satış emri açma (place-sell-order) | 32.284 / — / 0 / 0 / L0 (0) / 0 | 49.994 / 49.995 / 1 / 0 / L1 (0,25) / 0 | — / 34.264 | 32.284 / — / 0 / 0 / L0 (0) / 0 | 49.994 / 49.994,5 / 2 / 72,75 / L1 (0,25) / 0 | referans, işlem |
| 7 | Saddled Bighorn Ram (T5_MOUNT_RAM_FW_MARTLOCK) / Brecilien / Q1 | Düşük Sell fiyatından alış (instant-buy-from-sell) | 159.284 / 159.300 / 3 / 4,75 / L1 (0,25) / 0 | 249.999 / 314.429 / 2 / 62,83 / L1 (0,25) / 0 | 159.271,5 / 309.997 | 159.296 / 159.287 / 8 / 25,58 / L2 (0,5) / 1 | 246.997 / 314.429 / 2 / 62,83 / L1 (0,25) / 1 | referans |
| 8 | Saddled Bighorn Ram (T5_MOUNT_RAM_FW_MARTLOCK) / Brecilien / Q2 | Düşük Sell fiyatından alış (instant-buy-from-sell) | 159.244 / — / 0 / 0 / L0 (0) / 0 | 278.885 / — / 0 / 0 / L0 (0) / 0 | — / 324.996 | 159.244 / — / 0 / 0 / L0 (0) / 0 | 278.885 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 9 | Saddled Bighorn Ram (T5_MOUNT_RAM_FW_MARTLOCK) / Brecilien / Q4 | Düşük Sell fiyatından alış (instant-buy-from-sell) | — / — / 0 / 0 / L0 (0) / 0 | 278.884 / — / 0 / 0 / L0 (0) / 0 | — / 328.879 | — / — / 0 / 0 / L0 (0) / 0 | 278.884 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 10 | Direwolf (T6_MOUNT_DIREWOLF) / Brecilien / Q1 | Alış ve satış emrini birlikte kurma (local-make) | 390.023 / 390.006 / 1 / 0 / L1 (0,25) / 0 | 559.992 / 433.799 / 1 / 0 / L1 (0,25) / 0 | 390.006 / 450.392 | 390.023 / 390.015,5 / 8 / 18,83 / L2 (0,5) / 0 | 559.992 / 433.799 / 1 / 0 / L1 (0,25) / 0 | referans, işlem |
| 11 | Expert's Royal Helmet (T5_HEAD_PLATE_ROYAL@2) / Fort Sterling / Q5 | Satış emri açma (place-sell-order) | 359.000 / — / 0 / 0 / L0 (0) / 0 | 466.666 / — / 0 / 0 / L0 (0) / 0 | — / 380.000 | 359.000 / — / 0 / 0 / L0 (0) / 0 | 466.666 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 12 | Expert's Royal Helmet (T5_HEAD_PLATE_ROYAL@2) / Fort Sterling / Q4 | Alış ve satış emrini birlikte kurma (local-make) | 211.004 / — / 0 / 0 / L0 (0) / 0 | 461.928 / — / 0 / 0 / L0 (0) / 0 | 279.007 / 379.994 | 211.004 / — / 0 / 0 / L0 (0) / 0 | 461.928 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 13 | Expert's Royal Sigil (QUESTITEM_TOKEN_ROYAL_T5) / Thetford / Q1 | Anında Buy Order’a satış (instant-sell-to-buy) | 54.102 / — / 0 / 0 / L0 (0) / 0 | 55.500 / — / 0 / 0 / L0 (0) / 0 | 46.157 / 52.828 | 54.102 / — / 0 / 0 / L0 (0) / 0 | 55.500 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 14 | Pig (T7_FARM_PIG_GROWN) / Brecilien / Q1 | Düşük Buy fiyatından alış emri (place-buy-order) | 1.121 / 8.000 / 1 / 0 / L1 (0,25) / 0 | 9.995 / 10.049 / 1 / 0 / L1 (0,25) / 0 | 8.000 / 10.049 | 1.122 / 8.000 / 1 / 0 / L1 (0,25) / 0 | 9.995 / 9.997,5 / 4 / 67,75 / L1 (0,25) / 1 | referans, işlem, karantina |
| 15 | Raw Mutton (T6_MEAT) / Brecilien / Q1 | Alış ve satış emrini birlikte kurma (local-make) | 423 / 423 / 1 / 0 / L1 (0,25) / 0 | 789 / 471 / 2 / 24,33 / L1 (0,25) / 0 | 423 / 471 | 423 / 423 / 2 / 67 / L1 (0,25) / 0 | 789 / 471 / 2 / 24,33 / L1 (0,25) / 0 | referans, işlem |
| 16 | Expert's Riding Horse (T5_MOUNT_HORSE) / Brecilien / Q1 | Alış ve satış emrini birlikte kurma (local-make) | 46.372 / 55.140 / 1 / 0 / L1 (0,25) / 0 | 74.000 / 70.435 / 7 / 41,17 / L2 (0,5) / 0 | 55.140 / 70.435 | 46.372 / 55.140 / 1 / 0 / L1 (0,25) / 1 | 74.000 / 70.397,5 / 10 / 62,08 / L2 (0,5) / 0 | referans, işlem |
| 17 | Adept's Riding Horse (T4_MOUNT_HORSE) / Brecilien / Q1 | Alış ve satış emrini birlikte kurma (local-make) | 18.187 / 25.599 / 1 / 0 / L1 (0,25) / 0 | 37.956 / 37.954,5 / 2 / 24 / L1 (0,25) / 0 | 25.599 / 35.319 | 18.187 / 25.599 / 1 / 0 / L1 (0,25) / 0 | 37.956 / 36.562 / 10 / 67,25 / L2 (0,5) / 0 | referans, işlem |
| 18 | Chestnut Planks (T3_PLANKS) / Brecilien / Q1 | Anında Buy Order’a satış (instant-sell-to-buy) | 302 / 145 / 1 / 0 / L1 (0,25) / 0 | 438 / 245 / 1 / 0 / L1 (0,25) / 0 | 145 / 397 | 302 / 142 / 2 / 41,25 / L1 (0,25) / 0 | 438 / 245 / 1 / 0 / L1 (0,25) / 0 | referans, işlem |
| 19 | Worked Leather (T4_LEATHER) / Martlock / Q1 | Düşük Buy fiyatından alış emri (place-buy-order) | 262 / 316 / 5 / 41,67 / L2 (0,5) / 0 | 309 / 323 / 6 / 41,67 / L2 (0,5) / 0 | 315,5 / 339 | 262 / 315 / 7 / 53,75 / L1 (0,25) / 1 | 308 / 317,5 / 10 / 66,25 / L1 (0,25) / 1 | referans |
| 20 | Master Imbuer Contract (T6_LABOURER_CONTRACT_MAGE) / Martlock / Q1 | Düşük Sell fiyatından alış (instant-buy-from-sell) | 245.224 / — / 0 / 0 / L0 (0) / 0 | 354.996 / — / 0 / 0 / L0 (0) / 0 | 245.222 / 429.999 | 245.224 / — / 0 / 0 / L0 (0) / 0 | 354.996 / 354.996 / 1 / 0 / L1 (0,25) / 0 | referans, işlem |
| 21 | Novice Imbuer's Journal (Empty) (T2_JOURNAL_MAGE_EMPTY) / Martlock / Q1 | Düşük Sell fiyatından alış (instant-buy-from-sell) | — / — / 0 / 0 / L0 (0) / 0 | 494 / — / 0 / 0 / L0 (0) / 0 | — / 684 | — / — / 0 / 0 / L0 (0) / 0 | 494 / — / 0 / 0 / L0 (0) / 0 | referans, işlem |
| 22 | Chestnut Planks (T3_PLANKS) / Martlock / Q1 | Düşük Sell fiyatından alış (instant-buy-from-sell) | 174 / 179 / 3 / 47 / L1 (0,25) / 0 | 221 / 446 / 1 / 0 / L1 (0,25) / 0 | 191 / 342,5 | 173 / 179 / 3 / 47 / L1 (0,25) / 1 | 220 / 446 / 1 / 0 / L1 (0,25) / 1 | referans |

### Her adayın kapı ve kaynak açıklaması

1. **T8_PUMPKIN / Thetford / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L2, 7 gözlem/47,08 saat. Journal: sell: source-time-unknown, incomplete-book; L3, 16 gözlem/66,25 saat; kaynak market-order-packets, zaman 2026-10-10T14:06:34.620Z, yaş 1,29 saat.

2. **T8_MOUNT_RAM_FW_MARTLOCK_ELITE / Brecilien / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L1, 4 gözlem/51,75 saat; kaynak market-order-packets, zaman 2026-10-10T14:34:05.569Z, yaş 0,83 saat.

3. **T5_LEATHER / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 3 gözlem/43 saat. Journal: buy: source-time-unknown, incomplete-book; L1, 3 gözlem/43 saat; kaynak market-order-packets, zaman 2026-10-10T14:31:50.692Z, yaş 0,87 saat.

4. **T6_FARM_SHEEP_GROWN / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 2 gözlem/55,33 saat; sell: source-time-unknown, incomplete-book; L1, 2 gözlem/50,75 saat. Journal: buy: source-time-unknown, incomplete-book; L1, 4 gözlem/73,67 saat; kaynak market-order-packets, zaman 2026-10-10T14:51:21.127Z, yaş 0,55 saat; sell: source-time-unknown, incomplete-book; L1, 2 gözlem/50,75 saat; kaynak market-order-packets, zaman 2026-10-10T14:51:21.136Z, yaş 0,55 saat.

5. **T7_CORN / Thetford / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L1, 4 gözlem/49,08 saat. Journal: sell: accepted; L2, 8 gözlem/66,92 saat; kaynak aodp-current, zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat.

6. **T8_FARM_COW_BABY / Martlock / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L1, 2 gözlem/72,75 saat; kaynak market-order-packets, zaman 2026-10-10T13:53:22.712Z, yaş 1,51 saat.

7. **T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L1, 2 gözlem/62,83 saat. Journal: sell: movement-confirmed; L1, 2 gözlem/62,83 saat; kaynak aodp-current, zaman 2026-10-10T13:55:00.000Z, yaş 1,49 saat.

8. **T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / Q2**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T10:29:54.164Z, yaş 4,9 saat.

9. **T5_MOUNT_RAM_FW_MARTLOCK / Brecilien / Q4**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T10:29:54.164Z, yaş 4,9 saat.

10. **T6_MOUNT_DIREWOLF / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: buy: source-time-unknown, incomplete-book; L2, 8 gözlem/18,83 saat; kaynak market-order-packets, zaman 2026-10-10T14:47:53.012Z, yaş 0,6 saat; sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T14:47:53.002Z, yaş 0,6 saat.

11. **T5_HEAD_PLATE_ROYAL@2 / Fort Sterling / Q5**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T14:13:48.081Z, yaş 1,17 saat.

12. **T5_HEAD_PLATE_ROYAL@2 / Fort Sterling / Q4**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: buy: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T14:17:40.321Z, yaş 1,11 saat; sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T14:13:48.081Z, yaş 1,17 saat.

13. **QUESTITEM_TOKEN_ROYAL_T5 / Thetford / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: buy: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T14:09:38.226Z, yaş 1,24 saat.

14. **T7_FARM_PIG_GROWN / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: buy: suspicious-movement; L1, 1 gözlem/0 saat; kaynak aodp-current, zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat.

15. **T6_MEAT / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; sell: source-time-unknown, incomplete-book; L1, 2 gözlem/24,33 saat. Journal: buy: source-time-unknown, incomplete-book; L1, 2 gözlem/67 saat; kaynak market-order-packets, zaman 2026-10-10T14:33:58.084Z, yaş 0,84 saat; sell: source-time-unknown, incomplete-book; L1, 2 gözlem/24,33 saat; kaynak market-order-packets, zaman 2026-10-10T14:33:58.076Z, yaş 0,84 saat.

16. **T5_MOUNT_HORSE / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; sell: source-time-unknown, incomplete-book; L2, 7 gözlem/41,17 saat. Journal: buy: movement-confirmed; L1, 1 gözlem/0 saat; kaynak aodp-current, zaman 2026-10-10T15:05:00.000Z, yaş 0,32 saat; sell: source-time-unknown, incomplete-book; L2, 10 gözlem/62,08 saat; kaynak market-order-packets, zaman 2026-10-10T15:00:09.187Z, yaş 0,4 saat.

17. **T4_MOUNT_HORSE / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; sell: source-time-unknown, incomplete-book; L1, 2 gözlem/24 saat. Journal: buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T15:00:05.445Z, yaş 0,4 saat; sell: source-time-unknown, incomplete-book; L2, 10 gözlem/67,25 saat; kaynak market-order-packets, zaman 2026-10-10T15:00:05.452Z, yaş 0,4 saat.

18. **T3_PLANKS / Brecilien / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: buy: source-time-unknown, incomplete-book; L1, 2 gözlem/41,25 saat; kaynak market-order-packets, zaman 2026-10-10T14:48:13.181Z, yaş 0,6 saat.

19. **T4_LEATHER / Martlock / Q1**: ilk gerekli taraf(lar): buy: source-time-unknown, incomplete-book; L2, 5 gözlem/41,67 saat. Journal: buy: movement-confirmed; L1, 7 gözlem/53,75 saat; kaynak aodp-current, zaman 2026-10-10T13:30:00.000Z, yaş 1,9 saat.

20. **T6_LABOURER_CONTRACT_MAGE / Martlock / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T11:01:02.866Z, yaş 4,38 saat.

21. **T2_JOURNAL_MAGE_EMPTY / Martlock / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat. Journal: sell: source-time-unknown, incomplete-book; L0, 0 gözlem/0 saat; kaynak market-order-packets, zaman 2026-10-10T11:01:38.334Z, yaş 4,37 saat.

22. **T3_PLANKS / Martlock / Q1**: ilk gerekli taraf(lar): sell: source-time-unknown, incomplete-book; L1, 1 gözlem/0 saat. Journal: sell: movement-confirmed; L1, 1 gözlem/0 saat; kaynak aodp-current, zaman 2026-10-10T11:25:00.000Z, yaş 3,99 saat.

## Neden yalnız 3 taraf L3 olmuştu?

Seviye 3: en az 12 referans gözlemi, en az 24 saat ve medyan çevresinde ±%5 içinde en az %80 stabilite. Aynı kaynak timestamp'i tekrar indirmek bağımsız gözlem üretmez. İlk snapshot'ta 2.580/2.586 seri 12 bilinen-kapsamlı bağımsız önceki gözleme sahip değil. Sayı yeterli olup yalnız zaman yayılımından elenen seri yok. Journal'da da 25.178/25.210 seri sayı şartını sağlayamıyor. Bu, baskın olarak veri eksikliği.

Geçmiş formatı tamamen okunamıyor değil: AODP sourceQuoteAt/fetchedAt ayrımı restore ile korunuyor; journal replay'i 19 L3 üretiyor. Yerel paketlerde seenAt/bucketAt piyasa gözlem zamanı veya tam emir defteri kanıtı değildir. source-time-unknown + incomplete-book nedeniyle provisional olmaları bir parse hatası değil, kaynak kapsamı sınırlaması. Bunları timestamp uydurarak yükseltmek yanlış fırsat riskini artırır.

**Algoritma hatası / politika etkileşimi:** T4_PLANKS Lymhurst Sell: ilk 499, ardından yaklaşık 350–370 bandında birçok bağımsız fiyat. İlk snapshot'ta 13 uygun önceki gözlem/52,42 saat ve genel medyan çevresi stabilitesi %92,31 olmasına rağmen referans 499, örnek sayısı 1. Hareketler accepted olabilir, ama rejime ancak 24 örnek/72 saatle katılıyor. İlk başlangıç fiyatı doğrulanmış kalıcı rejim gibi davranıyor. L3'ün 12/24 şartı ile rejimin 24/72 şartının etkileşimi bu seriyi kilitliyor.

Journal örnekleri: T5_CABBAGE Brecilien Sell (15 uygun önceki gözlem/66,5 saat, genel stabilite %86,67; gerçek referans sayacı 1, ref690); T5_MOUNT_HORSE Brecilien Buy (14/66,17 saat, %92,86; sayaç1, ref55140); T4_MOUNT_HORSE Caerleon Sell (12/63,08 saat, %91,67; sayaç1). Bu seriler yeterli yapısal kanıta rağmen başlangıç fiyatına kilitleniyor.

T5_MOUNT_COUGAR_KEEPER@1 Brecilien Sell: 13 önceki gözlem/65,75 saat, genel stabilite %100; onaylanan yaklaşık %8 hareketin gözlemleri rejime katılmayınca sayaç8 ve L2 kalıyor. Bu, yalnız eşik katılığı değil, onaylanan kanıtın referans yaşam döngüsünde kaybolması.

T7_MEAT Fort Sterling ilk snapshot'ta 12 yapısal uygun gözlem vardı, ancak bir onaysız ayrışma nedeniyle gerçek sayaç11. Bunu düzeltilecek hata diye saymak için kanıt yok; journal ile L3'e zaten ulaşıyor. T3_MOUNT_HORSE Thetford genel stabilite %69,23; count üst sınırı yeterli olsa da istikrar kanıtı yetersiz.

**Güncel fiyat seçimi:** T8_PUMPKIN Thetford Sell'de yerel605 (14:06:34 alım zamanı, kapsam/zaman bilinmiyor) son fiyat seçiliyor; AODP468 kaynak14:05, fetch14:22 mevcut. Yerel kayıt onaylı AODP'yi gölgeliyor. Ancak AODP468/ref479 sapması −%2,30; bu örneği doğru seçmek fırsat üretmez. Yanlış engelleme mekanizmasını gösterir, kaçırılmış fırsatı kanıtlamaz.

**Ek teşhis:** aynı evidenceId için 1000,2000,1000 üçlü tekrarında çelişki karantinası son aynı-fiyat tekrarınca accepted'a dönüyor. probes.json bu davranışı doğrular. Bu bir yanlış fırsat riski; mevcut 22'nin elenme sebebi değildir. Bootstrap probunda 15 accepted gözlem olmasına rağmen ref499/sayaç1/L1 sonucu tekrarlandı.

## Eşikleri değiştirmeden ulaşılabilecek sınır

**32**, journal verisinde mevcut kaynak kapsamı korunarak L3 olabilecek serilerin gerekli sayı/zaman şartından gelen kesin üst sınırıdır; 32'nin tamamının doğrulanabilir olduğu iddia edilmiyor. Orijinal snapshot için aynı üst sınır6. 25 seri global medyan stabilitesini de sağlıyor, fakat global medyan hesabı motorun kronolojik rejim algoritması değildir; 25 bir garanti veya kesin maksimum değildir. Değişmeyen mevcut algoritmanın gerçek sonucu19 L3; bunların14'ünde güncel fiyat taze ve accepted. Bu14 tarafın referans sapmaları %12 fırsat şartını karşılamıyor. Dolayısıyla eldeki sonuç0 ile uyumlu. Algoritma düzeltmesi sonrası tam doğrulanabilir sayı, kronolojik replay ve strateji kapıları tekrar çalışmadan kesinleştirilemez; üst sınırı fırsat sayısı diye sunmak yanıltıcıdır.

## İlk tarama profili

Mevcut performans testini Node CPU profiler ile çalıştırdım: 2.520 taraf serisi × 2.160 saat, cold **21.316 ms**, warm **84 ms**, heap142MB; test geçti (1.260 doğrulanmış sentetik hücre, liste sınırı500). Bu önceki yaklaşık25 saniyelik sentetik testin tekrar ölçümüdür, gerçek journal replay süresinin aynısı değildir.

| CPU self-time odağı | Yaklaşık ms |
|---|---:|
| normalizeObservation | 7.680 |
| quoteFreshnessPoints map | 4.081 |
| Garbage collector | 2.507 |
| validateObservationSeries | 1.854 |
| 28 günlük filtre/map | 1.820 |
| Cache expiry boundary map | 1.119 |
| parsedTime | 685 |

Self-time değerleri örneklem tahminidir; iç içe toplam süre değildir. İlk taramada5.443.200 bucket zaman kontrolü, yaklaşık1.696.000 pencere içi gözlem işleniyor. Tarih parse/ISO dönüşümleri, tekrar nesne kopyalama ve ara diziler baskın; medyana sıralı eklemenin self-time'ı yaklaşık111ms, ana darboğaz değil. CPU dosyası ../market-observation-audit.cpuprofile.

Davranışı değiştirmeyen adaylar: filtre+normalize+freshness döngülerini ara diziler olmadan birleştirmek; timestamp'in sayısal değerini aynı kayıt boyunca yeniden kullanmak; now ISO'sunu her gözlemde üretmemek; expiry minimumunu dizi/spread yerine tek döngüyle bulmak; immutable normalize edilmiş metadata'yı seri revizyonuyla cachelemek. Beklenen etki CPU/GC düşüşü; ölçülmemiş hızlanma oranı vermiyorum. Kabul şartı: dondurulmuş snapshot'ta tüm fiyat/ref/status/reasons/evidence ve aday kararları birebir aynı; cache expiry, zaman ilerlemesi ve revision invalidation testleri aynı davranışı korumalı.

## İlk20 referans farkı ve ham zaman çizelgeleri

Sıralama: ilk22'nin üretildiği snapshot'ta eski/yeni referansı mevcut seriler arasında mutlak yüzde farkı. Journal ile farklı veri kapsamından gelen farklar algoritma farkı diye karıştırılmadı. Her tabloda eski/yeni referans, ham sourceQuoteAt/seenAt/fetchedAt/bucketAt, kaynak ve kronolojik validasyon gösterilir. Bunlar readMarketBook restore'undan gelen alanlardır; özgün değişmemiş ham dosyalar snapshot.json.gz'dedir. UTC kullanılır.

### 1. T8_PUMPKIN / Martlock / Q1 / sell

Eski **9.999** → yeni **515** (-94,85%). Yeni sayaç6, yayılım41,33 saat, L2. Yerel9999 kapsamı/zamanı bilinmediği için dışarıda; AODP505–521 bandı tutarlı. Eski referansın9999 olması kaynak karışması.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 9.999 | market-order-packets | — | 2026-10-07T17:36:25.085Z | — | 2026-10-07T17:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 519 | market-order-packets | — | 2026-10-08T22:06:22.580Z | — | 2026-10-08T22:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 520 | aodp-current | 2026-10-07T20:00:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 505 | aodp-current | 2026-10-08T09:05:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted:  |
| 518 | aodp-current | 2026-10-08T22:30:00.000Z | 2026-10-08T23:00:12.857Z | 2026-10-08T23:00:12.857Z | 2026-10-08T23:00:00.000Z | accepted:  |
| 521 | aodp-current | 2026-10-09T01:00:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted:  |
| 512 | aodp-current | 2026-10-09T08:55:00.000Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:00:00.000Z | accepted:  |
| 511 | aodp-current | 2026-10-09T13:20:00.000Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:00:00.000Z | accepted:  |
| 509 | aodp-current | 2026-10-09T16:25:00.000Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:00:00.000Z | accepted:  |

### 2. T3_MEAT / Lymhurst / Q1 / sell

Eski **2.552** → yeni **450** (-82,37%). Yeni sayaç1, yayılım0 saat, L1. 4654 tek büyük sıçrama karantinada;450 başlangıç ve479 onay bekliyor. Veri az; yeni referans güçlü kabul edilemez.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 450 | aodp-current | 2026-10-07T17:40:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 4.654 | aodp-current | 2026-10-09T00:05:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | quarantined: extreme-price |
| 479 | aodp-current | 2026-10-09T08:00:00.000Z | 2026-10-09T08:25:18.853Z | 2026-10-09T08:25:18.853Z | 2026-10-09T08:00:00.000Z | provisional: awaiting-movement |

### 3. T5_MOUNT_ARMORED_HORSE / Brecilien / Q1 / sell

Eski **419.926** → yeni **89.852** (-78,6%). Yeni sayaç3, yayılım44,5 saat, L1. 750000 tek sıçrama karantinada; yaklaşık88000–90000 kalan bandı destekliyor. Eski medyan ciddi kirlenmiş.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 89.852 | aodp-current | 2026-10-07T15:55:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 750.000 | aodp-current | 2026-10-08T10:50:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: extreme-price |
| 89.877 | aodp-current | 2026-10-09T06:40:00.000Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:00:00.000Z | accepted:  |
| 85.000 | aodp-current | 2026-10-09T08:45:00.000Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:00:00.000Z | provisional: awaiting-movement |
| 87.990 | aodp-current | 2026-10-09T12:25:00.000Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:00:00.000Z | accepted:  |
| 87.991 | aodp-current | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:00:00.000Z | accepted:  |

### 4. T3_EGG / Thetford / Q1 / sell

Eski **470** → yeni **145** (-69,15%). Yeni sayaç1, yayılım0 saat, L1. 477/470 ilk145 seviyesine göre karantinada;177 bekliyor. Az veri ve iki olası rejim; yeni145 kesin piyasa değeri değildir.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 145 | aodp-current | 2026-10-07T19:15:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 477 | aodp-current | 2026-10-08T17:15:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 470 | aodp-current | 2026-10-09T10:20:00.000Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:00:00.000Z | quarantined: suspicious-movement |
| 177 | aodp-current | 2026-10-09T14:40:00.000Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:00:00.000Z | provisional: awaiting-movement |

### 5. T5_TEASEL / Thetford / Q1 / sell

Eski **615** → yeni **999** (62,44%). Yeni sayaç1, yayılım0 saat, L1. 999 ilk fiyat;615/610 hareketi accepted olmasına rağmen referans999 kalıyor.49998 karantinada. Bootstrap kilidi.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 999 | aodp-current | 2026-10-07T19:00:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 615 | aodp-current | 2026-10-08T14:20:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 610 | aodp-current | 2026-10-08T23:45:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted: movement-confirmed |
| 49.998 | aodp-current | 2026-10-09T14:40:00.000Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:00:00.000Z | quarantined: extreme-price |

### 6. T8_FARM_COW_BABY / Martlock / Q1 / sell

Eski **34.264** → yeni **49.995** (45,91%). Yeni sayaç1, yayılım0 saat, L1. 49995 ilk fiyat; iki34264 accepted fakat rejime alınmıyor; son49994 bekliyor. Yeni ref artışı doğruluk kanıtı değil.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 49.994 | market-order-packets | — | 2026-10-10T13:53:22.712Z | — | 2026-10-10T13:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 49.995 | aodp-current | 2026-10-07T08:50:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 34.264 | aodp-current | 2026-10-08T18:50:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 34.264 | aodp-current | 2026-10-08T23:00:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted: movement-confirmed |

### 7. T3_EGG / Martlock / Q1 / sell

Eski **213** → yeni **130** (-38,97%). Yeni sayaç1, yayılım0 saat, L1. 296 karantinada,127 ve130 yakın. Az ama yeni ref yönünü destekleyen veri.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 130 | aodp-current | 2026-10-07T17:20:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 296 | aodp-current | 2026-10-08T12:55:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 127 | aodp-current | 2026-10-09T04:35:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted:  |

### 8. T3_PLANKS / Brecilien / Q1 / sell

Eski **397** → yeni **245** (-38,29%). Yeni sayaç1, yayılım0 saat, L1. 549 karantinada,438 bekliyor,245 ilk fiyat. Sonraki fiyatların gerçek rejim olması hâlinde başlangıç kilidi riski; veri yetersiz.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 438 | market-order-packets | — | 2026-10-10T14:48:13.166Z | — | 2026-10-10T14:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 245 | aodp-current | 2026-10-07T12:35:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 549 | aodp-current | 2026-10-08T18:50:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |

### 9. T5_CABBAGE / Brecilien / Q1 / sell

Eski **499** → yeni **690** (38,28%). Yeni sayaç1, yayılım0 saat, L1. 690 ilk fiyat; uzun500–480 accepted bandı rejime katılmıyor. Bootstrap kilidi; journal ile de sürüyor.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 490 | market-order-packets | — | 2026-10-09T11:15:42.025Z | — | 2026-10-09T11:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 690 | aodp-current | 2026-10-07T19:35:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 500 | aodp-current | 2026-10-08T19:55:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 498 | aodp-current | 2026-10-08T21:05:00.000Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:00.000Z | accepted: movement-confirmed |
| 429 | aodp-current | 2026-10-09T00:35:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | provisional: awaiting-movement |
| 495 | aodp-current | 2026-10-09T07:15:00.000Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:00:00.000Z | accepted: movement-confirmed |
| 492 | aodp-current | 2026-10-09T09:45:00.000Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:00:00.000Z | accepted: movement-confirmed |
| 490 | aodp-current | 2026-10-09T11:15:00.000Z | 2026-10-09T11:39:21.716Z | 2026-10-09T11:39:21.716Z | 2026-10-09T11:00:00.000Z | accepted: movement-confirmed |
| 482 | aodp-current | 2026-10-09T19:30:00.000Z | 2026-10-09T19:39:33.310Z | 2026-10-09T19:39:33.310Z | 2026-10-09T19:00:00.000Z | accepted: movement-confirmed |
| 484 | aodp-current | 2026-10-09T20:30:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | accepted: movement-confirmed |

### 10. T7_FARM_MULLEIN_SEED / Lymhurst / Q1 / sell

Eski **39.989** → yeni **24.992** (-37,5%). Yeni sayaç1, yayılım0 saat, L1. 39992/39989 ilk24992 seviyesine göre karantina; son24998 eski bandı destekliyor. Geçici sıçrama olasılığı, düşük sayı.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 24.992 | aodp-current | 2026-10-07T18:50:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 39.992 | aodp-current | 2026-10-08T06:50:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 39.989 | aodp-current | 2026-10-09T06:40:00.000Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:00:00.000Z | quarantined: suspicious-movement |
| 24.998 | aodp-current | 2026-10-09T20:35:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | accepted:  |

### 11. T4_PLANKS / Lymhurst / Q1 / sell

Eski **364** → yeni **499** (37,09%). Yeni sayaç1, yayılım0 saat, L1. 499 ilk fiyat;362 çevresinde çok sayıda accepted gözlem sayaca alınmıyor. Açık başlangıç kilidi.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 499 | aodp-current | 2026-10-07T14:40:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 362 | aodp-current | 2026-10-08T18:15:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 363 | aodp-current | 2026-10-09T03:50:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted: movement-confirmed |
| 362 | aodp-current | 2026-10-09T08:00:00.000Z | 2026-10-09T08:25:18.853Z | 2026-10-09T08:25:18.853Z | 2026-10-09T08:00:00.000Z | accepted: movement-confirmed |
| 364 | aodp-current | 2026-10-09T09:20:00.000Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:00:00.000Z | accepted: movement-confirmed |
| 364 | aodp-current | 2026-10-09T10:30:00.000Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:39:19.831Z | 2026-10-09T10:00:00.000Z | accepted: movement-confirmed |
| 370 | aodp-current | 2026-10-09T12:35:00.000Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:00:00.000Z | accepted: movement-confirmed |
| 366 | aodp-current | 2026-10-09T12:40:00.000Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:00:00.000Z | accepted: movement-confirmed |
| 358 | aodp-current | 2026-10-09T15:25:00.000Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:00:00.000Z | accepted: movement-confirmed |
| 358 | aodp-current | 2026-10-09T16:35:00.000Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:00:00.000Z | accepted: movement-confirmed |
| 358 | aodp-current | 2026-10-09T17:25:00.000Z | 2026-10-09T17:39:30.693Z | 2026-10-09T17:39:30.693Z | 2026-10-09T17:00:00.000Z | accepted: movement-confirmed |
| 351 | aodp-current | 2026-10-09T18:25:00.000Z | 2026-10-09T18:39:32.530Z | 2026-10-09T18:39:32.530Z | 2026-10-09T18:00:00.000Z | accepted: movement-confirmed |
| 351 | aodp-current | 2026-10-09T19:05:00.000Z | 2026-10-09T19:39:33.310Z | 2026-10-09T19:39:33.310Z | 2026-10-09T19:00:00.000Z | accepted: movement-confirmed |
| 343 | aodp-current | 2026-10-09T20:35:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | provisional: awaiting-movement |

### 12. T3_PLANKS / Martlock / Q1 / sell

Eski **342,5** → yeni **446** (30,22%). Yeni sayaç1, yayılım0 saat, L1. 446 ilk fiyat;239–224 accepted bandı referansa alınmıyor. Eski342,5 de iki rejimi karıştırıyor; yeni446 güvenilir merkez değil.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 221 | market-order-packets | — | 2026-10-10T10:59:00.895Z | — | 2026-10-10T10:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 446 | aodp-current | 2026-10-07T06:50:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 239 | aodp-current | 2026-10-08T17:35:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 230 | aodp-current | 2026-10-08T21:20:00.000Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:00.000Z | accepted: movement-confirmed |
| 224 | aodp-current | 2026-10-09T05:15:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted: movement-confirmed |
| 228 | aodp-current | 2026-10-09T09:15:00.000Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:00:00.000Z | accepted: movement-confirmed |

### 13. T3_MOUNT_HORSE / Caerleon / Q1 / sell

Eski **20.998** → yeni **15.449** (-26,43%). Yeni sayaç1, yayılım0 saat, L1. 15449 ilk fiyat; sonraki yaklaşık20000–24000 gözlemler karantina/beklemede. Yeni merkezin doğru olduğuna yeterli kanıt yok.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 15.449 | aodp-current | 2026-10-07T19:40:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 24.365 | aodp-current | 2026-10-08T18:25:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 22.000 | aodp-current | 2026-10-08T21:10:00.000Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:00.000Z | provisional: awaiting-movement |
| 19.996 | aodp-current | 2026-10-09T02:05:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | provisional: awaiting-movement |
| 21.991 | aodp-current | 2026-10-09T12:35:00.000Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:00:00.000Z | provisional: awaiting-movement |
| 21.991 | aodp-current | 2026-10-09T13:10:00.000Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:00:00.000Z | provisional: awaiting-movement |

### 14. T4_PLANKS / Bridgewatch / Q1 / sell

Eski **441** → yeni **339** (-23,13%). Yeni sayaç1, yayılım0 saat, L1. 339 ilk fiyat;550 karantina,419/417 hareketi accepted ama merkeze katılmıyor. Bootstrap kilidi ve veri azlığı.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 339 | aodp-current | 2026-10-07T14:30:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 550 | aodp-current | 2026-10-08T18:05:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 441 | aodp-current | 2026-10-09T07:00:00.000Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:00:00.000Z | provisional: awaiting-movement |
| 419 | aodp-current | 2026-10-09T17:30:00.000Z | 2026-10-09T17:39:30.693Z | 2026-10-09T17:39:30.693Z | 2026-10-09T17:00:00.000Z | accepted: movement-confirmed |
| 417 | aodp-current | 2026-10-09T19:55:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | accepted: movement-confirmed |

### 15. T8_MOUNT_RAM_FW_MARTLOCK_ELITE / Brecilien / Q1 / sell

Eski **3.100.000** → yeni **3.799.999** (22,58%). Yeni sayaç1, yayılım0 saat, L1. 3799999 ilk; iki3100000 accepted ama ref değişmiyor; son3799999 yerel kayıt provisional. Kaynak kapsamı ve rejim kilidi.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 3.799.999 | market-order-packets | — | 2026-10-10T14:34:05.569Z | — | 2026-10-10T14:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 3.799.999 | aodp-current | 2026-10-08T10:45:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted:  |
| 3.100.000 | aodp-current | 2026-10-09T01:35:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted: movement-confirmed |
| 3.100.000 | aodp-current | 2026-10-09T06:40:00.000Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:25:18.020Z | 2026-10-09T07:00:00.000Z | accepted: movement-confirmed |

### 16. T6_CLOTH / Martlock / Q1 / buy

Eski **2.888** → yeni **3.513** (21,64%). Yeni sayaç1, yayılım0 saat, L1. 3513 ilk AODP;2888 hareketi beklemede; yerel kayıt işlem kanıtı değil. Kaynak kapsamı + az bağımsız gözlem.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 2.888 | market-order-packets | — | 2026-10-10T07:57:26.682Z | — | 2026-10-10T07:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 2.888 | market-order-packets | — | 2026-10-10T08:10:57.963Z | — | 2026-10-10T08:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 3.063 | market-order-packets | — | 2026-10-10T11:02:03.087Z | — | 2026-10-10T11:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 3.513 | aodp-current | 2026-10-07T08:15:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |

### 17. T6_METALBAR / Martlock / Q1 / buy

Eski **3.293,5** → yeni **4.000** (21,45%). Yeni sayaç1, yayılım0 saat, L1. 4000 ilk;3292–3295 accepted fakat referans4000 kalıyor; yerel3101/3295 provisional. Bootstrap kilidi + kaynak kapsamı.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 3.101 | market-order-packets | — | 2026-10-10T07:57:26.682Z | — | 2026-10-10T07:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 3.101 | market-order-packets | — | 2026-10-10T08:10:57.963Z | — | 2026-10-10T08:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 3.295 | market-order-packets | — | 2026-10-10T10:59:15.931Z | — | 2026-10-10T10:00:00.000Z | provisional: source-time-unknown, incomplete-book |
| 4.000 | aodp-current | 2026-10-07T11:00:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 3.292 | aodp-current | 2026-10-08T20:20:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | accepted: movement-confirmed |
| 3.295 | aodp-current | 2026-10-09T13:30:00.000Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:39:24.379Z | 2026-10-09T13:00:00.000Z | accepted: movement-confirmed |
| 3.295 | aodp-current | 2026-10-09T20:20:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | accepted: movement-confirmed |

### 18. T3_EGG / Fort Sterling / Q1 / sell

Eski **187,5** → yeni **148** (-21,07%). Yeni sayaç2, yayılım52,25 saat, L1. 219/375 karantinada;140/156/155 düşük banda yakın. Yeni148 daha temiz fakat sayısı yalnız2.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 140 | aodp-current | 2026-10-06T20:35:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 219 | aodp-current | 2026-10-08T14:05:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | quarantined: suspicious-movement |
| 156 | aodp-current | 2026-10-09T00:50:00.000Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:25:17.135Z | 2026-10-09T06:00:00.000Z | accepted:  |
| 375 | aodp-current | 2026-10-09T08:35:00.000Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:25:19.831Z | 2026-10-09T09:00:00.000Z | quarantined: suspicious-movement |
| 155 | aodp-current | 2026-10-09T11:55:00.000Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:39:22.506Z | 2026-10-09T12:00:00.000Z | accepted:  |

### 19. T5_FARM_COUGAR_BABY / Fort Sterling / Q1 / sell

Eski **14.473,5** → yeni **17.494** (20,87%). Yeni sayaç1, yayılım0 saat, L1. 17494 ilk; son14931/14927 accepted hareket merkeze katılmıyor, ara hareketler bölünüyor. Bootstrap ve az veri.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 17.494 | aodp-current | 2026-10-06T21:15:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 13.988 | aodp-current | 2026-10-08T11:15:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | provisional: awaiting-movement |
| 14.959 | aodp-current | 2026-10-08T21:30:00.000Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:11.938Z | 2026-10-08T22:00:00.000Z | provisional: awaiting-movement |
| 11.679 | aodp-current | 2026-10-09T15:25:00.000Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:00:00.000Z | provisional: awaiting-movement |
| 14.931 | aodp-current | 2026-10-09T16:35:00.000Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:39:28.848Z | 2026-10-09T16:00:00.000Z | accepted: movement-confirmed |
| 14.927 | aodp-current | 2026-10-09T20:00:00.000Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:39:35.136Z | 2026-10-09T20:00:00.000Z | accepted: movement-confirmed |

### 20. T4_BURDOCK / Thetford / Q1 / sell

Eski **594,5** → yeni **476** (-19,93%). Yeni sayaç1, yayılım0 saat, L1. 476 ilk;713/634 ayrı pending hareketler. Herhangi bir bandı yeterince doğrulamayan üç gözlem; fark tek başına hata kanıtı değil.

| Fiyat | Kaynak | Kaynak zamanı | Alım/seen | Fetch | Bucket | Durum/neden |
|---:|---|---|---|---|---|---|
| 476 | aodp-current | 2026-10-07T14:15:00.000Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:23:56.217Z | 2026-10-07T20:00:00.000Z | accepted:  |
| 713 | aodp-current | 2026-10-08T14:25:00.000Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:08.727Z | 2026-10-08T21:00:00.000Z | provisional: awaiting-movement |
| 634 | aodp-current | 2026-10-09T14:40:00.000Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:39:27.032Z | 2026-10-09T15:00:00.000Z | provisional: awaiting-movement |

## Sınıflandırma ve öneriler

| Sınıf | Kanıt | Öneri | Beklenen etki | Yanlış fırsat riski |
|---|---|---|---|---|
| Veri eksikliği | Journal'da25.178 seri12 önceki gözleme sahip değil | Kaynak timestamp'i değişmiş gerçek bağımsız gözlemleri düzenli toplamak; aynı timestamp'i tekrar saymamak | Referans olgunluğu zamanla artar; anlık fırsat artışı vaat edilmez | Düşük; tekrarları bağımsız saymak yüksek risk |
| Algoritma hatası / raporlama | İlk shadow journal'ı dışlıyor;3 yerine19 L3 | Read-only replay'de checkpoint+tam journal+paketleri tek snapshot kaynağı yapmak, boş tarafları paydadan ayırmak | Karşılaştırma doğruluğu;22→766 eski aday veri kapsamı farkı açıklanır | Düşük; üretim kararını değiştirmez |
| Algoritma hatası | Accepted hareketler rejim sayacına katılmıyor, başlangıç fiyatına kilit | Bootstrap ve onaylı hareketin referans yaşam döngüsünü açık tasarlamak; önce kronolojik karşı örnekler ile doğrulamak | 32 üst sınır içindeki bazı serilerde hatalı engellemeyi kaldırabilir; kesin adet bilinmiyor | Orta/yüksek; hareket kendi referansına katılırsa fırsat sinyali silinebilir veya yanlış merkez üretebilir |
| Algoritma hatası / kaynak seçimi | Bilinmeyen yerel605 taze AODP468'i gölgeliyor | Gösterim fiyatı ve işlem için uygun en son kanıtı ayrı seçmek; kaynak gerekçesini görünür tutmak | Güncel işlem güveninin yanlış0 olmasını azaltabilir; pumpkin fırsata dönüşmez | Orta; eski kabul edilmiş fiyata düşerken6saat ve kaynak zamanı kapıları korunmalı |
| Algoritma hatası | Çelişkili evidence üçlü tekrarda karantinadan çıkıyor | Çelişkiyi aynı evidenceId ömründe monoton karantina yapmak | Yanlış kabulü engeller; fırsat sayısını azaltabilir | Düşük; eksik çözüm yanlış kabul riskini sürdürür |
| Aşırı katı politika olasılığı | L3 12/24, rejim24/72 etkileşimi | Önce bootstrap hatasını ayır; sonra mevcut eşiklerde duyarlılık raporu üret. Şimdi eşik değişikliği önerilmiyor | Politika etkisi ile uygulama hatası ayrılır | Eşiği azaltmak yüksek yanlış fırsat riski; veri bunu henüz desteklemiyor |
| Kaynak kapsamı | Yerel paket timestamp/kapsam bilinmiyor | Collector'da gerçek piyasa timestamp'i, tam/top kapsamı ve provenance varsa kaydet; eski kayıtlara uydurma metadata ekleme | Yeni paketlerin kanıt kalitesi artabilir | Orta/yüksek; yalnız gerçekten ispatlanan alanlar güvene katılmalı |
| Performans | Normalize/map/GC baskın | Sayısal timestamp reuse, tek geçişli döngüler ve doğru revision cache | Cold süre ve heap azalabilir, kararlar aynı kalmalı | Düşük; cache expiry veya dedup değişirse yükselir |

Öncelik: tutarlı shadow kaynağı ve doğru teşhis → conflict koruması → bootstrap/kanıt yaşam döngüsü için tasarım ve replay → kaynak seçimi → davranış eşdeğer performans çalışması. Validated moda geçiş için şu an yeterli kanıt yok. 0'ı zorla büyütmek için eşik indirmek gerekçesiz; gerçek fırsatın yanlışlıkla engellenebileceği iki mekanizma saptandı, fakat bu22 içinden doğrulanmış kaçırılmış kârlı fırsat gösterilemedi.

Tekrar üretim: node content/scripts/capture-market-audit.mjs (yeni ayrı snapshot alınır); node content/scripts/audit-market-observations.mjs (dondurulmuş snapshot okunur); node content/scripts/write-market-audit-report.mjs (rapor/probe). Snapshot üretimi yalnız docs'a yazar.
