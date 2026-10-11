# Günün Fırsatları — kanıt yaşam döngüsü düzeltmesi

Dondurulmuş journal snapshot'ında **L3:19→33, L4:0→0, doğrulanmış fırsat:0→0**. 14 seri ilk kez L3'e, toplam 17 taraf ilk kez taze/kabul edilmiş/kullanılabilir referansa ulaştı. 173 seride belirsiz yerel kayıt yerine gerçek kaynak zamanına sahip AODP seçildi. 684 serinin referansı değişti; her değişim bir iyileşme veya fırsat sayılmaz.

Validated modu etkinleştirilmedi, güven eşikleri düşürülmedi, üretim migration çalıştırılmadı. Üretim arşivlerine yazılmadı; UI değiştirilmedi; test gözlemleri yalnız geçici test dizinlerinde kullanıldı.

## Karşılaştırmanın temeli

Önceki audit raporunun tamamı ve ilk 20 zaman çizelgesi incelendi. Aynı snapshot.json.gz ve aynı 15:24:07.570 UTC/18:24:07.570 İstanbul asOf, checkpoint 24 + journal 25–775 kullanıldı. Orijinal 22 eski aday yeniden aynı şekilde üretildi. Önceki journal karşılaştırması baseline olarak korundu; yeni replay üretim constructor'ını çalıştırmadan bellekte yapıldı.

Kaynak hash'leri ../market-observation-audit/snapshot-manifest.json içinde. Ham snapshot ve önceki rapor değiştirilmedi. Yeni çıktılar bu dizinde. Eski motorun journal aday sayısı her iki durumda 766: veri kapsamı/legacy saat temsilcisi sabit kaldı.

## Yapılan düzeltmeler

1. **Kaynak seçimi:** kaynak ismine göre sabit öncelik yok. Bilinen gerçek kaynak zamanı, reported-top/complete kapsamı ve geçerli kimlik/zaman/fiyat aranır; uygun adaylar arasında en yeni piyasa gözlemi seçilir. Belirsiz receipt zamanı veya partial kapsam, geçerli AODP'yi gölgelemez. Daha yeni gerçek quarantined/pending olay ise eski accepted fiyatın arkasına saklanmaz. Tazelik seçilen kaynak zamanı üzerinden korunur. Sadece sourceTimeKnown bayrağı + receipt timestamp'i yeterli değildir.

2. **Çelişki ve dedup:** aynı gerçek timestamp/seri veya ortak evidenceId farklı kaynak/kimlik adıyla çoğaltılsa da bir kanıt olur. Çelişkili fiyatın karantinası tekrar 1000→2000→1000 ile silinmez; checkpoint/restart testi de bunu doğrular. Kapsamı belirsiz fiyat, aynı timestamp'e denk geldi diye güvenilir piyasa-top kanıtını karantinaya sokamaz. Kaynak kararlarında source-conflict, source-ineligible, source-older, source-invalid nedenleri ve seçilen observationId korunur.

3. **Referans yaşam döngüsü:** ilk fiyat olgun rejim sayılmaz. Yeni fiyat seviyesi yalnız değişmeyen hareket doğrulamasıyla admitted havuzuna girer. Onaylanan önceki tanıklar sonraki referanslara katılır; onaylama anının referansı işlemden önceki havuzdan alınır. Tek güncel fiyat veya onun henüz onaylanmamış öncülleri kendi referansını doğrulamaz. Seviye sayacı, medyan ve stabilite bu kabul edilmiş kanıtlardan hesaplanır.

4. **Rejim:** bootstrap ile olgun rejim geçişi ayrıldı. İlk bağımsız/stabil L3 referansın oluşması bootstrap kaydıdır; 24 gözlem/72 saat şartını karşılayan kalıcı hareket olgun regime geçişidir. Yukarı/aşağı aynı akıştan geçer. Geçişler from/to/at/evidence ile korunur ve sonraki gözleme uygulanır. Olgun rejimde hareket sürerken eski karşılaştırma çıpası korunur; tek uç fiyat yeni rejim olamaz.

5. **Kurtarma/toplayıcı:** journal'daki current olaylarında aynı fetch saatinde farklı gerçek sourceQuoteAt'a sahip gözlemler artık evidenceObservations olarak tutulur. Legacy ilk-saat temsilcisi aynen kalır; validated hesaplama ek bağımsız kanıtları da görür. Kaynak zamanı ilerlemeyen yeniden poll sayacı artırmaz. Kayıtlar gelecekte normal checkpoint'te korunabilir; mevcut üretim arşivi dönüştürülmedi. Restore ek kanıtların kimlik/fiyat/zaman/bucket tutarlılığını doğrular, bozuk ek veri fail-closed olur. AODP toplayıcı reported-top kapsamını açık kaydeder ve supplementalObservations sayar. Yerel hub geçmiş fiyatını sadece yeni gelen partial batch'ten üretir; cache'de kalmış eski ucuz emir yeni gözlem diye eklenmez. Yerel kapsam partial ve kaynak zamanı bilinmiyor olarak kalır.

6. **Performans:** yeniden kullanılan raw nesnelerin normalizasyon metadata'sı güvenlik alanları ve asOf ile cache'lenir; mutable validasyon durumları ayrı kopyadır. Sayısal timestamp tekrar kullanılır; processedAt her noktada yeniden ISO üretmez. Ara filter/map/quotedAt kopyaları validated akıştan kaldırıldı. Medyan sıralı fiyat listesinde tutulur. Seri revizyonu, live metadata ve zaman sınırları önbelleği geçersiz kılar. Büyük snapshot'ta 6.000 kayıt sonrası tüm summary cache'ini silmek yerine ayrı, sınırlı 32.768 summary cache kullanılır. Bu bellek limiti güven eşiği değildir. Eski policy alanlarının tamamı testle aynı kaldı.

## Önce/sonra sayılar

| Ölçüm | Önce | Sonra |
|---|---:|---:|
| Gerçek taraf serisi | 25.210 | 25.210 |
| L3 | 19 | 33 |
| L4 | 0 | 0 |
| Taze, accepted ve L3+ | 14 | 31 |
| Hareket adayı | 853 | 824 |
| Doğrulanmış fırsat | 0 | 0 |
| İlk 22: referans kapısı | 21 | 20 |
| İlk 22: işlem kapısı | 18 | 11 |
| İlk 22: tazelik kapısı | 0 | 1 |
| İlk 22: karantina kapısı | 1 | 3 |
| İlk 22: diğer/strateji | 0 | 2 |
| İlk 22: birden fazla engel | 17 | 11 |

Sonra kombinasyonlar: other: 2; reference: 9; reference+execution: 7; reference+execution+quarantine: 3; reference+execution+freshness: 1. Kapılar örtüşür; sütunlar toplanmaz. Kaynak düzeltmesi, geçmişte gölgelenmiş stale/quarantined AODP'yi görünür kıldığı için bazı engeller artmıştır; bunlar güveni yapay olarak yükseltmemek için korunur.

**Kök neden ayrımı:** sadece algoritma/kaynak seçimi düzeltmesiyle ve ek journal kanıtlarını devre dışı bırakan ablation replay'inde L3 **24**. Tam replay'de 33. Böylece net 5 L3 artışı referans/kanıt yaşam döngüsü düzeltmesinden, net 9 ek artış gerçek arşiv kanıtlarını erişilebilir kılmaktan gelir. Ablation güven eşiği değiştirmez ve üretime uygulanan bir mod değildir.

**Rejim kayıtları:** gerçek snapshot'ta 0 olgun regime geçişi,47 bootstrap kuruluşu var. Bootstrap kayıtlarının bir kısmı sonradan stabilitesini kaybetmiş veya güncel gözlem dışlanınca L3 altında kalmıştır; 47'yi güncel doğrulanmış seri sayısı diye sunmuyorum. 24/72 eşiğini düşürerek geçiş üretilmedi. Symmetric olgun geçiş ve tekil uç-fiyat koruması ayrı testlerle geçti.

