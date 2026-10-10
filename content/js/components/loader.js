import { escapeHtml } from '../utils/utils.js';

const PAGE_LOADER_ID = 'page-loader';
const AREA_LOADER_CLASS = 'area-loader';
const AREA_LOADER_ATTR = 'data-area-loader';

const areaLoaders = new WeakMap();
const activeAreaLoaders = new Set();
const overlayObservers = new WeakMap();

let pinListening = false;
let pageLoaderListening = false;
let pageLoaderObserver = null;

function spinnerMarkup() {
    return `
        <div class="at-classic-flip" role="status" aria-label="Yükleniyor">
            <span class="at-classic-flip__shadow" aria-hidden="true"></span>
            <span class="at-classic-flip__coin" aria-hidden="true"><i class="at-classic-flip__mark">◆</i></span>
        </div>
    `;
}

function setMessage(root, message) {
    const messageEl = root.querySelector('.loader-message');
    if (!messageEl) {
        return;
    }

    if (message) {
        messageEl.textContent = message;
        messageEl.hidden = false;
    } else {
        messageEl.textContent = '';
        messageEl.hidden = true;
    }
}

function ensureRelativePosition(container) {
    const style = getComputedStyle(container);
    if (style.position === 'static') {
        container.dataset.loaderPositionPatched = 'true';
        container.style.position = 'relative';
    }
}

function restorePosition(container) {
    if (container.dataset.loaderPositionPatched === 'true') {
        delete container.dataset.loaderPositionPatched;
        container.style.position = '';
    }
}

function getViewportClipTop() {
    const bar = document.querySelector('.app-topbar') || document.querySelector('.navbar');
    if (!bar) {
        return 0;
    }

    const style = getComputedStyle(bar);
    if (style.display === 'none') {
        return 0;
    }

    if (style.position !== 'sticky' && style.position !== 'fixed') {
        return 0;
    }

    return Math.max(0, bar.getBoundingClientRect().bottom);
}

function pinAreaLoader(overlay) {
    const inner = overlay.querySelector('.area-loader__inner');
    if (!inner || overlay.hidden) {
        return;
    }

    const rect = overlay.getBoundingClientRect();
    const viewTop = getViewportClipTop();
    const viewBottom = window.innerHeight;
    const visibleTop = Math.min(Math.max(rect.top, viewTop), viewBottom);
    const visibleBottom = Math.max(Math.min(rect.bottom, viewBottom), viewTop);
    const visibleHeight = visibleBottom - visibleTop;

    if (visibleHeight <= 0) {
        return;
    }

    const offset = visibleTop + visibleHeight / 2 - rect.top;
    inner.style.setProperty('--loader-pin-y', `${offset}px`);
}

function pinAllAreaLoaders() {
    activeAreaLoaders.forEach(pinAreaLoader);
}

function startPinListening() {
    if (pinListening) {
        return;
    }

    pinListening = true;
    window.addEventListener('scroll', pinAllAreaLoaders, { passive: true, capture: true });
    window.addEventListener('resize', pinAllAreaLoaders);
}

function stopPinListening() {
    if (activeAreaLoaders.size > 0 || !pinListening) {
        return;
    }

    pinListening = false;
    window.removeEventListener('scroll', pinAllAreaLoaders, { capture: true });
    window.removeEventListener('resize', pinAllAreaLoaders);
}

function watchAreaLoader(overlay) {
    activeAreaLoaders.add(overlay);
    pinAreaLoader(overlay);
    requestAnimationFrame(() => pinAreaLoader(overlay));
    startPinListening();

    if (typeof ResizeObserver === 'undefined' || overlayObservers.has(overlay)) {
        return;
    }

    const observer = new ResizeObserver(() => pinAreaLoader(overlay));
    observer.observe(overlay);
    overlayObservers.set(overlay, observer);
}

function unwatchAreaLoader(overlay) {
    activeAreaLoaders.delete(overlay);

    const observer = overlayObservers.get(overlay);
    if (observer) {
        observer.disconnect();
        overlayObservers.delete(overlay);
    }

    const inner = overlay.querySelector('.area-loader__inner');
    inner?.style.removeProperty('--loader-pin-y');
    stopPinListening();
}

export function yieldToMain() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 0);
        });
    });
}

function toolPageFrame() {
    return document.querySelector('main.tool-page');
}

