# Albion Tools — Ada Planlayıcı / Codex Handoff

Bu paket, konuşmada kesinleştirilmiş Ada Planlayıcı planını Codex'e aktarmak içindir.

## En önemli kural

**Yeni tasarım üretme.** Var olan proje yapısını ve kilitli UI kararlarını uygula. Bu pakette olmayan yeni panel, kart, buton, filtre, ikon, metrik, navigasyon, header, otomatik öneri veya görsel davranış ekleme.

## Kaynak önceliği

1. `spec/01_MASTER_IMPLEMENTATION_PROMPT.md`
2. `spec/02_LOCKED_UI_SPEC.md`
3. `spec/03_INTERACTION_AND_STATE_SPEC.md`
4. `spec/04_CALCULATION_AND_DATA_FLOW_SPEC.md`
5. `config/royal_slot_geometry.json`
6. `assets/island_planner_area2_final_assets.zip` içindeki Area 2 master spec ve referanslar
7. `references/area3_slot_states.png`
8. `references/area4_island_summary.png`
9. `references/area5_selected_slot_detail.png`

Görsel ile yazılı spec çelişirse **yazılı spec üstündür**. Özellikle Area 4 ve Area 5 görsellerindeki eski/yanlış küçük detaylar yazılı spec'e göre düzeltilmelidir.

## Kodlama yaklaşımı

- Önce mevcut projeyi analiz et; var olan component, stil, state ve hesaplama altyapısını mümkün olduğunca kullan.
- Büyük çaplı refactor yapma; yalnızca bu sayfayı ve zorunlu ortak parçaları değiştir.
- Bir kerede her şeyi yeniden yazma. Mevcut davranışları koruyarak ilerle.
- TODO olarak açıkça belirtilen verileri uydurma.
- Mevcut API/DB isimlerini ve veri kaynaklarını repo içinden keşfet; burada yeni endpoint veya tablo icat etme.

## Teslim kriteri

1600×850 masaüstü çalışma alanında:
- sol kontroller,
- 1:1 ada alanı,
- sağ üst 4×4 slot kartları,
- sağ alt seçili slot detayı,
- en altta ada + sağ alanın altında geniş Ada Özeti

tek ekranda görünmeli. Ada görseli hiçbir koşulda 1:1 oranını kaybetmemeli.
