import { getSitePages, getSiteTools } from './catalog.js';

function siteBase() {
    return new URL('.', document.baseURI);
}

function allPages() {
    return [...getSitePages(), ...getSiteTools()];
}

export function pageById(pageId) {
    return allPages().find((page) => page.id === pageId) || null;
}

export function routeHref(pageId) {
    const page = pageById(pageId);
    if (!page) throw new Error(`Unknown page id: ${pageId}`);
    return new URL(page.path ? `${page.path}/` : '', siteBase()).pathname;
}

export function routeFromPathname(pathname = location.pathname) {
    const basePath = new URL('.', document.baseURI).pathname;
    const relative = String(pathname).startsWith(basePath)
        ? String(pathname).slice(basePath.length)
        : String(pathname);
    return relative.replace(/^\/+|\/+$/g, '');
}

export function currentRoute() {
    return routeFromPathname();
}

export function currentPageId() {
    const route = currentRoute();
    return allPages().find((page) => page.path === route)?.id || null;
}

export function isCurrentRoute(pageId) {
    return currentPageId() === pageId;
}