## Kurtarılabilen veri ve kaynak kapsamı

Mevcut journal'dan **896 seride 1525** ek gerçek, bağımsız kaynak zamanlı AODP olayına erişildi. Bunların kronolojik sonuçları: accepted: 1389, provisional: 88, quarantined: 48. Yalnız arşivde zaten mevcut sourceQuoteAt/fetchedAt/kimlik kullanıldı; sales-history ortalamaları Buy/Sell kanıtına dönüştürülmedi. Kayıp journal veya bilinmeyen eski yerel zaman/kapsam kurtarılmış gibi gösterilmedi.

| Kaynak | Tekilleştirilmiş olay | Accepted | Provisional | Quarantined | Rejected |
|---|---:|---:|---:|---:|---:|
| market-order-packets | 1808 | 0 | 1808 | 0 | 0 |
| aodp-current | 38487 | 36437 | 1700 | 350 | 0 |

Accepted toplamı güçlü referans sayısı değildir; ilk normal fiyat da accepted olabilir. AODP kendi Buy/Sell top alanını, gerçek kaynak zamanını ve doğru kimliği verdiğinde yapısal kanıt üretir; hareket/referans/stabilite kapıları ayrıca geçilir. Mevcut yerel upload/NATS protokolü tamamlanma/çıkarma kanıtı ve gerçek piyasa gözlem zamanı vermediği için işlem kanıtı üretemiyor. Kısmi defter asla complete yapılmadı.

## Önceden engellenmiş, şimdi güvenilir referansa ulaşan 14 seri

Bunlar yeni fırsatlar değildir; referans kapısı düzelen gerçek kayıtlardır. Her satırın altında kullanılan tüm önceki kanıtların kaynak zamanı, alım zamanı ve fiyatı listelenir. Güncel gözlem referans kanıtı listesinde yoktur.

| Seri | Önce ref / sayı / L | Sonra ref / sayı / saat / stabilite / L | Güncel fiyat / zaman / E | Ek journal kanıtı |
|---|---|---|---|---:|
| europe|T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|1|buy | 159.287 / 8 / L2 | 159.286 / 13 / 25,92 / %100 / L3 | 159.296 / 2026-10-10T13:55:00.000Z / 1 | 5 |
| europe|T5_CABBAGE|Brecilien|1|sell | 690 / 1 / L1 | 483 / 14 / 66,5 / %92,86 / L3 | 468 / 2026-10-10T14:50:00.000Z / 1 | 0 |
| europe|T4_LEATHER|Martlock|1|sell | 317,5 / 10 / L1 | 311,5 / 14 / 66,67 / %85,71 / L3 | 308 / 2026-10-10T14:35:00.000Z / 1 | 4 |
| europe|T3_LEATHER|Martlock|1|sell | 215 / 11 / L2 | 215 / 12 / 65,75 / %83,33 / L3 | 212 / 2026-10-10T13:40:00.000Z / 1 | 1 |
| europe|T8_LEATHER|Martlock|1|sell | 36.985 / 9 / L2 | 36.983 / 13 / 71,25 / %100 / L3 | 36.933 / 2026-10-10T14:40:00.000Z / 1 | 4 |
| europe|T5_MOUNT_HORSE|Brecilien|1|buy | 55.140 / 1 / L1 | 46.350 / 22 / 66,17 / %95,45 / L3 | 46.372 / 2026-10-10T15:05:00.000Z / 1 | 8 |
| europe|T4_MOUNT_HORSE|Brecilien|1|buy | 25.599 / 1 / L1 | 18.172 / 18 / 66,83 / %94,44 / L3 | 18.188 / 2026-10-10T14:55:00.000Z / 1 | 7 |
| europe|T4_MOUNT_HORSE|Brecilien|1|sell | 36.562 / 10 / L2 | 35.493 / 17 / 65,17 / %88,24 / L3 | 37.956 / 2026-10-10T15:00:00.000Z / 1 | 5 |
| europe|T4_MOUNT_HORSE|Caerleon|1|sell | 31.925 / 1 / L1 | 29.969 / 12 / 63,08 / %91,67 / L3 | 29.999 / 2026-10-10T11:00:00.000Z / 1 | 0 |
| europe|T5_MOUNT_ARMORED_HORSE|Brecilien|1|buy | 54.875 / 1 / L1 | 72.028 / 17 / 79,83 / %94,12 / L3 | 72.041 / 2026-10-10T14:00:00.000Z / 1 | 8 |
| europe|T5_MOUNT_ARMORED_HORSE|Brecilien|1|sell | 87.244 / 9 / L2 | 87.238 / 16 / 69,67 / %100 / L3 | 86.997 / 2026-10-10T13:55:00.000Z / 1 | 7 |
| europe|T5_MOUNT_COUGAR_KEEPER@1|Brecilien|1|buy | 52.712 / 11 / L2 | 52.771,5 / 18 / 66,08 / %100 / L3 | 52.793 / 2026-10-10T14:00:00.000Z / 1 | 7 |
| europe|T5_MOUNT_DIREBOAR_FW_LYMHURST|Brecilien|1|sell | 260.000 / 1 / L1 | 299.496 / 12 / 66,42 / %91,67 / L3 | 294.999 / 2026-10-10T14:00:00.000Z / 1 | 4 |
| europe|T5_MOUNT_SWAMPDRAGON_FW_THETFORD|Brecilien|1|sell | 354.468,5 / 8 / L2 | 354.469 / 13 / 66,42 / %100 / L3 | 354.466 / 2026-10-10T14:00:00.000Z / 1 | 5 |

### europe|T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|1|buy

Önce L2 / ref 159.287; şimdi L3 / ref 159.286. 13 bağımsız önceki tanık, 25,92 saat, stabilite%100. Güncel: 2026-10-10T13:55:00.000Z, fiyat 159.296; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 159.299 | 2026-10-09T11:25:00.000Z | 2026-10-09T11:39:21.716Z | aodp-current / reported-top |
| 159.301 | 2026-10-09T12:35:00.000Z | 2026-10-09T12:39:22.506Z | aodp-current / reported-top |
| 159.300 | 2026-10-09T16:10:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 159.283 | 2026-10-10T09:30:00.000Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 159.284 | 2026-10-10T09:50:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 159.284 | 2026-10-10T10:10:00Z | 2026-10-10T10:18:18.747Z | aodp-current / reported-top |
| 159.284 | 2026-10-10T10:30:00Z | 2026-10-10T10:35:28.774Z | aodp-current / reported-top |
| 159.284 | 2026-10-10T10:40:00Z | 2026-10-10T10:45:39.984Z | aodp-current / reported-top |
| 159.286 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 159.286 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:15.338Z | aodp-current / reported-top |
| 159.286 | 2026-10-10T12:20:00.000Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 159.288 | 2026-10-10T13:00:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 159.288 | 2026-10-10T13:20:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |

### europe|T5_CABBAGE|Brecilien|1|sell

