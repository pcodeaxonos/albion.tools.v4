let initialized = false;

/** Plain text stays safe; line breaks and sentences become scan-friendly rows. */
export function renderTooltipContent(tip, text, document) {
    const lines = text.trim().split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ—])/u)
        .map(line => line.trim().replace(/^(?:[-•]\s+)/u, '')).filter(Boolean);
    tip.replaceChildren();
    if (lines.length === 1) {
        tip.textContent = lines[0];
        return;
    }
    if (lines[0].length <= 90 && !/[.!?]$/.test(lines[0])) {
        const heading = document.createElement('strong');
        heading.className = 'app-tooltip-heading';
        heading.textContent = lines.shift();
        tip.append(heading);
    }
    const list = document.createElement('ul');
    list.className = 'app-tooltip-list';
    for (const line of lines) {
        const item = document.createElement('li');
        item.textContent = line;
        list.append(item);
    }
    tip.append(list);
}

/** Delegated tooltips cover controls rendered after page initialization. */
export function initTooltips() {
    if (initialized) return;
    initialized = true;
    const tip = document.createElement('div');
    tip.className = 'app-tooltip';
    tip.id = 'app-tooltip-description'; // Accessibility relationship only.
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('popover', 'manual');
    document.body.append(tip);
    let active = null;
    let timer;
    let leaveTimer;
    const hook = '[data-app-tooltip]';
    function hide() {
        clearTimeout(timer);
        clearTimeout(leaveTimer);
        if (active) {
            const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
            if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
            else active.removeAttribute('aria-describedby');
        }
        active = null;
        if (typeof tip.hidePopover === 'function' && tip.matches(':popover-open')) tip.hidePopover();
        tip.classList.remove('is-open');
    }
    function show(node, immediate = false) {
        if (node === active) return;
        hide();
        if (!node?.dataset.appTooltip?.trim()) return;
        active = node;
        timer = setTimeout(() => {
            if (!node.isConnected) return hide();
            renderTooltipContent(tip, node.dataset.appTooltip, document);
            const ids = new Set((node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
            ids.add(tip.id);
            node.setAttribute('aria-describedby', [...ids].join(' '));
            if (typeof tip.showPopover === 'function') tip.showPopover();
            else tip.classList.add('is-open');
            const rect = node.getBoundingClientRect();
            const box = tip.getBoundingClientRect();
            const gap = 8;
            tip.style.left = `${Math.max(gap, Math.min(rect.left, innerWidth - box.width - gap))}px`;
            const below = rect.bottom + gap;
            tip.style.top = `${Math.max(gap, Math.min(below + box.height <= innerHeight - gap ? below : rect.top - box.height - gap, innerHeight - box.height - gap))}px`;
        }, immediate ? 0 : 180);
    }
    document.addEventListener('pointerover', event => {
        if (tip.contains(event.target)) { clearTimeout(leaveTimer); return; }
        clearTimeout(leaveTimer);
        if (event.pointerType !== 'touch') show(event.target.closest?.(hook));
    });
    document.addEventListener('pointerout', event => {
        if (active && !active.contains(event.relatedTarget) && !tip.contains(event.relatedTarget)) leaveTimer = setTimeout(hide, 100);
    });
    document.addEventListener('focusin', event => show(event.target.closest?.(hook), true));
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', event => {
        if (event.target === tip) return;
        const focused = active?.contains(document.activeElement) ? active : null;
        hide();
        if (focused) show(focused, true);
    }, true);
    window.addEventListener('resize', hide);
    new MutationObserver(records => {
        if (active && !active.isConnected) hide();
        else if (active && records.some(record => record.type === 'attributes' && record.target === active)) {
            const node = active;
            hide();
            show(node, true);
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-app-tooltip'] });
}
