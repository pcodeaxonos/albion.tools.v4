# Strateji düzeyinde görünüm denetimi

11 Ekim 2026. Karşılaştırma zamanı: 00:30:02.041 UTC (03:30 Türkiye).

## Bulgu ve düzeltme

Önceki ayrım hücreyi bütünüyle elemiyordu: local-make birincil olsa bile ana görünüm diğer uygun stratejiyi seçebiliyordu. Ancak tür filtresi bu seçimden **sonra yalnız birincil stratejiye** bakıyordu. Aynı hücrede ikinci tarihsel strateji tür filtresiyle seçilemiyor, tür sayacında görünmüyordu. Hariç tutma da alternatif seçmek yerine hücreyi düşürüyordu.

Tür, işlem, sapma, güven, kanıt ve ekonomik filtreler artık alternatif stratejiler üzerinde seçimden önce uygulanıyor. Her hücre görünüm başına en fazla bir kart üretir; görünümde uygun alternatifler tür filtreleriyle erişilebilir ve tür sayaçlarında sayılır. Tür sayaçları aktif tür seçiminin dışında, diğer filtrelerin tamamını uygular; bu nedenle türlerin toplamı benzersiz hücre sayısını aşabilir.

Kart eylemi, neden, ekonomik sonuç, dengeli puan, güven, önem ve güncellik seçilen stratejinin girdilerinden gelir. Detay açılışı da gösterilen strateji bağlamını korur. Liste satırındaki eylem başka görünümün stratejisini önermez. Motor kararları, gözlemler, eşikler, ücretler ve üretim arşivi değiştirilmedi. Şehirler arası taşıma önceki kullanıcı kararıyla kapsam dışında.

## Aynı canlı yanıt üzerinde eski / yeni

`live-scan.json` çalışan validated hub API'sinden tek yanıt olarak alındı; bellekteki güncel/journal birleşiminin iki ayrı zamandaki taraması karşılaştırılmadı. İki UI sürümü aynı yanıtta çalıştırıldı. `before-ui.txt` bu değişiklikten hemen önceki UI; `before.json` ve `after.json` denetim sonuçlarıdır. Her denetimde giriş JSON'unun değişmediği doğrulandı.

| Strateji | Uygun hücre | Eski tür filtresi | Yeni tür filtresi | Ana listede birincil | Yanlış kayıp |
|---|---:|---:|---:|---:|---:|
| Yüksek Sell | 1 | 1 | 1 | 1 | 0 |
| Düşük Buy | 0 | 0 | 0 | 0 | 0 |
| Yüksek Buy | 0 | 0 | 0 | 0 | 0 |
| Düşük Sell | 0 | 0 | 0 | 0 | 0 |
| Yerel anlık işlem | 1 | 1 | 1 | 1 | 0 |
| local-make | 859 | 859 | 859 | 0 | 0 |
| Şehirler arası | 192 | kapsam dışı | kapsam dışı | 0 | — |

Ana liste: **2 / 2**, Makas: **500 / 859**. Hub'da 1.033 benzersiz uygun hücre var; stratejiler örtüştüğü için sütunlar doğrudan toplanamaz. Makasın 850 hücresinde motor birinciliği local-make. Bu canlı kesitte makas ile tarihsel strateji birlikteliği yok; canlı veriden kurtarılmış tarihsel kayıt iddiasında bulunulmuyor. Sıfır olan tarihsel türler sıfır bırakıldı.

## Regresyon ve gerçek tarayıcı

- Sentetik, arşivden tamamen ayrı bir hücrede local-make birincil; Yüksek Sell ve Düşük Buy birlikte uygun. Her ikisi ana görünümde tür seçimiyle erişilebilir; makas görünümünde aynı hücrenin local-make stratejisi gösterilir; tekrar kart oluşmaz.
- Önceki UI aynı regresyonda alternatif tarihsel tür sayacı kontrolünde başarısız oldu (`before-regression.txt`); yeni UI geçti.
- Yüksek Buy, Düşük Sell ve yerel anlık işlem birlikteliği; hariç tutma; seçilen tarafın sapması; ekonomik alternatif; seçilen strateji fiyat/eylem/puan/güncellik ve girdi değişmezliği test edildi.
- `npm run opportunities:test`: bütün gruplar geçti; 67 uygunluk matrisi vakası dahil.
- `npm run opportunities:regression:test`: 25.210 fiyat tarafında değişen **0**. Performans: cold 3.508 ms, warm 129 ms, heap 48 MB (sentetik standart yük).
- Gerçek tarayıcı: Yüksek Sell 1/1 ve doğru satış emri kartı; Düşük Buy 0/0; makas 500/859; ana listeye dönüş 2/2. Console error yok. `browser.png` görünüm kanıtıdır. Çoklu tarihsel birliktelik canlı veride olmadığı için o durum VM tabanlı regresyonda doğrulandı, gerçek tarayıcıda canlı örnek varmış gibi sunulmadı.
