import { escapeHtml } from './utils.js';
import { initStore } from './db/store.js';
import { todayCraftBonuses } from './craft-bonus.js';
import { bonusDayIso, bonusWindowLabel } from './bonus-day.js';
import { bonusPackLine, bonusStationLine } from './bonus-cities.js';

const SIDEBAR_ID = 'sidebarToday';
const TOPBAR_ID = 'topbarToday';

export function todayWindowLabel() {
    return bonusWindowLabel(bonusDayIso());
}

function compactPackLine(bonus, { includeCity = true } = {}) {
    return bonusPackLine(bonus, { includeCity });
}

export function slotTitle(bonus) {
    const family = `${bonus.label} +${bonus.rate}%`;
    return [family, compactPackLine(bonus)].join(' · ');
}

export function renderTodaySlotCard(bonus) {
    const city = bonus.cityLabel || 'Şehir yok';
    const station = bonusStationLine(bonus);

    return `
        <article class="today-slot" title="${escapeHtml(slotTitle(bonus))}">
            <p class="today-slot-city">${escapeHtml(city)}</p>
            <p class="today-slot-family">${escapeHtml(bonus.label)} <span>+${bonus.rate}%</span></p>
            ${bonus.materialShort ? `<p class="today-slot-pack">${escapeHtml(bonus.materialShort)}</p>` : ''}
            ${station ? `<p class="today-slot-pack">${escapeHtml(station)}</p>` : ''}
        </article>
    `;
}

export function renderTodaySlotsHtml(bonuses, emptyText) {
    if (bonuses.length === 0) {
        return `<p class="today-slots-empty">${escapeHtml(emptyText)}</p>`;
    }

    return `
        <div class="today-slots">
            ${bonuses.map(renderTodaySlotCard).join('')}
        </div>
    `;
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
        const pack = compactPackLine(bonus, { includeCity: false });
        return `
            <span class="sidebar-today-slot" title="${escapeHtml(slotTitle(bonus))}">
                <span class="sidebar-today-city">${escapeHtml(city)}</span>
                <span class="sidebar-today-family">${escapeHtml(bonus.label)} +${bonus.rate}%</span>
                ${pack ? `<span class="sidebar-today-pack">${escapeHtml(pack)}</span>` : ''}
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
