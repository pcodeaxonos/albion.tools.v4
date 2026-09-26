import { escapeHtml } from '../../utils/utils.js';
import { itemIconHtml } from '../../components/item-icon.js';
import { parseKind, setVariants, shortItemName } from './domain.js';

const PLAN_STATIONS = [
    { id: 'plate', label: 'Plate' },
    { id: 'cloth', label: 'Cloth' },
    { id: 'leather', label: 'Leather' }
];
const PLAN_STATION_LIMIT = 6;

function byProfitPct(a, b) {
    const ap = Number.isFinite(a.pct) ? a.pct : -Infinity;
    const bp = Number.isFinite(b.pct) ? b.pct : -Infinity;
    if (bp !== ap) {
        return bp - ap;
    }
    const aProfit = Number.isFinite(a.profit) ? a.profit : -Infinity;
    const bProfit = Number.isFinite(b.profit) ? b.profit : -Infinity;
    return bProfit - aProfit;
}

/**
 * A–D from this table's profit% shape: prefer natural gaps, else even bands.
 * Cutoffs change with the visible rows — not fixed global % buckets.
 */
function assignProfitTiers(scoredRows) {
    const ranked = scoredRows.slice().sort(byProfitPct);
    const tiers = new Map();
    const n = ranked.length;
    const labels = ['A', 'B', 'C', 'D'];
    if (!n) {
        return tiers;
    }
    if (n <= 4) {
        ranked.forEach((row, index) => {
            tiers.set(row.id, labels[index] || 'D');
        });
        return tiers;
    }

    const values = ranked.map((row) => row.pct);
    const span = values[0] - values[n - 1];
    const minGap = span > 0 ? Math.max(span * 0.045, Math.abs(values[0]) * 0.008) : 0;
    const minSep = Math.max(1, Math.floor(n / 18));
    const gaps = [];
    for (let i = 0; i < n - 1; i++) {
        gaps.push({ after: i, gap: values[i] - values[i + 1] });
    }

    const chosen = [];
    const rankedGaps = gaps
        .filter((entry) => entry.gap >= minGap)
        .sort((a, b) => b.gap - a.gap || a.after - b.after);
    for (const entry of rankedGaps) {
        if (chosen.length >= 3) {
            break;
        }
        if (chosen.some((index) => Math.abs(index - entry.after) < minSep)) {
            continue;
        }
        if (entry.after < 0 || entry.after > n - 2) {
            continue;
        }
        chosen.push(entry.after);
    }

    const fallback = [
        Math.floor((n - 1) / 4),
        Math.floor((2 * (n - 1)) / 4),
        Math.floor((3 * (n - 1)) / 4)
    ];
    for (const target of fallback) {
        if (chosen.length >= 3) {
            break;
        }
        let best = null;
        let bestDist = Infinity;
        for (let i = 0; i <= n - 2; i++) {
            if (chosen.some((index) => Math.abs(index - i) < minSep || index === i)) {
                continue;
            }
            const dist = Math.abs(i - target);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        if (best != null) {
            chosen.push(best);
        }
    }

    const splits = chosen.sort((a, b) => a - b).slice(0, 3);
    while (splits.length < 3) {
        const next = splits.length ? splits[splits.length - 1] + Math.max(1, minSep) : fallback[splits.length];
        if (next > n - 2) {
            break;
        }
        if (!splits.includes(next)) {
            splits.push(next);
        } else {
            splits.push(Math.min(n - 2, next + 1));
        }
    }
    splits.sort((a, b) => a - b);

    ranked.forEach((row, index) => {
        let tier = 'D';
        if (index <= splits[0]) {
            tier = 'A';
        } else if (index <= splits[1]) {
            tier = 'B';
        } else if (index <= splits[2]) {
            tier = 'C';
        }
        tiers.set(row.id, tier);
    });
    return tiers;
}

/** Mix A–D so lower bands still appear in the plan (not only top profits). */
function pickStationRows(rows, tiers, limit = PLAN_STATION_LIMIT) {
    const queues = { A: [], B: [], C: [], D: [] };
    for (const row of rows.slice().sort(byProfitPct)) {
        const tier = tiers.get(row.id) || 'D';
        (queues[tier] || queues.D).push(row);
    }
    const picked = [];
    let progressed = true;
    while (picked.length < limit && progressed) {
        progressed = false;
        for (const key of ['A', 'B', 'C', 'D']) {
            if (picked.length >= limit) {
                break;
            }
            const next = queues[key].shift();
            if (next) {
                picked.push(next);
                progressed = true;
            }
        }
    }
    return picked.sort(byProfitPct);
}

/** Snapshot of current table rows for the craft-plan dialog. */
export function buildCraftPlan(list) {
    const stations = Object.fromEntries(PLAN_STATIONS.map((station) => [station.id, []]));
    const missingSell = [];
    const scored = [];

    for (const row of list) {
        const type = parseKind(row.recipe.kind).type;
        if (!stations[type]) {
            continue;
        }
        if (row.sell == null) {
            missingSell.push(row);
            continue;
        }
        if (row.cost == null || !Number.isFinite(row.pct)) {
            continue;
        }
        stations[type].push(row);
        scored.push(row);
    }

    const tiers = assignProfitTiers(scored);

    for (const station of PLAN_STATIONS) {
        stations[station.id] = pickStationRows(stations[station.id], tiers);
    }

    missingSell.sort((a, b) => {
        const typeCmp = parseKind(a.recipe.kind).type.localeCompare(parseKind(b.recipe.kind).type);
        if (typeCmp) {
            return typeCmp;
        }
        return String(a.tierEnchant).localeCompare(String(b.tierEnchant));
    });

    return { stations, missingSell, tiers };
}

function planPctText(ratio) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }
    const pct = Math.round(ratio * 100);
    return `${pct > 0 ? '+' : ''}${pct.toLocaleString('tr-TR')}%`;
}

