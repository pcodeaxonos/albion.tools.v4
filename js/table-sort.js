import { escapeHtml } from './utils.js';

const LOCALE = 'tr';

function cellText(cell) {
    return (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function parseSortNumber(text) {
    let raw = String(text).trim();
    if (!raw || raw === '—' || raw === '–' || raw === '-') {
        return null;
    }

    raw = raw.replace(/%/g, '').replace(/\s/g, '');

    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw) || /^-?\d+,\d+$/.test(raw)) {
        raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
        raw = raw.replace(/,/g, '');
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

export function parseSortDate(text) {
    const raw = String(text).trim();
    if (!raw) {
        return null;
    }

    const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy) {
        const stamp = Date.parse(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
        return Number.isNaN(stamp) ? null : stamp;
    }

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const stamp = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
        return Number.isNaN(stamp) ? null : stamp;
    }

    return null;
}

function readCellValue(cell, type) {
    if (cell?.hasAttribute('data-sort-value')) {
        const raw = cell.dataset.sortValue;
        if (raw === '') {
            return null;
        }
        if (type === 'number') {
            const numeric = Number(raw);
            return Number.isFinite(numeric) ? numeric : parseSortNumber(raw);
        }
        if (type === 'date') {
            return parseSortDate(raw) ?? parseSortDate(cellText(cell));
        }
        return raw;
    }

    const text = cellText(cell);
    if (!text || text === '—') {
        return null;
    }
    if (type === 'number') {
        return parseSortNumber(text);
    }
    if (type === 'date') {
        return parseSortDate(text);
    }
    return text;
}

export function compareSortValues(a, b, type, direction) {
    const emptyA = a == null || a === '';
    const emptyB = b == null || b === '';
    if (emptyA && emptyB) {
        return 0;
    }
    if (emptyA) {
        return 1;
    }
    if (emptyB) {
        return -1;
    }

    const mul = direction === 'desc' ? -1 : 1;
    if (type === 'number' || type === 'date') {
        return (a - b) * mul;
    }

    return String(a).localeCompare(String(b), LOCALE, {
        numeric: true,
        sensitivity: 'base'
    }) * mul;
}

export function sortHeaderHtml(label, options = {}) {
    const { key, type = 'text', className = '', direction = null, title = '' } = options;
    const classes = className ? ` class="${escapeHtml(className)}"` : '';
    const aria = direction === 'desc' ? 'descending' : direction === 'asc' ? 'ascending' : 'none';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';

    return `<th${classes} data-sort="${escapeHtml(type)}" data-sort-key="${escapeHtml(key)}" aria-sort="${aria}"${titleAttr}><button type="button" class="table-sort-btn"${titleAttr}>${escapeHtml(label)}</button></th>`;
}

export function applyHeaderSortState(table, key, direction) {
    const headers = table.tHead?.rows[0]?.cells ?? [];
    for (const th of headers) {
        if (!th.querySelector('.table-sort-btn')) {
            continue;
        }
        th.setAttribute(
            'aria-sort',
            th.dataset.sortKey === key
                ? (direction === 'desc' ? 'descending' : 'ascending')
                : 'none'
        );
    }
}

export function sortTableRows(table, index, type, direction) {
    const tbody = table.tBodies[0];
    if (!tbody) {
        return;
    }

    const rows = [...tbody.rows];
    rows.sort((left, right) => compareSortValues(
        readCellValue(left.cells[index], type),
        readCellValue(right.cells[index], type),
        type,
        direction
    ));
    tbody.append(...rows);
}

export function applyTableSort(table, key, direction) {
    const th = [...(table.tHead?.rows[0]?.cells ?? [])]
        .find((cell) => cell.dataset.sortKey === key);
    if (!th) {
        return;
    }

    applyHeaderSortState(table, key, direction);
    sortTableRows(table, th.cellIndex, th.dataset.sort || 'text', direction);
}

function nextDirection(current, type) {
    if (current === 'ascending') {
        return 'desc';
    }
    if (current === 'descending') {
        return 'asc';
    }
    return type === 'number' || type === 'date' ? 'desc' : 'asc';
}

export function initTableSort(table, options = {}) {
    if (!table?.tHead?.rows[0]) {
        return;
    }

    const headerRow = table.tHead.rows[0];

    headerRow.addEventListener('click', (event) => {
        const th = event.target.closest('th');
        if (!th || !headerRow.contains(th) || th.dataset.sort === 'false') {
            return;
        }
        if (!th.querySelector('.table-sort-btn')) {
            return;
        }

        const key = th.dataset.sortKey ?? String(th.cellIndex);
        const type = th.dataset.sort || 'text';
        const direction = nextDirection(th.getAttribute('aria-sort') || 'none', type);

        applyHeaderSortState(table, key, direction);
        if (options.sortBody !== false) {
            sortTableRows(table, th.cellIndex, type, direction);
        }

        options.onSort?.({ key, type, direction, index: th.cellIndex });
    });

    if (options.initial?.key) {
        applyTableSort(table, options.initial.key, options.initial.direction || 'asc');
    }
}