Önce L1 / ref 690; şimdi L3 / ref 483. 14 bağımsız önceki tanık, 66,5 saat, stabilite%92,86. Güncel: 2026-10-10T14:50:00.000Z, fiyat 468; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 690 | 2026-10-07T19:35:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 500 | 2026-10-08T19:55:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 498 | 2026-10-08T21:05:00.000Z | 2026-10-08T22:00:11.938Z | aodp-current / reported-top |
| 495 | 2026-10-09T07:15:00.000Z | 2026-10-09T07:25:18.020Z | aodp-current / reported-top |
| 492 | 2026-10-09T09:45:00.000Z | 2026-10-09T10:39:19.831Z | aodp-current / reported-top |
| 490 | 2026-10-09T11:15:00.000Z | 2026-10-09T11:39:21.716Z | aodp-current / reported-top |
| 482 | 2026-10-09T19:30:00.000Z | 2026-10-09T19:39:33.310Z | aodp-current / reported-top |
| 484 | 2026-10-09T20:30:00.000Z | 2026-10-09T20:39:35.136Z | aodp-current / reported-top |
| 482 | 2026-10-09T21:05:00.000Z | 2026-10-09T21:39:36.919Z | aodp-current / reported-top |
| 470 | 2026-10-10T07:30:00.000Z | 2026-10-10T07:46:40.256Z | aodp-current / reported-top |
| 478 | 2026-10-10T09:15:00.000Z | 2026-10-10T09:28:05.827Z | aodp-current / reported-top |
| 475 | 2026-10-10T09:55:00.000Z | 2026-10-10T10:01:10.311Z | aodp-current / reported-top |
| 469 | 2026-10-10T12:45:00.000Z | 2026-10-10T12:58:40.672Z | aodp-current / reported-top |
| 468 | 2026-10-10T14:05:00.000Z | 2026-10-10T14:21:44.255Z | aodp-current / reported-top |

### europe|T4_LEATHER|Martlock|1|sell

Önce L1 / ref 317,5; şimdi L3 / ref 311,5. 14 bağımsız önceki tanık, 66,67 saat, stabilite%85,71. Güncel: 2026-10-10T14:35:00.000Z, fiyat 308; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 334 | 2026-10-07T19:00:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 344 | 2026-10-08T20:20:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 322 | 2026-10-09T05:15:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 324 | 2026-10-09T09:15:00.000Z | 2026-10-09T09:25:19.831Z | aodp-current / reported-top |
| 316 | 2026-10-09T11:35:00.000Z | 2026-10-09T11:39:21.716Z | aodp-current / reported-top |
| 319 | 2026-10-09T12:40:00.000Z | 2026-10-09T13:39:24.379Z | aodp-current / reported-top |
| 311 | 2026-10-10T09:40:00.000Z | 2026-10-10T09:44:22.887Z | aodp-current / reported-top |
| 309 | 2026-10-10T10:55:00.000Z | 2026-10-10T11:01:48.255Z | aodp-current / reported-top |
| 299 | 2026-10-10T11:25:00Z | 2026-10-10T11:35:12.156Z | aodp-current / reported-top |
| 297 | 2026-10-10T11:50:00Z | 2026-10-10T11:51:52.170Z | aodp-current / reported-top |
| 299 | 2026-10-10T12:10:00.000Z | 2026-10-10T12:25:14.530Z | aodp-current / reported-top |
| 300 | 2026-10-10T12:35:00Z | 2026-10-10T12:41:56.117Z | aodp-current / reported-top |
| 312 | 2026-10-10T13:15:00.000Z | 2026-10-10T13:31:54.296Z | aodp-current / reported-top |
| 305 | 2026-10-10T13:40:00Z | 2026-10-10T13:48:27.155Z | aodp-current / reported-top |

### europe|T3_LEATHER|Martlock|1|sell

Önce L2 / ref 215; şimdi L3 / ref 215. 12 bağımsız önceki tanık, 65,75 saat, stabilite%83,33. Güncel: 2026-10-10T13:40:00.000Z, fiyat 212; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 226 | 2026-10-07T18:50:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 225 | 2026-10-08T15:35:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 228 | 2026-10-09T05:15:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 216 | 2026-10-09T10:15:00.000Z | 2026-10-09T10:39:19.831Z | aodp-current / reported-top |
| 210 | 2026-10-09T19:45:00.000Z | 2026-10-09T20:39:35.136Z | aodp-current / reported-top |
| 211 | 2026-10-10T00:25:00.000Z | 2026-10-10T00:39:41.518Z | aodp-current / reported-top |
| 217 | 2026-10-10T00:45:00.000Z | 2026-10-10T01:39:42.313Z | aodp-current / reported-top |
| 215 | 2026-10-10T07:15:00.000Z | 2026-10-10T07:46:40.256Z | aodp-current / reported-top |
| 210 | 2026-10-10T09:40:00.000Z | 2026-10-10T09:44:18.069Z | aodp-current / reported-top |
| 213 | 2026-10-10T11:25:00.000Z | 2026-10-10T11:35:09.042Z | aodp-current / reported-top |
| 215 | 2026-10-10T11:50:00Z | 2026-10-10T11:51:49.029Z | aodp-current / reported-top |
| 215 | 2026-10-10T12:35:00.000Z | 2026-10-10T12:41:51.343Z | aodp-current / reported-top |

### europe|T8_LEATHER|Martlock|1|sell

Önce L2 / ref 36.985; şimdi L3 / ref 36.983. 13 bağımsız önceki tanık, 71,25 saat, stabilite%100. Güncel: 2026-10-10T14:40:00.000Z, fiyat 36.933; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 37.118 | 2026-10-07T15:20:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 36.988 | 2026-10-08T18:50:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 36.949 | 2026-10-09T04:35:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 36.983 | 2026-10-09T09:15:00.000Z | 2026-10-09T09:25:19.831Z | aodp-current / reported-top |
| 36.985 | 2026-10-09T09:45:00.000Z | 2026-10-09T10:39:19.831Z | aodp-current / reported-top |
| 36.983 | 2026-10-09T11:35:00.000Z | 2026-10-09T11:39:21.716Z | aodp-current / reported-top |
| 37.118 | 2026-10-10T11:10:00.000Z | 2026-10-10T11:18:38.231Z | aodp-current / reported-top |
| 36.936 | 2026-10-10T11:25:00Z | 2026-10-10T11:35:21.654Z | aodp-current / reported-top |
| 36.936 | 2026-10-10T11:40:00Z | 2026-10-10T11:52:12.415Z | aodp-current / reported-top |
| 37.118 | 2026-10-10T13:10:00.000Z | 2026-10-10T13:15:45.172Z | aodp-current / reported-top |
| 36.934 | 2026-10-10T13:30:00Z | 2026-10-10T13:32:27.998Z | aodp-current / reported-top |
| 36.900 | 2026-10-10T14:00:00.000Z | 2026-10-10T14:05:43.686Z | aodp-current / reported-top |
| 37.118 | 2026-10-10T14:35:00Z | 2026-10-10T14:38:56.846Z | aodp-current / reported-top |

### europe|T5_MOUNT_HORSE|Brecilien|1|buy

Önce L1 / ref 55.140; şimdi L3 / ref 46.350. 22 bağımsız önceki tanık, 66,17 saat, stabilite%95,45. Güncel: 2026-10-10T15:05:00.000Z, fiyat 46.372; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 55.140 | 2026-10-07T19:50:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 48.027 | 2026-10-08T20:45:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 48.009 | 2026-10-08T22:35:00.000Z | 2026-10-08T23:00:12.857Z | aodp-current / reported-top |
| 46.211 | 2026-10-09T06:15:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 46.212 | 2026-10-09T07:05:00.000Z | 2026-10-09T07:25:18.020Z | aodp-current / reported-top |
| 46.306 | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 46.336 | 2026-10-10T07:30:00.000Z | 2026-10-10T07:46:40.256Z | aodp-current / reported-top |
| 46.336 | 2026-10-10T08:00:00.000Z | 2026-10-10T08:22:54.958Z | aodp-current / reported-top |
| 46.340 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 46.339 | 2026-10-10T09:25:00Z | 2026-10-10T09:28:10.353Z | aodp-current / reported-top |
| 46.341 | 2026-10-10T09:55:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 46.342 | 2026-10-10T10:15:00Z | 2026-10-10T10:19:22.822Z | aodp-current / reported-top |
| 46.348 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 46.350 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:15.338Z | aodp-current / reported-top |
| 46.350 | 2026-10-10T11:35:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 46.351 | 2026-10-10T12:00:00.000Z | 2026-10-10T12:08:36.882Z | aodp-current / reported-top |
| 46.353 | 2026-10-10T12:20:00Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 46.357 | 2026-10-10T12:55:00Z | 2026-10-10T12:58:42.315Z | aodp-current / reported-top |
| 46.359 | 2026-10-10T13:00:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 46.362 | 2026-10-10T13:20:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |
| 46.362 | 2026-10-10T13:35:00Z | 2026-10-10T13:48:35.273Z | aodp-current / reported-top |
| 46.368 | 2026-10-10T14:00:00.000Z | 2026-10-10T14:05:11.191Z | aodp-current / reported-top |