function syncPageLoaderFrame(loader) {
    const page = toolPageFrame();
    if (!page) {
        loader.classList.remove('is-tool-bound');
        return;
    }

    const rect = page.getBoundingClientRect();
    loader.style.setProperty('--page-loader-top', `${rect.top}px`);
    loader.style.setProperty('--page-loader-left', `${rect.left}px`);
    loader.style.setProperty('--page-loader-width', `${rect.width}px`);
    loader.style.setProperty('--page-loader-height', `${rect.height}px`);
    loader.classList.add('is-tool-bound');
}

function onPageLoaderFrame() {
    const loader = document.querySelector('[data-page-loader]');
    if (!loader || loader.hidden) {
        return;
    }

    syncPageLoaderFrame(loader);
}

function watchPageLoader(loader) {
    syncPageLoaderFrame(loader);

    if (!pageLoaderListening) {
        pageLoaderListening = true;
        window.addEventListener('scroll', onPageLoaderFrame, { passive: true, capture: true });
        window.addEventListener('resize', onPageLoaderFrame);
    }

    const page = toolPageFrame();
    if (!page || typeof ResizeObserver === 'undefined') {
        return;
    }

    pageLoaderObserver?.disconnect();
    pageLoaderObserver = new ResizeObserver(onPageLoaderFrame);
    pageLoaderObserver.observe(page);
    requestAnimationFrame(onPageLoaderFrame);
}

function unwatchPageLoader(loader) {
    if (pageLoaderListening) {
        pageLoaderListening = false;
        window.removeEventListener('scroll', onPageLoaderFrame, { capture: true });
        window.removeEventListener('resize', onPageLoaderFrame);
    }

    pageLoaderObserver?.disconnect();
    pageLoaderObserver = null;
    loader.classList.remove('is-tool-bound');
    loader.style.removeProperty('--page-loader-top');
    loader.style.removeProperty('--page-loader-left');
    loader.style.removeProperty('--page-loader-width');
    loader.style.removeProperty('--page-loader-height');
}

export function showPageLoader(message) {
    const loader = document.querySelector('[data-page-loader]');
    if (!loader) {
        return;
    }

    setMessage(loader, message);
    loader.hidden = false;
    loader.removeAttribute('aria-hidden');
    document.body.classList.add('is-page-loading');
    watchPageLoader(loader);
}

export function hidePageLoader() {
    const loader = document.querySelector('[data-page-loader]');
    if (!loader) {
        return;
    }

    loader.hidden = true;
    loader.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-page-loading');
    unwatchPageLoader(loader);
}

export function showAreaLoader(container, message) {
    if (!container) {
        return;
    }

    let overlay = areaLoaders.get(container);

    if (!overlay || !container.contains(overlay)) {
        ensureRelativePosition(container);
        overlay = document.createElement('div');
        overlay.className = AREA_LOADER_CLASS;
        overlay.setAttribute(AREA_LOADER_ATTR, 'true');
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = `
            <div class="area-loader__inner">
                ${spinnerMarkup()}
                <p class="loader-message" hidden></p>
            </div>
        `;
        container.appendChild(overlay);
        areaLoaders.set(container, overlay);
    }

    setMessage(overlay, message);
    overlay.hidden = false;
    overlay.removeAttribute('aria-hidden');
    container.classList.add('has-area-loader');
    container.setAttribute('aria-busy', 'true');
    watchAreaLoader(overlay);
}

export function hideAreaLoader(container) {
    if (!container) {
        return;
    }

    const overlay = areaLoaders.get(container);
    if (!overlay) {
        container.classList.remove('has-area-loader');
        container.removeAttribute('aria-busy');
        restorePosition(container);
        return;
    }

    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    container.classList.remove('has-area-loader');
    container.removeAttribute('aria-busy');
    unwatchAreaLoader(overlay);
    restorePosition(container);
}

export async function withAreaLoader(container, fn, message) {
    showAreaLoader(container, message);
    await yieldToMain();

    try {
        return await fn();
    } finally {
        hideAreaLoader(container);
    }
}

export async function withPageLoader(fn, message) {
    showPageLoader(message);
    await yieldToMain();

    try {
        return await fn();
    } finally {
        hidePageLoader();
    }
}

export function pageLoaderTemplate(message) {
    const safeMessage = message ? escapeHtml(message) : '';
    const messageMarkup = message
        ? `<p class="loader-message">${safeMessage}</p>`
        : '<p class="loader-message" hidden></p>';

    return `
        <div data-page-loader class="page-loader" hidden aria-hidden="true" aria-live="polite">
            <div class="page-loader__inner">
                ${spinnerMarkup()}
                ${messageMarkup}
            </div>
        </div>
    `;
}
