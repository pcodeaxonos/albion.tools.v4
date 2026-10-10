import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { renderDashboard } from './dashboard.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';

async function init() {
    initNav();

    const dashboardContainer = document.getElementById('dashboard');

    if (!dashboardContainer) {
        return;
    }

    showPageLoader();

    try {
        await initStore();
        await renderDashboard(dashboardContainer);
        hidePageLoader();
    } catch (error) {
        console.error(error);
        dashboardContainer.innerHTML =
            '<div class="alert alert-info">Dashboard yüklenemedi. Sayfayı bir static server ile açtığınızdan emin olun.</div>';
        hidePageLoader();
    }
}

init();
