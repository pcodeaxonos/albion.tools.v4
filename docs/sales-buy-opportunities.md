# Satış geçmişine göre düşük Buy fırsatları

12 Ekim 2026 incelemesi: fırsat taraması Buy fiyatını yalnızca önceki Buy gözlemleriyle karşılaştırıyordu. AODP satış geçmişi taramadan sonra hacim bilgisi olarak ekleniyordu. Bu nedenle uzun süredir düşük olan Buy fiyatı, satış fiyatı ortalamasından çok ucuz olsa da sinyal üretmiyordu.

Yerel checkpoint arşivinde T6_FOXGLOVE için ekran görüntüsündeki 112 fiyatı bulunmadı. Yedi şehirdeki kayıtların incelemesi `sales-buy-opportunities-audit.json` dosyasında. Güncel Brecilien kaydı 541, satış medyanı 571; diğer şehirlerde Buy eski veya eksik. Ekran görüntüsü şehir ve sunucu belirtmediği için o teklifin kayıt/aktarılma durumuna ilişkin kesin sonuç çıkarılmadı. İnceleme journal dosyalarına yazmaz, yalnızca kalıcı checkpoint dosyalarını okur.

Yeni `place-buy-order-sales` stratejisi aynı sunucu, şehir, ürün ve kalitede alış emri maliyetini satış geçmişiyle karşılaştırır. Mevcut Buy hareketi stratejileri korunur; satış referansı Buy referansına yazılmaz.

- Emir fiyatı en yüksek Buy +1; kurulum ücreti ortak ücret fonksiyonuyla eklenir.
- Referans ortak 28 günlük tamamlanmış UTC günleri medyanıdır. Pozitif satış adedi ve geçerli fiyatı bulunan günler kullanılır. Tekrarlanan günler ek kanıt sayılmaz.
- Ücret sonrası fark en az %12 ve 25 gümüş olmalıdır; mevcut fırsat eşikleri paylaşılır.
- Ana liste için en az 7 tamamlanmış satış günü, son satış günü en fazla 3 gün eski ve doğrulanmış güncel Buy gerekir. Tarihsel Buy düşüşü veya Buy referansı gerekmez.
- Eksik/eski kanıtlı ekonomik adaylar izleme listesine gider. Satış geçmişi bulunmazsa referans uydurulmaz.
- Kartlar satış medyanını, gün sayısını ve ücret sonrası tasarrufu gösterir. Dolum, kâr veya ROI garantisi verilmez. Senaryoda satış fiyatı kullanıcı tarafından girilir.

112 Buy / 576 satış referansı regresyonunda emir 113, ücretli birim maliyet 115,825, tasarruf 460,175 gümüştür. Bu sentetik test arşive eklenmez.

Doğrulama: `npm run opportunities:test`, satış referansı regresyonları ve UI filtre/kart kontrolleri, `npm run css:check`. V6 testleri kaynak dosyalarının eski hashlerini dondurmak yerine arşivlenmiş V5 sıralamasının ve referanslarının aynı kaldığını denetlemeye devam eder; yeni tespit davranışı ayrı regresyonlarla kapsanır.

Çalışan price hub modülleri başlangıçta yükler; yeni motorun devreye girmesi için hub yeniden başlatılmalı ve sayfa yenilenmelidir.
