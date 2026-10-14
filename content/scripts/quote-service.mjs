import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { islandMarketItemIds, islandMarketCities } from '../js/core/island/market-scope.mjs';
import { marketCatalogItemIds } from '../js/core/market-catalog.mjs';
import { createCollectionPlan } from '../js/core/market-collection-plan.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
import { BOOK_PRICE_FIELDS } from '../js/core/market-primitives.mjs';
import { AODP_COLLECTOR_POLICY, MARKET_COLLECTION_POLICY, PRICE_STALE_MS } from '../js/core/market-history-config.mjs';
import { selectLongTermReference } from '../js/core/long-term-price.mjs';
import { shadowEvaluationSteps } from '../js/core/market-opportunity-shadow.mjs';
import { OBSERVATION_POLICY } from '../js/core/market-observation.mjs';
import { OPPORTUNITY_POLICY } from '../js/core/market-opportunities.mjs';
import { scanQuoteBookSteps, runScanSteps, runScanStepsAsync, seriesForCell } from '../js/core/market-opportunity-scan.mjs';
import { QuoteHistoryRepository } from './quote-history-repository.mjs';
import { createAodpCollector } from './aodp-collector.mjs';
import { attachOpportunitySales, rankCommercialOpportunities } from '../js/core/market-opportunity-commerce.mjs';
import { rankOpportunityPresentation } from '../js/core/market-opportunity-quality.mjs';

const OPPORTUNITY_CACHE_TTL_MS = 30_000;