### europe|T4_MOUNT_HORSE|Brecilien|1|buy

Önce L1 / ref 25.599; şimdi L3 / ref 18.172. 18 bağımsız önceki tanık, 66,83 saat, stabilite%94,44. Güncel: 2026-10-10T14:55:00.000Z, fiyat 18.188; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 25.599 | 2026-10-07T19:10:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 18.009 | 2026-10-08T19:20:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 18.011 | 2026-10-08T21:10:00.000Z | 2026-10-08T22:00:11.938Z | aodp-current / reported-top |
| 18.102 | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 18.100 | 2026-10-09T18:55:00.000Z | 2026-10-09T19:39:33.310Z | aodp-current / reported-top |
| 18.145 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:16:45.180Z | aodp-current / reported-top |
| 18.144 | 2026-10-10T09:25:00Z | 2026-10-10T09:27:53.827Z | aodp-current / reported-top |
| 18.168 | 2026-10-10T09:55:00.000Z | 2026-10-10T10:01:05.607Z | aodp-current / reported-top |
| 18.168 | 2026-10-10T10:10:00Z | 2026-10-10T10:18:18.747Z | aodp-current / reported-top |
| 18.172 | 2026-10-10T11:15:00.000Z | 2026-10-10T11:18:31.984Z | aodp-current / reported-top |
| 18.172 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:12.156Z | aodp-current / reported-top |
| 18.173 | 2026-10-10T11:40:00Z | 2026-10-10T11:51:53.779Z | aodp-current / reported-top |
| 18.174 | 2026-10-10T12:00:00.000Z | 2026-10-10T12:08:33.664Z | aodp-current / reported-top |
| 18.173 | 2026-10-10T12:15:00Z | 2026-10-10T12:25:14.530Z | aodp-current / reported-top |
| 18.180 | 2026-10-10T12:55:00.000Z | 2026-10-10T13:15:20.379Z | aodp-current / reported-top |
| 18.182 | 2026-10-10T13:25:00Z | 2026-10-10T13:31:54.296Z | aodp-current / reported-top |
| 18.182 | 2026-10-10T13:45:00Z | 2026-10-10T13:48:28.716Z | aodp-current / reported-top |
| 18.185 | 2026-10-10T14:00:00.000Z | 2026-10-10T14:05:04.971Z | aodp-current / reported-top |

### europe|T4_MOUNT_HORSE|Brecilien|1|sell

Önce L2 / ref 36.562; şimdi L3 / ref 35.493. 17 bağımsız önceki tanık, 65,17 saat, stabilite%88,24. Güncel: 2026-10-10T15:00:00.000Z, fiyat 37.956; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 37.952 | 2026-10-07T19:45:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 37.957 | 2026-10-08T19:45:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 34.954 | 2026-10-08T21:10:00.000Z | 2026-10-08T22:00:11.938Z | aodp-current / reported-top |
| 35.951 | 2026-10-09T02:20:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 35.318 | 2026-10-09T12:05:00.000Z | 2026-10-09T12:39:22.506Z | aodp-current / reported-top |
| 35.320 | 2026-10-09T13:00:00.000Z | 2026-10-09T13:39:24.379Z | aodp-current / reported-top |
| 35.319 | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 35.000 | 2026-10-09T18:55:00.000Z | 2026-10-09T19:39:33.310Z | aodp-current / reported-top |
| 36.356 | 2026-10-10T08:30:00.000Z | 2026-10-10T08:50:34.818Z | aodp-current / reported-top |
| 36.458 | 2026-10-10T09:25:00.000Z | 2026-10-10T09:27:53.827Z | aodp-current / reported-top |
| 35.492 | 2026-10-10T09:55:00.000Z | 2026-10-10T10:01:05.607Z | aodp-current / reported-top |
| 35.483 | 2026-10-10T10:10:00Z | 2026-10-10T10:18:18.747Z | aodp-current / reported-top |
| 35.493 | 2026-10-10T11:15:00.000Z | 2026-10-10T11:18:31.984Z | aodp-current / reported-top |
| 35.493 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:12.156Z | aodp-current / reported-top |
| 35.879 | 2026-10-10T11:40:00Z | 2026-10-10T11:51:53.779Z | aodp-current / reported-top |
| 36.562 | 2026-10-10T12:15:00.000Z | 2026-10-10T12:25:14.530Z | aodp-current / reported-top |
| 36.562 | 2026-10-10T12:55:00.000Z | 2026-10-10T13:15:20.379Z | aodp-current / reported-top |

### europe|T4_MOUNT_HORSE|Caerleon|1|sell

Önce L1 / ref 31.925; şimdi L3 / ref 29.969. 12 bağımsız önceki tanık, 63,08 saat, stabilite%91,67. Güncel: 2026-10-10T11:00:00.000Z, fiyat 29.999; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 31.925 | 2026-10-07T17:25:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 29.959 | 2026-10-08T18:25:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 29.985 | 2026-10-08T21:10:00.000Z | 2026-10-08T22:00:11.938Z | aodp-current / reported-top |
| 29.979 | 2026-10-09T02:00:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 29.469 | 2026-10-09T07:05:00.000Z | 2026-10-09T07:25:18.020Z | aodp-current / reported-top |
| 29.980 | 2026-10-09T12:15:00.000Z | 2026-10-09T12:39:22.506Z | aodp-current / reported-top |
| 29.469 | 2026-10-09T13:25:00.000Z | 2026-10-09T13:39:24.379Z | aodp-current / reported-top |
| 29.469 | 2026-10-09T21:25:00.000Z | 2026-10-09T21:39:36.919Z | aodp-current / reported-top |
| 29.469 | 2026-10-09T22:30:00.000Z | 2026-10-09T22:39:38.843Z | aodp-current / reported-top |
| 29.995 | 2026-10-09T23:00:00.000Z | 2026-10-09T23:39:40.664Z | aodp-current / reported-top |
| 29.992 | 2026-10-10T00:20:00.000Z | 2026-10-10T00:39:41.518Z | aodp-current / reported-top |
| 29.469 | 2026-10-10T08:30:00.000Z | 2026-10-10T08:50:34.818Z | aodp-current / reported-top |

### europe|T5_MOUNT_ARMORED_HORSE|Brecilien|1|buy

Önce L1 / ref 54.875; şimdi L3 / ref 72.028. 17 bağımsız önceki tanık, 79,83 saat, stabilite%94,12. Güncel: 2026-10-10T14:00:00.000Z, fiyat 72.041; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 54.875 | 2026-10-07T05:45:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 71.259 | 2026-10-08T19:45:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 72.008 | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 72.011 | 2026-10-10T08:00:00.000Z | 2026-10-10T08:22:54.958Z | aodp-current / reported-top |
| 72.025 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 72.025 | 2026-10-10T09:25:00Z | 2026-10-10T09:28:10.353Z | aodp-current / reported-top |
| 72.025 | 2026-10-10T09:35:00Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 72.026 | 2026-10-10T09:45:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 72.028 | 2026-10-10T10:10:00Z | 2026-10-10T10:18:18.747Z | aodp-current / reported-top |
| 72.033 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 72.033 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:15.338Z | aodp-current / reported-top |
| 72.033 | 2026-10-10T11:35:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 72.033 | 2026-10-10T12:00:00.000Z | 2026-10-10T12:08:36.882Z | aodp-current / reported-top |
| 72.035 | 2026-10-10T12:20:00Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 72.037 | 2026-10-10T13:05:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 72.036 | 2026-10-10T13:30:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |
| 72.037 | 2026-10-10T13:35:00Z | 2026-10-10T13:48:35.273Z | aodp-current / reported-top |

