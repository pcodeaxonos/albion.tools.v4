import { initNav } from './nav.js';
import { initStore } from './db/store.js';
import { renderDashboard } from './dashboard.js';
import { showPageLoader, hidePageLoader } from './loader.js';

async function init() {
    initNav();

    const dashboardContainer = document.getElementById('dashboard');

    if (!dashboardContainer) {
        return;
    }

    showPageLoader('Dashboard yükleniyor…');

    try {
        await initStore();
        await renderDashboard(dashboardContainer);
    } catch (error) {
        console.error(error);
        dashboardContainer.innerHTML =
            '<div class="alert alert-info">Dashboard yüklenemedi. Sayfayı bir static server ile açtığınızdan emin olun.</div>';
    } finally {
        hidePageLoader();
    }
}

init();
