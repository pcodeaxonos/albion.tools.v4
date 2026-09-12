export function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function pageFileStem(pathOrHref) {
    const raw = String(pathOrHref || '').split(/[?#]/)[0];
    let name = raw.split('/').pop() || '';
    try {
        name = decodeURIComponent(name);
    } catch {
        // keep the raw segment
    }
    name = name.toLowerCase();
    if (!name || name === 'index.html' || name === 'index') {
        return 'index';
    }
    return name.endsWith('.html') ? name.slice(0, -5) : name;
}
