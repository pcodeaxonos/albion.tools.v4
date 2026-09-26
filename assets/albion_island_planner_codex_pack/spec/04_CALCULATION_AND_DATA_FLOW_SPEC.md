# 04 — CALCULATION AND DATA FLOW SPEC

# Tek hesaplama giriş noktası

```js
calculateIslandPlan()
```

- parametresiz
- güncel global/current planner state'i okur
- ilgili tüm derived değerleri hesaplar
- sonuçları cache/state içine yazar
- UI cached derived values okur
- hesap sırasında rounding YOK
- rounding yalnız display'de
- missing data crash ettirmez

# Resource-flow sırası

Ada bir resource-flow sistemi gibi hesaplanır:

1. tüm slotların production değerlerini hesapla
2. tüm slotların resource ihtiyaçlarını hesapla
3. resource bazında aggregate et
4. internal demand önce internal output'tan karşılanır
5. shortage marketten alınır
6. surplus satılır
7. internal consumed production aynı anda sale revenue sayılamaz
8. internal attribution ile external expense double-count edilmez

İki ayrı kavram:
- gerçek external cash flow
- internal cost attribution

Opportunity cost ayrı tutulur; ana net kâra sessizce gömülmez.

# Daily normalization

Tüm ekonomi günlük normalize edilir.

Multi-day growth:
```txt
daily = fullCycle / growthDays
```

# Seed / offspring net input

```txt
netInputCost = purchasePrice * (1 - returnRate)
```

Gerçek model mevcut ürün/animal verisine göre amount ile genişletilir; mevcut repo modelini kullan.

# Feed

Favorite food examples / known mappings:
- Chicken -> Wheat
- Goat -> Turnip
- Goose -> Cabbage
- Sheep -> Potato
- Pig -> Corn
- Cow -> Pumpkin

Favorite food quantity, non-favorite kabul edilebilir crop miktarının yarısıdır.

Horse/Ox için mevcut DB/veri kuralını kullan; yeni kural uydurma.

Feed sufficiency:
```txt
expectedDailyProduction / dailyNeed * 100
```

State:
- `<100` -> `Yetersiz`
- `100–<102` -> `Riskli`
- `>=102` -> `Güvenli`

Dynamic standard deviation YOK.

# Focus

Focus cost player skill'e bağlıdır; static wiki/Excel değeri evrensel kabul edilmez.
Mevcut karakter/DB değerini kullan.
Veri henüz yoksa integration TODO bırak; sabit değer uydurma.

Sol Focus = master.
Per-slot Focus = Area 5 selected slot control.

# Output / RR source

Öncelik:
- uygulamadaki gerçek Ada Çıktıları logları / observed data
- static reference fallback

`albion.xlsm` içindeki `results` sheet gerçek output kaynağı olarak kullanılmamalı.

Observed/static conflict varsa otomatik karar verme; mevcut uygulamadaki conflict handling mantığını kullan veya işaretle.

# Prices

State:
- Current: age <= 6h
- Stale: age > 6h
- Missing: null/blank/0-equivalent source state

Kural:
- Missing fiyatı gerçek `0` gibi hesaplama.
- Etkilenen derived value -> `— / Fiyat eksik`
- Required price missing ise overall island net profit definitive gösterilmemeli.
- Stale data ile hesap yapılabilir fakat warning gösterilir.
- Refresh en eski fiyatları önceliklendirebilir.

# Area 4 aggregates

Ada özeti resource-flow sonucundan türetilir:
- Net Kâr / Gün
- Gelir
- Gider
- Focus / Gün
- İçeriden karşılanan
- Marketten alınan
- Satışa kalan
- Yem yeterliliği
- fiyat eksik/eski adetleri

# Performance

- ~100–150ms debounce
- unnecessary per-hover recalc yok
- derived result cache
- 16 slot ölçeğinde full relevant recomputation kabul edilebilir
- premature micro-optimization yerine deterministik tek pipeline
