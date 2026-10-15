# Eski potansiyel fiyat kayıtlarının geçişi — 15 Ekim 2026

İnceleme anında SQLite anahtarında 1.684 snapshot vardı. Desteklenen 2/7/28 gün ve BUY projeksiyonunda 964 kayıt görünüyordu: 259 `supported-window-price-v2`, 705 `supported-window-price-v2.1`. Bu kesitte 473 kullanılabilir, 481 referans, 10 kanıtsız kayıt vardı. Bildirilen 700 eski kayıt mevcut kesitte tekrarlanmadı; 259 eski yöntem kaydı doğrudan doğrulandı.

Kabul kontrolü eski estimator fiyatlarını bilerek reddediyor; bu güvenlik kuralı korunmuştur. Önceki güncelleme bütün seçim için tek son yazmaya bağlıydı. Eksik 90 günlük yerel kapsam dış API isteğine yol açıyor, tek bir aktarım hatası tüm seçimin geçişini durduruyordu. Eski kayıtlar için dış servisten bağımsız, ilerlemeli bir arşiv geçişi bulunmuyordu. Arayüz, mevcut referans fiyatı ana sonuçta göstermiyordu; reddedilme açıklamasında snapshot'ın hesaplama nedeni yerine genel okuma tanısı öne çıkabiliyordu.

## Uygulama

- “Eski kayıtları arşivden yenile” mevcut filtrelerin tamamındaki eski kayıtları yerel oyun/AODP ve kişisel arşivle yeniden hesaplar. Dış geçmiş ve güncel emir isteği yapmaz. Başarılı geçişte estimator V2.1 olur; yeni bir fiyat algoritması eklenmez.
- Her iki işlem seçim listesini başlangıçta sabitler; sayfalama veya güncellenen durumlar devam eden kapsamı daraltmaz. Sunucu/şehir/kalite grupları mevcut ortak kaynak adaptörleriyle işlenir. Aynı eşya ve yön tekilleştirilir; BUY hesabı ufuk başına tekrarlanmaz.
- Her grup ayrı SQLite onayından sonra gösterilir. Başarısız ağ/yazma işlemi o grubun eski snapshot'larını değiştirmez; diğer gruplar devam eder. Başarılı eski kayıtlar tekrar geçiş seçimine girmez; başarısız kalanlar yeniden denenebilir.
- İşlenen, başarılı, hata, kalan ve tekrar denenecek sayıları gösterilir. Hataların şehir ve nedenleri sonuç alanında belirtilir.
- Liste ve kartlarda pozitif gösterge açıkça tarihsel referans olarak gösterilir; Planlayıcı fiyatı olmaya devam etmez. Ayrıntı paneli hesaplama ve reddedilme nedenini korur.

## Gerçek veri doğrulaması

`content/scripts/verify-potential-migration.cjs` gerçek sayfadaki arşiv geçişi düğmesini çalıştırdı: **259/259 başarılı, 0 hata, 0 dış istek**. Ardından aynı script `--refresh` ile normal düğmeden bütün 964 kaydı güncelledi: **964/964 başarılı, 0 hata, 0 kalan**, mevcut istemciler üzerinden 20 dış istek. Bunlar günlük geçmiş/güncel emir gruplarıdır; ufuk başına ayrı geçmiş indirilmez.

Her işlemden sonra sayfa yeniden açılıp SQLite projeksiyonu karşılaştırıldı. Toplam 1.684 snapshot korundu. Desteklenmeyen eski sürelerden kalan 720 tarihsel snapshot silinmedi; bunlar sayfanın desteklenen kayıt toplamına ve Planlayıcı fiyatlarına girmez.

| Son durum | Kayıt |
| --- | ---: |
| Sayfadaki toplam | 964 |
| Eski yöntem | 0 |
| Bu çalışmada V2.1'e geçirilen | 259 |
| Toplam V2.1 | 964 |
| Kullanılabilir | 479 |
| Yalnız referans | 475 |
| Fiyat kanıtı yok | 10 |
| Yenileme/yazma hatası | 0 |

Referansların 59'unda kanıt 7 günden eski. Diğer 416 kayıtta dönem kapsamı, tekrar/miktar desteği veya yakın fiyat rejimi teyidi yetersiz; 105 kayıtta ayrıca büyük sapma teyit edilemiyor (nedenler örtüşebilir). 10 kayıt için seçili kimlik/dönemde fiyat kanıtı yok. Bu kayıtlar artık “Eski yöntem” değildir; kanıt bulunmadan fiyat oluşturulmadı.

Kanıt dosyaları: `output/potential-migration-verification.json`, `output/potential-refresh-live-verification.json`, `output/potential-migration-unresolved.json`. Sonuncusu kanıtsız kayıt kimliklerini ve salt okunur SQLite `integrity_check: ok` sonucunu içerir.

## Kontroller

Geçen kontroller: desteklenen V2.1 algoritması, snapshot/Planlayıcı kabulü, filtre/sıralama, tablo projeksiyonu, yerel kaynak adaptörü, yenileme ve grup yazma hatası/yeniden deneme testleri; izole SQLite kullanan filtreli yenileme arayüz testi; `npm run css:check` (0 hata, mevcut advisory bulgular). Gerçek sayfa 1440×650 ve 992×650 boyutlarında sayfa taşması olmadan incelendi; 390px liste/kart görünümü de doğrulandı. Ortak CSS ve algoritma dosyası değiştirilmedi. Geniş proje test paketi çalıştırılmadı.
