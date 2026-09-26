import { showPageLoader, hidePageLoader, showAreaLoader, hideAreaLoader } from '../../components/loader.js';
import { applyPriceLoadMode, priceLoaderMessage } from '../../components/price-refresh.js';

export async function runPriceLoad({
    state,
    source,
    showLoader = true,
    loadingText = 'Fiyatlar alınıyor…',
    area = null,
    load,
    onSuccess,
    onError,
    onFinally,
    errorText = 'Fiyatlar alınamadı.',
    logError = true
}) {
    applyPriceLoadMode(state, { source, showLoader });
    state.error = null;

    const message = priceLoaderMessage(source, loadingText);
    if (showLoader) {
        showPageLoader(message);
    } else if (area) {
        showAreaLoader(area, message);
    }

    try {
        await load();
        state.loaded = true;
        state.error = null;
        onSuccess?.();
        return true;
    } catch (error) {
        if (logError) {
            console.error(error);
        }
        state.error = error?.message || errorText;
        state.loaded = true;
        onError?.(error);
        return false;
    } finally {
        if (showLoader) {
            hidePageLoader();
        }
        if (area) {
            hideAreaLoader(area);
        }
        onFinally?.();
    }
}
