const bindings = new WeakMap();

function readPx(el, name) {
    return parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;
}

function findScrollRoot(el) {
    return el?.closest('.app-content') || null;
}

function ensureSentinel(target, attr) {
    const prev = target.previousElementSibling;
    if (prev?.hasAttribute(attr)) {
        return prev;
    }

    const sentinel = document.createElement('div');
    sentinel.className = 'calc-sticky-sentinel';
    sentinel.setAttribute(attr, '');
    sentinel.setAttribute('aria-hidden', 'true');
    target.before(sentinel);
    return sentinel;
}

function observePinned(sentinel, target, root, topOffset) {
    const io = new IntersectionObserver(
        ([entry]) => {
            if (!entry) {
                return;
            }
            target.classList.toggle('is-stuck', !entry.isIntersecting);
        },
        {
            root,
            threshold: 0,
            rootMargin: `-${Math.max(0, Math.ceil(topOffset))}px 0px 0px 0px`
        }
    );
    io.observe(sentinel);
    return io;
}

function applyToolbarHeight(root, toolbar) {
    const height = toolbar ? Math.ceil(toolbar.getBoundingClientRect().height) : 0;
    root.style.setProperty('--calc-toolbar-height', `${height}px`);
}

export function bindCalcSticky(root, toolbar = root?.querySelector('[data-calc-toolbar]')) {
    if (!root) {
        return;
    }

    bindings.get(root)?.disconnect();
    document.body.classList.add('calc-page');

    const tables = [...root.querySelectorAll('.calc-table')];
    if (!toolbar && tables.length === 0) {
        applyToolbarHeight(root, null);
        return;
    }

    const scrollRoot = findScrollRoot(toolbar || tables[0] || root);
    const pinObservers = [];

    const bindPinState = () => {
        pinObservers.splice(0).forEach((observer) => observer.disconnect());

        const navbarHeight = readPx(document.documentElement, '--navbar-height');
        const statusHeight = readPx(document.documentElement, '--status-bar-height');
        const chromeTop = navbarHeight + statusHeight;
        let toolbarHeight = 0;

        if (toolbar) {
            const toolbarSentinel = ensureSentinel(toolbar, 'data-calc-toolbar-sentinel');
            pinObservers.push(observePinned(toolbarSentinel, toolbar, scrollRoot, chromeTop));
            toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height);
        }

        applyToolbarHeight(root, toolbar);

        root.querySelectorAll('.calc-table').forEach((table) => {
            const thead = table.tHead;
            const theadHeight = thead ? Math.ceil(thead.getBoundingClientRect().height) : 0;
            table.style.setProperty(
                '--calc-thead-height',
                `${Math.max(theadHeight, 1)}px`
            );
            const sentinel = ensureSentinel(table, 'data-calc-thead-sentinel');
            pinObservers.push(observePinned(sentinel, table, scrollRoot, chromeTop + toolbarHeight));
        });
    };

    bindPinState();

    const resizeObserver = new ResizeObserver(() => bindPinState());
    if (toolbar) {
        resizeObserver.observe(toolbar);
    }
    root.querySelectorAll('.calc-table').forEach((table) => resizeObserver.observe(table));

    const media = window.matchMedia('(max-width: 767px)');
    const onBreakpoint = () => bindPinState();
    media.addEventListener('change', onBreakpoint);

    bindings.set(root, {
        disconnect() {
            resizeObserver.disconnect();
            media.removeEventListener('change', onBreakpoint);
            pinObservers.splice(0).forEach((observer) => observer.disconnect());
        }
    });
}