### europe|T5_MOUNT_ARMORED_HORSE|Brecilien|1|sell

Önce L2 / ref 87.244; şimdi L3 / ref 87.238. 16 bağımsız önceki tanık, 69,67 saat, stabilite%100. Güncel: 2026-10-10T13:55:00.000Z, fiyat 86.997; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 89.852 | 2026-10-07T15:55:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 89.877 | 2026-10-09T06:40:00.000Z | 2026-10-09T07:25:18.020Z | aodp-current / reported-top |
| 87.990 | 2026-10-09T12:25:00.000Z | 2026-10-09T12:39:22.506Z | aodp-current / reported-top |
| 87.991 | 2026-10-09T16:30:00.000Z | 2026-10-09T16:39:28.848Z | aodp-current / reported-top |
| 87.244 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 87.243 | 2026-10-10T09:25:00Z | 2026-10-10T09:28:10.353Z | aodp-current / reported-top |
| 87.240 | 2026-10-10T09:40:00Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 87.238 | 2026-10-10T09:45:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 87.238 | 2026-10-10T10:10:00Z | 2026-10-10T10:18:18.747Z | aodp-current / reported-top |
| 87.228 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 87.228 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:15.338Z | aodp-current / reported-top |
| 87.225 | 2026-10-10T11:40:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 87.227 | 2026-10-10T12:15:00.000Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 87.227 | 2026-10-10T13:05:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 87.222 | 2026-10-10T13:30:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |
| 86.998 | 2026-10-10T13:35:00Z | 2026-10-10T13:48:35.273Z | aodp-current / reported-top |

### europe|T5_MOUNT_COUGAR_KEEPER@1|Brecilien|1|buy

Önce L2 / ref 52.712; şimdi L3 / ref 52.771,5. 18 bağımsız önceki tanık, 66,08 saat, stabilite%100. Güncel: 2026-10-10T14:00:00.000Z, fiyat 52.793; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 52.712 | 2026-10-07T19:15:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 52.781 | 2026-10-08T16:55:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 52.614 | 2026-10-09T02:10:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 52.621 | 2026-10-09T16:50:00.000Z | 2026-10-09T17:39:30.693Z | aodp-current / reported-top |
| 52.621 | 2026-10-09T18:10:00.000Z | 2026-10-09T18:39:32.530Z | aodp-current / reported-top |
| 52.627 | 2026-10-09T23:05:00.000Z | 2026-10-09T23:39:40.664Z | aodp-current / reported-top |
| 52.630 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 52.770 | 2026-10-10T09:35:00Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 52.771 | 2026-10-10T09:50:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 52.771 | 2026-10-10T10:10:00Z | 2026-10-10T10:17:56.071Z | aodp-current / reported-top |
| 52.773 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 52.773 | 2026-10-10T11:20:00Z | 2026-10-10T11:35:15.338Z | aodp-current / reported-top |
| 52.773 | 2026-10-10T11:45:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 52.772 | 2026-10-10T12:00:00.000Z | 2026-10-10T12:08:36.882Z | aodp-current / reported-top |
| 52.773 | 2026-10-10T12:20:00Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 52.774 | 2026-10-10T12:55:00Z | 2026-10-10T12:58:42.315Z | aodp-current / reported-top |
| 52.790 | 2026-10-10T13:05:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 52.791 | 2026-10-10T13:20:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |

### europe|T5_MOUNT_DIREBOAR_FW_LYMHURST|Brecilien|1|sell

Önce L1 / ref 260.000; şimdi L3 / ref 299.496. 12 bağımsız önceki tanık, 66,42 saat, stabilite%91,67. Güncel: 2026-10-10T14:00:00.000Z, fiyat 294.999; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 260.000 | 2026-10-07T19:05:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 289.988 | 2026-10-08T10:55:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 293.999 | 2026-10-09T17:50:00.000Z | 2026-10-09T18:39:32.530Z | aodp-current / reported-top |
| 288.884 | 2026-10-10T03:40:00.000Z | 2026-10-10T07:46:40.256Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T09:25:00Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T09:50:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T11:05:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T11:40:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 299.496 | 2026-10-10T12:20:00.000Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 299.497 | 2026-10-10T13:00:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 299.970 | 2026-10-10T13:30:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |

### europe|T5_MOUNT_SWAMPDRAGON_FW_THETFORD|Brecilien|1|sell

Önce L2 / ref 354.468,5; şimdi L3 / ref 354.469. 13 bağımsız önceki tanık, 66,42 saat, stabilite%100. Güncel: 2026-10-10T14:00:00.000Z, fiyat 354.466; E1.

| Fiyat | Kaynak gözlem zamanı UTC | Fetch/alım UTC | Kaynak/kapsam |
|---:|---|---|---|
| 343.463 | 2026-10-07T19:15:00.000Z | 2026-10-07T20:23:56.217Z | aodp-current / reported-top |
| 343.994 | 2026-10-08T10:55:00.000Z | 2026-10-08T21:00:08.727Z | aodp-current / reported-top |
| 344.485 | 2026-10-09T05:05:00.000Z | 2026-10-09T06:25:17.135Z | aodp-current / reported-top |
| 354.470 | 2026-10-10T09:05:00.000Z | 2026-10-10T09:17:01.894Z | aodp-current / reported-top |
| 354.466 | 2026-10-10T09:30:00Z | 2026-10-10T09:44:30.895Z | aodp-current / reported-top |
| 354.469 | 2026-10-10T09:50:00.000Z | 2026-10-10T10:01:13.434Z | aodp-current / reported-top |
| 354.469 | 2026-10-10T10:15:00Z | 2026-10-10T10:19:22.822Z | aodp-current / reported-top |
| 354.468 | 2026-10-10T11:10:00.000Z | 2026-10-10T11:18:33.536Z | aodp-current / reported-top |
| 354.470 | 2026-10-10T11:40:00Z | 2026-10-10T11:51:56.923Z | aodp-current / reported-top |
| 354.470 | 2026-10-10T12:20:00.000Z | 2026-10-10T12:25:19.337Z | aodp-current / reported-top |
| 354.470 | 2026-10-10T13:00:00.000Z | 2026-10-10T13:15:25.120Z | aodp-current / reported-top |
| 354.474 | 2026-10-10T13:20:00Z | 2026-10-10T13:32:02.125Z | aodp-current / reported-top |
| 354.474 | 2026-10-10T13:40:00Z | 2026-10-10T13:48:35.273Z | aodp-current / reported-top |

## Kaynak seçimi düzelince ayrıca kullanılabilir hâle gelen 3 eski L3 taraf

- **europe|T8_PUMPKIN|Thetford|1|sell**: önce market-order-packets, 605, E0; sonra aodp-current, 468, 2026-10-10T14:05:00.000Z, E1, ref 480.
- **europe|T3_MOUNT_HORSE|Brecilien|1|buy**: önce market-order-packets, 13.039, E0; sonra aodp-current, 13.039, 2026-10-10T14:55:00.000Z, E1, ref 13.048,5.
- **europe|T3_MOUNT_HORSE|Brecilien|1|sell**: önce market-order-packets, 14.996, E0; sonra aodp-current, 14.996, 2026-10-10T14:55:00.000Z, E1, ref 15.158.

173 kaynak seçimi düzeltmesi ve 277 kapsamı belirsiz kaynak çelişkisi bulunan seri ayrı ölçümlerdir; her çelişki önceki motorun güncel seçimini değiştirmemiştir. Tam listeler comparison.json içindedir.

## İlk 22 aday — güncel Buy/Sell, referans ve neden kodları

Hücre biçimi: fiyat / referans / önceki gözlem sayısı / yayılım / referans seviyesi(güven) / işlem güveni. Önce sütunu eski journal snapshot değerlendirmesi, sonra aynı snapshot'ta düzeltilmiş değerlendirme.

