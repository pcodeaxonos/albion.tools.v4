# Günün Fırsatları V6 — UI yenilemesi

Tam genişlikte fırsat listesi, tek açılır filtre paneli ve **Fırsat / Kontrol / İşlem** sekmeleri eklendi. Çalışma UI/UX kapsamındadır; fiyat keşfi, sıralama, V5 hesapları, V6 kayıt komutları ve FIFO muhasebe değiştirilmedi.

## Kullanım ve yerleşim

- Sol filtre sütunu kaldırıldı. Şehir, tier/enchant, tür, sapma, nominal fark, ROI, güven, kanıt, izleme ve karar filtreleri **Filtreler** panelinde tutuluyor. Aktif filtreler kontrol satırından tek tek veya topluca kaldırılabiliyor. Mevcut şehir seçimi görselleri ve tier renkleri korunuyor.
- Sayaçlar liste modlarında ve tek durum satırında birleştirildi. Büyük istatistik kartları kaldırıldı; toplama/servis/engine ayrıntıları **Tarama tanısı** altında. Kayıtlı liste/kart tercihi korunur; tercihi olmayan kullanıcı kartlarla başlar.
- Kartlar eşit yükseklikte: kopyalanabilir ürün adı/görseli, tier/kalite, rota, fırsat türü, birim teorik avantaj, ROI, fiyat kanıtı ve kontrol gereği. Uzun açıklamalar ayrıntılarda; bir ana **Detayı aç** eylemi var. İzleme düğmesi ikincil olarak korundu.
- **Fırsat:** ekonomik bilgiler, fiyat kanıtları, alternatif kaynaklar ve V5 simülatörü. Miktar görünür; fiyat/emir/ek gider seçenekleri gerektiğinde açılır. Geçmiş grafikler, diğer şehirler ve eski kişisel bildirimler isteğe bağlı ayrıntılarda.
- **Kontrol:** kaynak ve hedef için iki ayrı fiyat kartı. Taraf dropdown'u kaldırıldı; altı sonuç açık seçeneklerle seçiliyor. Değişmiş fiyat veya miktar sorunu seçildiğinde gözlenen fiyat/miktar/tarih alanları açılıyor. Kontrol kaydetmek işlem başlatmıyor.
- **İşlem:** gerçek alış veya açık alış emri başlatma; sonrasında kısmi alış/satış, emir/iptal ve gider kayıtları. Gerçekleşmiş net, kalan stok ve bağlı sermaye ayrı özetleniyor; FIFO ayrıntıları açılabiliyor.
- Analiz varsayılan kapalı. Veri yokken yalnız kısa başlangıç metni gösteriliyor. Filtreler ortak responsive form gridinde; yenileme ve tüm kanıtları JSON olarak indirme korundu. Mobilde liste ve analiz birbirinin üzerine çizilmiyor; ayrı scrollport/height zinciri test edildi.

Sekmeler ve kontrol sonuçları ok tuşları/Home/End ile seçilebilir. Escape filtre panelini kapatır ve odağı filtre düğmesine döndürür. Ürün adlarında mouse, Enter/Space ve tam adı kopyalama mevcut ortak bileşenle korunur.

## Dropdown kök nedeni

Select'ler zaten ortak autocomplete bileşenine dönüştürülüyordu. Önceki seçenek listesinin parent'ı `BODY` idi; native `<dialog>` üst katmanının arkasında kalıyordu. Renkler okunabilir olmasına rağmen `elementFromPoint` menüye ulaşmıyordu. Z-index artırılması bu native top-layer sınırını çözmez.

Ortak bileşen menüyü açık olan en yakın dialog'a, dialog dışındaysa body'ye taşıyor. Son testte parent `DIALOG`, `inDialog=true` ve `visibleHit=true`. V5 simülatöründe ve V6 işlem kayıtlarında seçenekler gerçek tıklamayla seçildi. Native fallback select/option için ortak koyu `color-scheme` ve palette tanımı da eklendi. Mevcut widget, klavye ve floating label davranışları kullanılıyor.

## Değişmezlik ve eşzamanlı yerel değişiklikler

UI öncesi kaynak parmak izleri ve UI dosyaları `baseline.json` / `before/` altında saklandı. İlk kontrolde 19 motor/API/arşiv/muhasebe dosyası byte düzeyinde aynıydı (`invariance.initial.json`).