function planRowTitle(row, tier) {
    const tierLabel = tier ? ` · Tier ${tier}` : '';
    return `${shortItemName(row.recipe.label)} · ${row.tierEnchant}${tierLabel} · ${planPctText(row.pct)}`;
}

function planSetIconsHtml(row) {
    const variants = setVariants(row.setLine?.uniqueName);
    return `
        <span class="royal-plan-sets" aria-hidden="true">
            ${variants.map((id) => itemIconHtml(id, { className: 'item-icon royal-plan-set-icon', size: 48 })).join('')}
        </span>
    `;
}

function planTeHtml(row) {
    const tier = Number(row.recipe?.tier);
    const tierAttribute = Number.isFinite(tier) ? ` data-tier="${tier}"` : '';
    return `<span class="royal-plan-te"${tierAttribute}>${escapeHtml(row.tierEnchant)}</span>`;
}

function renderPlanStationItem(row, profitTier = 'D') {
    const itemTier = Number(row.recipe?.tier);
    const tierAttribute = Number.isFinite(itemTier) ? ` data-tier="${itemTier}"` : '';
    return `
        <button type="button" class="royal-plan-item is-profit-tier-${escapeHtml(profitTier)}"${tierAttribute} data-plan-row="${escapeHtml(row.id)}"
            title="${escapeHtml(planRowTitle(row, profitTier))}">
            <span class="royal-plan-item-visual">
                ${itemIconHtml(row.sellId, { className: 'item-icon royal-plan-item-icon', size: 80 })}
                ${planTeHtml(row)}
            </span>
            ${planSetIconsHtml(row)}
            <span class="royal-plan-item-stats">
                <span class="royal-plan-item-pct">${escapeHtml(planPctText(row.pct))}</span>
            </span>
            <span class="royal-plan-tier" aria-label="Kâr tier ${escapeHtml(profitTier)}">${escapeHtml(profitTier)}</span>
        </button>
    `;
}

function renderPlanStationBox(station, rows, tiers) {
    const body = rows.length
        ? rows.map((row) => renderPlanStationItem(row, tiers.get(row.id) || 'D')).join('')
        : '<p class="royal-plan-empty">—</p>';
    return `
        <section class="royal-plan-station" data-plan-station="${escapeHtml(station.id)}">
            <header class="royal-plan-station-head">
                <span class="royal-plan-station-label">${escapeHtml(station.label)}</span>
            </header>
            <div class="royal-plan-station-list">${body}</div>
        </section>
    `;
}

function renderPlanMissingItem(row) {
    const type = parseKind(row.recipe.kind).type;
    return `
        <button type="button" class="royal-plan-miss-item" data-plan-row="${escapeHtml(row.id)}"
            title="${escapeHtml(`${shortItemName(row.recipe.label)} · ${row.tierEnchant} · satış yok`)}">
            ${itemIconHtml(row.sellId, { className: 'item-icon royal-plan-miss-icon', size: 48 })}
            ${planTeHtml(row)}
            <span class="royal-plan-chip">${escapeHtml(type || '?')}</span>
        </button>
    `;
}

export function renderPlanDialogBody(plan) {
    const stations = PLAN_STATIONS.map((station) =>
        renderPlanStationBox(station, plan.stations[station.id] || [], plan.tiers)
    ).join('');

    const missing = plan.missingSell.length
        ? `
            <section class="royal-plan-missing">
                <header class="royal-plan-missing-head">
                    <span class="royal-plan-missing-label">Satış yok</span>
                </header>
                <div class="royal-plan-missing-list">
                    ${plan.missingSell.map(renderPlanMissingItem).join('')}
                </div>
            </section>
        `
        : '';

    return `
        <button type="button" class="app-dialog-close" aria-label="Kapat" data-plan-close></button>
        <div class="royal-plan-sheet">
            <div class="royal-plan-stations">${stations}</div>
            ${missing}
        </div>
    `;
}

export function renderPlanFab() {
    return `
        <button type="button" class="royal-plan-fab" id="royalPlanFab" aria-label="Royal Crafting Wizard" title="Royal Crafting Wizard">
            <svg class="royal-plan-fab-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 2.5 1.5-1.5 2 2 3.5-3.5 1.5 1.5-5 5-3.5-3.5Z"/>
            </svg>
        </button>
    `;
}

