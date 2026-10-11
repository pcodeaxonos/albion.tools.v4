# Karar Motoru alt bölüm düzenlemesi

10 Ekim 2026. Alt analiz kartları ve iki ayrıntı bölümü kompaktlaştırıldı. Mevcut yerleşim, ortak başlık, hesaplama motoru ve veri servisleri korundu.

## Değişiklikler

- Üç analiz kartının masaüstü yüksekliği 256px → 236px, iç boşluğu 12px → 8px oldu. Başlık, tablo ve piyasa satırı aralıkları sıkılaştırıldı; grafik sunum yüksekliği 136px → 128px oldu.
- Sonuç blokları arasındaki boşluk azaltıldı. İki ayrıntı başlığı ortak bir alt grup içinde daha küçük boşluk ve ikonla yerleştirildi.
- Malzeme yardımcı metni aynı anlamı koruyarak kısaltıldı. İçerik saklanmadı; mevcut `overflow: auto` korundu. Uzun veri ve açılmış ayrıntılar gerektiğinde kaydırılabilir.

## Görsel doğrulama

1920 × 1080 Chrome ekranında gerçek Europe/Martlock T8 Beef Sandwich, 100 adet seçimi kullanıldı. API yanıtları taklit edilmedi. Eksik fiyatlar örnek değerlerle doldurulmadı. Ekran görüntüsü açılarak incelendi: dört alternatif, üç alt kart ve iki ayrıntı başlığı tamamen görünür.

| Alan | Dikey taşma |
| --- | ---: |
| Sayfa içerik alanı | 0px |
| Sağ sonuç alanı | 0px |
| Alternatifler tablosu | 0px |
| Fiyat Geçmişi | 0px |
| Malzeme Maliyeti | 0px |
| Piyasa Özeti | 0px |
| İki kapalı ayrıntı başlığı | 0px |

İki ayrıntı da açılıp sonuç alanının sonuna kaydırılarak erişim doğrulandı. Bu ölçümler belirtilen masaüstü durumuna aittir; küçük ekran veya uzun içerik doğal olarak kaydırılabilir.

- [1920 × 1080 ekran görüntüsü](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-compact-1920.png)
- [DOM taşma ölçümleri](C:/Users/Pcodea/.codex/visualizations/2026/10/10/01a12637-777e-7842-9ec2-9633fb89c7c0/decision-compact-scroll-audit.json)

## Test sonuçları

CSS derlemesi ve JavaScript sözdizimi kontrolü geçti. Mevcut `decision:test` (27 motor senaryosu, adaptör ve grafik), `routes:test` (22 rota), `city:test`, market order history, market opportunities ve AODP collector (12 kontrol) geçti. Masaüstü/mobil UI regresyonu ve ortak başlık testi (9 durum) geçti. Test altyapısı ve test dosyaları değiştirilmedi.

## Değişen dosyalar

- `content/scss/app/_decision-engine.scss`: alt kart ölçüleri, boşluklar ve ayrıntı başlıkları.
- `content/js/tools/decision-engine.js`: ayrıntı grubu sarmalayıcısı ve kısaltılmış yardımcı metin.
- `output/css/site.css`: derlenmiş stiller.
- Bu rapor ve önceki UI raporundaki güncelleme bağlantısı.

Bu kapsamda desteklenmeyen yeni işlev yok. Mevcut veri sınırlamaları korunur: bilinmeyen hacim, dolum süresi ve başarı olasılığı üretilmez; eksik craft girdileriyle toplam maliyet hesaplanmaz.