| # / kimlik / strateji | Önce Buy | Sonra Buy | Önce Sell | Sonra Sell | Önce → sonra kapılar |
|---|---|---|---|---|---|
| 1. T8_PUMPKIN|Thetford|1 / place-sell-order | 444 / 441 / 4 / 70,58h / L1 (0,25) / E0 | 444 / 439 / 3 / 64h / L1 (0,25) / E1 | 605 / 479 / 16 / 66,25h / L3 (0,75) / E0 | 468 / 480 / 15 / 66h / L3 (0,75) / E1 | execution → other |
| 2. T8_MOUNT_RAM_FW_MARTLOCK_ELITE|Brecilien|1 / place-sell-order | 2.200.002 / 2.200.002 / 2 / 5h / L1 (0,25) / E0 | 2.200.002 / 2.200.002 / 1 / 0h / L1 (0,25) / E1 | 3.799.999 / 3.799.999 / 4 / 51,75h / L1 (0,25) / E0 | 3.799.999 / 3.449.999,5 / 4 / 46,75h / L1 (0,25) / E1 | reference+execution → reference |
| 3. T5_LEATHER|Brecilien|1 / place-buy-order | 1.001 / 1.355 / 3 / 43h / L1 (0,25) / E0 | 1.001 / 1.355 / 3 / 43h / L1 (0,25) / E0 | 1.443 / 1.451,5 / 6 / 70,33h / L2 (0,5) / E0 | 1.443 / 1.459 / 5 / 69,42h / L2 (0,5) / E1 | reference+execution → reference+execution |
| 4. T6_FARM_SHEEP_GROWN|Brecilien|1 / local-make | 8.538 / 8.538 / 4 / 73,67h / L1 (0,25) / E0 | 8.538 / 8.538 / 3 / 56,17h / L1 (0,25) / E1 | 11.997 / 9.912,5 / 2 / 50,75h / L1 (0,25) / E0 | 11.997 / 10.951,5 / 4 / 66,67h / L1 (0,25) / E1 | reference+execution → reference |
| 5. T7_CORN|Thetford|1 / place-sell-order | 456 / 457 / 4 / 45,92h / L1 (0,25) / E0 | 456 / 458 / 3 / 43h / L1 (0,25) / E1 | 481 / 479 / 8 / 66,92h / L2 (0,5) / E1 | 481 / 479 / 8 / 66,92h / L2 (0,5) / E1 | reference → reference |
| 6. T8_FARM_COW_BABY|Martlock|1 / place-sell-order | 32.284 / — / 0 / 0h / L0 (0) / E0 | 32.284 / — / 0 / 0h / L0 (0) / E0 | 49.994 / 49.994,5 / 2 / 72,75h / L1 (0,25) / E0 | 49.994 / 34.264 / 3 / 38,17h / L1 (0,25) / E1 | reference+execution → reference |
| 7. T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|1 / instant-buy-from-sell | 159.296 / 159.287 / 8 / 25,58h / L2 (0,5) / E1 | 159.296 / 159.286 / 13 / 25,92h / L3 (0,75) / E1 | 246.997 / 314.429 / 2 / 62,83h / L1 (0,25) / E1 | 246.997 / 249.999 / 15 / 87,58h / L1 (0,25) / E1 | reference → reference |
| 8. T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|2 / instant-buy-from-sell | 159.244 / — / 0 / 0h / L0 (0) / E0 | 159.244 / — / 0 / 0h / L0 (0) / E0 | 278.885 / — / 0 / 0h / L0 (0) / E0 | 278.885 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 9. T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|4 / instant-buy-from-sell | — / — / 0 / 0h / L0 (0) / E0 | — / — / 0 / 0h / L0 (0) / E0 | 278.884 / — / 0 / 0h / L0 (0) / E0 | 278.884 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 10. T6_MOUNT_DIREWOLF|Brecilien|1 / local-make | 390.023 / 390.015,5 / 8 / 18,83h / L2 (0,5) / E0 | 390.023 / 390.015 / 11 / 18,08h / L2 (0,5) / E1 | 559.992 / 433.799 / 1 / 0h / L1 (0,25) / E0 | 559.992 / 559.981 / 9 / 66,75h / L2 (0,5) / E1 | reference+execution → reference |
| 11. T5_HEAD_PLATE_ROYAL@2|Fort Sterling|5 / place-sell-order | 359.000 / — / 0 / 0h / L0 (0) / E0 | 359.000 / — / 0 / 0h / L0 (0) / E0 | 466.666 / — / 0 / 0h / L0 (0) / E0 | 466.666 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 12. T5_HEAD_PLATE_ROYAL@2|Fort Sterling|4 / local-make | 211.004 / — / 0 / 0h / L0 (0) / E0 | 211.004 / — / 0 / 0h / L0 (0) / E0 | 461.928 / — / 0 / 0h / L0 (0) / E0 | 461.928 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 13. QUESTITEM_TOKEN_ROYAL_T5|Thetford|1 / instant-sell-to-buy | 54.102 / — / 0 / 0h / L0 (0) / E0 | 54.102 / — / 0 / 0h / L0 (0) / E0 | 55.500 / — / 0 / 0h / L0 (0) / E0 | 55.500 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 14. T7_FARM_PIG_GROWN|Brecilien|1 / place-buy-order | 1.122 / 8.000 / 1 / 0h / L1 (0,25) / E0 | 1.122 / 8.000 / 1 / 0h / L1 (0,25) / E0 | 9.995 / 9.997,5 / 4 / 67,75h / L1 (0,25) / E1 | 9.995 / 9.997,5 / 4 / 67,75h / L1 (0,25) / E1 | reference+execution+quarantine → reference+execution+quarantine |
| 15. T6_MEAT|Brecilien|1 / local-make | 423 / 423 / 2 / 67h / L1 (0,25) / E0 | 423 / 423 / 1 / 0h / L1 (0,25) / E1 | 789 / 471 / 2 / 24,33h / L1 (0,25) / E0 | 789 / 471 / 2 / 24,33h / L1 (0,25) / E0 | reference+execution → reference+execution+quarantine |
| 16. T5_MOUNT_HORSE|Brecilien|1 / local-make | 46.372 / 55.140 / 1 / 0h / L1 (0,25) / E1 | 46.372 / 46.350 / 22 / 66,17h / L3 (0,75) / E1 | 74.000 / 70.397,5 / 10 / 62,08h / L2 (0,5) / E0 | 74.000 / 69.999 / 20 / 66,25h / L1 (0,25) / E1 | reference+execution → reference |
| 17. T4_MOUNT_HORSE|Brecilien|1 / local-make | 18.187 / 25.599 / 1 / 0h / L1 (0,25) / E0 | 18.188 / 18.172 / 18 / 66,83h / L3 (0,75) / E1 | 37.956 / 36.562 / 10 / 67,25h / L2 (0,5) / E0 | 37.956 / 35.493 / 17 / 65,17h / L3 (0,75) / E1 | reference+execution → other |
| 18. T3_PLANKS|Brecilien|1 / instant-sell-to-buy | 302 / 142 / 2 / 41,25h / L1 (0,25) / E0 | 302 / 140 / 3 / 41,42h / L1 (0,25) / E0 | 438 / 245 / 1 / 0h / L1 (0,25) / E0 | 438 / 245 / 1 / 0h / L1 (0,25) / E0 | reference+execution → reference+execution+quarantine |
| 19. T4_LEATHER|Martlock|1 / place-buy-order | 262 / 315 / 7 / 53,75h / L1 (0,25) / E1 | 262 / 293,5 / 12 / 66,25h / L1 (0,25) / E1 | 308 / 317,5 / 10 / 66,25h / L1 (0,25) / E1 | 308 / 311,5 / 14 / 66,67h / L3 (0,75) / E1 | reference → reference |
| 20. T6_LABOURER_CONTRACT_MAGE|Martlock|1 / instant-buy-from-sell | 245.224 / — / 0 / 0h / L0 (0) / E0 | 245.224 / — / 0 / 0h / L0 (0) / E0 | 354.996 / 354.996 / 1 / 0h / L1 (0,25) / E0 | 354.996 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution+freshness |
| 21. T2_JOURNAL_MAGE_EMPTY|Martlock|1 / instant-buy-from-sell | — / — / 0 / 0h / L0 (0) / E0 | — / — / 0 / 0h / L0 (0) / E0 | 494 / — / 0 / 0h / L0 (0) / E0 | 494 / — / 0 / 0h / L0 (0) / E0 | reference+execution → reference+execution |
| 22. T3_PLANKS|Martlock|1 / instant-buy-from-sell | 173 / 179 / 3 / 47h / L1 (0,25) / E1 | 173 / 179 / 3 / 47h / L1 (0,25) / E1 | 220 / 446 / 1 / 0h / L1 (0,25) / E1 | 220 / 230 / 5 / 50,42h / L2 (0,5) / E1 | reference → reference |

