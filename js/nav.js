import { escapeHtml } from './utils.js';
import { PAGES, getToolGroups, isNewTool } from './tools.js';
import { recordCurrentToolVisit } from './usage.js';
import { bootLocalDataSync } from './local-data.js';
import { initPipelineStatus } from './pipeline-status.js';
import { initTodayBonusChip } from './today-bonus.js';

await bootLocalDataSync();

const SIDEBAR_ID = 'appSidebar';
const OPEN_CLASS = 'is-open';
const BODY_OPEN_CLASS = 'app-sidebar-open';
const MQ_DESKTOP = '(min-width: 768px)';

function currentPage() {
    return location.pathname.split('/').pop() || 'index.html';
}

function isActiveHref(href) {
    const path = href.split('/').pop();
    const current = currentPage();
    return path === current || (current === '' && path === 'index.html');
}

function renderPageLink(page) {
    const active = isActiveHref(page.href);
    return `
        <a class="sidebar-link${active ? ' active' : ''}" href="${escapeHtml(page.href)}"${active ? ' aria-current="page"' : ''}>
            <span class="sidebar-link-label">${escapeHtml(page.title)}</span>
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

    if (tool.href) {
        const active = isActiveHref(tool.href);
        return `
            <a class="sidebar-link${active ? ' active' : ''}" href="${escapeHtml(tool.href)}"${active ? ' aria-current="page"' : ''}>
                <span class="sidebar-link-icon" aria-hidden="true">${tool.icon}</span>
                <span class="sidebar-link-label">${escapeHtml(tool.title)}</span>
                ${newBadge}
            </a>
        `;
    }

    return `
        <span class="sidebar-link sidebar-link--soon" aria-disabled="true">
            <span class="sidebar-link-icon" aria-hidden="true">${tool.icon}</span>
            <span class="sidebar-link-label">${escapeHtml(tool.title)}</span>
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
        <a class="sidebar-brand" href="index.html">Albion Tools</a>
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

    const sidebar = document.getElementById(SIDEBAR_ID);
    if (!sidebar) {
        return;
    }

    sidebar.innerHTML = renderSidebarMarkup();
    initPipelineStatus();
    initTodayBonusChip();

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
