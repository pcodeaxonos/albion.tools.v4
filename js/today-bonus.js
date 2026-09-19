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
            ? `<span class="bonus-mat-recipe-label">${escapeHtml(recipe.label)}</span>`
            : '';
        return `<span class="bonus-mat-recipe" title="${escapeHtml(title)}">${label}${renderMatsHtml(recipe.materials, className, size)}</span>`;
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
        const station = bonusStationLine(bonus);
        return `
            <span class="sidebar-today-slot"${cityAttr} title="${escapeHtml(slotTitle(bonus))}">
                <span class="sidebar-today-copy">
                    <span class="sidebar-today-city">
                        <span class="sidebar-today-city-full">${escapeHtml(city)}</span>
                        <span class="sidebar-today-city-short">${escapeHtml(short)}</span>
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

function paint() {
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
        topbar.title = empty
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
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (sidebar) {
        ensureChip(sidebar, { placement: 'sidebar', className: 'sidebar-today', compact: false });
    }

    const topbar = document.querySelector('.app-topbar');
    if (topbar) {
        ensureChip(topbar, { placement: 'topbar', className: 'topbar-today', compact: true });
    }

    initStore()
        .then(paint)
        .catch(() => {
            const sidebarChip = document.querySelector(SIDEBAR_CHIP_SELECTOR);
            const topbarChip = document.querySelector(TOPBAR_CHIP_SELECTOR);
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
