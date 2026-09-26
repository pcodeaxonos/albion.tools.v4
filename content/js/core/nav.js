import { escapeHtml } from '../utils/utils.js';
import { currentPageId, isCurrentRoute, pageById, routeHref } from './routes.js';
import { PAGES, getToolGroups, isNewTool } from './tools.js';
import { recordCurrentToolVisit } from './usage.js';
import { bootLocalDataSync } from './local-data.js';
import { initPipelineStatus } from './pipeline-status.js';
import { initTodayBonusChip } from './today-bonus.js';
import { initStore } from '../db/store.js';
import { clearAllPriceFieldDeltas } from './price-side.js';

await bootLocalDataSync();
await initStore();

const SIDEBAR_ID = 'appSidebar';
const OPEN_CLASS = 'is-open';
const BODY_OPEN_CLASS = 'app-sidebar-open';
const MQ_DESKTOP = '(min-width: 768px)';

function setPageHeadImageRatio(head) {
    head.classList.remove('has-page-head-image');
    const match = getComputedStyle(head).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (!match) return;

    head.querySelector(':scope > .page-head-image')?.remove();
    const image = document.createElement('img');
    image.className = 'page-head-image';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('load', () => {
        head.classList.add('has-page-head-image');
    }, { once: true });
    image.src = match[1];
    head.prepend(image);
}

function arrangePageHead(head) {
    if (head.querySelector(':scope > .page-head-content')) return;

    const content = document.createElement('div');
    content.className = 'page-head-content';
    const children = [...head.children];
    children.filter((child) => child.matches('h1, p')).forEach((child) => content.append(child));
    const others = children.filter((child) => !child.matches('h1, p'));
    if (others.length) {
        const othersSlot = document.createElement('div');
        othersSlot.className = 'page-head-others';
        others.forEach((child) => othersSlot.append(child));
        content.append(othersSlot);
    }
    head.prepend(content);

    setPageHeadImageRatio(head);
}

function arrangeToolPage(root) {
    const head = [...root.children].find((child) => child.classList.contains('page-head'));
    if (!head || root.querySelector(':scope > .page-body')) return;

    const body = document.createElement('div');
    body.className = 'page-body';
    let sibling = head.nextSibling;
    while (sibling) {
        const next = sibling.nextSibling;
        body.append(sibling);
        sibling = next;
    }

    root.append(body);
    root.classList.add('tool-page');
}

const pageLayoutObserver = new MutationObserver(() => {
    document.querySelectorAll('.page-head').forEach(arrangePageHead);
    document.querySelectorAll('main > [id]').forEach(arrangeToolPage);
});

pageLayoutObserver.observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll('.page-head').forEach(arrangePageHead);
window.matchMedia('(max-width: 768px)').addEventListener('change', () => {
    document.querySelectorAll('.page-head').forEach(setPageHeadImageRatio);
});

function renderPageLink(page) {
    const active = isCurrentRoute(page.id);
    return `
        <a class="sidebar-link${active ? ' active' : ''}" href="${escapeHtml(routeHref(page.id))}"${active ? ' aria-current="page"' : ''}>
            <span class="sidebar-link-label">${escapeHtml(page.navLabel)}</span>
        </a>
    `;
}

function renderNewBadge(tool) {
    if (!isNewTool(tool)) {
        return '';
    }

    return '<span class="sidebar-link-new">Yeni</span>';
}

function renderToolLink(tool) {
    const newBadge = renderNewBadge(tool);

    if (tool.path) {
        const active = isCurrentRoute(tool.id);
        return `
            <a class="sidebar-link${active ? ' active' : ''}" href="${escapeHtml(routeHref(tool.id))}"${active ? ' aria-current="page"' : ''}>
                <span class="sidebar-link-icon" aria-hidden="true">${tool.icon}</span>
                <span class="sidebar-link-label">${escapeHtml(tool.navLabel)}</span>
                ${newBadge}
            </a>
        `;
    }

    return `
        <span class="sidebar-link sidebar-link--soon" aria-disabled="true">
            <span class="sidebar-link-icon" aria-hidden="true">${tool.icon}</span>
            <span class="sidebar-link-label">${escapeHtml(tool.navLabel)}</span>
            ${newBadge || '<span class="sidebar-link-soon">yakında</span>'}
        </span>
    `;
}

