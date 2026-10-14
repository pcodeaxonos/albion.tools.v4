import { cityNameHtml, cityDataKey, cityNameAttributes } from '../components/city-name.js';
import { showToast } from '../components/toast.js';
import { readStorage, writeStorage } from './storage.js';
import { durableStorage, durableKeys, initDurableStorage, flushDurableWrites, reloadDurableStorage, saveDurableChanges, createDurableBackup, persistenceStatus, PERSISTENCE_EVENT } from './durable-storage.mjs';
import { DATA_PREFIX, isPersistentKey } from './persistence-config.mjs';
import { initStore } from '../db/store.js';
import { hasTodayDailyBonus, todayCraftBonuses } from './craft-bonus.js';
import { isBonusRedirectReady } from './bonus-day.js';
import { initDialogBackdropClose } from '../components/dialog.js';
import { initTooltips } from '../components/tooltip.js';
import { initItemNameCopy, itemNameHtml } from '../components/item-name.js';
import { initPageInfo } from '../components/page-info.js';
import { escapeHtml } from '../utils/utils.js';
import { currentPageId, isCurrentRoute, pageById, routeHref } from './routes.js';
import { PAGES, getToolGroups, isNewTool } from './tools.js';
import { recordCurrentToolVisit } from './usage.js';
import { clearAllPriceFieldDeltas } from './price-side.js';
import { getSettings, getServer, localPriceHost, PRICE_SOURCES } from './settings.js';
import { startPriceLive, noteHubSnapshot, PRICES_EVENT } from './price-live.js';
import { bonusFamilyMeta, bonusMaterialItemId, bonusPackLine, bonusStationLine } from './bonus-cities.js';
import { itemIconHtml } from '../components/item-icon.js';

const SIDEBAR_ID = 'appSidebar';
const OPEN_CLASS = 'is-open';
const BODY_OPEN_CLASS = 'app-sidebar-open';
const MQ_DESKTOP = '(min-width: 768px)';

function arrangePageHead(head) {
    if (head.querySelector(':scope > .page-head-content')) { initPageInfo(head); return; }

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
    initPageInfo(head);

}

function initPageLayout() {
const pageLayoutObserver = new MutationObserver(() => {
    document.querySelectorAll('.page-head').forEach(arrangePageHead);
    document.querySelectorAll('[data-page-info-head]').forEach(initPageInfo);
});

pageLayoutObserver.observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll('.page-head').forEach(arrangePageHead);
document.querySelectorAll('[data-page-info-head]').forEach(initPageInfo);

}

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
            <button type="button" class="sidebar-delta-clear" aria-label="Fiyat güncelleme görsellerini temizle" data-app-tooltip="Fiyat güncelleme görsellerini temizle">
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

let navInitialized = false;

