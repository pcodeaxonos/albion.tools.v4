import assert from 'node:assert/strict';
import { decide, craftCost, assessQuote, expandRecipe, STATUS, DECISION_POLICY } from '../js/core/decision-engine.mjs';
import { estimateLongTermReference } from '../js/core/long-term-price.mjs';
import { DAY_MS } from '../js/core/market-history-config.mjs';
import fs from 'node:fs';
import { collectRecipeMechanics, matchingRecipeMechanics } from '../js/core/recipe-mechanics.mjs';

let tests = 0;
function test(name, fn) { fn(); tests++; console.log(`OK ${name}`); }
const confirmed = price => ({ price, status: STATUS.confirmed });
const fees = { taxRate: .04, setupFeeRate: .025 };
const recipe = { uniqueName: 'OUTPUT', lines: [{ uniqueName: 'MAT', qty: 2, appliesRr: true }] };
const mechanics = { batchYield: 1, feePerBatch: 1, rr: 0, focus: false };
const quotes = { OUTPUT: { sell: confirmed(100), buy: confirmed(90) }, MAT: { sell: confirmed(10), buy: confirmed(8) } };
const base = { itemId: 'OUTPUT', mode: 'need', quantity: 1, quotes, fees, recipe, mechanics, urgency: 'now', city: 'Martlock' };
const option = (result, id) => result.options.find(option => option.id === id);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('Complete cheap craft => CRAFT_NOW', () => assert.equal(decide(base).primary, 'CRAFT_NOW'));
test('Ask acquisition and bid disposal remain separate', () => {
    assert.equal(option(decide({ ...base, recipe: null }), 'BUY_NOW').total, 100);
    close(option(decide({ ...base, mode: 'have' }), 'SELL_NOW').total, 86.4);
});
test('Order fees differ from instant fees', () => {
    assert.equal(option(decide({ ...base, limitPrice: 40 }), 'BUY_ORDER').total, 41);
    assert.equal(option(decide({ ...base, mode: 'have', limitPrice: 100 }), 'SELL_ORDER').total, 93.5);
});
test('Cheap unknown order, urgent => BUY_NOW', () => assert.equal(decide({ ...base, recipe: null, limitPrice: 1 }).primary, 'BUY_NOW'));
test('Conditional savings remain separate from confirmed recommendation', () => {
    const result = decide({ ...base, recipe: null, limitPrice: 40, urgency: 'later' });
    assert.equal(result.primary, 'BUY_NOW'); assert.equal(option(result, 'BUY_ORDER').conditionalAdvantage, 59);
});
test('Unknown fill never becomes guaranteed even when not urgent', () => {
    const result = decide({ ...base, recipe: null, limitPrice: 1, urgency: 'later' });
    assert.equal(result.primary, 'BUY_NOW'); assert.equal(option(result, 'BUY_ORDER').status, STATUS.order);
});
test('Missing ingredient does not block independent instant acquisition', () => {
    const result = decide({ ...base, quotes: { OUTPUT: quotes.OUTPUT } });
    assert.equal(result.primary, 'BUY_NOW'); assert.equal(option(result, 'CRAFT_NOW').status, STATUS.missing); assert.equal(option(result, 'CRAFT_NOW').total, null);
});
test('Batch rounding buys full recipe quantities', () => {
    const result = craftCost({ recipe, quantity: 5, quotes, fees, mechanics: { ...mechanics, batchYield: 3 } });
    assert.equal(result.batches, 2); assert.equal(result.outputQuantity, 6); assert.equal(result.materials[0].qty, 4); assert.equal(result.total, 42);
});
test('Owned materials have nonzero disposal opportunity cost', () => {
    const result = craftCost({ recipe, quantity: 1, quotes, fees, mechanics, inventory: { MAT: 2 } });
    close(result.opportunity, 15.36); close(result.total, 16.36);
});
test('RR credits disposal bids net of tax only in separate conditional net', () => {
    const result = craftCost({ recipe, quantity: 1, quotes, fees, mechanics: { ...mechanics, rr: .5 } });
    close(result.returns, 7.68); close(result.conditionalTotal, 13.32); assert.equal(result.total, 21); assert.equal(result.status, STATUS.confirmed);
});
test('Non-returnable input receives no RR credit', () => {
    const result = craftCost({ recipe: { ...recipe, lines: [{ ...recipe.lines[0], appliesRr: false }] }, quantity: 1, quotes, fees, mechanics: { ...mechanics, rr: .5 } });
    assert.equal(result.returns, 0); assert.equal(result.total, 21);
});
test('Focus expense and missing focus economics', () => {
    const result = craftCost({ recipe, quantity: 1, quotes, fees, mechanics: { ...mechanics, focus: true, focusPerBatch: 10, focusSilver: 3 } });
    assert.equal(result.focusCost, 30); assert.equal(result.total, 51);
    assert.equal(craftCost({ recipe, quantity: 1, quotes, fees, mechanics: { ...mechanics, focus: true } }).status, STATUS.missing);
});
test('Material order scenario uses explicit limit and setup', () => {
    const result = decide({ ...base, materialOrders: { MAT: 5 } });
    assert.equal(option(result, 'CRAFT_WITH_ORDERS').total, 11.25); assert.equal(option(result, 'CRAFT_WITH_ORDERS').status, STATUS.order);
});
test('Loss-making conversion => SELL_NOW, including held opportunity cost', () => {
    const upper = { uniqueName: 'UPPER', lines: [{ uniqueName: 'OUTPUT', qty: 1, appliesRr: false }, { uniqueName: 'MAT', qty: 2 }] };
    const result = decide({ ...base, mode: 'have', quotes: { ...quotes, UPPER: { buy: confirmed(95) } }, conversions: [{ recipe: upper, mechanics }] });
    assert.equal(result.primary, 'SELL_NOW'); assert.ok(option(result, 'CRAFT_INTO').additionalValue < 0); close(option(result, 'CRAFT_INTO').opportunity, 86.4);
});
test('Profitable conversion includes leftover held stock', () => {
    const upper = { uniqueName: 'UPPER', lines: [{ uniqueName: 'OUTPUT', qty: 2, appliesRr: false }] };
    const result = decide({ ...base, mode: 'have', quantity: 3, quotes: { ...quotes, UPPER: { buy: confirmed(250) } }, conversions: [{ recipe: upper, mechanics }] });
    assert.equal(result.primary, 'CRAFT_INTO'); assert.equal(option(result, 'CRAFT_INTO').heldUsed, 2); assert.ok(Math.abs(option(result, 'CRAFT_INTO').total - 325.4) < 1e-8);
});
test('Anomalous ask is excluded from firm recommendation', () => {
    const now = Date.UTC(2026, 9, 10);
    const quote = assessQuote({ sell_price_min: 1, sell_price_min_date: new Date(now).toISOString() }, 'sell', { source: 'quote-history', price: 100 }, { now });
    assert.equal(quote.status, STATUS.anomaly); assert.equal(decide({ ...base, recipe: null, quotes: { OUTPUT: { sell: quote } } }).primary, 'NO_RELIABLE_DECISION');
});
test('Observed timestamp is not replaced by fresh fetch time', () => {
    const now = Date.UTC(2026, 9, 10);
    const row = { sell_price_min: 100, sell_price_min_date: new Date(now - DECISION_POLICY.staleMs - 1).toISOString(), fetchedAt: new Date(now).toISOString() };
    assert.equal(assessQuote(row, 'sell', null, { now }).status, STATUS.missing);
    assert.equal(assessQuote({ ...row, sell_price_min_date: null }, 'sell', null, { now }).status, STATUS.missing);
    assert.equal(assessQuote({ ...row, sell_price_min_date: '2026-10-10T00:00:00' }, 'sell', null, { now }).status, STATUS.confirmed);
});
test('28-day estimator keeps sparse hours absent and admits completed coverage', () => {
    const now = 100 * DAY_MS;
    const points = Array.from({ length: 13 }, (_, hour) => ({ seenAt: new Date(now - DAY_MS + hour * 3600000).toISOString(), price: 10 }));
    const reference = estimateLongTermReference(points, { now, source: 'quote-history' });
    assert.equal(reference.validBuckets, 13); assert.equal(reference.validDays, 1); assert.equal(reference.price, 10);
});
test('Mode separation', () => {
    assert.ok(decide(base).options.every(o => !o.id.startsWith('SELL')));
    assert.ok(decide({ ...base, mode: 'have' }).options.every(o => !o.id.startsWith('BUY')));
});
test('Invalid inputs and missing rates never produce decisions', () => {
    for (const quantity of [0, -1, NaN, Infinity, 1.5, null]) assert.equal(decide({ ...base, quantity }).primary, 'NO_RELIABLE_DECISION');
    assert.equal(decide({ ...base, fees: { taxRate: null, setupFeeRate: .025 } }).primary, 'NO_RELIABLE_DECISION');
    assert.equal(decide({ ...base, mode: 'invalid' }).primary, 'NO_RELIABLE_DECISION');
    assert.equal(option(decide({ ...base, inventory: { MAT: -1 } }), 'CRAFT_NOW').status, STATUS.missing);
});
test('Equal and close costs prefer simpler instant path', () => {
    assert.equal(decide({ ...base, quotes: { ...quotes, OUTPUT: { sell: confirmed(21), buy: confirmed(20) } } }).primary, 'BUY_NOW');
    assert.equal(decide({ ...base, quotes: { ...quotes, OUTPUT: { sell: confirmed(21.01), buy: confirmed(20) } } }).primary, 'BUY_NOW');
});
test('Unknown transfer expense blocks cross-city craft', () => {
    const result = decide({ ...base, craftCity: 'Lymhurst' }); assert.equal(result.primary, 'BUY_NOW'); assert.equal(option(result, 'CRAFT_NOW').total, null);
});
test('Missing batch, station fee, RR, or return bid do not turn into zero', () => {
    for (const key of ['batchYield', 'feePerBatch', 'rr']) assert.equal(option(decide({ ...base, mechanics: { ...mechanics, [key]: null } }), 'CRAFT_NOW').status, STATUS.missing);
    assert.equal(option(decide({ ...base, mechanics: { ...mechanics, rr: .5 }, quotes: { ...quotes, MAT: { sell: confirmed(10) } } }), 'CRAFT_NOW').total, null);
});
test('Known base fee and safe quantity bounds cannot be bypassed', () => {
    assert.equal(option(decide({ ...base, mechanics: { ...mechanics, baseSilverPerBatch: 10 } }), 'CRAFT_NOW').status, STATUS.missing);
    assert.equal(option(decide({ ...base, quantity: Number.MAX_SAFE_INTEGER }), 'CRAFT_NOW').status, STATUS.missing);
});
test('Recursive inspection has depth and cycle guards', () => {
    const recipes = { OUTPUT: { ...recipe, batchYield: 2 }, MAT: { batchYield: 1, lines: [{ uniqueName: 'LEAF', qty: 3 }] } };
    assert.equal(expandRecipe('OUTPUT', 3, recipes).children[0].children[0].quantity, 12);
    assert.throws(() => expandRecipe('OUTPUT', 1, { OUTPUT: { ...recipe, batchYield: 1 }, MAT: { batchYield: 1, lines: [{ uniqueName: 'OUTPUT', qty: 1 }] } }), /döngüsü/);
    assert.throws(() => expandRecipe('OUTPUT', 1, recipes, { maxDepth: 1 }), /derinlik/);
});
test('Recipe metadata preserves inherited enchant identity and explicit unknowns', () => {
    const metadata = collectRecipeMechanics({ '@uniquename': 'ITEM', craftingrequirements: { '@amountcrafted': '10', '@silver': '0', craftresource: { '@uniquename': 'MAT', '@count': '2' } }, enchantments: { enchantment: { '@enchantmentlevel': '1', craftingrequirements: { '@amountcrafted': '10', craftresource: { '@uniquename': 'MAT', '@count': '3' } } } } });
    assert.equal(metadata.get('ITEM').batchYield, 10); assert.equal(metadata.get('ITEM').baseSilverPerBatch, 0);
    assert.equal(metadata.get('ITEM@1').lines[0].qty, 3); assert.equal(metadata.get('ITEM@1').baseSilverPerBatch, null);
    assert.equal(matchingRecipeMechanics({ uniqueName: 'ITEM', lines: [{ uniqueName: 'MAT', qty: 999 }] }, metadata.get('ITEM')), null);
});
test('Real Beef Sandwich metadata matches local BOM with yield 10', () => {
    const metadata = JSON.parse(fs.readFileSync(new URL('../../data/recipe-mechanics.json', import.meta.url))).recipes.find(row => row.uniqueName === 'T8_MEAL_SANDWICH');
    assert.equal(metadata.batchYield, 10);
    assert.deepEqual(metadata.lines.map(row => row.qty), [36, 72, 18]);
    const items = JSON.parse(fs.readFileSync(new URL('../../data/items.json', import.meta.url)));
    const lines = JSON.parse(fs.readFileSync(new URL('../../data/recipe-materials.json', import.meta.url)));
    const outputId = items.find(row => row.uniqueName === metadata.uniqueName).id;
    const byId = new Map(items.map(row => [row.id, row.uniqueName]));
    assert.ok(matchingRecipeMechanics({ uniqueName: metadata.uniqueName, lines: lines.filter(line => line.outputItemId === outputId).map(line => ({ ...line, uniqueName: byId.get(line.inputItemId) })) }, metadata));
});
console.log(`PASS ${tests} decision-engine fixtures`);