function renderSidebarMarkup() {
    const groups = getToolGroups()
        .map((group) => `
            <div class="sidebar-group">
                <p class="sidebar-group-label">${escapeHtml(group.label)}</p>
                ${group.tools.map(renderToolLink).join('')}
            </div>
        `)
        .join('');

    return `
        <div class="sidebar-brand">
            <a class="sidebar-brand-link" href="${routeHref('home')}">Albion Tools</a>
            <button type="button" class="sidebar-delta-clear" aria-label="Fiyat güncelleme görsellerini temizle" title="Fiyat güncelleme görsellerini temizle">
                <svg class="sidebar-delta-clear-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M12.8 3.2 20.6 11a2.2 2.2 0 0 1 0 3.1l-6.5 6.5a2.2 2.2 0 0 1-3.1 0L3.2 12.8A2.2 2.2 0 0 1 2.6 11V5.1A2.1 2.1 0 0 1 4.7 3h5.9c.6 0 1.1.2 1.5.6ZM6.2 7.1a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm8.2 2.3 1.4 1.4-2.4 2.4 2.4 2.4-1.4 1.4-2.4-2.4-2.4 2.4-1.4-1.4 2.4-2.4-2.4-2.4 1.4-1.4 2.4 2.4 2.4-2.4Z"/>
                </svg>
            </button>
        </div>
        <nav class="sidebar-nav" aria-label="Sayfalar ve araçlar">
            <div class="sidebar-group">
                ${PAGES.map(renderPageLink).join('')}
            </div>
            ${groups}
        </nav>
    `;
}

function isDesktop() {
    return window.matchMedia(MQ_DESKTOP).matches;
}

function setOpen(sidebar, toggler, backdrop, open) {
    sidebar.classList.toggle(OPEN_CLASS, open);
    document.body.classList.toggle(BODY_OPEN_CLASS, open);
    if (toggler) {
        toggler.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggler.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    }
    if (backdrop) {
        backdrop.hidden = !open;
    }
}

function ensureBackdrop() {
    let backdrop = document.querySelector('.app-sidebar-backdrop');
    if (backdrop) {
        return backdrop;
    }

    backdrop = document.createElement('div');
    backdrop.className = 'app-sidebar-backdrop';
    backdrop.hidden = true;
    document.body.append(backdrop);
    return backdrop;
}

export function initNav() {
    recordCurrentToolVisit();

    document.querySelectorAll('[data-route-id]').forEach((link) => {
        const pageId = link.dataset.routeId;
        if (pageById(pageId)) {
            link.href = routeHref(pageId);
        }
    });

    const currentPage = pageById(currentPageId());
    if (currentPage) {
        document.title = `${currentPage.title} - Albion Tools`;
    }

    const sidebar = document.querySelector('[data-app-sidebar]');
    if (!sidebar) {
        return;
    }

    sidebar.innerHTML = renderSidebarMarkup();
    initPipelineStatus();
    initTodayBonusChip();

    sidebar.querySelector('.sidebar-delta-clear')?.addEventListener('click', () => {
        clearAllPriceFieldDeltas();
    });

    const toggler = document.querySelector('.sidebar-toggler');
    const backdrop = ensureBackdrop();

    const close = () => setOpen(sidebar, toggler, backdrop, false);
    const toggle = () => {
        const open = !sidebar.classList.contains(OPEN_CLASS);
        setOpen(sidebar, toggler, backdrop, open);
    };

    toggler?.addEventListener('click', toggle);
    backdrop.addEventListener('click', close);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar.classList.contains(OPEN_CLASS)) {
            close();
        }
    });

    sidebar.querySelectorAll('a.sidebar-link').forEach((link) => {
        link.addEventListener('click', () => {
            if (!isDesktop()) {
                close();
            }
        });
    });

    window.matchMedia(MQ_DESKTOP).addEventListener('change', (event) => {
        if (event.matches) {
            close();
        }
    });
}