function renderMenu() {
    if (navInitialized) return;
    navInitialized = true;
    initTooltips();
    initItemNameCopy();
    initDialogBackdropClose();


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

const DAILY_BONUS_REDIRECT_KEY = 'albiontools.v4.dailyBonusRedirectAt';
const DAILY_BONUS_REDIRECT_COOLDOWN_MS = 5 * 60 * 1000;

function redirectToDailyBonusWhenNeeded() {
    if (currentPageId() === 'daily-bonus' || hasTodayDailyBonus() || !isBonusRedirectReady()) {
        return;
    }

    const now = Date.now();
    const lastRedirectAt = Number(readStorage(DAILY_BONUS_REDIRECT_KEY));
    if (Number.isFinite(lastRedirectAt)
        && lastRedirectAt <= now
        && now - lastRedirectAt < DAILY_BONUS_REDIRECT_COOLDOWN_MS) {
        return;
    }

    writeStorage(DAILY_BONUS_REDIRECT_KEY, String(now));
    location.replace(`${routeHref('daily-bonus')}?need=today#bonusForm`);
}


// Every tool owns the same height chain; only the contents of its slots vary.
// fillControls lets panels share spare desktop height; content-sized is the default.
export function toolPageHtml({ key, head, topControls = '', controls = '', fillControls = false, layout = 'split', summary = '', result = '', resultClass = '', bottomResult = '', overlays = '' }) {
    return `${head}
        <section class="page-body">
            ${topControls ? `<div class="tool-page-top-controls tool-split-controls">${topControls}</div>` : ''}
            <div class="tool-split${layout === 'stacked' ? ' tool-split--stacked' : ''}">
                <section class="left">
                    <div class="controls tool-split-controls${fillControls ? ' tool-split-controls--fill' : ''}" data-controls="${escapeHtml(key)}">${controls}</div>
                    ${summary.trim() ? `<div class="summary">${summary}</div>` : ''}
                </section>
                <section class="right">
                    <div class="result tool-split-result ${escapeHtml(resultClass)}">${result}</div>
                </section>
            </div>
            ${bottomResult ? `<div class="tool-page-bottom-result tool-split-result">${bottomResult}</div>` : ''}
        </section>${overlays}`;
}

const ROOT_ID = 'appStatus';
const POLL_MS = 5000;
const HUB_TIMEOUT_MS = 1500;
const API_TIMEOUT_MS = 3500;
const LIVE_MS = 15 * 60 * 1000;
const OPEN_KEY = 'albiontools.v4.statusOpen';
const FRESH_MS = 15000;
const ZONE_FIX = 'Oyunda bir zone geç (şehir kapısı veya teleport). ADC konum almadan market paketi göndermez; sonra Trading Post’u aç.';
const INGEST_FIX = 'ADC’nin -i http://127.0.0.1:3001 ile çalıştığını doğrula. Gerekirse ADC’yi kapatıp start.bat ile yeniden başlat.';

const ICON_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="7" rx="5.5" ry="2.5"/><path d="M6.5 7v7c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7"/><path d="M6.5 10.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5"/></svg>`;
const ICON_HUB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2"/></svg>`;
const ICON_CLIENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 12.5a5 5 0 0 1 7 0"/><path d="M5.5 9.5a9 9 0 0 1 13 0"/><circle cx="12" cy="16.5" r="1.5" fill="currentColor" stroke="none"/></svg>`;
const ICON_TOOLS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7.5c-1.9-1.1-4.3-1.4-6.5-.9v9.8c2-.5 4.4-.2 6.5.9"/><path d="M12 7.5c1.9-1.1 4.3-1.4 6.5-.9v9.8c-2-.5-4.4-.2-6.5.9"/><path d="M12 7.5v10.8"/></svg>`;
const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 9.2 12 14.8l5.5-5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let pollTimer = 0;
let inFlight = 0;
let lastReport = null;
let freshUntil = 0;
let freshText = '';
let placeFrame = 0;

function sourceLabel(id) {
    return PRICE_SOURCES.find((source) => source.id === id)?.label ?? id;
}

function relativeTime(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
        return '—';
    }
    const delta = Math.max(0, Date.now() - then);
    const seconds = Math.round(delta / 1000);
    if (seconds < 10) {
        return 'şimdi';
    }
    if (seconds < 60) {
        return `${seconds} sn önce`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} dk önce`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 48) {
        return `${hours} sa önce`;
    }
    return `${Math.round(hours / 24)} gün önce`;
}

function ageMs(iso) {
    const then = Date.parse(iso);
    return Number.isFinite(then) ? Math.max(0, Date.now() - then) : Infinity;
}

async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
            throw new Error(String(response.status));
        }
        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

function step(id, state, title, detail, fix, code = null) {
    return { id, state, title, detail, fix, code };
}

export function sessionAdcState(hub, packets = true) {
    if (!packets) {
        const marketAt = hub?.sessionMarketAt || null;
        if (marketAt && ageMs(marketAt) <= LIVE_MS) {
            return step(
                'adc',
                'ok',
                'Albion Data Client',
                `Canlı · son emir ${relativeTime(marketAt)}`,
                null
            );
        }
        return step(
            'adc',
            'info',
            'Albion Data Client',
            'Paket kaynağı kullanılmıyor',
            null
        );
    }

    const err = 'err';
    if (!hub) {
        return step(
            'adc',
            'err',
            'Albion Data Client',
            'Hub olmadan kontrol edilemez',
            'Önce hub’ı aç.'
        );
    }

    const marketAt = hub.sessionMarketAt || null;
    const clientAt = hub.sessionClientAt || hub.lastPowAt || null;
    const droppedAt = hub.sessionDroppedMarketAt || null;
    const marketAge = ageMs(marketAt);
    const clientAge = ageMs(clientAt);
    const droppedAge = ageMs(droppedAt);
    const cachedOrders = hub.orders ?? 0;
    const unknown = Array.isArray(hub.unknownLocations)
        ? hub.unknownLocations.filter(Boolean)
        : [];

    if (marketAt && marketAge <= LIVE_MS) {
        return step(
            'adc',
            'ok',
            'Albion Data Client',
            `Canlı · son emir ${relativeTime(marketAt)}`,
            null
        );
    }

    if (droppedAt && droppedAge <= LIVE_MS && (!marketAt || droppedAge <= marketAge)) {
        const loc = unknown.length ? ` · ${unknown.slice(-3).join(', ')}` : '';
        return step(
            'adc',
            'warn',
            'Albion Data Client',
            `Market paketi geldi ama şehir yok${loc}`,
            ZONE_FIX,
            'location'
        );
    }

    if (hub.adcProcess === false) {
        const last = marketAt ? ` · son emir ${relativeTime(marketAt)}` : '';
        return step(
            'adc',
            err,
            'Albion Data Client',
            `ADC kapalı${last}`,
            'start.bat ile ADC’yi aç. Zone geç, marketi yenile.',
            'dead'
        );
    }

    if (marketAt) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · son emir ${relativeTime(marketAt)}`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (cachedOrders > 0) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · ${cachedOrders} sipariş önbellekte`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (clientAt && clientAge <= LIVE_MS) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · ADC bağlı, bu oturumda emir yok (son sinyal ${relativeTime(clientAt)})`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (hub.adcProcess === true) {
        return step(
            'adc',
            'warn',
            'Albion Data Client',
            'ADC açık ama hub’a paket düşmedi',
            INGEST_FIX,
            'ingest'
        );
    }

    return step(
        'adc',
        err,
        'Albion Data Client',
        'Hub’a bu oturumda hiç paket düşmemiş',
        'start.bat ADC’yi -i http://127.0.0.1:3001 ile aç. AFM kapalı olsun. Zone geç, marketi aç.',
        'missing'
    );
}

