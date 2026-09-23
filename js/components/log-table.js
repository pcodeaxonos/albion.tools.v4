/**
 * Shared binder for tool record logs (`.log-table`).
 * Click a `tr[data-id]` → onSelect(id, rowEl).
 */
export function bindLogTableRows(container, onSelect, { table = '.log-table' } = {}) {
    if (!container || typeof onSelect !== 'function') {
        return;
    }
    container.querySelectorAll(`${table} tbody tr[data-id]`).forEach((row) => {
        row.addEventListener('click', () => {
            onSelect(row.dataset.id, row);
        });
    });
}
