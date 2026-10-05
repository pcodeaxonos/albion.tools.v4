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

/** No unvalidated coverage/freshness thresholds are imposed here. */
export const LONG_TERM_STRATEGIES = Object.freeze({
    'median-28d': Object.freeze({ windowMs: 28 * DAY_MS, estimator: 'median', completeDaysOnly: true })
});