async function probe() {
    const settings = getSettings();
    const packets = settings.priceSource === 'packets';
    const steps = [];

    steps.push(step(
        'source',
        packets ? 'ok' : 'info',
        'Fiyat kaynağı',
        sourceLabel(settings.priceSource),
        packets ? null : 'Paket hattını kullanmak için Ayarlar → Oyundaki paketler.'
    ));

    let hub = null;
    try {
        hub = await fetchJson(`${localPriceHost()}/api/v2/stats/status`, HUB_TIMEOUT_MS);
        noteHubSnapshot(hub);
        const orders = hub.orders ?? 0;
        const cities = Array.isArray(hub.cities) && hub.cities.length > 0
            ? hub.cities.join(', ')
            : 'şehir yok';
        steps.push(step(
            'hub',
            'ok',
            'Fiyat hub :3001',
            `${orders} sipariş · ${cities}`,
            null
        ));
    } catch {
        steps.push(step(
            'hub',
            'err',
            'Fiyat hub :3001',
            'Kapalı veya yanıt yok',
            'start.bat çalıştır. Hub penceresi açık kalmalı.'
        ));
    }

    if (hub) {
        steps.push(sessionAdcState(hub, packets));
    } else {
        steps.push(sessionAdcState(null, packets));
    }

    if (packets) {
        const hubOk = steps.find((item) => item.id === 'hub')?.state === 'ok';
        const adc = steps.find((item) => item.id === 'adc');
        const adcOk = adc?.state === 'ok';
        if (hubOk && adcOk) {
            steps.push(step('tools', 'ok', 'Tool fiyatları', 'Yerel kitaptan okunuyor', null));
        } else if (hubOk && adc?.code === 'idle') {
            const last = hub?.sessionMarketAt ? relativeTime(hub.sessionMarketAt) : null;
            steps.push(step(
                'tools',
                'info',
                'Tool fiyatları',
                last
                    ? `Önbellekteki fiyatlar kullanılıyor · son emir ${last}`
                    : 'Önbellekteki fiyatlar kullanılıyor',
                'Marketi aç veya eksik fiyatı elle gir.'
            ));
        } else if (hubOk) {
            const cached = (hub?.orders ?? 0) > 0;
            steps.push(step(
                'tools',
                'warn',
                'Tool fiyatları',
                cached
                    ? 'Önbellekteki eski fiyatlar duruyor — taze paket yok'
                    : 'Hub açık, taze emir yok — kırmızı alanlar boş kalır',
                adc?.code === 'location' || adc?.code === 'dead' || adc?.code === 'ingest'
                    ? (adc.fix || ZONE_FIX)
                    : 'Marketi aç veya eksik fiyatı elle gir.'
            ));
        } else {
            steps.push(step(
                'tools',
                'err',
                'Tool fiyatları',
                'Paket kaynağı seçili ama hub yok',
                'start.bat veya Ayarlar’dan AODP API’ye dön.'
            ));
        }
    } else {
        try {
            const host = getServer().host;
            await fetchJson(
                `${host}/api/v2/stats/prices/T4_BAG?locations=Caerleon&qualities=1`,
                API_TIMEOUT_MS
            );
            steps.push(step(
                'api',
                'ok',
                `AODP API (${getServer().label})`,
                'Yanıt var',
                null
            ));
            steps.push(step('tools', 'ok', 'Tool fiyatları', 'AODP API’den okunuyor', null));
        } catch {
            steps.push(step(
                'api',
                'err',
                `AODP API (${getServer().label})`,
                'Yanıt yok',
                'Ağ / sunucu seçimini kontrol et veya paket kaynağına geç.'
            ));
            steps.push(step(
                'tools',
                'err',
                'Tool fiyatları',
                'API kapalı',
                'AODP veya yerel paket hattını düzelt.'
            ));
        }
    }

    const worst = rank(steps);
    return { steps, worst, packets, hub };
}

