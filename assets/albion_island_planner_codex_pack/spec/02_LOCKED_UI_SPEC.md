# 02 — LOCKED UI SPEC

# Genel

- Koyu, teknik, sade Albion Tools dili.
- Fazla iç içe kutu / border-on-border kullanma.
- Thin border, yüksek kontrastlı sayısal değerler.
- UI Türkçe.
- Yeni dekoratif/fantastik katman ekleme.
- Header yok.

---

# AREA 1 — SOL KONTROLLER

İçerik ve davranış:

- `Premium | Free`
- `Focus | Yok` master switch
- `ADA ŞEHRİ`: 7 şehir, tek satır
  - Martlock
  - Thetford
  - Fort Sterling
  - Lymhurst
  - Bridgewatch
  - Brecilien
  - Caerleon
- `SATIŞ ŞEHRİ`: aynı 7 şehir, tek satır
- şehir seçimleri dairesel/kompakt
- `ADA SEVİYESİ`: `L2 L3 L4 L5 L6`
  - dairesel
  - seçilen seviyenin hemen sağında plot adedi, örn. `16 plot`
- `Tohum`: `Buy | Sell`
- `Hasat`: `Buy | Sell`
- Alt aksiyonlar:
  - `Kaydet`
  - `Kaydedilmiş Haline Dön`
  - `Fiyatları Yenile` + son güncelleme bilgisi

YOK:
- calculate button
- tax/setup fee
- reset selections
- ek açıklama kutuları
- gereksiz info iconları
- selectbox ile değiştirilebilecek segmented kontrollerin select'e çevrilmesi

Hesaplama otomatik.

Şehir buton assetleri:
`assets/island_planner_city_assets_clean.zip`

---

# AREA 2 — ADA

Kesin:
- Ada görseli **1:1**.
- Stretch / non-uniform scale YOK.
- Zoom YOK.
- 16 diamond overlay.
- Ekonomi rakamları ada üzerinde YOK.

Slot state:
- Empty: merkez `+`
- Locked: lock, sönük, tıklanamaz
- Filled: gerçek Albion item görseli
- Hover: geçici hafif belirgin
- Selected: cyan/mavi 2–3px outline; tier rengi selection değildir
- slot numarası görünür

Royal şehirler aynı fiziksel geometri:
- Martlock
- Thetford
- Fort Sterling
- Lymhurst
- Bridgewatch

Brecilien ayrı.
Caerleon ayrı.

Toolbar:
- ada görselinin sol-altında
- floating
- tek satır
- dış container transparan
- 1:1 kompakt butonlar
- akış:
  1. slot
  2. tür: `Tarla / Ot / Mera / Kennel / Ev`
  3. tier: `T1..T8`
  4. gerçek Albion item ikonları
  5. atama
- geri butonu önceki aşamaya döner
- storyboard'un buton artwork'ünü kopyalama

---

# AREA 3 — 4×4 SLOT KARTLARI

16 kart, 4×4.

## Filled kart
Header:
- slot no bordered mini box (`01`)
- küçük mavi dot = Focus durumu
- top-right tier badge (`T4`)
- tier altında şehir bonusu yalnız ikon; `+10%` metni YOK
- header kalabalık değil

Middle:
- gerçek item image
- item adı görselin ALTINDA
- ekstra kategori label YOK

Finance row:
- label YOK
- değerler arasında separator line YOK
- gelir/gider neutral white/gray
- gelir değerinde küçük yeşil `+` icon, bordered mini box, sayının sol-üst tarafında
- gider değerinde küçük kırmızı `−` icon, bordered mini box, sayının sağ-üst tarafında
- ortada profit yüzde; gelir/giderden daha küçük font
- profit yeşil/kırmızı/0'a yakınsa gri

Net:
- büyük net kâr/zarar
- profit green / loss red / zero gray
- arrow YOK
- enclosing background/border YOK
- net rakamın ÜSTÜNDE ince glow line
- glow line state rengiyle uyumlu

## States
- Normal
- Hover: hafif açık mavi outline/glow
- Selected: canlı cyan/greenish outline; tier renginden bağımsız
- Empty:
  - slot no
  - plus
  - `Plot Seçin`
  - kısa subtitle
  - dashed border
- Locked:
  - slot no
  - item yok
  - tier yok
  - lock icon
  - `Kilitli Slot`
  - `Ada seviyesi yetersiz olduğu için kullanılamaz.`
  - solid/plain border

Referans:
`references/area3_slot_states.png`

---

# AREA 4 — ADA ÖZETİ

Final layout'ta en alt satırda, Area 2 + sağ alan genişliğini span eder.

Sol:
- index-like `05`
- `Ada Özeti`
- `Martlock • Seviye 6`
- island thumbnail YOK
- Premium badge YOK
- Focus badge YOK
- sağ chevron YOK

Metric grupları:
- Net Kâr / Gün: `114.560`, küçük `+12%`
- Gelir: `182.320`
- Gider: `67.760`
- Focus / Gün: `4.620`
- İçeriden: `%82` + `(55.6K)`
- Marketten: `12.420` + `(%18)`
- Satışa Kalan: `138.600`
- Yem: `%104.8`, `Güvenli`
- Fiyat: `2 eksik`, `3 eski`

Görsel dil:
- dark bar
- angled/slanted grouped segments
- kompakt neon accents
- yalnız gerekli ince ayraçlar

Referans:
`references/area4_island_summary.png`

---

# AREA 5 — SELECTED SLOT DETAIL

Area 3 altında. Kompakt; boşluk lüksü yok.

Üst satır:
- ayrı `Seçili Slot Detayı (06)` başlığı YOK
- slot no bir kez (`06`)
- item image
- item name (`Havuç`)
- tier (`T4`)
- kategori (`Sebze`)
- kategori yanında şehir bonusu göstergesi:
  - yeşil **şehir/tower silhouette**
  - hover tooltip: `Şehir Bonusu +10%`
- Focus toggle
- `Üretim Modu` segmented multi-option selection
  - yuvarlak radio circle kullanmak zorunda değil
  - diğer segmented kontrollerin tasarım diliyle aynı
  - örnek: `Tam Ürün / Tohum / Denge`

KPI:
- Kâr / Gün
- Gelir / Gün
- Gider / Gün
- Focus / Gün

Alt:
- sol: `ÜRETİM BİLGİLERİ`
  - Günlük Çıktı
  - Büyüme Süresi
  - RR / Geri Dönüş
  - Net Çıktı
  - Veri Kaynağı
  - ürün tipine göre gerekli satırlar dinamik olabilir
- sağ: `EKONOMİ / TEDARİK`
  - Tohum/Yavru Alış veya ilgili giriş maliyeti
  - günlük net giriş maliyeti
  - Satış Fiyatı
  - İçeriden Karşılanan
  - Marketten Alınan
  - Fiyat Durumu
  - ürün tipine göre yem / satışa kalan gibi gerekli satırlar dinamik olabilir

Alt status satırı (`Fiyatlar güncel · Hesaplama tamam`) YOK.

Hovered slot:
- Area 5 içeriğini geçici olarak gösterir
- read-only
- mouse leave -> selected slot geri gelir

Selected slot:
- edit edilebilir
- Focus ve üretim modu burada değiştirilebilir

Focus/production-mode controls hover detayında edit edilemez.

Referans:
`references/area5_selected_slot_detail.png`
Not: bu görseldeki eski şehir bonusu ikonu yerine bu spec'teki şehir/tower silhouette kullanılmalı.
