# 01 — MASTER IMPLEMENTATION PROMPT

Albion Tools içindeki **Ada Planlayıcı** sayfasını mevcut proje üzerinde uygula/güncelle.

## Çalışma biçimi

Bu görev bir yeniden tasarım görevi değildir.

- Yeni tasarım üretme.
- Mevcut projedeki genel stil sistemini koru.
- Aşağıdaki 5 alan için kilitli tasarım ve davranış kararlarını uygula.
- Tasarlanmamış yeni özellik ekleme.
- Sırf boşluk var diye yeni içerik ekleme.
- Header / navigation / sayfa başlığı ekleme.
- Mevcut repo içindeki isimlendirme, state yönetimi, API ve veri erişim yapılarını önce incele; mümkün olduğunca onların üzerine otur.
- Burada belirtilmeyen iş kurallarını tahmin etme. Eksik config'i TODO olarak bırak.

## Final layout — kesin

Çalışma hedefi: **1600×850**.

Ana sayfa iki satırlı, üç kolonlu düşünülmeli:

```txt
┌──────────────┬────────────────────┬──────────────────────────┐
│              │                    │ Area 3: 4×4 slot kartları│
│ Area 1       │ Area 2: ADA        ├──────────────────────────┤
│ Sol Kontrol  │ MUTLAKA 1:1        │ Area 5: seçili slot      │
│              │                    │ detayı                    │
├──────────────┼────────────────────┴──────────────────────────┤
│ Area 1 devam │ Area 4: Ada Özeti — center + right span      │
└──────────────┴───────────────────────────────────────────────┘
```

Kritik:
- Area 2 her zaman **square / 1:1**.
- 1:1 sağlamak için adayı yatayda büyütüp koordinatları bozma; gerekirse üst ana bölgenin yüksekliğini azalt.
- Area 4, **ada alanı + sağ alanın altını birlikte** kaplayan geniş yatay bar.
- Area 1 solda kendi yüksekliği boyunca devam edebilir.
- Area 2 dışındaki alanlar responsive.
- Area 3 ve Area 5 sağ kolonda kalan yüksekliği paylaşır.
- Tüm içerik tek desktop viewport'ta sığmalı; içerik atma.
- Component iç tasarımlarını değiştirme; yalnızca entegrasyon için scale / spacing / gap / padding ayarla.

Önerilen CSS mantığı (tasarım değil, geometri):
```css
.page {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "controls island right"
    "controls summary summary";
}
.island {
  aspect-ratio: 1 / 1;
  height: 100%;
  width: auto;
  max-width: 100%;
}
.right {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}
```

Exact px değerlerini yeni bir görsel dil oluşturacak şekilde hardcode etme; mevcut component ölçülerini ve gerçek viewport'u baz al.

## 5 alan

### Area 1 — Sol Kontroller
`spec/02_LOCKED_UI_SPEC.md` içindeki Area 1'i uygula.

### Area 2 — Ada
`assets/island_planner_area2_final_assets.zip` ve `config/royal_slot_geometry.json` ana kaynaklardır.

### Area 3 — 16 slot kartı
4×4 grid. Görsel referans: `references/area3_slot_states.png`.
Yazılı kurallar Area 3 spec'inde üstündür.

### Area 5 — Seçili slot detayı
Area 3'ün hemen altında.
Görsel referans: `references/area5_selected_slot_detail.png`.
Görseldeki şehir bonusu ikonu yerine yazılı spec'teki **şehir/tower silhouette** kullanılmalı.
En üstte ayrı başlık yok.

### Area 4 — Ada Özeti
Sayfanın en altında, **Area 2 + Area 3/5 toplam genişliği boyunca**.
Görsel referans: `references/area4_island_summary.png`.
Premium/Focus badge ve sağ chevron YOK.

## Hesaplama
Tek giriş noktası:
```js
calculateIslandPlan()
```
Parametre alma. Güncel state'i oku. Detaylar:
`spec/04_CALCULATION_AND_DATA_FLOW_SPEC.md`.

## State / persistence
`spec/03_INTERACTION_AND_STATE_SPEC.md` kesin kaynaktır.

## Yapma
- otomatik planlama ana akışı oluşturma
- yeni sidebar/toolbar ekleme
- zoom kontrolleri ekleme
- Undo/Redo ekleme
- persistent Copy/Clear butonları ekleme
- slot card içine ekstra ekonomi satırları ekleme
- ada üzerine ekonomi rakamları koyma
- missing fiyatı `0` sayma
- hover/select nedeniyle hesaplama çalıştırma
- Royal şehirler için ayrı ayrı koordinat seti uydurma
- Brecilien/Caerleon koordinatlarını tahmin etme
- ada level → unlocked slot eşlemesini tahmin etme

## Uygulama sırası

1. Repo ve mevcut Ada Planlayıcı kodunu analiz et.
2. State modelini mevcut yapıya uyarlayıp kayıpsız hale getir.
3. Final layout'u 1:1 ada şartıyla kur.
4. Area 1'i mevcut davranışlarıyla bağla.
5. Area 2 overlay/state/toolbar/drag-drop'u bağla.
6. Area 3 kart gridini ve state'lerini bağla.
7. Area 5 selected/hover detail davranışını bağla.
8. Area 4 aggregate summary'yi bağla.
9. `calculateIslandPlan()` ve resource flow'u bağla.
10. Draft persistence / save / revert'i bağla.
11. 1600×850 ve daha dar desktop genişliklerinde responsive kontrol yap.
12. Acceptance checklist'i çalıştır.

Kod yazarken bu dosyadaki kapsam dışına çıkma.