function rank(steps) {
    if (steps.some((item) => item.state === 'err')) {
        return 'err';
    }
    if (steps.some((item) => item.state === 'warn')) {
        return 'warn';
    }
    if (steps.some((item) => item.code === 'idle')) {
        return 'info';
    }
    return 'ok';
}

function summaryText(report) {
    const blocked = report.steps.find((item) => item.state === 'err')
        ?? report.steps.find((item) => item.state === 'warn')
        ?? report.steps.find((item) => item.code === 'idle');
    if (!blocked) {
        return report.packets ? 'Paket hattı çalışıyor' : 'AODP API çalışıyor';
    }
    if (blocked.code === 'idle') {
        return blocked.detail;
    }
    return blocked.fix ? `${blocked.title}: ${blocked.fix}` : `${blocked.title}: ${blocked.detail}`;
}

function summaryShort(report) {
    const adc = report.steps.find((item) => item.id === 'adc');
    if (adc?.code === 'location') {
        return 'Konum yok';
    }
    if (adc?.code === 'ingest') {
        return 'Yanlış ingest';
    }
    if (adc?.code === 'dead') {
        return 'ADC kapalı';
    }
    if (adc?.code === 'idle') {
        return 'Beklemede';
    }
    if (report.worst === 'ok') {
        return report.packets ? 'Paketler canlı' : 'API canlı';
    }
    if (report.worst === 'warn') {
        return 'Dikkat';
    }
    if (report.worst === 'info') {
        return 'Beklemede';
    }
    return 'Tıkanma';
}

function renderSteps(steps) {
    return `
        <ul class="app-status-steps">
            ${steps.map((item) => `
                <li class="app-status-step is-${item.state}">
                    <span class="app-status-step-mark" aria-hidden="true"></span>
                    <span class="app-status-step-body">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>${escapeHtml(item.detail)}</span>
                        ${item.fix && item.state !== 'ok' ? `<em>${escapeHtml(item.fix)}</em>` : ''}
                    </span>
                </li>
            `).join('')}
        </ul>
    `;
}

function isOpen() {
    return sessionStorage.getItem(OPEN_KEY) === '1';
}

function setStatusOpen(root, open) {
    sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
    root.classList.toggle('is-open', open);
    const toggle = root.querySelector('.app-status-toggle');
    const panel = root.querySelector('.app-status-panel');
    if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (panel) {
        panel.hidden = !open;
    }
}

function applyCopy(root, labelText, hintText) {
    const label = root.querySelector('.app-status-label');
    const hint = root.querySelector('.app-status-hint');
    const toggle = root.querySelector('.app-status-toggle');
    if (label) {
        label.textContent = labelText;
    }
    if (hint) {
        hint.textContent = hintText;
    }
    if (toggle) {
        toggle.setAttribute('aria-label', `${labelText}. ${hintText}`);
    }
}

function paintMarks(root, report) {
    root.querySelectorAll('.app-status-mark').forEach((mark) => {
        const item = report?.steps?.find((stepItem) => stepItem.id === mark.dataset.step);
        mark.dataset.state = item?.state || 'pending';
    });
}

function paintStatus(root, report) {
    lastReport = report;
    root.dataset.state = report.worst;
    const panel = root.querySelector('.app-status-panel');
    const fresh = Date.now() < freshUntil;
    root.classList.toggle('is-fresh', fresh);
    applyCopy(
        root,
        fresh ? freshText : summaryShort(report),
        fresh ? 'Sayfadaki ilgili fiyatlar güncelleniyor' : summaryText(report)
    );
    paintMarks(root, report);
    if (panel) {
        panel.innerHTML = renderSteps(report.steps);
    }
    schedulePlace(root);
}

function signalFresh(root, detail) {
    const cities = (detail.cities ?? []).join(', ') || 'market';
    const count = detail.items?.length ?? 0;
    freshUntil = Date.now() + FRESH_MS;
    freshText = count ? `Yeni paket · ${cities} · ${count} eşya` : `Yeni paket · ${cities}`;
    if (lastReport) {
        paintStatus(root, lastReport);
    } else {
        root.classList.add('is-fresh');
        applyCopy(root, freshText, 'Sayfadaki ilgili fiyatlar güncelleniyor');
    }
    window.setTimeout(() => {
        if (Date.now() >= freshUntil && lastReport) {
            paintStatus(root, lastReport);
        }
    }, FRESH_MS + 50);
}

function scrollOffset(content) {
    return content ? content.scrollTop : 0;
}

