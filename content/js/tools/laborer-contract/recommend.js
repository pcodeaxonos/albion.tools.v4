import { optimum } from '../../core/laborer/economics.js';

// Presentation policy only. Ranking stays on the existing total-profit optimum;
// this does not invent a second score or treat a missing profit as zero.
function verified(row) {
    return !!row
        && row.economics?.status === 'ok'
        && row.economics.optimal !== false
        && Number.isFinite(row.economics.profit)
        && !row.priceState?.missing?.length
        && (row.priceState?.status === 'LIVE' || row.priceState?.status === 'MANUAL');
}

function rejectionReason(row) {
    if (!row) return 'Eksik veya eski fiyatlar toplam net kârı doğrulamıyor.';
    if (row.priceState?.status === 'STALE') return 'En yüksek toplam net kâr eski fiyata dayanıyor.';
    if (row.priceState?.missing?.length) return 'En yüksek toplam net kâr eksik fiyat içeriyor.';
    if (row.economics?.optimal === false) return 'En yüksek toplam net kâr yalnızca fiyatı bulunan rotalar için hesaplandı; global seçenek doğrulanamıyor.';
    if (row.economics?.status !== 'ok') return 'En yüksek toplam net kâr için sermaye veya satış tamamlanamadı.';
    return 'En yüksek toplam net kâr doğrulanamıyor.';
}

export function verifiedRecommendation(rows) {
    const best = optimum(rows).total;
    if (!verified(best)) {
        return { tier: null, metric: 'profit', excluded: 0, reason: rows.length ? rejectionReason(best) : 'Karşılaştırılacak tier yok.' };
    }
    const excluded = rows.filter((row) => row !== best && !verified(row)).length;
    return { tier: best, metric: 'profit', excluded, reason: null };
}
