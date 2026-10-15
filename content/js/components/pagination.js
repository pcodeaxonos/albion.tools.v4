export function paginationPages(page, totalPages) {
    const total = Math.max(1, Math.trunc(Number(totalPages)) || 1);
    const current = Math.min(total, Math.max(1, Math.trunc(Number(page)) || 1));
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const start = Math.max(2, Math.min(current - 1, total - 3));
    const end = Math.min(total - 1, Math.max(current + 1, 4));
    const pages = [1];
    if (start > 2) pages.push('…');
    for (let value = start; value <= end; value++) pages.push(value);
    if (end < total - 1) pages.push('…');
    pages.push(total);
    return pages;
}

// Page targets are one-based, including previous and next arrows.
export function paginationHtml(page, totalPages) {
    const total = Math.max(1, Math.trunc(Number(totalPages)) || 1);
    const current = Math.min(total, Math.max(1, Math.trunc(Number(page)) || 1));
    const arrow = direction => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'}"/></svg>`;
    const button = (target, label, content, disabled = false) => `<button type="button" class="pagination-button${target === current ? ' is-active' : ''}" data-pagination-page="${target}" aria-label="${label}"${target === current ? ' aria-current="page"' : ''}${disabled ? ' disabled' : ''}>${content}</button>`;
    return `<nav class="pagination" aria-label="Sayfalama">${button(current - 1, 'Önceki sayfa', arrow(-1), current === 1)}${paginationPages(current, total).map(value => value === '…' ? '<span class="pagination-gap" aria-hidden="true">…</span>' : button(value, `Sayfa ${value}`, value)).join('')}${button(current + 1, 'Sonraki sayfa', arrow(1), current === total)}</nav>`;
}