function place(root) {
    const content = root.closest('.app-content');
    const main = content?.querySelector('main') || document.querySelector('main');
    const anchor = main || content;
    if (!anchor) {
        return;
    }

    document.querySelectorAll('.page-head-content.has-status-stack').forEach((node) => {
        node.classList.remove('has-status-stack');
    });
    document.documentElement.style.setProperty('--app-status-reserve', '0px');

    const box = anchor.getBoundingClientRect();
    const top = box.top + scrollOffset(content);
    root.style.top = `${Math.max(0, Math.round(top))}px`;
    root.style.left = `${Math.round(box.left + box.width / 2)}px`;
    root.style.right = 'auto';
    root.style.maxWidth = `${Math.max(160, Math.round(box.width - 24))}px`;

    const height = root.querySelector('.app-status-toggle')?.offsetHeight || root.offsetHeight || 0;
    document.documentElement.style.setProperty('--app-status-offset', `${Math.ceil(height)}px`);
}

function schedulePlace(root) {
    if (placeFrame) {
        return;
    }
    placeFrame = window.requestAnimationFrame(() => {
        placeFrame = 0;
        place(root);
    });
}

function watchPlacement(root, content) {
    schedulePlace(root);
    window.addEventListener('resize', () => schedulePlace(root));
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => schedulePlace(root));
        observer.observe(root);
        const head = () => content.querySelector('.page-head-content');
        const watchHead = () => {
            const node = head();
            if (node) {
                observer.observe(node);
            }
        };
        watchHead();
        const mutations = new MutationObserver((records) => {
            const outside = records.some((record) => {
                const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                return !node?.closest?.(`#${ROOT_ID}`);
            });
            if (!outside) {
                return;
            }
            watchHead();
            schedulePlace(root);
        });
        mutations.observe(content, { childList: true, subtree: true });
    }
}

function mount(content) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'app-status';
        root.innerHTML = `
            <button type="button" class="app-status-toggle" aria-expanded="false" aria-controls="appStatusPanel">
                <span class="app-status-label">Kontrol ediliyor…</span>
                <span class="app-status-live" aria-hidden="true"></span>
                <span class="app-status-hint">Hub, ADC, kaynak ve API</span>
                <span class="app-status-marks" aria-hidden="true">
                    <span class="app-status-mark" data-step="source" data-state="pending">${ICON_SOURCE}</span>
                    <span class="app-status-mark" data-step="hub" data-state="pending">${ICON_HUB}</span>
                    <span class="app-status-mark" data-step="adc" data-state="pending">${ICON_CLIENT}</span>
                    <span class="app-status-mark" data-step="tools" data-state="pending">${ICON_TOOLS}</span>
                </span>
                <span class="app-status-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
            </button>
            <div class="app-status-panel" id="appStatusPanel" hidden></div>
        `;
        content.append(root);
        root.querySelector('.app-status-toggle')?.addEventListener('click', () => {
            setStatusOpen(root, !root.classList.contains('is-open'));
            schedulePlace(root);
        });
    }

    setStatusOpen(root, isOpen());
    document.documentElement.style.setProperty('--status-bar-height', '0px');
    watchPlacement(root, content);
    return root;
}

async function tick(root) {
    if (inFlight > 0) {
        return;
    }
    inFlight += 1;
    try {
        const report = await probe();
        paintStatus(root, report);
    } catch (error) {
        console.error(error);
        paintStatus(root, {
            worst: 'err',
            packets: getSettings().priceSource === 'packets',
            steps: [step('probe', 'err', 'Durum', 'Kontrol başarısız', 'Sayfayı yenile.')]
        });
    } finally {
        inFlight -= 1;
    }
}

export function initPipelineStatus() {
    const content = document.querySelector('.app-content');
    if (!content) {
        return;
    }

    const root = mount(content);
    startPriceLive();
    window.addEventListener(PRICES_EVENT, (event) => signalFresh(root, event.detail));
    tick(root);
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => tick(root), POLL_MS);
    window.addEventListener('pagehide', () => window.clearInterval(pollTimer));
}


const SIDEBAR_SELECTOR = '[data-app-sidebar]';
const SIDEBAR_CHIP_SELECTOR = '[data-today-bonus="sidebar"]';
const TOPBAR_CHIP_SELECTOR = '[data-today-bonus="topbar"]';

function compactPackLine(bonus, { includeCity = true } = {}) {
    return bonusPackLine(bonus, { includeCity });
}

export function slotTitle(bonus) {
    const family = `${bonus.label} +${bonus.rate}%`;
    return [family, compactPackLine(bonus)].join(' · ');
}

export function renderMatsHtml(materials, className = 'bonus-mat-icon', size = 32) {
    if (!materials?.length) {
        return '';
    }

    const icons = materials
        .map((key) => itemIconHtml(bonusMaterialItemId(key), {
            size,
            className: `item-icon ${className}`
        }))
        .filter(Boolean)
        .join('');

    if (!icons) {
        return '';
    }

    return `<span class="bonus-mats">${icons}</span>`;
}

