import { escapeHtml } from '../utils.js';
import {
    getTable,
    getTableNames,
    getEditableColumns,
    getDisplayColumns,
    getColumnLabel,
    getSourceLabel,
    TABLE_GROUPS,
    tables
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
    resetAllTables,
    reseedTable,
    exportTableJson,
    replaceAllRows,
    mergeImportedRows,
    loadSeedRows,
    tableHasLocalChanges,
    getJunctionChildIds
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
import { parseFamilyVariants, bonusMaterialItemId } from '../bonus-cities.js';
import { itemIconHtml } from '../item-icon.js';
import { getItemUniqueName } from './relations.js';

const PAGE_SIZE = 25;
const CODE_CHAR_LIMIT = 20;
const NAME_COLUMNS = new Set(['localizedName', 'displayName', 'name', 'marketApiName']);
const CODE_COLUMNS = new Set(['uniqueName', 'slug', 'parentSlug', 'index', 'familyKey']);

const state = {
    tableName: null,
    view: 'placeholder',
    mode: null,
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
    const byGroup = new Map(TABLE_GROUPS.map((group) => [group.id, []]));

    for (const name of names) {
        const table = getTable(name);
        const groupId = table.group || 'game';
        if (!byGroup.has(groupId)) {
            byGroup.set(groupId, []);
        }
        byGroup.get(groupId).push(name);
    }

    const sections = [];
    for (const group of TABLE_GROUPS) {
        const groupTables = byGroup.get(group.id) || [];
        if (groupTables.length === 0) {
            continue;
        }

        sections.push(`
            <div class="db-table-group">
                <h3 class="db-table-group-title">${escapeHtml(group.label)}</h3>
                ${groupTables.map((name) => {
                    const table = tables[name];
                    const count = getRowCount(name);
                    const active = state.tableName === name ? ' active' : '';
                    const source = getSourceLabel(table.source);
                    return `
                        <a class="db-table-card${active}" href="#" data-table-name="${escapeHtml(name)}" title="${escapeHtml(name)}">
                            <span class="db-table-card-title">${escapeHtml(table.displayName)}</span>
                            <span class="db-table-card-meta">
                                <span class="badge bg-secondary">${count}</span>
                                <span class="badge db-source-badge db-source-badge--${escapeHtml(table.source || 'curated')}">${escapeHtml(source)}</span>
                            </span>
                        </a>
                    `;
                }).join('')}
            </div>
        `);
    }

    list.innerHTML = sections.join('');

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
            clearFormState();
            dismissSidebarForm();
            renderSidebar();
            await renderContent();
        } finally {
            hidePageLoader();
        }
    });
}

function getContentLoaderMessage() {
    if (state.view === 'table') {
        return 'Tablo yükleniyor…';
    }

    return null;
}

function clearFormState() {
    state.mode = null;
    state.editId = null;
}

function syncTableHash() {
    const action = state.mode === 'edit' || state.mode === 'create' ? state.mode : null;
    const id = state.mode === 'edit' ? state.editId : null;
    setHash(state.tableName, action, id, state.search, state.page);
}

async function openTable(tableName, search = '', options = {}) {
    if (!getTable(tableName)) {
        return;
    }

    state.tableName = tableName;
    state.view = 'table';
    clearFormState();
    dismissSidebarForm();
    state.search = search;
    state.columnFilters = {};
    state.page = options.page ?? 1;
    state.sort = resolveDefaultSort(getTable(tableName));
    syncTableHash();
    renderSidebar();
    await renderContent(options);
}

async function openCreateForm(tableName, options = {}) {
    state.tableName = tableName;
    state.view = 'table';
    state.mode = 'create';
    state.editId = null;
    syncTableHash();
    renderSidebar();
    await showInlineForm(options);
}

async function openEditForm(tableName, id, options = {}) {
    state.tableName = tableName;
    state.view = 'table';
    state.mode = 'edit';
    state.editId = id;
    syncTableHash();
    renderSidebar();
    await showInlineForm(options);
}

