import { initNav } from '../core/nav.js';
import { siteHref } from '../utils/site-url.js';
import { initStore } from '../db/store.js';
import { renderDashboard } from './dashboard.js';
import { hasTodayDailyBonus } from '../core/craft-bonus.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';

async function init() {
    initNav();

    const dashboardContainer = document.getElementById('dashboard');

    if (!dashboardContainer) {
        return;
    }

    showPageLoader('Dashboard yükleniyor…');

    try {
        await initStore();
        if (!hasTodayDailyBonus()) {
            location.replace(`${siteHref('pages/logs/daily-bonus.html')}?need=today#bonusForm`);
            return;
        }
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
