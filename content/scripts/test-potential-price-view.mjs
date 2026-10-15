import assert from 'node:assert/strict';
import { POTENTIAL_PRICE_STATES, potentialPriceState, potentialDefaults, potentialPreferences, filterPotentialRows, potentialFilterValue } from '../js/core/potential-price-view.mjs';
const decisions = [
    { id: 'usable', plannerUsable: true, decision: 'Kullanılabilir', indicativePrice: 100 },
    { id: 'warning', plannerUsable: true, decision: 'Uyarıyla kullanılabilir', freshness: 'delayed' },
    { id: 'reference', plannerUsable: false, decision: 'İnceleme gerekli', indicativePrice: 100, confidence: 'low', reviewRequired: true },
    { id: 'no-evidence', plannerUsable: false, decision: 'Kullanılmaz', indicativePrice: null, status: 'Süresi doldu' }
];
const original = structuredClone(decisions);
for (const [priceState] of POTENTIAL_PRICE_STATES) {
    assert.deepEqual(filterPotentialRows(decisions, { ...potentialDefaults(), priceState }).map(row => row.id), [priceState]);
}
assert.deepEqual(decisions.map(potentialPriceState), POTENTIAL_PRICE_STATES.map(([value]) => value));
assert.deepEqual(decisions, original, 'classification leaves decision details unchanged');
assert.equal(potentialPreferences({ priceState: 'reference' }).priceState, 'reference');
assert.equal(potentialPreferences({ priceState: 'invalid' }).priceState, '');
assert.deepEqual(potentialPreferences({ decision: 'Kullanılmaz', status: 'Düşük güven' }), potentialDefaults(), 'retired overlapping preferences cannot invisibly filter records');
const rows = [{ id: '1', itemName: 'Carrots', itemId: 'T4_CARROT', city: 'Brecilien', price: 100 },
    { id: '2', itemName: 'Turnips', itemId: 'T4_TURNIP', city: 'Martlock', price: null },
    { id: '3', itemName: 'Carrots', itemId: 'T4_CARROT', city: 'Martlock', price: 50 }];
assert.deepEqual(filterPotentialRows(rows, { ...potentialDefaults(), city: 'Martlock', search: 'carrot' }).map(row => row.id), ['3']);
for (const direction of ['asc', 'desc']) assert.equal(filterPotentialRows(rows, { ...potentialDefaults(), sort: 'price', direction }).at(-1).price, null);
assert.deepEqual(rows.map(row => row.id), ['1', '2', '3'], 'sorting does not mutate stored projection');
const variants = [
    { id: 'base', itemId: 'T4_BAG', city: 'Martlock' },
    { id: 'enchanted', itemId: 'T4_BAG@1', city: 'Martlock' },
    { id: 'higher', itemId: 'T5_BAG@1', city: 'Brecilien' },
    { id: 'unknown', itemId: 'SILVER' }
];
const ids = filters => filterPotentialRows(variants, { ...potentialDefaults(), ...filters }).map(row => row.id).sort();
assert.deepEqual(ids({ itemId: 'T4_BAG' }), ['base'], 'item selection excludes other tiers and enchantments');
assert.deepEqual(ids({ itemId: 'T4_BAG@1', city: 'Martlock' }), ['enchanted']);
assert.deepEqual(ids({ itemId: 'T4_BAG', city: 'Brecilien' }), [], 'item and market filters combine');
assert.deepEqual(ids({ tier: '4' }), ['base', 'enchanted']);
assert.deepEqual(ids({ enchant: '0' }), ['base']);
assert.deepEqual(ids({ enchant: '1' }), ['enchanted', 'higher']);
assert.deepEqual(ids({ tier: '4', enchant: '1', city: 'Martlock' }), ['enchanted']);
assert.deepEqual(ids({ tier: '5', enchant: '0' }), []);
assert.equal(potentialFilterValue(variants[3], 'enchant'), '', 'unknown items are not treated as base enchant');
assert.equal(ids({}).length, 4, 'all retains items without tier metadata');
console.log('Potential price filters and null-safe sorting passed.');

const preferences = { ...potentialDefaults(), itemId: 'T4_BAG@1', city: 'Martlock', tier: '4', enchant: '1', sort: 'price', direction: 'asc', view: 'cards', page: 2 };
for (const days of ['2', '7', '28']) assert.equal(potentialPreferences({ days }).days, days);
for (const days of ['1', '14', '21', '60', '90']) assert.equal(potentialPreferences({ days }).days, '');
assert.deepEqual(filterPotentialRows([2, 7, 28, 1, 14, 21, 60, 90, null].map(days => ({ id: String(days), days })), potentialDefaults()).map(row => row.days), [2, 7, 28, null], 'retired durations stay in storage but are excluded from tool results');
assert.deepEqual(potentialPreferences(JSON.parse(JSON.stringify(preferences))), preferences, 'all selections survive persistence');
for (const saved of [null, [], 'invalid', { sort: 'invalid', direction: 'invalid', view: 'invalid', page: -1, city: {} }]) {
    assert.deepEqual(potentialPreferences(saved), potentialDefaults(), 'invalid saved preferences use defaults');
}
