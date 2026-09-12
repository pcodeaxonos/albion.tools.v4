import { escapeHtml } from '../utils.js';
import {
    getTable,
    getTableNames,
    getEditableColumns,
    getDisplayColumns,
    getColumnLabel
} from './schema.js';
import {
    initStore,
    getAll,
    getRowCount,
    searchRows,
    getById,
    createRow,
    updateRow,
    deleteRow,
    resetAllTables
} from './store.js';
import { initNav } from '../nav.js';
import { initFloatingLabels } from '../forms.js';
import {
    showPageLoader,
    hidePageLoader,
    showAreaLoader,
    hideAreaLoader,
    yieldToMain
} from '../loader.js';
import { initTableSort, sortHeaderHtml } from '../table-sort.js';
import { renderMatsHtml, renderRecipesHtml } from '../today-bonus.js';
import { parseFamilyVariants } from '../bonus-cities.js';

const PAGE_SIZE = 25;
const CODE_CHAR_LIMIT = 20;
const NAME_COLUMNS = new Set(['localizedName', 'displayName', 'name', 'marketApiName']);
const CODE_COLUMNS = new Set(['uniqueName', 'slug', 'parentSlug', 'index', 'familyKey']);

const state = {
    tableName: null,
    view: 'placeholder',
    mode: 'create',
    editId: null,
    search: '',
    columnFilters: {},
    page: 1,
    sort: null
};

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

async function boot() {
    initNav();
    showPageLoader('Veritabanı yükleniyor…');

    try {
        await initStore();
    } catch (error) {
        hidePageLoader();
        document.getElementById('dbContent').innerHTML =
            `<div class="alert alert-info">${escapeHtml(error.message)}</div>`;
        return;
    }

    renderSidebar();
    bindResetButton();

    const hash = parseHash();
    if (hash.table && getTable(hash.table)) {
        await openTable(hash.table, hash.search, { showLoader: false, page: hash.page });
        if (hash.action === 'edit' && hash.id) {
            await openEditForm(hash.table, hash.id, { showLoader: false });
        } else if (hash.action === 'create') {
            await openCreateForm(hash.table, { showLoader: false });
        }
    }

    hidePageLoader();
}

function parseHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return {};

    const parts = raw.split('/');
    const params = new URLSearchParams(location.search);

    return {
        table: parts[0] || null,
        action: parts[1] || null,
        id: parts[2] || null,
        search: params.get('search') ?? '',
        page: parsePage(params.get('page'))
    };
}

function parsePage(raw) {
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : 1;
}

function setHash(tableName, action, id, search, page) {
    let hash = tableName ? `#${tableName}` : '';
    if (action) hash += `/${action}`;
    if (id) hash += `/${id}`;

    const params = new URLSearchParams();
    if (search) {
        params.set('search', search);
    }
    if (page > 1) {
        params.set('page', String(page));
    }

    const query = params.toString();
    const url = query ? `db.html?${query}${hash}` : `db.html${hash}`;

    history.replaceState(null, '', url);
}

function renderSidebar() {
    const list = document.getElementById('dbTableList');
    const names = getTableNames();

    list.innerHTML = names.map((name) => {
        const table = getTable(name);
        const count = getRowCount(name);
        const active = state.tableName === name ? ' active' : '';

        return `
            <a class="db-table-card${active}" href="#" data-table-name="${escapeHtml(name)}">
                <div class="db-table-card-body">
                    <h4 class="db-table-card-title">${escapeHtml(table.displayName)}</h4>
                    <div class="text-muted small">${escapeHtml(name)}</div>
                    <span class="badge bg-secondary">${count} kayıt</span>
                </div>
            </a>
        `;
    }).join('');

    list.querySelectorAll('.db-table-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            event.preventDefault();
            void openTable(card.dataset.tableName);
        });
    });
}

function bindResetButton() {
    document.getElementById('resetDb').addEventListener('click', async () => {
        if (!confirm('Tüm tablolar seed verisine sıfırlansın mı? Yerel değişiklikler silinir.')) {
            return;
        }

        showPageLoader('Veritabanı sıfırlanıyor…');

        try {
            await resetAllTables();
            state.tableName = null;
            state.view = 'placeholder';
            state.page = 1;
            renderSidebar();
            await renderContent();
        } finally {
            hidePageLoader();
        }
    });
}

