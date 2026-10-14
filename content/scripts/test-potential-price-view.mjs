import assert from 'node:assert/strict';
import { potentialDefaults, filterPotentialRows, potentialFilterValue } from '../js/core/potential-price-view.mjs';
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
assert.deepEqual(ids({ tier: '4' }), ['base', 'enchanted']);
assert.deepEqual(ids({ enchant: '0' }), ['base']);
assert.deepEqual(ids({ enchant: '1' }), ['enchanted', 'higher']);
assert.deepEqual(ids({ tier: '4', enchant: '1', city: 'Martlock' }), ['enchanted']);
assert.deepEqual(ids({ tier: '5', enchant: '0' }), []);
assert.equal(potentialFilterValue(variants[3], 'enchant'), '', 'unknown items are not treated as base enchant');
assert.equal(ids({}).length, 4, 'all retains items without tier metadata');
console.log('Potential price filters and null-safe sorting passed.');
