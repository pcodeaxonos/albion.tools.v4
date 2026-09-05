const PAGE_LOADER_ID = 'page-loader';
const AREA_LOADER_CLASS = 'area-loader';
const AREA_LOADER_ATTR = 'data-area-loader';

const areaLoaders = new WeakMap();
const activeAreaLoaders = new Set();
const overlayObservers = new WeakMap();

let pinListening = false;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function spinnerMarkup() {
    return `
        <div class="loader-sigil" aria-hidden="true">
            <svg class="loader-sigil__svg" viewBox="0 0 72 72" fill="none">
                <g class="loader-sigil__orbit loader-sigil__orbit--outer">
                    <circle class="loader-sigil__gold" cx="36" cy="36" r="30" stroke-width="1.2"></circle>
                    <path class="loader-sigil__gold" stroke-width="1.6" d="M36 4v6M36 62v6M4 36h6M62 36h6"></path>
                    <path class="loader-sigil__gold" stroke-width="1.1" d="M14.4 14.4l4.2 4.2M53.4 53.4l4.2 4.2M53.4 14.4l4.2-4.2M14.4 57.6l4.2-4.2"></path>
                </g>
                <g class="loader-sigil__orbit loader-sigil__orbit--runes">
                    <circle class="loader-sigil__gold" cx="36" cy="36" r="24" stroke-width="1" stroke-dasharray="1.6 5.2"></circle>
                </g>
                <g class="loader-sigil__orbit loader-sigil__orbit--inner">
                    <circle class="loader-sigil__silver" cx="36" cy="36" r="16" stroke-width="1.15" stroke-dasharray="22 10" stroke-linecap="square"></circle>
                </g>
                <path class="loader-sigil__gem" d="M36 24 L46 36 L36 48 L26 36 Z"></path>
            </svg>
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

export function showPageLoader(message) {
    const loader = document.getElementById(PAGE_LOADER_ID);
    if (!loader) {
        return;
    }

    setMessage(loader, message);
    loader.hidden = false;
    loader.removeAttribute('aria-hidden');
    document.body.classList.add('is-page-loading');
}

export function hidePageLoader() {
    const loader = document.getElementById(PAGE_LOADER_ID);
    if (!loader) {
        return;
    }

    loader.hidden = true;
    loader.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-page-loading');
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
        <div id="${PAGE_LOADER_ID}" class="page-loader" hidden aria-hidden="true" aria-live="polite">
            <div class="page-loader__inner">
                ${spinnerMarkup()}
                ${messageMarkup}
            </div>
        </div>
    `;
}