### Stratejinin kullandığı taraflarda önce/sonra nedenler

1. **T8_PUMPKIN|Thetford|1**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-conflict; zaman 2026-10-10T14:05:00.000Z, yaş 1,32 saat. Son kapılar: other.

2. **T8_MOUNT_RAM_FW_MARTLOCK_ELITE|Brecilien|1**: önce sell: source-time-unknown, incomplete-book → sonra sell: movement-confirmed; zaman 2026-10-10T14:30:00.000Z, yaş 0,9 saat. Son kapılar: reference.

3. **T5_LEATHER|Brecilien|1**: önce buy: source-time-unknown, incomplete-book → sonra buy: awaiting-movement, source-conflict; zaman 2026-10-10T14:25:00.000Z, yaş 0,99 saat. Son kapılar: reference, execution.

4. **T6_FARM_SHEEP_GROWN|Brecilien|1**: önce buy: source-time-unknown, incomplete-book; sell: source-time-unknown, incomplete-book → sonra buy: accepted; zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat; sell: movement-confirmed; zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat. Son kapılar: reference.

5. **T7_CORN|Thetford|1**: önce sell: accepted → sonra sell: source-conflict; zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat. Son kapılar: reference.

6. **T8_FARM_COW_BABY|Martlock|1**: önce sell: source-time-unknown, incomplete-book → sonra sell: accepted; zaman 2026-10-10T09:35:00.000Z, yaş 5,82 saat. Son kapılar: reference.

7. **T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|1**: önce sell: movement-confirmed → sonra sell: source-conflict; zaman 2026-10-10T13:55:00.000Z, yaş 1,49 saat. Son kapılar: reference.

8. **T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|2**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-time-unknown, incomplete-book; zaman 2026-10-10T10:29:54.164Z, yaş 4,9 saat. Son kapılar: reference, execution.

9. **T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|4**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-time-unknown, incomplete-book; zaman 2026-10-10T10:29:54.164Z, yaş 4,9 saat. Son kapılar: reference, execution.

10. **T6_MOUNT_DIREWOLF|Brecilien|1**: önce buy: source-time-unknown, incomplete-book; sell: source-time-unknown, incomplete-book → sonra buy: accepted; zaman 2026-10-10T14:45:00.000Z, yaş 0,65 saat; sell: movement-confirmed; zaman 2026-10-10T14:45:00.000Z, yaş 0,65 saat. Son kapılar: reference.

11. **T5_HEAD_PLATE_ROYAL@2|Fort Sterling|5**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-time-unknown, incomplete-book; zaman 2026-10-10T14:13:48.081Z, yaş 1,17 saat. Son kapılar: reference, execution.

12. **T5_HEAD_PLATE_ROYAL@2|Fort Sterling|4**: önce buy: source-time-unknown, incomplete-book; sell: source-time-unknown, incomplete-book → sonra buy: source-time-unknown, incomplete-book; zaman 2026-10-10T14:17:40.321Z, yaş 1,11 saat; sell: source-time-unknown, incomplete-book; zaman 2026-10-10T14:13:48.081Z, yaş 1,17 saat. Son kapılar: reference, execution.

13. **QUESTITEM_TOKEN_ROYAL_T5|Thetford|1**: önce buy: source-time-unknown, incomplete-book → sonra buy: source-time-unknown, incomplete-book; zaman 2026-10-10T14:09:38.226Z, yaş 1,24 saat. Son kapılar: reference, execution.

14. **T7_FARM_PIG_GROWN|Brecilien|1**: önce buy: suspicious-movement → sonra buy: suspicious-movement, source-conflict; zaman 2026-10-10T14:50:00.000Z, yaş 0,57 saat. Son kapılar: reference, execution, quarantine.

15. **T6_MEAT|Brecilien|1**: önce buy: source-time-unknown, incomplete-book; sell: source-time-unknown, incomplete-book → sonra buy: accepted; zaman 2026-10-10T14:30:00.000Z, yaş 0,9 saat; sell: suspicious-movement; zaman 2026-10-10T14:30:00.000Z, yaş 0,9 saat. Son kapılar: reference, execution, quarantine.

16. **T5_MOUNT_HORSE|Brecilien|1**: önce buy: movement-confirmed; sell: source-time-unknown, incomplete-book → sonra buy: movement-confirmed, source-conflict; zaman 2026-10-10T15:05:00.000Z, yaş 0,32 saat; sell: movement-confirmed; zaman 2026-10-10T15:00:00.000Z, yaş 0,4 saat. Son kapılar: reference.

17. **T4_MOUNT_HORSE|Brecilien|1**: önce buy: source-time-unknown, incomplete-book; sell: source-time-unknown, incomplete-book → sonra buy: movement-confirmed, source-conflict; zaman 2026-10-10T14:55:00.000Z, yaş 0,49 saat; sell: movement-confirmed, source-conflict; zaman 2026-10-10T15:00:00.000Z, yaş 0,4 saat. Son kapılar: other.

18. **T3_PLANKS|Brecilien|1**: önce buy: source-time-unknown, incomplete-book → sonra buy: suspicious-movement; zaman 2026-10-10T14:45:00.000Z, yaş 0,65 saat. Son kapılar: reference, execution, quarantine.

19. **T4_LEATHER|Martlock|1**: önce buy: movement-confirmed → sonra buy: movement-confirmed, source-conflict; zaman 2026-10-10T13:30:00.000Z, yaş 1,9 saat. Son kapılar: reference.

20. **T6_LABOURER_CONTRACT_MAGE|Martlock|1**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-conflict; zaman 2026-10-09T09:15:00.000Z, yaş 30,15 saat. Son kapılar: reference, execution, freshness.

21. **T2_JOURNAL_MAGE_EMPTY|Martlock|1**: önce sell: source-time-unknown, incomplete-book → sonra sell: source-time-unknown, incomplete-book; zaman 2026-10-10T11:01:38.334Z, yaş 4,37 saat. Son kapılar: reference, execution.

22. **T3_PLANKS|Martlock|1**: önce sell: movement-confirmed → sonra sell: movement-confirmed, source-conflict; zaman 2026-10-10T11:25:00.000Z, yaş 3,99 saat. Son kapılar: reference.

## Hâlâ 0 olmasının ayrıştırılmış nedeni

**Güvenilir 31 güncel tarafta** en büyük mutlak referans sapması **%6,94**; değişmeyen fırsat-anomali eşiği%12. Güvenilir aynı-şehir anında çevirme çiftlerinde ücret sonrası pozitif fark yok (testle assert edildi). Bu nedenle güçlü kanıt havuzunda 0 sonucu referans kilidiyle açıklanmıyor; mevcut strateji koşullarıyla açıklanıyor.

