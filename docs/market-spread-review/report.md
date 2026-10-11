# Makas önerisi düzeltmesi

Canlı arşiv/journal snapshot'ı: 11 Ekim 2026 03:41 Türkiye saati, sequence 2539. Kaynak dosyalar gzip kopya olarak alındı; production arşivleri değiştirilmedi.

## Kural ve sonuç

`local-make` ham hesapları ve adayları duruyor, fakat pozitif makas artık emir açma önerisi oluşturmuyor. Ana Fırsatlar listesi yalnız diğer doğrulanmış uygun stratejileri seçiyor. Makas listesi `spreadReview` sınıfını gösteriyor ve eylemi “Emir fırsatını incele” veya “Makası incele” olarak sınırlandırıyor. Kartta dolum kanıtı bulunmadığı açık kalıyor.

Tarihsel makas, aynı kaynak zamanındaki kabul edilmiş Buy/Sell gözlem çiftlerinden kurulur; saat başına tek çift sayılır. Mevcut gözlem politikasının L3 şartı olan 12 gözlem ve 24 saat yayılımı korunur. Referans, o ürün/şehir/kalitenin kendi eşleşmiş makas dağılımıdır. Üst Tukey dış çiti (`Q3 + 3 × IQR`) sınıflandırma için kullanılır; yeni fiyat/getiri eşiği değildir ve dolum olasılığı iddia etmez. Eksik eşleşme ya da mevcut fiyat tutarsızlığı “Veri yetersiz” olur.

| Aynı snapshot, 867 local-make adayı | Önceki sınıf | Yeni sınıf |
|---|---:|---:|
| Tarihsel / olağandışı | 4 tarihsel fiyat destekli | 0 olağandışı |
| Normal | Ayrı sınıf yok | 2 normal |
| Kanıt yetersiz | 807 yalnız güncel emir, 56 geniş/belirsiz | 865 veri yetersiz |

Önceki sınıf ile yeni sınıf farklı soruları ölçüyor. Önceki 4 “tarihsel fiyat destekli” kaydın ikisi makas için L3 eşleşmeye ulaştı; bunlar kendi dağılımlarında olağandışı değil, normal. Genel olarak kullanılabilir eşleşmiş tarihsel makas yetersiz; bu nedenle bu snapshot’ta hiçbir makas doğrudan emir fırsatı görünmüyor. Ham makas adayları duruyor.

Tarama motorunun evaluation rows eski/yeni bire bir aynı kaldı; güven, ücret, hareket eşiği ve diğer strateji kararlarında değişiklik yok. Sınıf dağılımı ve süre/çift örnek ayrıntısı `comparison.json` içinde; tam sıkıştırılmış snapshot ve tekrar oynatma kodu bu klasörde.

## Test ve devreye alma durumu

- `npm run opportunities:test`: geçti; strateji matrisi, eşleşmiş zaman, L3 örnek/süre, kısmi kapsam, karantina, tekrar sayımı, üç sınıf, kart eylemi ve filtre sayaçları kapsandı.
- `npm run opportunities:regression:test`: 25.210 fiyat tarafında 0 değişiklik; sentetik perf: cold 2.636 ms, warm 64 ms, heap 60 MB, 1.260 doğrulanmış / 500 listelenmiş.
- Journal’ın 1,3 GB canlı dosya boyutu Node’un tek-string limitini aşıyordu. Arşivi yazmadan satır satır okuma eklendi; UTF-8 sınırı, son satır, eksik ve bozuk dosya testleri geçti. Snapshot bu akışla başarıyla oynatıldı.
- Gerçek tarayıcı ve mobil testi bu turda tamamlanamadı: yerel web sayfası `ERR_CONNECTION_REFUSED` verdi; sandbox içinde yerel sunucu başlatma denemesi de portu dinlemeye alamadı. Makas L3 geçmişi için erken çıkış eklendi, fakat son büyük snapshot tekrarından ölçüm alınamadı. Yeni backend alanlarını sunmak için fiyat hub’ının güncel modülle yeniden başlaması gerekiyor.
- Tam snapshot tekrarında, L3 erken çıkışı eklenmeden önce cold 4,43 sn / warm 5,49 sn ve 1,57 GB heap gözlendi; bu büyük arşiv/journal replay ölçümüdür. Düzeltilmiş erken çıkışın aynı snapshot üzerindeki etkisi henüz ölçülemedi. Standart performans regresyonu geçti. Kullanım sınırı nedeniyle otomatik onay tamamlanamadı ve kontrol aşılmadı. Bu nedenle sınıflandırma kodu ve testler hazır, fakat **çalışan hub’a yüklenmiş değil**. Eski API yanıtındaki makas adayları UI fallback’iyle “Veri yetersiz” ve inceleme eylemi olarak kalır; olağandışı/normal ayrımı canlı ekranda görünmez, ta ki hub güncel kodla yeniden başlayana kadar.

## Son dağıtım/perf kontrolü — 11 Ekim 2026

Aynı sequence 2539 journal snapshot'ı (25.874 hücre, 1.061 uygun aday, 867 makas adayı) önceki shadow yaşam döngüsü ve düzeltilmiş yaşam döngüsüyle tekrar çalıştırıldı. Eski shadow kodu iki tam hücre izi kümesini aynı anda tutuyordu. Yeni akış validated tarama izini shadow için gereken küçük alanlara indirip legacy taramasından önce serbest bırakıyor. Shadow raporunun bütün karar alanları snapshot üzerinde birebir aynı kaldı: 1.343 kaldırılan, 952 eklenen, 3.757 referans alanı değişimi; özet karşılaştırması eşit.

İlk 1,57 GB değeri audit harness'inin eski, cold ve warm tam sonuçlarını aynı anda bellekte tutup tam taramayı JSON/gzip olarak yazmasından kaynaklanıyordu; gerçek hub shadow yaşam döngüsü için karşılaştırılabilir tepe değeri değildi. Aynı veri ve aynı servis çağrı sırasıyla `--trace-gc` old-space tepe ölçümü 762,6 MB önce, 752,0 MB sonra oldu. Tam shadow sonrası zorlanmış GC'de kalan heap 501,6 MB'den 283,8 MB'ye (%43,4 azalma) indi. Ölçülen cold/warm/legacy-shadow süreleri sırasıyla önce 4.609/7.833/6.257 ms, sonra 6.163/6.524/4.742 ms; GC izleme etkin olduğundan süreler profiler yükünü içerir ve tek koşu olduğundan küçük farklar kesin hızlanma iddiası değildir.

`npm run opportunities:test` ve `npm run opportunities:regression:test` geçti; 25.210 fiyat tarafında değişiklik 0. Cold/warm shadow snapshot'ta kararlar eşit. Normal/persisted kayıtlar ve production arşivleri değiştirilmedi. Tarayıcı doğrulaması halen `ERR_CONNECTION_REFUSED` nedeniyle yapılamadı. Hub yeniden başlatma normal yetkili akışında kullanım/onay sınırı tarafından reddedilmişti; bu sınır aşılmadı. **Canlıya alınmadı.**