function diagnosticEvidence(rows, now) {
    const seen = new Set(), ages = [];
    let fresh = 0, stale = 0, missing = 0, unknownSourceTime = 0, timeSkewOver60m = 0;
    for (const row of rows) {
        const inputs = row.primary?.evidence?.inputs || {};
        const routeTimes = [];
        for (const [role, side] of Object.entries(inputs)) {
            const sourceAt = Date.parse(side?.at || '');
            if (Number.isFinite(sourceAt)) routeTimes.push(sourceAt);
            const key = side?.evidenceId || `${row.server}|${row.itemId}|${row.city}|${row.quality}|${role}|${side?.at || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!(Number(side?.price) > 0) || !side?.at) { missing++; continue; }
            const age = Number.isFinite(side.ageMs) ? side.ageMs : now - Date.parse(side.at);
            ages.push(age);
            if (age < 0 || !side.sourceTimeKnown) unknownSourceTime++;
            else if (age >= PRICE_STALE_MS) stale++;
            else fresh++;
        }
        if (routeTimes.length > 1 && Math.max(...routeTimes) - Math.min(...routeTimes) > 60 * 60 * 1000) timeSkewOver60m++;
    }
    const sorted = ages.slice().sort((a, b) => a - b);
    return { scope: 'unique primary evidence legs on returned opportunity/watch candidates; not all scanned cells',
        uniquePriceLegs: seen.size, freshUnder6h: fresh, stale6hOrMore: stale, missingPriceOrTime: missing,
        unknownOrFutureSourceTime: unknownSourceTime, routesWithSourceTimeSkewOver60m: timeSkewOver60m,
        ageMs: sorted.length ? { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) } : null };
}

function groupedCount(rows, calibration) {
    const presented = rankOpportunityPresentation(rows, { calibration });
    // Group totals need strategy selection and liquidity grouping, not Pareto ordering.
    return { before: rows.length, after: rankCommercialOpportunities(presented, { calibration, includeParetoFronts: false }).length };
}

function diagnosticScan(payload, { scanId, snapshotId, engine, server, now }) {
    const eligible = payload.eligibleCandidates || payload.opportunities || [];
    const potential = payload.potentialCandidates || payload.potential || [];
    const suspicious = payload.suspiciousCandidates || [];
    const evidenceRows = [...eligible, ...potential, ...suspicious];
    return { scanId, snapshotId, server, scannedAt: payload.scannedAt || new Date(now).toISOString(), engine,
        counts: { examined: payload.scanned ?? payload.counts?.evaluated ?? null,
            discovered: payload.pipeline?.discovered ?? null, priceSupported: eligible.length, watch: potential.length,
            rejected: payload.pipeline?.rejected ?? null, suspicious: payload.counts?.suspicious ?? suspicious.length,
            insufficient: payload.counts?.insufficient ?? null,
            groups: { opportunities: groupedCount(eligible, payload.qualityCalibration), watch: groupedCount(potential, payload.qualityCalibration) } },
        funnel: payload.funnel || null, primaryReasons: payload.pipeline?.reasons || payload.rejectionReasons || {},
        excluded: payload.excluded || null, priceEvidence: diagnosticEvidence(evidenceRows, now) };
}

function economyRates(root) {
    const rows = JSON.parse(readFileSync(join(root, 'data', 'economy-constants.json'), 'utf8'));
    const read = (key) => {
        const value = Number(rows.find((row) => row.key === key)?.value);
        if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error(`Missing economy rate: ${key}`);
        return value;
    };
    return { setupFeeRate: read('setup_fee'), taxPremiumRate: read('tax_premium'), taxFreeRate: read('tax_free') };
}

export function startQuoteService({ root, server, packetHistory, collectorOptions = {}, diagnosticsRepository = null }) {
    // Fingerprint is captured once at process start, never read from disk per request.
    const engineBuild = createHash('sha256');
    for (const name of ['market-opportunity-scan', 'market-opportunity-review', 'market-opportunities',
        'market-opportunity-quality', 'market-strategy-policy', 'market-observation', 'opportunity-assistant', 'opportunity-status',
        'market-sales-reference', 'long-term-price'])
        engineBuild.update(readFileSync(new URL(`../js/core/${name}.mjs`, import.meta.url)));
    const presentationBuild = createHash('sha256');
    for (const name of ['market-sales-activity', 'market-opportunity-commerce', 'market-trade-scenario'])
        presentationBuild.update(readFileSync(new URL(`../js/core/${name}.mjs`, import.meta.url)));
    const engine = { version: 4, fingerprint: engineBuild.digest('hex'), presentationVersion: 5, presentationFingerprint: presentationBuild.digest('hex') };
    const read = name => JSON.parse(readFileSync(join(root, 'data', `${name}.json`), 'utf8'));
    const servers = read('price-servers');
    const host = servers.find(row => row.code === server)?.host;
    if (!host) throw new Error('AODP server host missing in shared configuration');
    const catalog = { plants: read('plants'), animals: read('animals'), items: read('items'), recipeMaterials: read('recipe-materials') };
    const islandIds = islandMarketItemIds(catalog);
    const ids = [...new Set([...marketCatalogItemIds(catalog.items), ...islandIds])].sort();
    const cities = islandMarketCities(read('cities'));
    const batchCount = host ? urlBatches(ids, (batch) => aodpUrl(host, 'prices', batch, cities, AODP_COLLECTOR_POLICY.quality)).length : 0;
    const collectionPlan = createCollectionPlan({
        ids, preferredIds: islandIds, batchCount, policy: MARKET_COLLECTION_POLICY
    });
    let repository;
    try { repository = new QuoteHistoryRepository({ path: join(root, AODP_COLLECTOR_POLICY.fileName), servers: servers.map(row => row.code) }); }
    catch (error) {
        console.warn(`AODP collector disabled; repository preserved: ${error.message}`);
        return { repository: null, error: error.message,
            collector: { state: { status: 'repository-error', server, itemCount: ids.length, cityCount: cities.length,
                error: error.message, lastSuccessAt: null } } };
    }
    const collector = createAodpCollector({
        ...collectorOptions, host, server, ids, cities, repository, collectionPlan,
        onRun: run => {
            try { diagnosticsRepository?.recordCollectorRun({ ...run, server }); }
            catch (error) { console.warn('Collector diagnostics could not be recorded:', error.message); }
            collectorOptions.onRun?.(run);
        },
        policy: {
            ...AODP_COLLECTOR_POLICY, requestGapMs: collectionPlan.cadence.requestGapMs,
            ...collectorOptions.policy
        }
    });
    collector.start();
    let opportunityCache = null;
    let fees = null;
    let shadowCache = null;
    let activeScan = null;
    let activeScanKey = null;
    return { repository, collector,
        invalidateOpportunities() { opportunityCache = null; },
        opportunityScan(options) { return runScanSteps(this.opportunityScanSteps(options)); },
        async opportunityScanAsync(options) {
            const key = `${options.requestedServer}|${options.premium !== false && options.premium !== '0'}`;
            // Share the in-flight result even when a long scan crosses a cache time slot.
            while (activeScan) {
                if (activeScanKey === key) return activeScan;
                await activeScan;
            }
            const scan = runScanStepsAsync(this.opportunityScanSteps({ includeShadow: false, ...options }));
            activeScan = scan;
            activeScanKey = key;
            try { return await scan; }
            finally { if (activeScan === scan) { activeScan = null; activeScanKey = null; } }
        },
        *opportunityScanSteps({ requestedServer, premium = true, now = Date.now(), includeShadow = true }) {
            const started = Date.now();
            if (requestedServer !== server) return { server, opportunities: [], error: 'server-mismatch' };
            const enabled = premium !== false && premium !== '0';
            const validated = process.env.OPPORTUNITIES_VALIDATED === '1'
                || (process.env.OPPORTUNITIES_VALIDATED !== '0' && read('price-hub-config').opportunitiesValidated === true);
            const slot = `${requestedServer}|${enabled ? 1 : 0}|${validated ? 1 : 0}`;
            if (opportunityCache?.slot === slot && now >= opportunityCache.evaluatedAt
                && now - opportunityCache.completedAt < OPPORTUNITY_CACHE_TTL_MS) return opportunityCache.payload;
            fees ??= economyRates(root);
            const inputs = { server, packetHistory, repository, now, premium: enabled, fees };
            // Stage rollout: compare the same inputs first; operator explicitly enables revised output.
            const refreshShadow = includeShadow && (!shadowCache || now - shadowCache.at >= OBSERVATION_POLICY.shadowIntervalMs || shadowCache.premium !== enabled);
            const payload = yield* scanQuoteBookSteps({ ...inputs, includeCandidates: true, includeEvaluation: refreshShadow, policy: { ...OPPORTUNITY_POLICY, validationMode: validated ? 'validated' : 'legacy' } });
            if (refreshShadow) {
                const { validated: ignoredOutput, ...summary } = yield* shadowEvaluationSteps({ ...inputs,
                    validatedScan: validated ? payload : undefined, legacyScan: validated ? undefined : payload });
                shadowCache = { at: now, premium: enabled, summary };
            }
            delete payload.evaluation;
            // Sales activity enriches strategies; sales valuation is evaluated inside the scan.
            for (const key of ['eligibleCandidates', 'potentialCandidates', 'opportunities', 'potential']) {
                if (Array.isArray(payload[key])) payload[key] = attachOpportunitySales(payload[key],
                    (item, city, quality, region) => repository.anchor(item, city, quality, region), now);
            }
            payload.engineMode = validated ? 'validated' : 'legacy-shadow';
            payload.engine = engine;
            const scanId = randomUUID();
            const snapshotId = createHash('sha256').update([server, engine.fingerprint, engine.presentationFingerprint,
                repository.sequence ?? 0, repository.history?.revision ?? 0, packetHistory.revision ?? 0].join('|')).digest('hex');
            payload.scanId = scanId;
            payload.snapshotId = snapshotId;
            try { diagnosticsRepository?.recordServerScan(diagnosticScan(payload, { scanId, snapshotId, engine, server, now })); }
            catch (error) { console.warn('Opportunity scan diagnostics could not be recorded:', error.message); }
            const collection = collector.state.lastDataRun || collector.state.lastRun;
            if (collection) payload.collection = { startedAt: collection.fetchedAt ?? null,
                newArchiveObservations: collection.observations ?? 0, supplementalObservations: collection.supplementalObservations ?? 0,
                duplicates: collection.duplicates ?? 0, stale: collection.stale ?? 0 };
            payload.shadow = shadowCache?.premium === enabled ? shadowCache.summary : null;
            collector.noteOpportunities((payload.opportunities || []).map((row) => row.itemId), now);
            // A long calculation must not expire its own cache before the response arrives.
            opportunityCache = { slot, payload, evaluatedAt: now, completedAt: now + Date.now() - started };
            return payload;
        },
        opportunitySeries({ requestedServer, itemId, city, quality, now = Date.now() }) {
            if (requestedServer !== server || !itemId || !city) return null;
            return seriesForCell(packetHistory, repository, { server, itemId, city, quality, now });
        },
        references({ requestedServer, items, locations, qualities = [1], sides = ['buy', 'sell'], now = Date.now() }) {
            if (requestedServer !== server) return [];
            collector.noteWatched(items, now);
            return items.flatMap(itemId => locations.flatMap(city => qualities.flatMap(quality => sides.map(side => {
                const identity = { server, itemId, city, quality: Number(quality), side, priceField: BOOK_PRICE_FIELDS[side] };
                const series = [packetHistory.seriesFor(identity, now), repository.seriesFor(identity, now)].filter(Boolean);
                const buyPoints = packetHistory.seriesFor({ ...identity, side: 'buy' }, now)?.buckets
                    .map(p => ({ ...p, source: 'market-order-packets' }))
                    .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt)) || [];
                const current = repository.currentQuote({ ...identity, side: 'buy' }) ?? buyPoints[0];
                return selectLongTermReference({ series, identity, now, salesRow: repository.anchor(itemId, city, Number(quality), server),
                    currentRow: current && { buy_price_max: current.price, buy_price_max_date: current.sourceQuoteAt ?? current.seenAt,
                        source: current.source, fetchedAt: current.fetchedAt } });
            }))));
        }
    };
}