**Önemli ayrı politika bulgusu:** T3_MOUNT_HORSE Lymhurst Sell 11917 → Brecilien Buy 13039, her iki tarafta L3 ve E1. Premium vergi sonrası, taşıma öncesi fark **600,44 gümüş**. Cross-city stratejisinde kaynak veya hedef tarafın anomalous olması şartı var; iki taraf da%12 sapmayı geçmediğinden route üretilmiyor. Bu mevcut strateji politikasıdır; kaynak/referans hatası değildir ve değiştirilmedi. Emir derinliği, taşıma maliyeti ve gerçekleşme verisi olmadığından bu çıplak fiyat farkı doğrulanmış net kâr ilan edilmedi. Kanıtları comparison.json suppressedRoutes içinde.

**Geri kalan veri:** 25135 seri 12 bilinen-kapsamlı bağımsız önceki gözlemden yoksun; sayı yeterli olan 30 serinin yayılımı 24 saatten kısa. Gerekli sayı/zaman üst sınırı 45 seri; gerçek L3 sayısı 33. Üst sınırdaki kalan 12'nin kapıları aşağıda. Global-medyan stabilite taraması ile kronolojik kabul aynı algoritma değildir; sayılar eşit olsa bile kimlik kümeleri 2 seride farklıdır. Bu nedenle global stabiliteyi tek başına doğrulama saymıyorum.

| Seri | Yapısal önceki sayı / saat | Kabul edilen ref sayı / stabilite | Kalan neden |
|---|---|---|---|
| europe|T5_MOUNT_RAM_FW_MARTLOCK|Brecilien|1|sell | 17 / 87,58 | 15 / %66,67 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T4_MOUNT_HORSE|Lymhurst|1|sell | 12 / 63,5 | 11 / %100 | kabul edilmiş bağımsız tanık <12; onaysız hareketler hariç |
| europe|T4_LEATHER|Martlock|1|buy | 12 / 66,25 | 12 / %16,67 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T5_LEATHER|Martlock|1|sell | 14 / 70,75 | 14 / %71,43 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T5_MOUNT_HORSE|Brecilien|1|sell | 22 / 66,25 | 20 / %60 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T3_MOUNT_HORSE|Thetford|1|sell | 20 / 66,08 | 16 / %62,5 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T4_PLANKS|Lymhurst|1|buy | 16 / 69,92 | 14 / %71,43 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T4_PLANKS|Lymhurst|1|sell | 21 / 69,25 | 20 / %60 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T5_MOUNT_COUGAR_KEEPER@1|Brecilien|1|sell | 19 / 66,25 | 19 / %68,42 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T5_PLANKS|Lymhurst|1|sell | 12 / 64,42 | 8 / %87,5 | kabul edilmiş bağımsız tanık <12; onaysız hareketler hariç |
| europe|T6_MOUNT_HORSE|Brecilien|1|sell | 22 / 67,67 | 21 / %52,38 | kabul edilmiş rejim stabilitesi <%80 |
| europe|T7_MOUNT_HORSE|Brecilien|1|sell | 14 / 66,08 | 14 / %78,57 | kabul edilmiş rejim stabilitesi <%80 |

T4_PLANKS Lymhurst Sell ilk snapshot'ta bootstrap sorunu yaşıyordu; tam journal daha sonra farklı fiyat seviyeleri içeriyor. Şimdi referans ilk 499'a kilitli değil, ama kabul edilen tüm geçmişte stabilite%60. Bunu L3 yapmak için eşik gevşetilmedi. T4_MOUNT_HORSE Lymhurst Sell'in yapısal 12 tanığından yalnız 11'i onaylı; onaysız fiyatın salt timestamp'i yeterli değildir.

**Sınıflandırma:** düzelen hatalar = algoritma/kanıt yaşam döngüsü + gerçek journal kanıtına erişim + kaynak seçimi. Kalan engeller = veri eksikliği, yerel kaynak kapsamı, doğrulanmamış/istikrarsız hareket ve mevcut strateji/anomali politikası. İncelenen kayıtlar ve regresyonlar bu kalan engelleri açıklıyor; başka tüm olası algoritma kusurlarının bulunmadığı yönünde genel bir garanti verilmiyor. Yeni doğrulanmış fırsat oluşmadığı için ayrıca incelenecek yeni validated satır yok.

## Performans ve eşdeğerlik

| Aynı sentetik benchmark | Önce | Sonra |
|---|---:|---:|
| Cold | 21195 ms | 2980 ms |
| Warm | 90 ms | 63 ms |
| Ölçüm sonu heap | 148 MB | 43 MB |
| Doğrulanmış sentetik hücre | 1260 | 1260 |
| Listeye giren sentetik hücre | 500 | 500 |

2.520 seri ×2.160 saat benchmark'tır; sentetik hücreler gerçek piyasa fırsatı olarak kullanılmadı. Cold yaklaşık%85,94 azaldı. Heap ölçümü process.heapUsed sonucudur, peak RSS değildir. CPU profiler ayrı ölçümünde normalizeObservation self-time yaklaşık 7685→382ms, GC 2507→173ms; profilli süre 3478ms. Profil dosyası after.cpuprofile.

Gerçek 25.210 seri replay'i: validated cold 3.386ms, warm 975,99ms. Bu gerçek replay ölçümü benchmark'taki sürelerle karıştırılmamalı; yeni ek kanıtlar da işleniyor.

Fonksiyonel algoritmanın optimizasyon öncesi saklanan kaynak kodu ile optimize edilmiş algoritma **aynı nihai kanıt dizileri üzerinde 25.210 serinin tamamında** fiyat/reference/samples/span/stability/level/status/reasons/sourceDecisions/referenceEvidence/transitions/usable alanlarında aynı. İlk 22 aday ve verifiedRows da birebir aynı. Nihai replay'de cold/warm evaluation tam eşitliği ayrıca assert edildi. Journal kurtarmanın son kontrolünde saatler arası geçmiş fiyat düzeltmeleri de korundu; bu doğruluk değişikliği ara functional replay'in bazı zayıf referanslarını değiştirdi. Optimizasyon testi bu veri farkını ayırmak için iki algoritmayı aynı nihai kanıt dizileri üzerinde çalıştırır (optimization-equivalence.json). Önceki hatalı motor ile kararların aynı olması beklenmez; eşdeğerlik yalnız performans değişikliklerini izole eder.

## Doğrulama ve tekrar üretim

Geçen kontroller: opportunities regresyonu, opportunity-status,12 observation reliability grubu (migration idempotence/backup/rollback/restart/corruption dahil),8 yeni evidence lifecycle grubu (gerçek audit timeline dahil), market-order-history/hub ingest/persistence,12 AODP collector grubu, market collection ve performans. Üretim migration komutu çağrılmadı; migration/rollback yalnız geçici fixture arşivinde test edildi.

Komutlar:

```powershell
npm run opportunities:test
node content/scripts/test-market-order-history.mjs
node content/scripts/test-aodp-collector.mjs
node content/scripts/test-market-collection.mjs
node content/scripts/test-market-observation-performance.mjs
$env:AUDIT_OUTPUT='docs/market-observation-fix/optimized'
node content/scripts/audit-market-observations.mjs
Remove-Item Env:AUDIT_OUTPUT
node content/scripts/test-market-optimization-equivalence.mjs
node content/scripts/compare-market-evidence-fix.mjs
node content/scripts/write-market-evidence-fix-report.mjs
```

Önceki audit çıktıları baseline olarak korunur; functional dizini ara fonksiyonel replay'i, market-observation-functional.txt optimizasyon öncesi algoritma kaynak kodunu tutar. Nihai eşdeğerlik testi bu kaynak kodunu aynı son kanıtlarla yeniden çalıştırır. comparison.json içinde tam 22 aday,14 yeni L3,17 kullanılabilirlik düzeltmesi,173 kaynak seçimi düzeltmesi,684 referans değişimi,1525 kurtarılmış olay ve 47 bootstrap kaydı vardır. Üretim tarafında değişikliklerin etkin olması için hiçbir servis başlatılmadı/restart edilmedi.