async function showInlineForm(options = {}) {
    const container = document.getElementById('dbContent');
    const hasTable = Boolean(container.querySelector('.db-table-panel'));

    if (!hasTable) {
        await renderContent(options);
    }

    mountInlineForm(container);
}

function mountInlineForm(container) {
    const sidebar = document.querySelector('.db-sidebar');
    const host = document.getElementById('dbSidebarForm');
    if (!sidebar || !host) {
        return;
    }

    host.innerHTML = renderFormView();
    host.hidden = false;
    sidebar.classList.add('db-sidebar--editing');

    bindFormEvents(host);
    initFloatingLabels(host);
    highlightActiveRow(container);
}

function closeInlineForm(container = document.getElementById('dbContent')) {
    clearFormState();
    syncTableHash();
    dismissSidebarForm();
    if (container) {
        highlightActiveRow(container);
    }
}

function dismissSidebarForm() {
    const sidebar = document.querySelector('.db-sidebar');
    const host = document.getElementById('dbSidebarForm');
    if (host) {
        host.innerHTML = '';
        host.hidden = true;
    }
    sidebar?.classList.remove('db-sidebar--editing');
}

function highlightActiveRow(container) {
    container.querySelectorAll('.db-data-row.is-editing').forEach((row) => {
        row.classList.remove('is-editing');
    });

    if (state.mode !== 'edit' || state.editId == null) {
        return;
    }

    const active = container.querySelector(`.db-data-row[data-id="${CSS.escape(String(state.editId))}"]`);
    active?.classList.add('is-editing');
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
            dismissSidebarForm();
            container.innerHTML = `
                <div class="db-placeholder">
                    <h2>Tablo Seçin</h2>
                    <p class="text-muted">Soldaki gruplardan bir tablo seçin. Her tabloda ekleme, silme, düzenleme, JSON içe/dışa aktarma ve seed’e dönüş var.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = renderTableView();
        bindTableEvents(container);
        if (state.mode === 'edit' || state.mode === 'create') {
            mountInlineForm(container);
        } else {
            dismissSidebarForm();
        }
        initFloatingLabels(container);
        syncTableHash();
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

            if (col.type === 'refs' && col.junction) {
                const ids = getJunctionChildIds(col, row[table.key]);
                return ids.some((id) => String(id) === String(filterValue));
            }

            const value = row[colName];
            if (value == null) {
                return false;
            }

            if (col.type === 'boolean') {
                const boolVal = value ? 'true' : 'false';
                return boolVal === filterValue;
            }

            if (col.type === 'enum' || col.type === 'ref' || col.match === 'exact') {
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
    const source = getSourceLabel(table.source);
    const description = table.description
        ? `<p class="db-table-desc text-muted mb-0">${escapeHtml(table.description)}</p>`
        : '';

    const header = `
        <div class="db-table-header mb-3">
            <div class="db-table-header-text">
                <h1 class="mb-0">${escapeHtml(table.displayName)}</h1>
                <div class="db-table-header-meta">
                    <span class="small text-muted">${escapeHtml(state.tableName)}</span>
                    <span class="badge db-source-badge db-source-badge--${escapeHtml(table.source || 'curated')}">${escapeHtml(source)}</span>
                </div>
                ${description}
            </div>
            <div class="db-table-actions">
                <button type="button" class="btn btn-success" id="btnCreate">+ Yeni</button>
                <button type="button" class="btn btn-outline-secondary" id="btnExport" title="JSON indir">Dışa aktar</button>
                <button type="button" class="btn btn-outline-secondary" id="btnImport" title="JSON yükle">İçe aktar</button>
                <button type="button" class="btn btn-outline-secondary" id="btnReseed" title="Seed dosyasından yenile">Seed’e dön</button>
                <input type="file" id="importFile" accept="application/json,.json" hidden>
            </div>
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
                        </tr>
                        <tr class="db-col-filters">
                            ${columns.map((col) => `<th${columnClassAttr(col)}><div class="db-col-filter-wrap">${renderColumnFilter(col)}</div></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length === 0
                            ? `<tr class="db-empty-row"><td colspan="${columns.length}" class="text-muted text-center py-3">Kayıt bulunamadı.</td></tr>`
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

    if ((column.type === 'ref' || column.type === 'refs') && column.refTable) {
        if (column.refTable === 'materialKeys') {
            return `
                <select class="form-select form-select-sm db-col-filter" data-col="${escapeHtml(column.name)}">
                    ${renderMaterialKeySelectOptions(column, filterValue, { emptyLabel: 'Tümü' })}
                </select>
            `;
        }
        const rows = getAll(column.refTable).slice().sort((a, b) => {
            const la = String(a[column.refLabel] ?? a.key ?? a.id);
            const lb = String(b[column.refLabel] ?? b.key ?? b.id);
            return la.localeCompare(lb, 'tr', { numeric: true });
        });
        return `
            <select class="form-select form-select-sm db-col-filter" data-col="${escapeHtml(column.name)}">
                <option value="">Tümü</option>
                ${rows.map((row) => {
                    const selected = String(filterValue) === String(row.id) ? ' selected' : '';
                    const text = column.refLabel ? row[column.refLabel] : (row.key || `#${row.id}`);
                    return `<option value="${escapeHtml(row.id)}"${selected}>${escapeHtml(text)}</option>`;
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

    if (column.format === 'materials' || column.type === 'refs') {
        return 'db-cell-mats';
    }

    if (column.type === 'ref' && column.refTable === 'materialKeys') {
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

function materialOptionIconAttr(row) {
    if (!row) {
        return '';
    }
    const uniqueName = bonusMaterialItemId(row.key) || getItemUniqueName(row.itemId);
    return uniqueName ? ` data-icon="${escapeHtml(uniqueName)}"` : '';
}

const MATERIAL_GROUPS = [
    { id: 'craft', label: 'İşlenmiş', columns: 4 },
    { id: 'refine', label: 'İşlenmemiş', columns: 5 },
    { id: 'other', label: 'Diğer', columns: 4 }
];

function sortedMaterialKeys() {
    return getAll('materialKeys').slice().sort((a, b) =>
        (Number(a.sortValue) || 0) - (Number(b.sortValue) || 0)
        || String(a.key || a.label).localeCompare(String(b.key || b.label), 'tr')
    );
}

function materialKeyOptionHtml(column, row, selectedValue) {
    const selected = String(selectedValue ?? '') === String(row.id) ? ' selected' : '';
    const text = column.refLabel ? String(row[column.refLabel] ?? row.key ?? row.id) : String(row.key || row.id);
    const iconAttr = materialOptionIconAttr(row);
    return `<option value="${escapeHtml(row.id)}"${selected}${iconAttr}>${escapeHtml(text)}</option>`;
}

function renderMaterialKeySelectOptions(column, selectedValue, { emptyLabel = '—' } = {}) {
    const rows = sortedMaterialKeys();
    const parts = [`<option value="">${escapeHtml(emptyLabel)}</option>`];

    for (const group of MATERIAL_GROUPS) {
        const items = rows.filter((row) => (row.matGroup || 'other') === group.id);
        if (!items.length) {
            continue;
        }
        parts.push(`<optgroup label="${escapeHtml(group.label)}">`);
        for (const row of items) {
            parts.push(materialKeyOptionHtml(column, row, selectedValue));
        }
        parts.push('</optgroup>');
    }

    return parts.join('');
}

function materialKeysFromIds(ids) {
    const byId = new Map(getAll('materialKeys').map((row) => [Number(row.id), row]));
    return (ids || [])
        .map((id) => byId.get(Number(id)))
        .filter(Boolean)
        .map((row) => row.key);
}

function renderMaterialsCell(ids) {
    const keys = materialKeysFromIds(ids);
    if (!keys.length) {
        return '<span class="text-muted">—</span>';
    }

    const labels = keys
        .map((key) => {
            const row = getAll('materialKeys').find((entry) => entry.key === key);
            return row?.label || key;
        })
        .join(', ');

    const icons = renderMatsHtml(keys);
    if (icons) {
        return `<span class="db-cell-mats" title="${escapeHtml(labels)}">${icons}</span>`;
    }

    return escapeHtml(labels);
}

function renderDataRow(table, columns, row) {
    const id = row[table.key];
    const isEditing = state.mode === 'edit' && String(state.editId) === String(id);
    const editingClass = isEditing ? ' is-editing' : '';
    const deleteBtn = `
        <button type="button" class="db-row-delete btn-delete" data-id="${escapeHtml(id)}" title="Sil" aria-label="Sil">
            <svg class="db-row-delete-icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M6.5 1h3a.5.5 0 0 1 .5.5V3h3.5a.5.5 0 0 1 0 1H2a.5.5 0 0 1 0-1H5.5V1.5a.5.5 0 0 1 .5-.5M3.118 4 3 4.059V13.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V4.059L12.882 4zM5 6.5a.5.5 0 0 1 .5-.5h.01a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h.01a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H8.5a.5.5 0 0 1-.5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
            </svg>
        </button>
    `;

    return `
        <tr class="db-data-row${editingClass}" data-id="${escapeHtml(id)}" tabindex="0">
            ${columns.map((col, index) => {
                const value = row[col.name];
                const cellClass = getCellClass(col, value);
                const classAttr = cellClass ? ` class="${cellClass}"` : '';
                return `<td${classAttr}>${index === 0 ? deleteBtn : ''}${formatCellValue(value, col, id, row)}</td>`;
            }).join('')}
        </tr>
    `;
}

function formatCellValue(value, column, parentId = null, row = null) {
    if (column.type === 'refs' && column.junction) {
        const ids = getJunctionChildIds(column, parentId);
        if (column.format === 'materials') {
            return renderMaterialsCell(ids);
        }
        if (!ids.length) {
            return '<span class="text-muted">—</span>';
        }
        const labels = ids.map((id) => {
            const ref = getAll(column.refTable).find((entry) => Number(entry.id) === Number(id));
            return ref ? (column.refLabel ? ref[column.refLabel] : `#${ref.id}`) : `#${id}`;
        });
        return escapeHtml(labels.join(', '));
    }

    if (value == null || value === '') {
        return '<span class="text-muted">—</span>';
    }

    if (column.type === 'boolean') {
        return value
            ? '<span class="badge bg-success">Evet</span>'
            : '<span class="badge bg-secondary">Hayır</span>';
    }

    if (column.type === 'ref' && column.refTable === 'materialKeys') {
        const refRow = getAll(column.refTable).find((entry) => String(entry.id) === String(value));
        if (refRow) {
            const text = column.refLabel ? String(refRow[column.refLabel] ?? refRow.id) : String(refRow.id);
            const icon = materialIconHtml(refRow);
            if (icon) {
                return `<span class="db-cell-mats" title="${escapeHtml(text)}">${icon}</span>`;
            }
            return escapeHtml(text);
        }
    }

    if (column.type === 'ref' && column.refTable) {
        const refRow = getAll(column.refTable).find((entry) => String(entry.id) === String(value));
        if (refRow) {
            const text = column.refLabel ? String(refRow[column.refLabel] ?? refRow.id) : String(refRow.id);
            return escapeHtml(text);
        }
    }

    if (state.tableName === 'materialKeys' && row && (column.name === 'key' || column.name === 'label' || column.name === 'itemId')) {
        const icon = materialIconHtml(row);
        const text = escapeHtml(String(value));
        if (icon && column.name === 'itemId') {
            return `<span class="db-cell-mats" title="${text}">${icon}<span class="db-cell-mats-id">${text}</span></span>`;
        }
        if (icon && column.name === 'key') {
            return `<span class="db-cell-mats" title="${text}">${icon}<span class="db-cell-mats-text">${text}</span></span>`;
        }
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
        return renderMaterialsCell(
            keys.map((key) => getAll('materialKeys').find((entry) => entry.key === key)?.id).filter(Boolean)
        );
    }

    const str = String(value);
    if (shouldTruncateCode(column, str)) {
        const display = str.slice(0, CODE_CHAR_LIMIT) + '...';
        return `<span class="db-cell-truncate" title="${escapeHtml(str)}">${escapeHtml(display)}</span>`;
    }

    return escapeHtml(str);
}

function bindRowActions(container) {
    container.querySelectorAll('.db-data-table tbody tr.db-data-row[data-id]').forEach((row) => {
        row.addEventListener('click', (event) => {
            if (event.target.closest('button, a, input, select, label')) {
                return;
            }
            void openEditForm(state.tableName, row.dataset.id);
        });
        row.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            if (event.target !== row) {
                return;
            }
            event.preventDefault();
            void openEditForm(state.tableName, row.dataset.id);
        });
    });

    container.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            void handleDeleteRow(container, btn.dataset.id);
        });
    });
}

async function handleDeleteRow(container, id) {
    if (!window.confirm('Bu kaydı silmek istediğine emin misin?')) {
        return;
    }

    showAreaLoader(container, 'Siliniyor…');
    await yieldToMain();

    try {
        deleteRow(state.tableName, id);
        if (state.mode === 'edit' && String(state.editId) === String(id)) {
            clearFormState();
            dismissSidebarForm();
        }
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
            tbody.innerHTML = `<tr class="db-empty-row"><td colspan="${columns.length}" class="text-muted text-center py-3">Kayıt bulunamadı.</td></tr>`;
        } else {
            tbody.innerHTML = rows.map((row) => renderDataRow(table, columns, row)).join('');
            bindRowActions(container);
            highlightActiveRow(container);
        }

        syncTableHash();
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

    container.querySelector('#btnExport')?.addEventListener('click', () => {
        downloadTableJson(state.tableName);
    });

    container.querySelector('#btnImport')?.addEventListener('click', () => {
        container.querySelector('#importFile')?.click();
    });

    container.querySelector('#importFile')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) {
            void handleImportFile(container, file);
        }
    });

    container.querySelector('#btnReseed')?.addEventListener('click', () => {
        void handleReseedTable(container);
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

function downloadTableJson(tableName) {
    const blob = new Blob([exportTableJson(tableName)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function handleReseedTable(container) {
    const table = getTable(state.tableName);
    if (!table?.seedUrl) {
        alert('Bu tablonun seed dosyası yok.');
        return;
    }

    try {
        const seedRows = await loadSeedRows(state.tableName);
        if (tableHasLocalChanges(state.tableName, seedRows)) {
            const ok = confirm(
                `"${table.displayName}" yerel değişiklik içeriyor.\n\nSeed dosyasına dönmek tüm yerel kayıtları siler. Devam edilsin mi?`
            );
            if (!ok) {
                return;
            }
        } else if (!confirm(`"${table.displayName}" seed dosyasından yenilensin mi?`)) {
            return;
        }
    } catch (error) {
        alert(error.message);
        return;
    }

    showAreaLoader(container, 'Seed yükleniyor…');
    await yieldToMain();

    try {
        await reseedTable(state.tableName);
        renderSidebar();
        await openTable(state.tableName, state.search, { showLoader: false });
    } catch (error) {
        alert(error.message);
    } finally {
        hideAreaLoader(container);
    }
}

async function handleImportFile(container, file) {
    let rows;
    try {
        const text = await file.text();
        rows = JSON.parse(text);
        if (!Array.isArray(rows)) {
            throw new Error('JSON bir dizi olmalı');
        }
    } catch (error) {
        alert(`JSON okunamadı: ${error.message}`);
        return;
    }

    const table = getTable(state.tableName);
    const localCount = getRowCount(state.tableName);
    let mode = 'replace';

    if (localCount > 0) {
        const choice = window.prompt(
            `"${table.displayName}" içinde ${localCount} kayıt var.\n\n` +
            `Nasıl içe aktarılsın?\n` +
            `• replace — hepsini sil, dosyadakileri yaz\n` +
            `• merge — aynı id’leri güncelle, yenileri ekle\n` +
            `• cancel — iptal\n`,
            'merge'
        );

        if (!choice || choice.trim().toLowerCase() === 'cancel') {
            return;
        }

        mode = choice.trim().toLowerCase();
        if (mode !== 'replace' && mode !== 'merge') {
            alert('Geçersiz seçim. replace, merge veya cancel yazın.');
            return;
        }
    }

    showAreaLoader(container, 'İçe aktarılıyor…');
    await yieldToMain();

    try {
        if (mode === 'merge') {
            const result = mergeImportedRows(state.tableName, rows);
            alert(`Birleştirildi: ${result.added} yeni, ${result.updated} güncellendi (${result.total} toplam).`);
        } else {
            replaceAllRows(state.tableName, rows);
            alert(`Değiştirildi: ${rows.length} kayıt.`);
        }
        renderSidebar();
        await openTable(state.tableName, state.search, { showLoader: false });
    } catch (error) {
        alert(error.message);
    } finally {
        hideAreaLoader(container);
    }
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
        return '<div class="db-inline-form"><div class="alert alert-info mb-0">Kayıt bulunamadı.</div></div>';
    }

    const title = isEdit ? 'Kayıt Düzenle' : 'Yeni Kayıt';

    return `
        <div class="db-inline-form">
            <div class="db-inline-form-head">
                <h2 class="db-inline-form-title">${title}</h2>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="btnCancel">Kapat</button>
            </div>
            <form class="form-grid db-inline-form-grid" id="recordForm">
                ${isEdit ? renderKeyField(table, record) : ''}
                ${getEditableColumns(table).map((col) => renderField(col, record)).join('')}
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Kaydet' : 'Oluştur'}</button>
                    <button type="button" class="btn btn-outline-secondary" id="btnCancelSecondary">İptal</button>
                </div>
            </form>
        </div>
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
        const defaultOn = !record && (column.name === 'isActive' || column.name === 'isEquipable');
        const checked = (value ?? defaultOn) ? ' checked' : '';
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

    if (column.type === 'ref' && column.refTable) {
        if (column.refTable === 'materialKeys') {
            return `
                <div class="form-floating">
                    <select class="form-select" name="${escapeHtml(column.name)}" id="field-${escapeHtml(column.name)}">${renderMaterialKeySelectOptions(column, value)}</select>
                    <label for="field-${escapeHtml(column.name)}">${escapeHtml(label)}</label>
                </div>
            `;
        }
        const rows = getAll(column.refTable).slice().sort((a, b) => {
            const la = String(a[column.refLabel] ?? a.id);
            const lb = String(b[column.refLabel] ?? b.id);
            return la.localeCompare(lb, 'tr', { numeric: true });
        });
        const options = [
            `<option value="">—</option>`,
            ...rows.map((row) => {
                const selected = String(value ?? '') === String(row.id) ? ' selected' : '';
                const text = column.refLabel ? String(row[column.refLabel] ?? row.id) : String(row.id);
                return `<option value="${escapeHtml(row.id)}"${selected}>${escapeHtml(text)}</option>`;
            })
        ].join('');

        return `
            <div class="form-floating">
                <select class="form-select" name="${escapeHtml(column.name)}" id="field-${escapeHtml(column.name)}">${options}</select>
                <label for="field-${escapeHtml(column.name)}">${escapeHtml(label)}</label>
            </div>
        `;
    }

    if (column.type === 'refs' && column.refTable) {
        const selected = new Set(
            (column.junction && record
                ? getJunctionChildIds(column, record[getTable(state.tableName).key])
                : Array.isArray(value) ? value : []
            ).map(Number)
        );

        if (column.format === 'materials' && column.refTable === 'materialKeys') {
            return renderMaterialRefsField(column, label, selected);
        }

        const rows = getAll(column.refTable).slice().sort((a, b) => {
            const la = String(a[column.refLabel] ?? a.key ?? a.id);
            const lb = String(b[column.refLabel] ?? b.key ?? b.id);
            return la.localeCompare(lb, 'tr', { numeric: true });
        });
        const checks = rows.map((row) => renderRefsOption(column, row, selected)).join('');

        return `
            <fieldset class="db-refs-field">
                <legend class="db-refs-legend">${escapeHtml(label)}</legend>
                <div class="db-refs-grid">${checks || '<span class="text-muted">Kayıt yok</span>'}</div>
            </fieldset>
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

function materialIconHtml(row) {
    const uniqueName = bonusMaterialItemId(row.key) || getItemUniqueName(row.itemId);
    return itemIconHtml(uniqueName, { size: 28, className: 'item-icon db-refs-mat-icon' }) || '';
}

function renderRefsOption(column, row, selected, { withIcon = false } = {}) {
    const id = `field-${column.name}-${row.id}`;
    const checked = selected.has(Number(row.id)) ? ' checked' : '';
    const text = column.refLabel ? String(row[column.refLabel] ?? row.key ?? row.id) : String(row.key || row.id);
    const icon = withIcon ? materialIconHtml(row) : '';
    const titleAttr = withIcon ? ` title="${escapeHtml(text)}"` : '';
    return `
        <div class="form-check db-refs-option${withIcon ? ' db-refs-option--mat' : ''}"${titleAttr}>
            <input class="form-check-input" type="checkbox" name="${escapeHtml(column.name)}" id="${escapeHtml(id)}" value="${escapeHtml(row.id)}"${checked}>
            <label class="form-check-label" for="${escapeHtml(id)}">
                ${icon}<span class="db-refs-option-text">${escapeHtml(text)}</span>
            </label>
        </div>
    `;
}

function renderMaterialRefsField(column, label, selected) {
    const rows = sortedMaterialKeys();

    const sections = MATERIAL_GROUPS.map((group) => {
        const items = rows.filter((row) => (row.matGroup || 'other') === group.id);
        if (!items.length) {
            return '';
        }
        const checks = items.map((row) => renderRefsOption(column, row, selected, { withIcon: true })).join('');
        return `
            <div class="db-refs-group" data-mat-group="${escapeHtml(group.id)}">
                <div class="db-refs-group-title">${escapeHtml(group.label)}</div>
                <div class="db-refs-grid db-refs-grid--${escapeHtml(group.id)}">${checks}</div>
            </div>
        `;
    }).filter(Boolean).join('');

    return `
        <fieldset class="db-refs-field db-refs-field--materials">
            <legend class="db-refs-legend">${escapeHtml(label)}</legend>
            ${sections || '<span class="text-muted">Kayıt yok</span>'}
        </fieldset>
    `;
}

function bindFormEvents(root) {
    const close = () => {
        closeInlineForm(document.getElementById('dbContent'));
    };

    root.querySelector('#btnCancel')?.addEventListener('click', close);
    root.querySelector('#btnCancelSecondary')?.addEventListener('click', close);

    root.querySelector('#recordForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void handleFormSubmit(document.getElementById('dbContent'), event.target);
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

        clearFormState();
        syncTableHash();
        renderSidebar();
        await renderContent({ showLoader: false });
    } catch (error) {
        alert(error.message);
    } finally {
        hideAreaLoader(container);
    }
}

boot();
