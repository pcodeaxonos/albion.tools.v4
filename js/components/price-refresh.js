const REFRESH_HOOK = '[data-price-refresh]';
const API_REFRESH_HOOK = '[data-price-refresh-api]';

export function priceLoaderMessage(source, fallback = 'Fiyatlar alınıyor…') {
    if (source === 'api') {
        return 'AODP fiyatları alınıyor (oyun verisiyle birleştirilecek)…';
    }
    return fallback;
}

export function priceRefreshActionsHtml() {
    return `
        <div class="tool-price-actions">
            <button type="button" class="btn btn-outline-secondary" data-price-refresh title="Önce oyun (paket) verisi, yoksa veya daha eskiyse AODP ile birleştirir.">Fiyatları yenile</button>
            <button type="button" class="btn btn-outline-secondary" data-price-refresh-api title="AODP’yi yeniden çeker; oyun verisi varsa güncel olan kazanır. Eksikler için oyunda marketi aç.">Fiyatları API’den çek</button>
        </div>
    `;
}

export function applyPriceLoadMode(state, { source, showLoader = true } = {}) {
    if (source === 'api') {
        state.livePaused = true;
        return;
    }
    if (showLoader) {
        state.livePaused = false;
    }
}

export function bindPriceRefresh(container, { load }) {
    container.querySelector(REFRESH_HOOK)?.addEventListener('click', () => {
        load();
    });
    container.querySelector(API_REFRESH_HOOK)?.addEventListener('click', () => {
        load({ source: 'api' });
    });
}
