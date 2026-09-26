function siteBase() {
    return new URL('.', document.baseURI);
}

export function routeHref(route) {
    const clean = String(route || '').replace(/^\/+|\/+$/g, '');
    return new URL(clean ? `${clean}/` : '', siteBase()).href;
}

export function routeFromPathname(pathname = location.pathname) {
    const basePath = new URL('.', document.baseURI).pathname;
    const relative = String(pathname).startsWith(basePath)
        ? String(pathname).slice(basePath.length)
        : String(pathname);
    const parts = relative.replace(/\/+$/, '').split('/').filter(Boolean);
    return parts.at(-1) || '';
}

export function currentRoute() {
    return routeFromPathname();
}

export function isCurrentRoute(route) {
    return currentRoute() === String(route || '').replace(/^\/+|\/+$/g, '');
}
