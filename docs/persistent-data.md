# Kalıcı uygulama verileri

Node.js 22.16 veya üstü gerekir. Ayrı SQLite kurulumu gerekmez. Hub açıldığında uygulama verileri proje kökündeki `.albion-tools.sqlite` dosyasında tutulur. Ayarlar, araç tercihleri, veritabanı sayfasındaki tablolar, günlük kayıtlar, ada planları, craft kart sıralaması ve fırsat/işlem kayıtları aynı dosyadadır.

`start.bat` sürümü kontrol eder. Farklı bir Node yürütülebilir dosyası kullanmak için `ALBION_NODE` ortam değişkeni veya `.albion-node.path` dosyasındaki tek satır yol kullanılabilir. Bu bilgisayara özel dosya Git’e girmez; başka bilgisayarda geçerli değilse başlatıcı sistemdeki Node’u kullanır. Veritabanı ve yedeklerin Node dosyasından ayrı tutulması gerekir.

Tarayıcı yalnızca bellekte bir okuma önbelleği ve henüz onaylanmamış değişiklik kuyruğu tutar. Açılışta SQLite kayıtları yüklenmeden araçlar açılmaz. Hub erişilemiyorsa uygulama boş kayıtlar oluşturarak devam etmez. Kalıcı tabloların işlemleri sunucu onayı bekler; taslaklar ve tercih değişiklikleri kısa aralıklarla birleştirilir. Bekleyen veya başarısız yazım arayüzde gösterilir; bekleyen yazım varken sayfadan ayrılma uyarısı vardır. Tarayıcı kapatılmadan önce kaydın tamamlanması beklenmelidir.

SQLite WAL ve `synchronous=FULL` kullanır. İlişkili kayıtlar tek transaction içinde yazılır. Her veri anahtarının sürümü vardır; eski bir sekme/cihaz yeni kayıtları sessizce ezemez. Tablolar SQLite içinde kayıt kimliğiyle indekslenmiş satırlardır. Bir satırı değiştirmek bütün kataloğu ağ üzerinden yeniden göndermek veya bütün satırları diske yazmak gerektirmez. Okuma önbelleği aynı JSON’u tekrar tekrar ayrıştırmaz.

## İlk aktarım

Eski `.albion-tools-data.json` ve `.opportunity-evidence.jsonl` okunur, doğrulanır ve SQLite’a aktarılır. Orijinal dosyalar korunur ve sonraki yazımlar bu dosyalara yapılmaz. Eski hub dosyası veya veritabanı bozuksa aktarım durur; boş veritabanıyla üzerine yazılmaz.

Üretilen eşya ve tarif katalogları kullanıcı kayıtlarından farklı bir güncelleme politikası kullanır. Eski tarayıcı/hub kopyaları aktif oyun kataloğu olarak kabul edilmez: ilk kaynak eşlemesinde bu tablolar arşivlenir ve birlikte güncel `data` dosyalarından kurulur. Kaynak parmak izi ve önceki kaynak sürümü SQLite’ta tutulur. Kaynak değişmedikçe katalog değiştirilmez; sonraki kaynak güncellemeleri manuel alan değişikliklerini ve silmeleri koruyan üçlü karşılaştırmayla uygulanır. Eşya kimlikleri ve tarif bağlantıları birlikte eşlenir. Böylece eski tarif kimlikleri binekleri veya başka üretim seçeneklerini sessizce aday listesinden çıkaramaz.

Her eski tarayıcı/site adresini yeni uygulamayla bir kez açın. Tarayıcıdaki kalıcı kayıtlar sunucuya aktarılır ve onaydan sonra tarayıcıdan kaldırılır. Sunucuda bulunan kayıtlar aktarım sırasında ezilmez. Farklı eski sürümler SQLite içindeki `legacy_imports` tablosunda kaynak adresi ve aktarım tarihiyle arşivlenir; tüm arşiv tam SQLite yedeğine dahildir. İşlem günlüğünün istek kimlikleri de korunur; aynı isteği tekrar göndermek yeni işlem oluşturmaz.

Hub kapalıyken `npm run data:migrate` aktarımı ve ilk doğrulanmış yedeği ayrıca çalıştırabilir. Hub açıkken eski işlem günlüğünün kilidi eşzamanlı aktarımı engeller. Eski otomatik kimlikli tablolardaki tekrar eden kimlikler yeni kimliklerle ayrılır; hiçbir satır atılmaz ve orijinal kimlikler aktarım arşivinde korunur.

## Otomatik yedekleme

Hub açılışında ve saatte bir doğrulanmış tam SQLite yedeği alınır. Varsayılan klasör `.albion-tools-backups`; son 48 başarılı sürüm tutulur. Yedekleme SQLite backup API’siyle yapılır, canlı WAL dosyasının sıradan dosya kopyası kullanılmaz. Yedek doğrulanıp tamamlandıktan sonra eski sürümler temizlenir. Ayarlar → Veri → **Şimdi tam yedek al** ile de yedek alınabilir. JSON dışa aktarma tablolar/ayarlar içindir; tam SQLite yedeği craft sıralamasını, işlem günlüğünü ve eski aktarım arşivini de içerir.

Hub başlatılmadan önce bu ortam değişkenleri ayarlanabilir:

```powershell
$env:ALBION_DATA_PATH = 'F:\AlbionData\albion-tools.sqlite'
$env:ALBION_BACKUP_DIR = 'G:\AlbionBackups'
npm run prices
```

Başka bir bilgisayardan aynı kayıtları kullanmak için aynı hub’a bağlanılmalıdır. Her bilgisayarda ayrı hub/veritabanı başlatmak verileri ortak hale getirmez.

**Proje yanındaki yedek, proje diski formatlanır veya arızalanırsa koruma sağlamaz.** Format/disk kaybından kurtarma için yedek klasörü ayrı diskte, harici diskte veya bulutla eşitlenen klasörde tutulmalı; kopyanın oraya ulaştığı kontrol edilmelidir. Saatlik yedekten kurtarma, son yedekten sonraki değişiklikleri geri getirmez.

## Geri yükleme

Hub’ı kapatın. Doğrulanmış yedeği yeni bir dosyaya geri yükleyin:

```powershell
node content/scripts/restore-user-data.mjs 'G:\AlbionBackups\albion-tools-TARIH.sqlite' 'F:\AlbionData\restored.sqlite'
$env:ALBION_DATA_PATH = 'F:\AlbionData\restored.sqlite'
npm run prices
```

Komut mevcut hedefin üzerine yazmaz. Eski veritabanını ve yedeği kurtarma doğrulanana kadar koruyun. Tarayıcıyı yeniden açın; veriler yeni dosyadan yüklenir.

Piyasa fiyatları, oyun paketi arşivleri ve teşhis çıktıları yeniden toplanabilen alan verileridir; mevcut özel arşiv altyapısını kullanmaya devam eder. Kullanıcının elle girdiği kalıcı kayıtların kaynağı SQLite’tır.

## Doğrulama

`npm run data:test`: aktarım, servis yeniden başlatma, çakışma/transaction koruması, satır bazlı yazım, başarısız isteklerin tekrar gönderilmesi, boş tarayıcı, işlem günlüğü ve tam yedekten geri yükleme.

`npm run app:ui:test`: bütün araçların açılış sırası, tarayıcı depolaması kapalıyken tablo kayıt ekleme/düzenleme, başarısız yazımın eski kaydı koruması ve yeni tarayıcı profiline yükleme.