function getContentLoaderMessage() {
    if (state.view === 'form') {
        return state.mode === 'edit' ? 'Kayıt yükleniyor…' : 'Form hazırlanıyor…';
    }

    if (state.view === 'table') {
        return 'Tablo yükleniyor…';
    }

    return null;
}

async function openTable(tableName, search = '', options = {}) {
    if (!getTable(tableName)) {
        return;
    }

    state.tableName = tableName;
    state.view = 'table';
    state.search = search;
    state.columnFilters = {};
    state.page = options.page ?? 1;
    state.sort = resolveDefaultSort(getTable(tableName));
    setHash(tableName, null, null, search, state.page);
    renderSidebar();
    await renderContent(options);
}

async function openCreateForm(tableName, options = {}) {
    state.tableName = tableName;
    state.view = 'form';
    state.mode = 'create';
    state.editId = null;
    setHash(tableName, 'create');
    renderSidebar();
    await renderContent(options);
}

async function openEditForm(tableName, id, options = {}) {
    state.tableName = tableName;
    state.view = 'form';
    state.mode = 'edit';
    state.editId = id;
    setHash(tableName, 'edit', id);
    renderSidebar();
    await renderContent(options);
}

async function renderContent(options = {}) {
    const { showLoader = true } = options;
    const container = document.getElementById('dbContent');

    if (showLoader) {
        showAreaLoader(container, getContentLoaderMessage());
        await yieldToMain();
    }

    try {
        if (state.view === 'placeholder') {
            container.innerHTML = `
                <div class="db-placeholder">
                    <h2>Tablo Seçin</h2>
                    <p class="text-muted">Soldaki listeden bir tablo seçerek içeriğini görüntüleyin.</p>
                </div>
            `;
            return;
        }

        if (state.view === 'form') {
            container.innerHTML = renderFormView();
            bindFormEvents(container);
            return;
        }

        container.innerHTML = renderTableView();
        bindTableEvents(container);
        initFloatingLabels(container);
        setHash(state.tableName, null, null, state.search, state.page);
    } finally {
        if (showLoader) {
            hideAreaLoader(container);
        }
    }
}

function getFilteredRows() {
    const table = getTable(state.tableName);
    let rows = searchRows(state.tableName, state.search);
    rows = applyColumnFilters(rows, table, state.columnFilters);
    return sortRows(rows, table);
}

function resolveDefaultSort(table) {
    if (!table?.defaultSort?.column) {
        return null;
    }

    return {
        column: table.defaultSort.column,
        direction: table.defaultSort.direction === 'desc' ? 'desc' : 'asc'
    };
}

function getActiveSort(table) {
    if (state.sort?.column) {
        return state.sort;
    }

    return table.defaultSort ?? null;
}

function sortRows(rows, table) {
    const sort = getActiveSort(table);
    if (!sort?.column) {
        return rows;
    }

    const dir = sort.direction === 'desc' ? -1 : 1;
    const column = sort.column;
    const colDef = table.columns.find((col) => col.name === column);

    return rows.slice().sort((a, b) => {
        const av = a[column];
        const bv = b[column];

        if (av == null && bv == null) {
            return 0;
        }
        if (av == null) {
            return 1;
        }
        if (bv == null) {
            return -1;
        }
        if (typeof av === 'number' && typeof bv === 'number') {
            return (av - bv) * dir;
        }
        if (typeof av === 'boolean' && typeof bv === 'boolean') {
            return ((av === bv) ? 0 : av ? 1 : -1) * dir;
        }
        if (colDef?.name === 'date' || (typeof av === 'string' && /^\d{4}-\d{2}-\d{2}/.test(av))) {
            const comparedDates = String(av).localeCompare(String(bv));
            if (comparedDates !== 0) {
                return comparedDates * dir;
            }
        }

        const compared = String(av).localeCompare(String(bv), 'tr', { numeric: true, sensitivity: 'base' });
        if (compared !== 0) {
            return compared * dir;
        }

        return ((Number(a[table.key]) || 0) - (Number(b[table.key]) || 0)) * dir;
    });
}

function getPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, state.page), totalPages);
    if (page !== state.page) {
        state.page = page;
    }

    const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);

    return { page, totalPages, start, end, total };
}

function getPageRows(rows) {
    const pagination = getPagination(rows.length);
    return {
        rows: rows.slice(pagination.start, pagination.end),
        pagination
    };
}

