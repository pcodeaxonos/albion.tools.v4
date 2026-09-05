import { escapeHtml } from './utils.js';
import { getAll } from './db/store.js';
import { bonusDayIso } from './bonus-day.js';

export const CRAFT_BONUS_RATES = [0, 10, 20];

export function normalizeCraftBonusRate(value) {
    const rate = Number(value);
    return CRAFT_BONUS_RATES.includes(rate) ? rate : 0;
}

export function todayCraftBonuses() {
    const today = bonusDayIso();
    const row = getAll('dailyBonuses').find((entry) => entry.date === today);
    if (!row) {
        return [];
    }

    return [
        { key: row.slot1FamilyKey, rate: Number(row.slot1Rate) },
        { key: row.slot2FamilyKey, rate: Number(row.slot2Rate) }
    ].filter((bonus) => bonus.key && Number.isFinite(bonus.rate));
}

export function defaultCraftBonusRate(familyKeys) {
    const keys = new Set(familyKeys.filter(Boolean));
    const match = todayCraftBonuses().find((bonus) => keys.has(bonus.key));
    return normalizeCraftBonusRate(match?.rate ?? 0);
}

export function craftBonusToggleHtml(selected, { buttonClass } = {}) {
    const cls = buttonClass || 'price-side-btn';
    const current = normalizeCraftBonusRate(selected);

    return CRAFT_BONUS_RATES.map((rate) => {
        const pressed = rate === current;
        return `
            <button type="button" class="${escapeHtml(cls)}${pressed ? ' is-active' : ''}"
                data-bonus-rate="${rate}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${rate}%
            </button>
        `;
    }).join('');
}
