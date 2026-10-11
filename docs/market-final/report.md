# Günün Fırsatları — final doğrulama

**Durum: validated motor aktif.** `data/price-hub-config.json` ayarı açık ve canlı fiyat hub 11 Ekim 2026 00:08 UTC kontrolünde `validated` modda, toplayıcı `ok` durumundaydı. Canlı taramada 24.624 hücreden 1.093'ü uygun, 35'i izlenen, 350'si şüpheli; 23.146'sı yetersiz veriliydi. Fırsat sayısı dolum veya gerçekleşmiş kâr kanıtı değildir.

## Kanıt ve geri dönüş

Aktivasyon öncesi snapshot ve journal birlikte yedeklendi. Hash ve byte doğrulaması, izole kopyada migration/rollback, tekrarlı migration idempotansı ve iki dosyanın birlikte geri yüklenmesi geçti. Üretim arşivine migration uygulanmadı ve arşiv silinmedi. Eski tutarlı snapshot'taki 25.210 tarafın doğrulaması ve önceki uygunluk/sıralama sonuçları değişmedi.

İlk 20 seçilmiş kaydın Buy/Sell fiyatları AODP'den yeniden sorgulandığında eşleşti. Bu bağımsız doğrulama değildir; aynı sağlayıcı kontrol edildi. Yerel hub ve AODP canlı gözlemleri kaynak ve zaman bilgisiyle kayda giriyor; tam emir defteri, emir dolumu, derinlik ve gerçekleşmiş kâr verisi mevcut değil.

Makas sınıfları geçerli kartlarda görünür. Geniş ve belirsiz emir makasları erişilebilir kalır ve gerçekleşebilirlik uyarısı taşır. Tarayıcı testi sırasında sapma değeri olmayan karantina kartının çizimini durduran hata bulundu; kart artık sayısal sapma uydurmadan “Karantinada” gösteriyor. Regresyon testi eklendi ve düzeltme sonrası yeni tarayıcı oturumunda 500 kart yüklendi, konsol hatası görülmedi.

## Doğrulama

- Fırsat karar matrisi, gözlem yaşam döngüsü, strateji uygunluğu/ücretler, sıralama, makas sınıfları ve UI akış testleri geçti.
- Toplayıcı, sipariş geçmişi, 9.508 ürünlük koleksiyon ve 22 rota kontrolü geçti. Optimizasyon eşdeğerliği 25.210 tarafta sıfır fark verdi.
- Performans regresyonu: eski snapshot cold/warm 3.985/1.289 ms; sentetik 2.520 seri için cold 3.966 ms, warm 60 ms, heap 55 MB. Sentetik veri fırsat kanıtı olarak kullanılmadı.
- Canlı kontrol: 4.134 ms motor taraması, 8.672 ms ilk API yanıtı, 1,49 MB gzip. İkinci istek farklı tarama zamanına denk geldiğinden cache sıcaklık karşılaştırması sayılmadı.
- Masaüstü ve 390 px mobil görünüm, strateji/kanıt filtreleri, sıralama, ürün araması ve fiyat geçmişi tarayıcıda denendi. Mobilde yatay taşma yok.

Bağımsız piyasa kaynağı, emir derinliği ve dolum kanıtı sınırlamaları sürüyor. Geri dönüş için `opportunitiesValidated` ayarını kapatıp fiyat hub'ı yeniden başlatmak yeterlidir; arşiv geri yüklemek ancak veriyi geri almak gerektiğinde, aynı snapshot/journal çiftiyle yapılmalıdır.

Tarayıcı kanıtı: [mobile.png](mobile.png). Canlı API ve yedek kanıtları bu klasördeki `live-api.json`, `price-crosscheck.json`, `verification.json` ve manifest dosyalarındadır.

## Liste ayrımı

Güncel taramada uygun satırlar varsayılan **Fırsatlar** ve ayrı **Makas Stratejileri** listelerine ayrıldı. Sunum seçimi güven/ücret/uygunluk sonuçlarını ve strateji hesaplarını değiştirmez. Arayüz tüm uygun adayları filtreleyip sıraladıktan sonra 500 kart sınırını uygular; sayaç tam eşleşen sayıyı, başlık ise gösterilen/toplam biçimini verir. Şüpheli, yetersiz ve izlenen veri sayaçları kendi kategorilerinde gösterilir.

Canlı tarayıcı doğrulamasında 194 fırsat ve 900 makas stratejisi sayıldı. Varsayılan 194 kartın hiçbirinde local-make/“Çift emir kur” yoktu. Makas görünümü 500 kartta durup `500 / 900 gösteriliyor` yazdı. Ürün araması, kanıt filtresi, üç sıralama, makas sınıfı, 390 px mobil taşma kontrolü ve temiz konsol doğrulandı. Son tarama sırasında değişen veri nedeniyle sayılar yeniden taramada değişebilir.

Bu görünürlük revizyonundan sonra fırsat regresyon paketi ve 25.210 taraf eşdeğerlik testi geçti; eşdeğerlikte değişen sonuç sıfırdır. 2.520 seri performans testi cold 4.134 ms, warm 106 ms ve 62 MB heap ölçtü. CSS derlemesi başarılıdır.