function applyColumnFilters(rows, table, filters) {
    const active = Object.entries(filters).filter(([, value]) => value !== '' && value != null);
    if (active.length === 0) {
        return rows;
    }

    return rows.filter((row) =>
        active.every(([colName, filterValue]) => {
            const col = table.columns.find((c) => c.name === colName);
            if (!col) {
                return true;
            }

            const value = row[colName];
            if (value == null) {
                return false;
            }

            if (col.type === 'boolean') {
                const boolVal = value ? 'true' : 'false';
                return boolVal === filterValue;
            }

            if (col.type === 'enum' || col.match === 'exact') {
                return String(value) === filterValue;
            }

            return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
        })
    );
}

function renderTableView() {
    const table = getTable(state.tableName);
    const { rows, pagination } = getPageRows(getFilteredRows());
    const columns = getDisplayColumns(table);

    const header = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h1 class="mb-0">${escapeHtml(table.displayName)}</h1>
                <span class="small text-muted">${escapeHtml(state.tableName)}</span>
            </div>
            <button type="button" class="btn btn-success" id="btnCreate">+ Yeni Kayıt</button>
        </div>
    `;

    const searchBar = `
        <div class="mb-3 db-search-bar">
            ${state.tableName === 'items' ? renderShopFilterBar() : ''}
            <div class="input-group">
                <input type="text" class="form-control" name="search" id="dbSearchInput" value="${escapeHtml(state.search)}" placeholder="Ara..." autocomplete="off">
                ${state.search ? '<button class="btn btn-outline-primary" type="button" id="btnClearSearch">Temizle</button>' : ''}
            </div>
        </div>
    `;

    const tableHtml = `
        <div class="db-table-panel">
            <div class="table-responsive">
                <table class="table table-striped db-data-table">
                    <thead>
                        <tr>
                            ${columns.map((col) => renderDataHeader(col)).join('')}
                            <th class="text-end">İşlemler</th>
                        </tr>
                        <tr class="db-col-filters">
                            ${columns.map((col) => `<th${columnClassAttr(col)}><div class="db-col-filter-wrap">${renderColumnFilter(col)}</div></th>`).join('')}
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length === 0
                            ? `<tr class="db-empty-row"><td colspan="${columns.length + 1}" class="text-muted text-center py-3">Kayıt bulunamadı.</td></tr>`
                            : rows.map((row) => renderDataRow(table, columns, row)).join('')}
                    </tbody>
                </table>
            </div>
            ${renderPager(pagination)}
        </div>
    `;

    return header + searchBar + tableHtml;
}

function renderPager(pagination) {
    if (pagination.total === 0) {
        return '';
    }

    const { page, totalPages, start, end, total } = pagination;
    const from = start + 1;
    const prevDisabled = page <= 1 ? ' disabled' : '';
    const nextDisabled = page >= totalPages ? ' disabled' : '';

    return `
        <nav class="db-pager" aria-label="Sayfalama">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btnPrevPage"${prevDisabled}>Önceki</button>
            <div class="db-pager-status">
                <span>Sayfa <span class="db-pager-page">${page}</span> / ${totalPages}</span>
                <span class="text-muted">${from}–${end} / ${total}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btnNextPage"${nextDisabled}>Sonraki</button>
        </nav>
    `;
}

function formatShopLabel(slug) {
    if (!slug) {
        return '';
    }

    return slug
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function getShopCategoryRows() {
    return getAll('itemCategories')
        .filter((row) => row.level === 'category')
        .slice()
        .sort((a, b) => (a.sortValue - b.sortValue) || a.slug.localeCompare(b.slug));
}

function getShopSubCategoryRows(parentSlug) {
    if (!parentSlug) {
        return [];
    }

    return getAll('itemCategories')
        .filter((row) => row.level === 'subcategory' && row.parentSlug === parentSlug)
        .slice()
        .sort((a, b) => (a.sortValue - b.sortValue) || a.slug.localeCompare(b.slug));
}

function renderShopSelectOptions(rows, selected) {
    const options = [
        { value: '', label: 'Tümü' },
        ...rows.map((row) => ({ value: row.slug, label: formatShopLabel(row.slug) }))
    ];

    return options.map((opt) => {
        const isSelected = selected === opt.value ? ' selected' : '';
        return `<option value="${escapeHtml(opt.value)}"${isSelected}>${escapeHtml(opt.label)}</option>`;
    }).join('');
}

function renderShopSelect(columnName, rows, selected, disabled = false) {
    const disabledAttr = disabled ? ' disabled' : '';
    return `
        <select class="form-select form-select-sm db-col-filter" data-col="${escapeHtml(columnName)}"${disabledAttr}>
            ${renderShopSelectOptions(rows, selected)}
        </select>
    `;
}

function renderShopFilterBar() {
    const category = state.columnFilters.shopCategory ?? '';
    const subCategory = state.columnFilters.shopSubCategory ?? '';

    return `
        <div class="db-shop-filters">
            <div class="db-shop-filter">
                <label>Kategori</label>
                ${renderShopSelect('shopCategory', getShopCategoryRows(), category)}
            </div>
            <div class="db-shop-filter">
                <label>Alt kategori</label>
                ${renderShopSelect('shopSubCategory', getShopSubCategoryRows(category), subCategory, !category)}
            </div>
        </div>
    `;
}

function syncShopFilterSelects(container, colName, value) {
    container.querySelectorAll(`.db-col-filter[data-col="${colName}"]`).forEach((select) => {
        if (select.value !== value) {
            select.value = value;
        }
    });
}

function syncShopSubCategorySelects(container) {
    const parent = state.columnFilters.shopCategory ?? '';
    const selected = state.columnFilters.shopSubCategory ?? '';
    const html = renderShopSelectOptions(getShopSubCategoryRows(parent), selected);

    container.querySelectorAll('.db-col-filter[data-col="shopSubCategory"]').forEach((select) => {
        select.innerHTML = html;
        select.disabled = !parent;
        select.value = selected;
    });
}

function applyShopAwareFilter(container, colName, value) {
    if (value) {
        state.columnFilters[colName] = value;
    } else {
        delete state.columnFilters[colName];
    }

    if (colName === 'shopCategory') {
        const allowed = new Set(getShopSubCategoryRows(value).map((row) => row.slug));
        if (!allowed.has(state.columnFilters.shopSubCategory)) {
            delete state.columnFilters.shopSubCategory;
        }
        syncShopSubCategorySelects(container);
    }

    syncShopFilterSelects(container, colName, value ?? '');
    void refreshTableBody(container, { resetPage: true });
}

function renderColumnFilter(column) {
    const filterValue = state.columnFilters[column.name] ?? '';

    if (column.filter === 'shopCategory') {
        return renderShopSelect('shopCategory', getShopCategoryRows(), filterValue);
    }

    if (column.filter === 'shopSubCategory') {
        const parent = state.columnFilters.shopCategory ?? '';
        return renderShopSelect('shopSubCategory', getShopSubCategoryRows(parent), filterValue, !parent);
    }

    if (column.type === 'boolean') {
        const options = [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Evet' },
            { value: 'false', label: 'Hayır' }
        ];
        return `
            <select class="form-select form-select-sm db-col-filter" data-col="${escapeHtml(column.name)}">
                ${options.map((opt) => {
                    const selected = filterValue === opt.value ? ' selected' : '';
                    return `<option value="${opt.value}"${selected}>${escapeHtml(opt.label)}</option>`;
                }).join('')}
            </select>
        `;
    }

    if (column.type === 'enum') {
        const options = [
            { value: '', label: 'Tümü' },
            ...column.options.map((opt) => ({ value: opt, label: opt }))
        ];
        return `
            <select class="form-select form-select-sm db-col-filter" data-col="${escapeHtml(column.name)}">
                ${options.map((opt) => {
                    const selected = filterValue === opt.value ? ' selected' : '';
                    return `<option value="${escapeHtml(opt.value)}"${selected}>${escapeHtml(opt.label)}</option>`;
                }).join('')}
            </select>
        `;
    }

    return `
        <input type="text" class="form-control form-control-sm db-col-filter" data-col="${escapeHtml(column.name)}" value="${escapeHtml(filterValue)}" placeholder="Filtrele..." autocomplete="off" size="1">
    `;
}

function isCompactColumn(column) {
    return column.type === 'number' || column.type === 'boolean';
}

function columnClassList(column) {
    const classes = [];
    if (isCompactColumn(column)) {
        classes.push('db-col-compact');
    }
    if (column.type === 'number') {
        classes.push('num');
    }
    return classes;
}

function columnClassAttr(column) {
    const classes = columnClassList(column);
    return classes.length ? ` class="${classes.join(' ')}"` : '';
}

function sortTypeForColumn(column) {
    if (column.type === 'number') {
        return 'number';
    }
    if (column.name === 'date') {
        return 'date';
    }
    return 'text';
}

function renderDataHeader(column) {
    const direction = state.sort?.column === column.name ? state.sort.direction : null;
    return sortHeaderHtml(getColumnLabel(column), {
        key: column.name,
        type: sortTypeForColumn(column),
        className: columnClassList(column).join(' '),
        direction
    });
}

function isCodeLikeToken(str) {
    if (/\s/.test(str)) {
        return false;
    }

    return /^[A-Za-z0-9]+([_-][A-Za-z0-9]+)+$/.test(str);
}

function isNameColumn(column) {
    return NAME_COLUMNS.has(column.name);
}

function isCodeColumn(column, value) {
    if (isNameColumn(column)) {
        return false;
    }

    if (CODE_COLUMNS.has(column.name)) {
        return true;
    }

    return value != null && value !== '' && isCodeLikeToken(String(value));
}

function shouldTruncateCode(column, str) {
    if (isNameColumn(column) || str.length <= CODE_CHAR_LIMIT) {
        return false;
    }

    return CODE_COLUMNS.has(column.name) || isCodeLikeToken(str);
}

function getCellClass(column, value) {
    if (column.format === 'variants') {
        return 'db-cell-recipes';
    }

    if (column.format === 'materials') {
        return 'db-cell-mats';
    }

    if (column.name === 'notes') {
        return 'db-cell-notes';
    }

    if (isCompactColumn(column)) {
        return column.type === 'number' ? 'db-col-compact num' : 'db-col-compact';
    }

    return isCodeColumn(column, value) ? 'db-cell-code' : 'db-cell-name';
}

function renderDataRow(table, columns, row) {
    const id = row[table.key];

    return `
        <tr>
            ${columns.map((col) => {
                const value = row[col.name];
                const cellClass = getCellClass(col, value);
                const classAttr = cellClass ? ` class="${cellClass}"` : '';
                return `<td${classAttr}>${formatCellValue(value, col)}</td>`;
            }).join('')}
            <td class="text-end text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary btn-edit" data-id="${escapeHtml(id)}">Düzenle</button>
                <button type="button" class="btn btn-sm btn-outline-danger btn-delete" data-id="${escapeHtml(id)}">Sil</button>
            </td>
        </tr>
    `;
}

function formatCellValue(value, column) {
    if (value == null || value === '') {
        return '<span class="text-muted">—</span>';
    }

    if (column.type === 'boolean') {
        return value
            ? '<span class="badge bg-success">Evet</span>'
            : '<span class="badge bg-secondary">Hayır</span>';
    }

    if (column.type === 'number') {
        return escapeHtml(value);
    }

    if (column.format === 'variants') {
        const html = renderRecipesHtml(parseFamilyVariants(value), { labels: true });
        if (html) {
            return html;
        }
    }

    if (column.format === 'materials') {
        const keys = String(value)
            .split(/[,/·]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        const icons = renderMatsHtml(keys);
        if (icons) {
            return `<span class="db-cell-mats">${icons}<span class="db-cell-mats-text">${escapeHtml(keys.join(', '))}</span></span>`;
        }
    }

    const str = String(value);
    if (shouldTruncateCode(column, str)) {
        const display = str.slice(0, CODE_CHAR_LIMIT) + '...';
        return `<span class="db-cell-truncate" title="${escapeHtml(str)}">${escapeHtml(display)}</span>`;
    }

    return escapeHtml(str);
}

function bindRowActions(container) {
    container.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
            void openEditForm(state.tableName, btn.dataset.id);
        });
    });

    container.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', () => {
            void handleDeleteRow(container, btn.dataset.id);
        });
    });
}

async function handleDeleteRow(container, id) {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
        return;
    }

    showAreaLoader(container, 'Siliniyor…');
    await yieldToMain();

    try {
        deleteRow(state.tableName, id);
        renderSidebar();
        await renderContent({ showLoader: false });
    } finally {
        hideAreaLoader(container);
    }
}

async function refreshTableBody(container, options = {}) {
    const { resetPage = false, loaderMessage = 'Filtreleniyor…' } = options;
    const target = container.querySelector('.db-table-panel')
        || container.querySelector('.table-responsive')
        || container;

    if (resetPage) {
        state.page = 1;
    }

    showAreaLoader(target, loaderMessage);
    await yieldToMain();

    try {
        const table = getTable(state.tableName);
        const columns = getDisplayColumns(table);
        const { rows, pagination } = getPageRows(getFilteredRows());
        const tbody = container.querySelector('.db-data-table tbody');

        if (!tbody) {
            return;
        }

        if (rows.length === 0) {
            tbody.innerHTML = `<tr class="db-empty-row"><td colspan="${columns.length + 1}" class="text-muted text-center py-3">Kayıt bulunamadı.</td></tr>`;
        } else {
            tbody.innerHTML = rows.map((row) => renderDataRow(table, columns, row)).join('');
            bindRowActions(container);
        }

        setHash(state.tableName, null, null, state.search, state.page);
        syncPager(container, pagination);
    } finally {
        hideAreaLoader(target);
    }
}

function syncPager(container, pagination) {
    const panel = container.querySelector('.db-table-panel');
    const existing = container.querySelector('.db-pager');
    const html = renderPager(pagination);

    if (!html) {
        existing?.remove();
        return;
    }

    if (existing) {
        existing.outerHTML = html;
        return;
    }

    if (panel) {
        panel.insertAdjacentHTML('beforeend', html);
    } else {
        container.insertAdjacentHTML('beforeend', html);
    }
}

async function goToPage(container, page) {
    if (page === state.page || page < 1) {
        return;
    }

    state.page = page;
    await refreshTableBody(container, { loaderMessage: 'Sayfa yükleniyor…' });
}

function bindTableEvents(container) {
    container.querySelector('#btnCreate')?.addEventListener('click', () => {
        void openCreateForm(state.tableName);
    });

    const searchInput = container.querySelector('#dbSearchInput');
    if (searchInput) {
        const debouncedSearch = debounce((value) => {
            state.search = value;
            void refreshTableBody(container, { resetPage: true });
            updateClearSearchButton(container);
        }, 250);

        searchInput.addEventListener('input', (event) => {
            debouncedSearch(event.target.value);
        });
    }

    container.querySelector('#btnClearSearch')?.addEventListener('click', () => {
        state.search = '';
        const input = container.querySelector('#dbSearchInput');
        if (input) {
            input.value = '';
            input.focus();
        }
        void refreshTableBody(container, { resetPage: true });
        updateClearSearchButton(container);
    });

    bindColumnFilterEvents(container);
    bindPagerEvents(container);
    bindSortEvents(container);
    bindRowActions(container);
}

function bindSortEvents(container) {
    const table = container.querySelector('.db-data-table');
    if (!table) {
        return;
    }

    initTableSort(table, {
        sortBody: false,
        onSort({ key, direction }) {
            state.sort = { column: key, direction };
            void refreshTableBody(container, { resetPage: true });
        }
    });
}

function bindPagerEvents(container) {
    if (container.dataset.pagerBound === 'true') {
        return;
    }

    container.dataset.pagerBound = 'true';
    container.addEventListener('click', (event) => {
        const prev = event.target.closest('#btnPrevPage');
        if (prev && !prev.disabled) {
            void goToPage(container, state.page - 1);
            return;
        }

        const next = event.target.closest('#btnNextPage');
        if (next && !next.disabled) {
            void goToPage(container, state.page + 1);
        }
    });
}

function updateClearSearchButton(container) {
    const group = container.querySelector('.db-search-bar .input-group');
    const existing = container.querySelector('#btnClearSearch');

    if (state.search && !existing) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-primary';
        btn.type = 'button';
        btn.id = 'btnClearSearch';
        btn.textContent = 'Temizle';
        btn.addEventListener('click', () => {
            state.search = '';
            const input = container.querySelector('#dbSearchInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            void refreshTableBody(container, { resetPage: true });
            updateClearSearchButton(container);
        });
        group.appendChild(btn);
    } else if (!state.search && existing) {
        existing.remove();
    }
}

function bindColumnFilterEvents(container) {
    const debouncedFilter = debounce((colName, value) => {
        if (value) {
            state.columnFilters[colName] = value;
        } else {
            delete state.columnFilters[colName];
        }
        void refreshTableBody(container, { resetPage: true });
    }, 250);

    container.querySelectorAll('.db-col-filter').forEach((el) => {
        const colName = el.dataset.col;

        if (el.tagName === 'SELECT') {
            el.addEventListener('change', () => {
                if (colName === 'shopCategory' || colName === 'shopSubCategory') {
                    applyShopAwareFilter(container, colName, el.value);
                    return;
                }

                if (el.value) {
                    state.columnFilters[colName] = el.value;
                } else {
                    delete state.columnFilters[colName];
                }
                void refreshTableBody(container, { resetPage: true });
            });
        } else {
            el.addEventListener('input', () => {
                debouncedFilter(colName, el.value);
            });
        }
    });
}

function renderFormView() {
    const table = getTable(state.tableName);
    const isEdit = state.mode === 'edit';
    const record = isEdit ? getById(state.tableName, state.editId) : null;

    if (isEdit && !record) {
        return '<div class="alert alert-info">Kayıt bulunamadı.</div>';
    }

    const title = isEdit ? 'Kayıt Düzenle' : 'Yeni Kayıt';

    return `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h1 class="mb-0">${title} — ${escapeHtml(table.displayName)}</h1>
                <button type="button" class="small text-muted btn-link" id="btnBack">← Tabloya dön</button>
            </div>
        </div>
        <form class="form-section form-grid" id="recordForm">
            ${isEdit ? renderKeyField(table, record) : ''}
            ${getEditableColumns(table).map((col) => renderField(col, record)).join('')}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${isEdit ? 'Kaydet' : 'Oluştur'}</button>
                <button type="button" class="btn btn-outline-secondary" id="btnCancel">İptal</button>
            </div>
        </form>
    `;
}

function renderKeyField(table, record) {
    return `
        <div class="form-floating">
            <input type="text" class="form-control" value="${escapeHtml(record[table.key])}" placeholder=" " disabled>
            <label>${escapeHtml(table.key)}</label>
        </div>
    `;
}

function renderField(column, record) {
    const value = record?.[column.name];
    const label = getColumnLabel(column);

    if (column.type === 'boolean') {
        const checked = value ? ' checked' : '';
        return `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="${escapeHtml(column.name)}" id="field-${escapeHtml(column.name)}" value="true"${checked}>
                <label class="form-check-label" for="field-${escapeHtml(column.name)}">${escapeHtml(label)}</label>
            </div>
        `;
    }

    if (column.type === 'enum') {
        const options = column.options.map((opt) => {
            const selected = value === opt ? ' selected' : '';
            return `<option value="${escapeHtml(opt)}"${selected}>${escapeHtml(opt)}</option>`;
        }).join('');

        return `
            <div class="form-floating">
                <select class="form-select" name="${escapeHtml(column.name)}" id="field-${escapeHtml(column.name)}">${options}</select>
                <label for="field-${escapeHtml(column.name)}">${escapeHtml(label)}</label>
            </div>
        `;
    }

    const inputType = column.type === 'number' ? 'number' : 'text';
    const inputValue = value ?? '';

    return `
        <div class="form-floating">
            <input type="${inputType}" class="form-control" name="${escapeHtml(column.name)}" id="field-${escapeHtml(column.name)}" value="${escapeHtml(inputValue)}" placeholder=" ">
            <label for="field-${escapeHtml(column.name)}">${escapeHtml(label)}</label>
        </div>
    `;
}

function bindFormEvents(container) {
    initFloatingLabels(container);

    container.querySelector('#btnBack')?.addEventListener('click', () => {
        void openTable(state.tableName, state.search);
    });
    container.querySelector('#btnCancel')?.addEventListener('click', () => {
        void openTable(state.tableName, state.search);
    });

    container.querySelector('#recordForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void handleFormSubmit(container, event.target);
    });
}

async function handleFormSubmit(container, form) {
    showAreaLoader(container, 'Kaydediliyor…');
    await yieldToMain();

    try {
        const formData = new FormData(form);

        if (state.mode === 'edit') {
            updateRow(state.tableName, state.editId, formData);
        } else {
            createRow(state.tableName, formData);
        }

        state.view = 'table';
        setHash(state.tableName, null, null, state.search, state.page);
        renderSidebar();
        await renderContent({ showLoader: false });
    } catch (error) {
        alert(error.message);
    } finally {
        hideAreaLoader(container);
    }
}

boot();
