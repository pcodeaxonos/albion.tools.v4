import { escapeHtml } from './utils.js';
import { initStore } from './db/store.js';
import { todayCraftBonuses } from './craft-bonus.js';
import {
    bonusFamilyMeta,
    bonusMaterialItemId,
    bonusPackLine,
    bonusStationLine
} from './bonus-cities.js';
import { itemIconHtml } from './item-icon.js';

const SIDEBAR_ID = 'sidebarToday';
const TOPBAR_ID = 'topbarToday';

function compactPackLine(bonus, { includeCity = true } = {}) {
    return bonusPackLine(bonus, { includeCity });
}

export function slotTitle(bonus) {
    const family = `${bonus.label} +${bonus.rate}%`;
    return [family, compactPackLine(bonus)].join(' · ');
}

export function renderMatsHtml(materials, className = 'bonus-mat-icon') {
    if (!materials?.length) {
        return '';
    }

    const icons = materials
        .map((key) => itemIconHtml(bonusMaterialItemId(key), {
            size: 32,
            className: `item-icon ${className}`
        }))
        .filter(Boolean)
        .join('');

    if (!icons) {
        return '';
    }

    return `<span class="bonus-mats">${icons}</span>`;
}

export function renderBonusHintHtml(familyKey) {
    const meta = bonusFamilyMeta(familyKey);
    if (!meta.cityLabel) {
        return '';
    }

    const station = bonusStationLine(meta);
    return [
        `<span class="bonus-hint-city">${escapeHtml(meta.cityLabel)}</span>`,
        renderMatsHtml(meta.materials),
        station ? `<span class="bonus-hint-station">${escapeHtml(station)}</span>` : ''
    ].filter(Boolean).join(' ');
}

function renderPackHtml(bonus) {
    const mats = renderMatsHtml(bonus.materials);
    const station = bonusStationLine(bonus);
    if (!mats && !station) {
        return '';
    }

    return `
        <span class="sidebar-today-pack">
            ${mats}
            ${station ? `<span class="sidebar-today-station">${escapeHtml(station)}</span>` : ''}
        </span>
    `;
}

function emptyCopy(compact) {
    return compact ? 'Bonus yok' : 'Kayıt yok';
}

function citySlug(city) {
    return String(city || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function renderSidebarSlots(bonuses) {
    if (bonuses.length === 0) {
        return `<span class="sidebar-today-empty">${escapeHtml(emptyCopy(false))}</span>`;
    }

    return bonuses.map((bonus) => {
        const city = bonus.cityLabel || '—';
        const short = bonus.cityShort || city;
        const slug = citySlug(bonus.city || bonus.cityLabel);
        const cityAttr = slug ? ` data-city="${escapeHtml(slug)}"` : '';
        return `
            <span class="sidebar-today-slot"${cityAttr} title="${escapeHtml(slotTitle(bonus))}">
                <span class="sidebar-today-city">
                    <span class="sidebar-today-city-full">${escapeHtml(city)}</span>
                    <span class="sidebar-today-city-short">${escapeHtml(short)}</span>
                </span>
                <span class="sidebar-today-family">${escapeHtml(bonus.label)} <span class="sidebar-today-rate">+${bonus.rate}%</span></span>
                ${renderPackHtml(bonus)}
            </span>
        `;
    }).join('');
}

function renderTopbarSlots(bonuses) {
    if (bonuses.length === 0) {
        return escapeHtml(emptyCopy(true));
    }

    return bonuses.map((bonus) => compactPackLine(bonus)).join(' · ');
}

function paint() {
    const bonuses = todayCraftBonuses();
    const sidebar = document.getElementById(SIDEBAR_ID);
    const topbar = document.getElementById(TOPBAR_ID);
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
        topbar.textContent = renderTopbarSlots(bonuses);
        topbar.title = empty
            ? 'Bugün günlük bonus kaydı yok'
            : bonuses.map(slotTitle).join(' · ');
    }
}

function ensureChip(root, { id, className, compact }) {
    let el = document.getElementById(id);
    if (el) {
        return el;
    }

    el = document.createElement('a');
    el.id = id;
    el.href = 'daily-bonus.html';
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
    paint();
}

export function initTodayBonusChip() {
    const sidebar = document.getElementById('appSidebar');
    if (sidebar) {
        ensureChip(sidebar, { id: SIDEBAR_ID, className: 'sidebar-today', compact: false });
    }

    const topbar = document.querySelector('.app-topbar');
    if (topbar) {
        ensureChip(topbar, { id: TOPBAR_ID, className: 'topbar-today', compact: true });
    }

    initStore()
        .then(paint)
        .catch(() => {
            const sidebarChip = document.getElementById(SIDEBAR_ID);
            const topbarChip = document.getElementById(TOPBAR_ID);
            if (sidebarChip) {
                sidebarChip.classList.add('is-empty');
                const slots = sidebarChip.querySelector('.sidebar-today-slots');
                if (slots) {
                    slots.textContent = 'Yüklenemedi';
                }
            }
            if (topbarChip) {
                topbarChip.classList.add('is-empty');
                topbarChip.textContent = 'Bonus yok';
            }
        });
}
