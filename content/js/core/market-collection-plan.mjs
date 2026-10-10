import { MARKET_COLLECTION_POLICY } from './market-history-config.mjs';

const FIVE_MIN_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const CLASS_RANK = { A: 0, B: 1, C: 2 };

/**
 * Official caps are 180/minute and 300/5 minutes. Stay at budgetRatio of both.
 * If the whole catalog fits inside the fastest target, every class uses that target.
 * Otherwise intervals stretch to the sustainable full-catalog period, never below the class target.
 */
export function cadenceForCatalog({ batchCount, policy = MARKET_COLLECTION_POLICY }) {
    const budgetPerFiveMin = Math.floor(policy.rateLimitPerFiveMin * policy.budgetRatio);
    const budgetPerMinute = Math.floor(policy.rateLimitPerMinute * policy.budgetRatio);
    const fastest = policy.targets.A;
    const requestsForFastest = batchCount * (FIVE_MIN_MS / fastest);
    const fullSweepFitsFastest = requestsForFastest <= budgetPerFiveMin;
    const minInterval = batchCount > 0 ? Math.ceil(batchCount / budgetPerFiveMin * FIVE_MIN_MS) : fastest;
    const interval = (target) => fullSweepFitsFastest ? fastest : Math.max(target, minInterval);
    const sustainedPerMinute = Math.min(budgetPerMinute, budgetPerFiveMin / 5);
    const requestGapMs = Math.ceil(MINUTE_MS / sustainedPerMinute);
    return {
        A: interval(policy.targets.A),
        B: interval(policy.targets.B),
        C: interval(policy.targets.C),
        budgetPerFiveMin,
        budgetPerMinute,
        requestGapMs,
        fullSweepFitsFastest,
        batchCount
    };
}

export function classifyCollectionItem({ opportunityAt = 0, watchedAt = 0, samples = 0, changes = 0, now, policy = MARKET_COLLECTION_POLICY }) {
    if ((opportunityAt && now - opportunityAt < policy.classARecentMs)
        || (watchedAt && now - watchedAt < policy.classARecentMs)) return 'A';
    if (samples >= policy.classBMinSamples && changes > 0) return 'B';
    return 'C';
}

export function createCollectionPlan({
    ids, preferredIds = [], policy = MARKET_COLLECTION_POLICY, batchCount, now = Date.now
} = {}) {
    const idSet = new Set(ids);
    const preferred = new Set(preferredIds);
    const cadence = cadenceForCatalog({ batchCount, policy });
    const fetchedAt = new Map();
    const opportunityAt = new Map();
    const watchedAt = new Map();
    const samples = new Map();
    const changes = new Map();
    const lastPrice = new Map();
    const requests = [];
    let discovered = 0;

    function rememberRequest(at) {
        requests.push(at);
        while (requests.length && at - requests[0] > FIVE_MIN_MS) requests.shift();
    }

    function classOf(id, at) {
        return classifyCollectionItem({
            opportunityAt: opportunityAt.get(id) || 0,
            watchedAt: watchedAt.get(id) || 0,
            samples: samples.get(id) || 0,
            changes: changes.get(id) || 0,
            now: at,
            policy
        });
    }

    function stampSignal(map, itemIds, at) {
        for (const id of itemIds || []) {
            if (!idSet.has(id)) continue;
            map.set(id, at);
            const last = fetchedAt.get(id) || 0;
            if (at - last >= cadence.A) fetchedAt.set(id, at - cadence.A);
        }
    }

    return {
        cadence,
        tickMs: policy.tickMs,
        historyBatchCap: policy.historyBatchCap,
        preferredIds: preferred,
        dueIds(at = now()) {
            return [...idSet].filter((id) => at - (fetchedAt.get(id) || 0) >= cadence[classOf(id, at)])
                .sort((a, b) => CLASS_RANK[classOf(a, at)] - CLASS_RANK[classOf(b, at)]
                    || (fetchedAt.get(a) || 0) - (fetchedAt.get(b) || 0));
        },
        allowRequest(at = now()) {
            const minute = requests.filter((stamp) => at - stamp < MINUTE_MS).length;
            const five = requests.filter((stamp) => at - stamp < FIVE_MIN_MS).length;
            return minute < cadence.budgetPerMinute && five < cadence.budgetPerFiveMin;
        },
        noteRequest(at = now()) { rememberRequest(at); },
        noteFetched(itemIds, at = now()) {
            for (const id of itemIds || []) if (idSet.has(id)) fetchedAt.set(id, at);
        },
        notePrices(rows, at = now()) {
            for (const row of rows || []) {
                const id = row.itemId;
                if (!idSet.has(id) || !(row.price > 0)) continue;
                const key = `${id}|${row.city}|${row.side}`;
                const previous = lastPrice.get(key);
                if (previous != null && previous !== row.price) changes.set(id, (changes.get(id) || 0) + 1);
                lastPrice.set(key, row.price);
                samples.set(id, (samples.get(id) || 0) + 1);
            }
            void at;
        },
        noteOpportunities(itemIds, at = now()) { stampSignal(opportunityAt, itemIds, at); },
        noteWatched(itemIds, at = now()) { stampSignal(watchedAt, itemIds, at); },
        noteDiscovery(itemIds, at = now()) {
            const known = (itemIds || []).filter((id) => idSet.has(id));
            discovered += known.length;
            stampSignal(opportunityAt, known, at);
            return known.length;
        },
        publicState(at = now()) {
            const counts = { A: 0, B: 0, C: 0 };
            for (const id of idSet) counts[classOf(id, at)] += 1;
            const minute = requests.filter((stamp) => at - stamp < MINUTE_MS).length;
            const five = requests.filter((stamp) => at - stamp < FIVE_MIN_MS).length;
            return {
                cadence,
                classes: counts,
                requestsInMinute: minute,
                requestsInFiveMin: five,
                budgetPerMinute: cadence.budgetPerMinute,
                budgetPerFiveMin: cadence.budgetPerFiveMin,
                discoveredSignals: discovered
            };
        }
    };
}