export function renderRecipesHtml(variants, { labels = true, className = 'bonus-mat-icon', size = 32 } = {}) {
    const recipes = (variants || []).filter((recipe) => recipe.materials?.length);
    if (!recipes.length) {
        return '';
    }

    if (recipes.length === 1 && !recipes[0].label) {
        return renderMatsHtml(recipes[0].materials, className, size);
    }

    return `<span class="bonus-mat-recipes">${recipes.map((recipe) => {
        const title = recipe.label
            ? `${recipe.label}: ${recipe.materials.join(' + ')}`
            : recipe.materials.join(' + ');
        const label = labels && recipe.label
            ? `<span class="bonus-mat-recipe-label">${itemNameHtml(recipe.label)}</span>`
            : '';
        return `<span class="bonus-mat-recipe" data-app-tooltip="${escapeHtml(title)}">${label}${renderMatsHtml(recipe.materials, className, size)}</span>`;
    }).join('')}</span>`;
}

function recipesFromMeta(meta) {
    if (meta.variants?.length) {
        return meta.variants;
    }

    if (meta.materials?.length) {
        return [{ label: '', materials: meta.materials }];
    }

    return [];
}

export function renderBonusHintHtml(familyKey) {
    const meta = bonusFamilyMeta(familyKey);
    if (!meta.cityLabel) {
        return '';
    }

    const station = bonusStationLine(meta);
    return [
        `<span class="bonus-hint-city">${escapeHtml(meta.cityLabel)}</span>`,
        renderRecipesHtml(recipesFromMeta(meta), { labels: true }),
        station ? `<span class="bonus-hint-station">${escapeHtml(station)}</span>` : ''
    ].filter(Boolean).join(' ');
}

function renderPackHtml(bonus) {
    const mats = renderRecipesHtml(recipesFromMeta(bonus), { labels: false, size: 64 });
    if (!mats) {
        return '';
    }

    return `<span class="sidebar-today-pack">${mats}</span>`;
}

function emptyCopy(compact) {
    return compact ? 'Bonus yok' : 'Kayıt yok';
}



function renderSidebarSlots(bonuses) {
    if (bonuses.length === 0) {
        return `<span class="sidebar-today-empty">${escapeHtml(emptyCopy(false))}</span>`;
    }

    return bonuses.map((bonus) => {
        const city = bonus.cityLabel || '—';
        const short = bonus.cityShort || city;
        const slug = cityDataKey(bonus.city || bonus.cityLabel);
        const cityAttr = slug ? ` data-city="${escapeHtml(slug)}"` : '';
        const station = bonusStationLine(bonus);
        return `
            <span class="sidebar-today-slot"${cityAttr} data-app-tooltip="${escapeHtml(slotTitle(bonus))}">
                <span class="sidebar-today-copy">
                    <span class="sidebar-today-city">
                        <span class="sidebar-today-city-full">${cityNameHtml(bonus.city || city)}</span>
                        <span class="sidebar-today-city-short city-name" ${cityNameAttributes(bonus.city || city)}>${escapeHtml(short)}</span>
                    </span>
                    <span class="sidebar-today-family">${escapeHtml(bonus.label)} <span class="sidebar-today-rate">+${bonus.rate}%</span></span>
                    ${station ? `<span class="sidebar-today-station">${escapeHtml(station)}</span>` : ''}
                </span>
                ${renderPackHtml(bonus)}
            </span>
        `;
    }).join('');
}

function renderTopbarSlots(bonuses) {
    if (bonuses.length === 0) {
        return escapeHtml(emptyCopy(true));
    }

    return bonuses.map((bonus) => {
        const mats = renderRecipesHtml(recipesFromMeta(bonus), {
            labels: false,
            className: 'topbar-today-mat-icon',
            size: 24
        });
        const city = bonus.cityShort || bonus.cityLabel || '';
        const bits = [
            mats,
            escapeHtml(`${bonus.label} +${bonus.rate}%`),
            city ? `<span class="topbar-today-city">${escapeHtml(city)}</span>` : ''
        ].filter(Boolean);
        return `<span class="topbar-today-slot">${bits.join(' ')}</span>`;
    }).join('<span class="topbar-today-sep">·</span>');
}

function paintTodayBonus() {
    const bonuses = todayCraftBonuses();
    const sidebar = document.querySelector(SIDEBAR_CHIP_SELECTOR);
    const topbar = document.querySelector(TOPBAR_CHIP_SELECTOR);
    const empty = bonuses.length === 0;

    if (sidebar) {
        sidebar.classList.toggle('is-empty', empty);
        const slots = sidebar.querySelector('.sidebar-today-slots');
        if (slots) {
            slots.innerHTML = renderSidebarSlots(bonuses);
        }
    }

    if (topbar) {
        topbar.classList.toggle('is-empty', empty);
        topbar.innerHTML = renderTopbarSlots(bonuses);
        topbar.dataset.appTooltip = empty
            ? 'Bugün günlük bonus kaydı yok'
            : bonuses.map(slotTitle).join(' · ');
    }
}

