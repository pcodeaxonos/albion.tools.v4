import { fetchPrices, priceIndexKey } from './market.js';
import { fetchLongTermIndex } from './long-term-quotes.js';
import { marketSeriesKey } from './market-primitives.mjs';
import { getServer, localPriceHost, getSettings } from './settings.js';
import { getCraftRecipes, getEconomyConstant } from './catalog.js';
import { getAll } from '../db/store.js';
import { assessQuote, DECISION_POLICY } from './decision-engine.mjs';
import { matchingRecipeMechanics } from './recipe-mechanics.mjs';
import { bonusFamilyMeta } from './bonus-cities.js';
import { hasTodayDailyBonus, defaultCraftBonusRate } from './craft-bonus.js';
import { returnRateFromProductionBonus } from './economy-math.js';

let mechanicsIndex = new Map();
export async function loadRecipeMechanics() {
    const response = await fetch('data/recipe-mechanics.json');
    if (!response.ok) throw new Error('Tarif metadata’sı alınamadı');
    const payload = await response.json();
    mechanicsIndex = new Map(payload.recipes.map(recipe => [recipe.uniqueName, { ...recipe, source: payload.source, fetchedAt: payload.fetchedAt }]));
}
export function decisionRecipeInfo(recipe, city, focus) {
    const metadata = matchingRecipeMechanics(recipe, mechanicsIndex.get(recipe?.uniqueName));
    const family = recipe?.familyKey ? bonusFamilyMeta(recipe.familyKey) : null;
    const dailyKnown = hasTodayDailyBonus();
    const cityRow = getAll('cities').find(row => row.marketApiName === city);
    const base = getEconomyConstant('city_production');
    const specialty = getEconomyConstant('city_specialty_production');
    const focusBonus = getEconomyConstant('focus_production');
    // Only the existing standard royal equipment craft model is admitted automatically.
    // Consumable/refine cities have distinct mechanics; their RR must be confirmed separately.
    const standardEquipment = ['head', 'armors', 'shoes', 'weapons', 'offhands'].includes(recipe?.familyKey?.split('/')[0]);
    const production = standardEquipment && dailyKnown && cityRow?.cityType === 'Royal' && [base, specialty, focusBonus].every(value => typeof value === 'number' && Number.isFinite(value))
        ? base + (family?.city === city ? specialty : 0) + defaultCraftBonusRate([recipe.familyKey]) + (focus ? focusBonus : 0) : null;
    return { metadata, family, dailyKnown, production, rr: production == null ? null : returnRateFromProductionBonus(production) };
}

export function decisionCatalog() {
    const recipes = getCraftRecipes();
    const byOutput = new Map(recipes.map(recipe => [recipe.uniqueName, recipe]));
    const byInput = new Map();
    for (const recipe of recipes) for (const line of recipe.lines) {
        if (!byInput.has(line.uniqueName)) byInput.set(line.uniqueName, []);
        const list = byInput.get(line.uniqueName);
        if (!list.includes(recipe)) list.push(recipe);
    }
    return { items: getAll('items').filter(item => item.tradeable !== false), byOutput, byInput };
}

export function decisionFees() {
    // No fallback rates: missing catalog configuration blocks the calculation.
    return { setupFeeRate: getEconomyConstant('setup_fee'), taxRate: getEconomyConstant(getSettings().premium ? 'tax_premium' : 'tax_free') };
}

export async function loadDecisionQuotes(items, city, { signal } = {}) {
    const server = getServer().id;
    const ids = [...new Set(items.filter(Boolean))];
    const [prices, history] = await Promise.allSettled([fetchPrices(ids, [city], { qualities: '1', signal }), fetchLongTermIndex(ids, [city], { signal })]);
    signal?.throwIfAborted();
    if (getServer().id !== server) throw new Error('Sunucu değişti; fiyatları yenileyin');
    if (prices.status === 'rejected') throw prices.reason;
    const index = new Map(prices.value.map(row => [priceIndexKey(row.item_id, row.city, row.quality), row]));
    const references = history.status === 'fulfilled' ? history.value : new Map();
    const quotes = {};
    const now = Date.now();
    for (const itemId of ids) {
        const row = index.get(priceIndexKey(itemId, city, 1));
        quotes[itemId] = Object.fromEntries(['buy', 'sell'].map(side => [side,
            assessQuote(row, side, references.get(marketSeriesKey({ server, itemId, city, quality: 1, side })), { now })]));
    }
    return { server, city, quotes, fetchedAt: new Date(now).toISOString(), source: getSettings().priceSource,
        historyError: history.status === 'rejected' ? '28 günlük arşiv alınamadı; anomali kontrolü sınırlı.' : '', policy: DECISION_POLICY };
}

export async function loadDecisionSeries(itemId, city, signal) {
    const server = getServer().id;
    const params = new URLSearchParams({ server, item: itemId, location: city, quality: '1' });
    const response = await fetch(`${localPriceHost()}/api/v1/market/opportunity-series?${params}`, { signal });
    if (!response.ok) throw new Error('Saatlik arşiv alınamadı');
    const data = await response.json();
    if (data.server !== server || data.itemId !== itemId || data.city !== city || Number(data.quality) !== 1) throw new Error('Geçmiş seri kimliği uyuşmuyor');
    return data;
}