Çalışma sürerken UI işi dışında üç dosyada eşzamanlı değişiklik gözlendi: `price-hub.mjs`, `aodp-collector.mjs`, `quote-history-repository.mjs`. Bunlar geri alınmadı ve bu UI çalışmasında düzenlenmedi. Gözlenen dosya hash'leri/tarihleri `external-changes.json` içinde açıkça ayrılmıştır. UI değişmezlik testi korunan çekirdek/API/hesaplama kaynaklarında kesin karşılaştırma yapar; eşzamanlı altyapı farkları eşitlik iddiası olmadan raporlanır. `--strict-infrastructure` seçeneği başlangıçtaki 19 dosyanın tümünde byte eşitliği arar ve bu ayrı değişiklikleri hata olarak işaretler. Tüm çekirdek fiyat/sıralama/FIFO/ücret modülleri, V6 depo/API dosyası ve quote-service dahil kalan 16 dosya aynı kaldı. V6 route entegrasyonu, 10 UI veri/hesaplama fonksiyonu, gerçek işlem komutlarının üretimi ve head HTML kompozisyonu ayrıca aynıdır (`invariance.json`).

Aynı gerçek dondurulmuş snapshot'ta **94 aday / 74 grup**, bütün sıralama JSON'u ve fiyat referansları değişmedi. Regresyonda **25.210 karşılaştırma / 0 değişiklik**. Test kayıtları geçici depolarda; kullanıcı kayıtlarına veya fiyat arşivine test işlemi yazılmadı.

## Testler ve görseller

1920×1080, 1440×900, 1280×720, 768×1024 ve 390×844 test edildi. Önce/sonra ana ekranlar `before/main-*.png` ve `after/main-*.png` içinde.

Sonra görselleri ayrıca filtre açık/kapalı, boş sonuç, çoklu filtre, uzun ürün adları, Kontrol sekmesi, açık emir/kısmi satış ve performans raporunu kapsar. Kart yükseklikleri, yatay taşma, listenin analizle çakışmaması, sekme/dropdown klavyesi, gerçek kayıt, kısmi doğrulama, kayıp yanıtın sayfa yenilemesiyle mükerrersiz tekrar gönderilmesi, JSON indirme ve yeniden açılan kayıt deposu test edildi.

Geçen kontroller:

- `npm run opportunities:test` — V3/V4/V5/V6, muhasebe ve kalıcılık dahil.
- `npm run opportunities:regression:test`
- `npm run opportunities:v6:ui:invariance`
- `npm run opportunities:v6:redesign:test`
- `npm run opportunities:v6:ui:test`
- `npm run opportunities:v5:ui:test`
- `npm run css:build`, `npm run css:check` — 0 retired-class hatası; mevcut 22 advisory.
- `npm run item-name:test`, `npm run city:test`

Chrome/Playwright ve Node 22+ kullanıldı. Ekran görüntüleri, arka plan göstergelerinin animasyonuna bağlı beklemek yerine gerçek yerleşim geometrisi sabitlendikten sonra alınır.

## Bu çalışmada değişen dosyalar

- `content/js/tools/opportunities.js` — sayfa, filtre etiketleri, kartlar ve detay sekmeleri.
- `content/js/components/opportunity-evidence.js` — iki kontrol kartı, ayrı işlem alanı, kompakt rapor.
- `content/js/components/tabs.js` — mevcut segmented-choice görünümüyle ortak erişilebilir sekme davranışı.
- `content/js/components/tool-page.js` — opt-in stacked yerleşim; diğer araçların varsayılan yerleşimi aynı.
- `content/js/components/autocomplete.js` — dialog top-layer portal düzeltmesi.
- `content/scss/app/_opportunities.scss` — alanın kompakt/domain yerleşimi; gereksiz eski stat/card blokları kaldırıldı.
- `content/scss/app/_tool-page.scss`, `_tool-controls.scss`, `content/scss/_components.scss` — ortak stacked height zinciri, responsive form gridi ve native fallback palette.
- `output/css/site.css` — mevcut ortak SCSS kaynaklarından derlendi.
- UI testleri, tarayıcı yerleşim yardımcısı, `package.json` komutları ve bu teslim kanıtları.

Motor/kayıt API'si/FIFO dosyalarında bu UI çalışmasının bir düzenlemesi yoktur. Kullanıcının diğer yerel değişiklikleri korunuyor.

## Kalan sınırlar

Oyun içi kontroller ve gerçekleşen tutarlar kullanıcı beyanıdır. V6 kalıcılık için yerel hub'a ihtiyaç duyar. Otomatik oyun/SAT aktarımı veya öğrenme eklenmedi. Kopyalanabilir tam ad korunurken çok uzun kart metinleri görsel olarak sınırlanır. Eşzamanlı altyapı değişiklikleri bu UI tesliminden ayrı değerlendirilmelidir. Tarayıcıda eski module/CSS cache varsa sayfayı yenileyin.