function ensureChip(root, { placement, className, compact }) {
    let el = root.querySelector(`[data-today-bonus="${placement}"]`);
    if (el) {
        return el;
    }

    el = document.createElement('a');
    el.dataset.todayBonus = placement;
    el.href = routeHref('daily-bonus');
    el.className = className;
    if (compact) {
        el.textContent = '…';
    } else {
        el.innerHTML = `
            <span class="sidebar-today-kicker">Bugün</span>
            <span class="sidebar-today-slots">…</span>
        `;
    }
    root.append(el);
    return el;
}

export function refreshTodayBonusChip() {
    paintTodayBonus();
}

export function initTodayBonusChip() {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (sidebar) {
        ensureChip(sidebar, { placement: 'sidebar', className: 'sidebar-today', compact: false });
    }

    const topbar = document.querySelector('.app-topbar');
    if (topbar) {
        ensureChip(topbar, { placement: 'topbar', className: 'topbar-today', compact: true });
    }

    paintTodayBonus();
}


export const LOCAL_DATA_PREFIX = DATA_PREFIX;
export const LOCAL_DATA_KIND = 'albion.tools.local-data';
export const LOCAL_DATA_VERSION = 1;
let bootPromise = null;

export function listLocalDataKeys() { return durableKeys(); }
export function getLocalDataClock() { return Date.now(); }
export function ensureLocalDataClock() { return getLocalDataClock(); }
export function installLocalDataClock() {} // Retained API; browser storage is no longer intercepted.
export function collectLocalData() {
    return { version: LOCAL_DATA_VERSION, kind: LOCAL_DATA_KIND, exportedAt: new Date().toISOString(),
        origin: location.origin, data: Object.fromEntries(durableKeys().map(key => [key, durableStorage.getItem(key)])) };
}
export function localDataSummary() {
    const keys = durableKeys();
    return { keys: keys.length, bytes: keys.reduce((sum, key) => sum + key.length + (durableStorage.getItem(key)?.length || 0), 0), clock: Date.now() };
}

export function parseLocalDataSnapshot(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || parsed.kind !== LOCAL_DATA_KIND) {
        throw new Error('Bu dosya Albion Tools yedeği değil.');
    }
    if (Number(parsed.version) !== LOCAL_DATA_VERSION) {
        throw new Error('Yedek sürümü desteklenmiyor.');
    }
    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
        throw new Error('Yedek bozuk.');
    }

    const data = {};
    for (const [key, value] of Object.entries(parsed.data)) {
        if (!isPersistentKey(key) || value == null) {
            continue;
        }
        data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    return {
        version: LOCAL_DATA_VERSION,
        kind: LOCAL_DATA_KIND,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        origin: typeof parsed.origin === 'string' ? parsed.origin : '',
        data
    };
}

function tryParseJson(value) {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeDailyBonusRows(left, right) {
    const rows = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
    const byDate = new Map();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || !row.date) {
            continue;
        }
        const date = String(row.date);
        const previous = byDate.get(date);
        if (!previous) {
            byDate.set(date, row);
            continue;
        }
        const score = (item) => (item.slot1FamilyKey ? 1 : 0) + (item.slot2FamilyKey ? 1 : 0);
        byDate.set(date, score(row) >= score(previous) ? { ...previous, ...row } : { ...row, ...previous });
    }
    return [...byDate.values()]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((row, index) => ({ ...row, id: index + 1 }));
}

function mergeStoredValues(key, localValue, remoteValue, localNewer) {
    if (localValue == null) {
        return remoteValue;
    }
    if (remoteValue == null) {
        return localValue;
    }
    if (key.endsWith('dailyBonuses')) {
        return JSON.stringify(mergeDailyBonusRows(tryParseJson(localValue), tryParseJson(remoteValue)));
    }
    const localParsed = tryParseJson(localValue);
    const remoteParsed = tryParseJson(remoteValue);
    if (Array.isArray(localParsed) && Array.isArray(remoteParsed)) {
        return JSON.stringify(localParsed.length >= remoteParsed.length ? localParsed : remoteParsed);
    }
    if (isPlainObject(localParsed) && isPlainObject(remoteParsed)) {
        const merged = localNewer ? { ...remoteParsed, ...localParsed } : { ...localParsed, ...remoteParsed };
        return JSON.stringify(merged);
    }
    return localNewer ? localValue : remoteValue;
}

export function mergeLocalDataMaps(localData = {}, remoteData = {}, localNewer = true) {
    const keys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
    const data = {};
    for (const key of keys) {
        if (!isPersistentKey(key)) {
            continue;
        }
        data[key] = mergeStoredValues(key, localData[key], remoteData[key], localNewer);
    }
    return data;
}

