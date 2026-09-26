# 03 — INTERACTION AND STATE SPEC

# Hover / Selected

- `selectedSlotId`: kalıcı kullanıcı seçimi
- `hoveredSlotId`: geçici
- Detay panelinin gösterdiği slot:
  - hovered varsa hovered
  - yoksa selected
- Hover selection'ı değiştirmez.
- Hover hesaplama tetiklemez.
- Selection hesaplama tetiklemez.
- Hovered detail read-only.
- Selected detail editable.

# Drag & Drop

İşlem MOVE değil COPY.

## Filled -> Empty
- Kaynak slot değişmez.
- Tüm slot ayarları anında kopyalanır:
  - item
  - tier
  - focus
  - production mode
  - slot'a ait diğer mevcut parametreler
- tür/item farkı drop'u invalid yapmaz.
- hesaplama tetiklenir.

## Filled -> Filled
Confirmation:
`Bu slot dolu. Mevcut ayarlar üzerine yazılsın mı?`

Buttons:
- `İptal`
- `Üzerine Yaz`

Overwrite sonrası hesaplama tetiklenir.

## Drag -> Boşalt
- drag başlayınca normalde gizli `Boşalt` drop zone görünür
- drop -> confirmation
- onay -> kaynak slot sıfırlanır
- drag bitince drop zone gizlenir
- hesaplama tetiklenir

## Invalid
- Locked slot drop target olamaz.
- Bunun dışında item/type farkından dolayı invalid hedef üretme.

Persistent Copy/Clear buttons YOK.
Undo/Redo YOK.

# Toolbar flow

1. slot select
2. type/category
3. tier
4. item
5. assign

Back -> önceki aşama.

# Calculation trigger matrix

`calculateIslandPlan()` ÇALIŞIR:
- slot/item atama
- slot temizleme
- drag copy
- overwrite
- Focus değişimi
- production mode değişimi
- Premium/Free değişimi
- global Focus master değişimi
- ada şehri değişimi
- satış şehri değişimi
- ada seviyesi değişimi
- tohum Buy/Sell
- hasat Buy/Sell
- fiyat yenileme sonrası fiyat datası değiştiğinde
- ekonomiyi etkileyen başka mevcut state değişiklikleri

ÇALIŞMAZ:
- hover
- selection
- toolbar stage navigation
- sadece görsel state
- tooltip

~100–150 ms debounce.

# Draft / Save

- Draft city bazında tutulur.
- Refresh unsaved çalışmayı kaybettirmemeli.
- DB write ile calculation frequency birbirinden ayrılmalı.
- Draft autosave throttled/debounced olabilir.
- `Kaydet`: committed saved plan'ı günceller.
- `Kaydedilmiş Haline Dön`: son committed state'e geri döner.
- Undo/Redo yok.

# Responsive

- Island viewport daima square.
- Island overlay koordinatları normalized referans koordinatlarından hesaplanmalı.
- Non-uniform resize yasak.
- Island dışındaki paneller responsive.
- Final desktop target 1600×850.
- Daha dar desktop'ta önce spacing/font/card scale küçülebilir; içerik silinmez.
