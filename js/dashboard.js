import { escapeHtml } from './utils.js';
import { isNewTool } from './tools.js';
import { getFrequentTools } from './usage.js';
import { getAll, getRowCount } from './db/store.js';
import { getTableNames, getTable } from './db/schema.js';
import { showAreaLoader, hideAreaLoader, yieldToMain } from './loader.js';

export async function renderDashboard(container) {
    container.innerHTML = `
        <section class="dashboard-hero">
            <h1>Albion Tools</h1>
            <p>Albion Online oyuncuları için market, craft ve karlılık araçları.</p>
        </section>

        <section class="dashboard-stats" aria-label="Veritabanı özeti" aria-busy="true">
            <div class="dashboard-stat">
                <span class="dashboard-stat-value" data-stat="total-records">—</span>
                <span class="dashboard-stat-label">Toplam kayıt</span>
            </div>
            <div class="dashboard-stat">
                <span class="dashboard-stat-value" data-stat="active-cities">—</span>
                <span class="dashboard-stat-label">Aktif şehir</span>
            </div>
            <div class="dashboard-stat">
                <span class="dashboard-stat-value" data-stat="table-count">—</span>
                <span class="dashboard-stat-label">Veri tablosu</span>
            </div>
            <a class="dashboard-stat dashboard-stat-link" href="db.html">
                <span class="dashboard-stat-value">→</span>
                <span class="dashboard-stat-label">Veritabanını aç</span>
            </a>
        </section>

        <section class="dashboard-section">
            <div class="dashboard-section-header">
                <h2>Sık kullanılanlar</h2>
                <p class="text-muted">En çok açtığınız araçlar. Tam liste soldaki menüde; yakında olanlar yapı hazır oldukça açılacak.</p>
            </div>
            <div class="tool-grid tool-grid--frequent"></div>
        </section>

        <section class="dashboard-section">
            <div class="dashboard-section-header">
                <h2>Veri Tabloları</h2>
                <p class="text-muted">Albion API kaynaklarından yüklenen referans verileri.</p>
            </div>
            <div class="db-summary-grid" aria-busy="true"></div>
        </section>
    `;

    bindFrequentGrid(container.querySelector('.tool-grid--frequent'));

    const statsSection = container.querySelector('.dashboard-stats');
    const summaryGrid = container.querySelector('.db-summary-grid');

    showAreaLoader(statsSection, 'İstatistikler yükleniyor…');
    showAreaLoader(summaryGrid, 'Tablolar yükleniyor…');

    await yieldToMain();

    const tableNames = getTableNames();
    const stats = tableNames.map((name) => ({
        name,
        label: getTable(name).displayName,
        count: getRowCount(name)
    }));

    const totalRecords = stats.reduce((sum, stat) => sum + stat.count, 0);
    const activeCities = getAll('cities').filter((city) => city.isActive).length;

    statsSection.querySelector('[data-stat="total-records"]').textContent =
        totalRecords.toLocaleString('tr-TR');
    statsSection.querySelector('[data-stat="active-cities"]').textContent =
        String(activeCities);
    statsSection.querySelector('[data-stat="table-count"]').textContent =
        String(stats.length);
    statsSection.removeAttribute('aria-busy');

    summaryGrid.innerHTML = stats
        .filter((stat) => !getTable(stat.name).userData)
        .map(renderDbSummaryCard)
        .join('');
    summaryGrid.removeAttribute('aria-busy');

    hideAreaLoader(statsSection);
    hideAreaLoader(summaryGrid);
}

const FREQUENT_ROWS = 2;
let frequentObserver = null;

function cssLengthToPx(value) {
    const raw = String(value || '').trim();
    const amount = Number.parseFloat(raw);

    if (!Number.isFinite(amount)) {
        return 200;
    }

    if (raw.endsWith('rem')) {
        const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        return amount * root;
    }

    return amount;
}

function frequentColumnCount(grid) {
    const styles = getComputedStyle(grid);
    const gap = cssLengthToPx(styles.columnGap);
    const min = cssLengthToPx(styles.getPropertyValue('--tool-card-min'));
    const width = grid.clientWidth;

    if (width <= 0) {
        return 1;
    }

    return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

function bindFrequentGrid(grid) {
    if (!grid) {
        return;
    }

    const paint = () => {
        const tools = getFrequentTools();
        const maxCols = Math.max(1, Math.floor(tools.length / FREQUENT_ROWS));
        const cols = Math.min(frequentColumnCount(grid), maxCols);
        const key = String(cols);

        if (grid.dataset.cols === key) {
            return;
        }

        grid.dataset.cols = key;
        grid.style.setProperty('--frequent-cols', key);
        grid.innerHTML = tools.slice(0, cols * FREQUENT_ROWS).map(renderToolCard).join('');
    };

    frequentObserver?.disconnect();
    frequentObserver = new ResizeObserver(paint);
    frequentObserver.observe(grid);
    paint();
}

function renderToolCard(tool) {
    if (tool.href) {
        return `
        <a class="tool-card" href="${escapeHtml(tool.href)}">
            <div class="tool-card-header">
                <span class="tool-card-icon" aria-hidden="true">${tool.icon}</span>
                <span class="badge bg-success tool-card-badge">Açık</span>
                ${isNewTool(tool) ? '<span class="badge bg-info tool-card-badge">Yeni</span>' : ''}
            </div>
            <h3 class="tool-card-title">${escapeHtml(tool.title)}</h3>
            <p class="tool-card-desc">${escapeHtml(tool.description)}</p>
        </a>
        `;
    }

    return `
        <article class="tool-card tool-card-disabled" aria-disabled="true">
            <div class="tool-card-header">
                <span class="tool-card-icon" aria-hidden="true">${tool.icon}</span>
                <span class="badge bg-secondary tool-card-badge">Yakında</span>
            </div>
            <h3 class="tool-card-title">${escapeHtml(tool.title)}</h3>
            <p class="tool-card-desc">${escapeHtml(tool.description)}</p>
        </article>
    `;
}

function renderDbSummaryCard(stat) {
    return `
        <a class="db-summary-card" href="db.html#${escapeHtml(stat.name)}">
            <span class="db-summary-count">${stat.count.toLocaleString('tr-TR')}</span>
            <span class="db-summary-label">${escapeHtml(stat.label)}</span>
            <span class="db-summary-meta">${escapeHtml(stat.name)}</span>
        </a>
    `;
}