export async function applyLocalData(snapshot, { replace = true } = {}) {
    const next = parseLocalDataSnapshot(snapshot);
    await createDurableBackup();
    const data = replace ? next.data : mergeLocalDataMaps(collectLocalData().data, next.data, true);
    const changes = new Map(Object.entries(data));
    if (replace) for (const key of durableKeys()) if (!changes.has(key)) changes.set(key, null);
    await saveDurableChanges(changes);
    return next;
}

export function downloadLocalData() {
    const snapshot = collectLocalData();
    const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
    const stamp = (snapshot.exportedAt || '').slice(0, 10) || 'export';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `albion-tools-data-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return snapshot;
}

export function formatDataBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function fetchHubDataMeta() {
    const summary = localDataSummary();
    return { empty: !summary.keys, keyCount: summary.keys, exportedAt: new Date().toISOString(), ...persistenceStatus() };
}
export async function fetchHubDataSnapshot() { await reloadDurableStorage(); return collectLocalData(); }
export async function pushLocalDataToHub() { await flushDurableWrites(); return fetchHubDataMeta(); }
export async function syncWithHub(mode = 'auto') {
    if (mode === 'push') await flushDurableWrites();
    else await reloadDurableStorage();
    return { status: mode === 'push' ? 'pushed' : 'pulled', meta: await fetchHubDataMeta() };
}
export function setLocalDataAutoPush() {} // All permanent writes always go to SQLite.

async function runBootSync() {
    const legacy = {};
    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (isPersistentKey(key)) legacy[key] = localStorage.getItem(key);
        }
    } catch { /* Browser storage is optional, only consulted for one-time migration. */ }
    const migration = await initDurableStorage(localPriceHost(), legacy);
    if (migration) {
        // Remove old browser records only after the server has archived and acknowledged them.
        try { for (const key of Object.keys(legacy)) localStorage.removeItem(key); } catch {}
        if (migration.conflicts?.length) showToast('Eski tarayıcı kayıtlarının farklı sürümleri veritabanında arşivlendi. Aktif kayıtlar sunucudan yüklendi.', { duration: 8000 });
    }
    window.addEventListener('beforeunload', event => {
        if (persistenceStatus().pending) { event.preventDefault(); event.returnValue = ''; }
    });
    window.addEventListener('online', () => { void flushDurableWrites().catch(() => {}); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushDurableWrites().catch(() => {});
    });
    window.addEventListener(PERSISTENCE_EVENT, event => {
        let notice = document.querySelector('[data-persistence-notice]');
        const status = event.detail;
        if (!notice && (status.pending || status.error)) {
            notice = document.createElement('div');
            notice.className = 'alert alert-warning app-persistence-notice';
            notice.dataset.persistenceNotice = '';
            notice.setAttribute('role', 'status');
            document.body.append(notice);
        }
        if (notice) {
            notice.hidden = !status.pending && !status.error;
            notice.textContent = status.error ? `Kaydedilemeyen değişiklik var: ${status.error} ` : 'Değişiklikler veritabanına kaydediliyor…';
            if (status.error) {
                const retry = document.createElement('button');
                retry.type = 'button'; retry.className = 'btn btn-outline-secondary btn-sm'; retry.textContent = 'Tekrar dene';
                retry.textContent = status.pending ? 'Tekrar dene' : 'Verileri yeniden yükle';
                retry.addEventListener('click', () => { if (status.pending) void flushDurableWrites().catch(() => {}); else location.reload(); });
                notice.append(retry);
            }
        }
    });
    return { status: 'database' };
}
export function bootLocalDataSync() { return bootPromise ||= runBootSync(); }

// All page-wide startup work belongs here. Domain services remain reusable modules.
// Importing this module completes phases 1-4 before a page entry can fill its content.
async function startApp() {
    // 1. Critical data must be ready before any application render.
    await bootLocalDataSync();
    await initStore();
    redirectToDailyBonusWhenNeeded();

    // 2. Menu and shared interactions.
    initPageLayout();
    renderMenu();
    recordCurrentToolVisit();
    initTodayBonusChip();

    // 3. appStatus and the shared live-price connection.
    initPipelineStatus();

    // 4. Empty content structure. The tool entry owns phase 5 (content/data).
    const main = document.querySelector('main');
    const root = main?.querySelector('[data-island-planner-v2]') || main;
    const page = pageById(currentPageId());
    if (root && !root.hasChildNodes() && page) {
        root.innerHTML = toolPageHtml({
            key: page.id,
            head: '<section class="page-head"><h1>' + escapeHtml(page.title) + '</h1></section>'
        });
    }
}

try { await startApp(); }
catch (error) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = '<div class="alert alert-danger" role="alert">Veritabanı bağlantısı kurulamadı. Hub servisini çalıştırıp yeniden deneyin. Mevcut kayıtlar değiştirilmedi. <button class="btn btn-outline-secondary" type="button" data-database-retry>Tekrar dene</button></div>';
        main.querySelector('[data-database-retry]')?.addEventListener('click', () => location.reload());
    }
    throw error;
}
