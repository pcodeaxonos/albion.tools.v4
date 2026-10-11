import assert from 'node:assert/strict';
import { analyzeMarketCell as legacyAnalyze, assessMarketSide as legacyAssess, OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import {
    PRIMARY_STATUS as S, STATUS_PRESENTATION, STRATEGY_SPECS,
    opportunityFacts, resolveOpportunityCard, resolvePrimaryStatus,
    OPPORTUNITY_STATUS_FILTERS, isOpportunityFilter, matchesOpportunityFilter
} from '../js/core/opportunity-status.mjs';

// Unstated required conditions are valid, fresh and sufficient.
const legacyPolicy = { ...OPPORTUNITY_POLICY, validationMode: 'legacy' };
const assessMarketSide = options => legacyAssess({ ...options, policy: legacyPolicy });
const analyzeMarketCell = options => legacyAnalyze({ ...options, policy: legacyPolicy });

const BASE = Object.freeze({
    type: null,
    invalid: false,
    anomaly: false,
    prices: 'present',
    freshness: 'fresh',
    confidence: 'verified',
    netRequired: true,
    net: null,
    feasibility: 'verified',
    feasibilityRequired: false,
    strategy: null
});
const STRATEGY = Object.freeze({ verified: true, sufficientData: true });

const MATRIX = [
    ['Kritik hata + anomali', { invalid: true, anomaly: true, net: 500 }, S.BLOCKED],
    ['Geçerli anomali + pozitif teorik kâr', { anomaly: true, net: 500 }, S.ANOMALY],
    ['Anomali + eski veri', { anomaly: true, freshness: 'stale', net: 500 }, S.ANOMALY],
    ['Zorunlu fiyat eksik + veri eski', { prices: 'missing', freshness: 'stale', net: 500 }, S.INSUFFICIENT],
    ['Güncellik bilinmiyor', { freshness: 'unknown', net: 500 }, S.INSUFFICIENT],
    ['Pozitif net kâr + eski veri', { freshness: 'stale', net: 500 }, S.STALE],
    ['Negatif net kâr + güncel/yeterli veri', { net: -120 }, S.UNPROFITABLE],
    ['Pozitif net kâr + güven yeterli + işlem doğrulanmış', { net: 500, confidence: 'verified', feasibility: 'verified' }, S.ACTIONABLE],
    ['Pozitif net kâr + zorunlu güven yetersiz', { net: 500, confidence: 'insufficient' }, S.INSUFFICIENT],
    ['Geniş makas + doğrulanmış negatif net kâr', { type: 'local-make', net: -40 }, S.UNPROFITABLE],
    ['Net kâr bilinmiyor + bağımsız doğrulanmış strateji', { net: null, netRequired: true, strategy: STRATEGY }, S.STRATEGY],
    ['Net kâr bilinmiyor + zorunlu kâr hesabı eksik', { net: null, netRequired: true, strategy: null }, S.INSUFFICIENT],
    ['Uygulanabilirlik bilinmiyor + bağımsız doğrulanmış strateji', { net: 500, feasibility: 'unknown', strategy: STRATEGY }, S.STRATEGY],
    ['Uygulanabilirlik bilinmiyor + strateji yok + doğrulama zorunlu', { net: 500, feasibility: 'unknown', feasibilityRequired: true, strategy: null }, S.INSUFFICIENT],
    ['Tüm veriler geçerli + fırsat/strateji yok', { net: null, netRequired: false, strategy: null }, S.NEUTRAL]
];

const INVARIANTS = [
    ['STRATEGY zorunlu fiyat eksikliğini aşamaz', { prices: 'missing', net: null, strategy: STRATEGY }, S.INSUFFICIENT],
    ['STRATEGY güncellik bilinmezliğini aşamaz', { freshness: 'unknown', net: null, strategy: STRATEGY }, S.INSUFFICIENT],
    ['Bilinmeyen net sıfır değildir', { net: null, netRequired: false }, S.NEUTRAL],
    ['Bilinen sıfır net kârsızdır', { net: 0 }, S.UNPROFITABLE],
    ['Doğrulanmış negatif net bağımsız stratejiyi ezer', { net: -1, strategy: STRATEGY }, S.UNPROFITABLE],
    ['Bilinmeyen uygulanabilirlik ACTIONABLE üretmez', { net: 500, feasibility: 'unknown' }, S.NEUTRAL],
    ['Onaysız güven ACTIONABLE üretmez', { net: 500, confidence: 'sufficient' }, S.NEUTRAL],
    ['Onaysız strateji STRATEGY üretmez', { net: 500, confidence: 'sufficient', strategy: { verified: false, sufficientData: true } }, S.NEUTRAL],
    ['Bilinmeyen güven yetersizdir', { net: 500, confidence: 'unknown' }, S.INSUFFICIENT],
    ['Bilinmeyen net bilinmeyen uygulanabilirlikle ACTIONABLE üretmez', { net: null, netRequired: false, strategy: STRATEGY }, S.STRATEGY]
];

const TYPES = [null, ...Object.keys(STRATEGY_SPECS)];
for (const [name, inputs, expected] of [...MATRIX, ...INVARIANTS]) {
    const facts = { ...BASE, ...inputs };
    const result = resolvePrimaryStatus(facts);
    assert.equal(result.status, expected, `${name}: ${JSON.stringify(inputs)}`);
    assert.ok(STATUS_PRESENTATION[result.status], `${name}: status has a presentation`);
    for (const type of TYPES) {
        assert.deepEqual(resolvePrimaryStatus({ ...facts, type }), result, `${name}: independent of type ${type}`);
    }
    assert.deepEqual(resolvePrimaryStatus({ ...facts }), result, `${name}: deterministic`);
}
assert.deepEqual(resolvePrimaryStatus({ ...BASE, net: null, netRequired: true }).causes, ['net']);
assert.deepEqual(resolvePrimaryStatus({ ...BASE, prices: 'missing', freshness: 'unknown', net: 1 }).causes, ['prices', 'freshness']);
for (const [status, presentation] of Object.entries(STATUS_PRESENTATION)) {
    assert.equal(presentation.trade === 'allowed', status === S.ACTIONABLE, `${status}: only ACTIONABLE allows a trade`);
}

// Engine rows. Every row here comes from analyzeMarketCell; the engine leaves feasibility unknown.
const now = Date.parse('2026-10-10T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const fees = { setupFeeRate: 0.025, taxPremiumRate: 0.04, taxFreeRate: 0.08 };
const cell = { server: 'europe', itemId: 'T4_BAG', city: 'Martlock', quality: 1, fees, premium: true, now };
const none = () => assessMarketSide({ now });
function side(price, refPrice, { samples = 12, repeats = 2 } = {}) {
    const points = [];
    for (let index = samples; index >= 1; index -= 1) {
        points.push({ price: refPrice, seenAt: new Date(now - (index + 2) * HOUR).toISOString() });
    }
    for (let index = repeats - 1; index >= 0; index -= 1) points.push({ price, seenAt: new Date(now - index * HOUR).toISOString() });
    return assessMarketSide({ points, now });
}
function card(row) {
    return resolveOpportunityCard(row);
}

const sellUp = analyzeMarketCell({ ...cell, buy: none(), sell: side(150, 100) });
assert.equal(sellUp.parts.feasibility, null);
const sellUpCard = card(sellUp);
assert.equal(sellUpCard.facts.feasibility, 'unknown');
assert.equal(sellUpCard.status, S.STRATEGY, 'confirmed post-fee gain with unknown depth is a strategy, not actionable');
assert.equal(sellUpCard.tone, 'gain');
assert.equal(sellUpCard.trade, 'evaluate');

const sellDown = card(analyzeMarketCell({ ...cell, buy: none(), sell: side(70, 100) }));
assert.equal(sellDown.facts.netRequired, false);
assert.equal(sellDown.facts.net, null);
assert.equal(sellDown.status, S.STRATEGY, 'a saving needs no net result');

const buyUp = card(analyzeMarketCell({ ...cell, buy: side(150, 100), sell: none() }));
assert.equal(buyUp.status, S.STRATEGY);
assert.equal(buyUp.tone, 'amber');

const fresh = card(analyzeMarketCell({ ...cell, buy: none(), sell: side(150, 100, { repeats: 1 }) }));
assert.equal(fresh.facts.confidence, 'sufficient');
assert.equal(fresh.status, S.NEUTRAL, 'an unconfirmed move is neither actionable nor a verified strategy');
assert.equal(fresh.tone, 'muted');

const extreme = card(analyzeMarketCell({ ...cell, buy: side(3168, 3000, { samples: 2 }), sell: side(999999, 3000, { samples: 2 }) }));
assert.equal(extreme.status, S.ANOMALY);
assert.equal(extreme.trade, 'blocked');

const extremeRow = analyzeMarketCell({ ...cell, buy: none(), sell: side(999999, 3000, { samples: 2 }) });
assert.equal(matchesOpportunityFilter(extremeRow, 'place-sell-order'), true, 'high Sell continues to include extreme prices');
assert.equal(matchesOpportunityFilter(extremeRow, 'status:ANOMALY'), true);
assert.equal(matchesOpportunityFilter(sellUp, 'status:ANOMALY'), false);
assert.equal(matchesOpportunityFilter({ ...sellUp, sell: { ...sellUp.sell, reference: null } }, 'place-sell-order'), true);
assert.equal(matchesOpportunityFilter({ ...sellUp, sell: { ...sellUp.sell, reference: null } }, 'status:INSUFFICIENT'), true);
assert.equal(isOpportunityFilter('status:ANOMALY'), true);
assert.equal(isOpportunityFilter('status:UNKNOWN'), false);
assert.equal(isOpportunityFilter('place-sell-order'), true);
for (const filter of OPPORTUNITY_STATUS_FILTERS) assert.equal(isOpportunityFilter(filter.id), true);

const solid = analyzeMarketCell({ ...cell, buy: side(8000, 8000), sell: side(12000, 8000) });
assert.ok(solid.declined.some((row) => row.id === 'local-flip' && row.advantageSilver <= 0), 'evaluated non-positive strategies are exposed');
assert.equal(solid.strategies.some((row) => row.id === 'local-flip'), false);

const carried = analyzeMarketCell({
    ...cell, buy: side(90, 90), sell: side(100, 100),
    peers: [{ city: 'Thetford', buy: side(200, 100), sell: none() }]
});
assert.equal(carried.primary.id, 'cross-city-instant');
assert.ok(Number.isFinite(carried.primary.destAgeMs), 'destination age is public, so freshness is known');
assert.equal(opportunityFacts(carried).freshness, 'fresh');
assert.equal(card(carried).status, S.NEUTRAL, 'an inversion has no confirmation step');

// Engine-shaped rows with one fact changed. Same facts give the same status as the matrix above.
const withSell = (row, patch) => ({ ...row, sell: { ...row.sell, ...patch } });
assert.equal(card(withSell(sellUp, { reference: null })).status, S.INSUFFICIENT);
assert.deepEqual(card(withSell(sellUp, { reference: null })).causes, ['prices']);
assert.equal(card(withSell(sellUp, { price: -5 })).status, S.BLOCKED);
assert.equal(card(withSell(sellUp, { stale: true, ageMs: 7 * HOUR })).status, S.STALE);
assert.equal(card(withSell(sellUp, { ageMs: undefined })).status, S.INSUFFICIENT);
assert.equal(card({ ...sellUp, parts: { ...sellUp.parts, reliability: 0 } }).status, S.INSUFFICIENT);
assert.equal(card({ ...sellUp, parts: { ...sellUp.parts, feasibility: 1 } }).status, S.ACTIONABLE);
assert.equal(card({ ...sellUp, parts: { ...sellUp.parts, feasibility: 0 } }).status, S.BLOCKED);
assert.equal(card({ ...withSell(sellUp, { anomalous: true, deviation: 5 }), sell: { ...sellUp.sell, deviation: 5, stale: true } }).status, S.ANOMALY);

const declinedSell = {
    ...sellUp, primary: null,
    strategies: sellUp.strategies.filter((row) => row.id !== 'place-sell-order'),
    declined: [{ id: 'place-sell-order', label: 'Satış emri açma', kind: 'unrealized', advantageSilver: -12, netSilver: -12 }]
};
assert.equal(card(declinedSell).status, S.UNPROFITABLE, 'an evaluated non-positive result is unprofitable');
assert.equal(card({ ...declinedSell, declined: [] }).status, S.INSUFFICIENT, 'an unevaluated result is unknown, not zero');
assert.deepEqual(card({ ...declinedSell, declined: [] }).causes, ['net']);

console.log('Opportunity status: decision matrix, invariants and engine-row mapping passed.');
