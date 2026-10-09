const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Storage policy, not a claim about estimator confidence. */
export const ORDER_HISTORY_POLICY = Object.freeze({
    bucketMs: HOUR_MS,
    retentionMs: 90 * DAY_MS,
    maintenanceMs: HOUR_MS,
    fileName: '.price-order-history.json',
    version: 1,
    representative: 'first-observation',
    observationTimeMeaning: 'hub-packet-received-at; not order-created-at'
});

/** Coverage admission policy; not a calibrated confidence estimate. */
export const LONG_TERM_STRATEGIES = Object.freeze({
    'median-28d': Object.freeze({ windowMs: 28 * DAY_MS, estimator: 'median', completeDaysOnly: true,
        quoteDayCoverage: Object.freeze({ minBucketCount: 12, minObservationSpanMs: 12 * HOUR_MS }) })
});

export const AODP_COLLECTOR_POLICY = Object.freeze({
    intervalMs: HOUR_MS, initialDelayMs: 1500, timeoutMs: 15000,
    maxUrlLength: 4096, retries: 2, retryBaseMs: 2000, maxRetryMs: 60000,
    requestGapMs: 400, quality: 1, anchorRefreshMs: DAY_MS,
    checkpointMs: DAY_MS, fileName: '.aodp-quote-history.json',
    // No arbitrary age rejection: the storage retention is the admissible source window.
    sourceMaxAgeMs: ORDER_HISTORY_POLICY.retentionMs
});

export const LONG_TERM_SELECTION = Object.freeze({
    sourcePriority: ['market-order-packets', 'aodp-current'],
    // Any completed day meeting strategy coverage is usable. No 28-day warm-up.
    quoteMinCompletedDays: 1
});

export const AODP_HISTORY_POLICY = Object.freeze({ ...ORDER_HISTORY_POLICY,
    fileName: AODP_COLLECTOR_POLICY.fileName,
    observationTimeMeaning: 'hub-collector-fetched-at; sourceQuoteAt is separate, never backfilled'
});
