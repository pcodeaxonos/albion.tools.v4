# Market order observation archive

The price hub now records independently keyed buy/sell observations without
changing Island Planner modes or optimization. Start/restart `npm run prices`
to run the new collector. No old cache or client logs are backfilled.

## Server assignment

`data/price-hub-config.json` explicitly assigns this client to `europe`, as
confirmed by the operator. `PRICE_HUB_SERVER` overrides that setting. Valid
identifiers come from `data/price-servers.json`, not another region list.
Packets do not prove region identity. Run one client/region per hub process;
stop/reconfigure/restart the hub when changing the client's game server.
The browser's settings do not silently reassign packet history. Tagged live
caches from another server are skipped; legacy untagged caches may still supply
live prices but never seed historical observations.

## Schema and observations

Local, gitignored `.price-order-history.json`:

```json
{
  "kind": "albion.tools.order-price-history",
  "version": 1,
  "source": "market-order-packets",
  "policy": {
    "bucketMs": 3600000,
    "retentionMs": 7776000000,
    "maintenanceMs": 3600000,
    "fileName": ".price-order-history.json",
    "version": 1,
    "representative": "first-observation",
    "observationTimeMeaning": "hub-packet-received-at; not order-created-at"
  },
  "series": [{
    "server": "europe",
    "itemId": "T1_CARROT",
    "city": "Martlock",
    "quality": 1,
    "side": "buy",
    "priceField": "buy_price_max",
    "buckets": [{
      "bucketAt": "2026-10-05T10:00:00.000Z",
      "seenAt": "2026-10-05T10:05:00.000Z",
      "price": 400
    }]
  }]
}
```

The series key includes **server/item/city/quality/side**. Request books supply
`buy_price_max`; offer books supply `sell_price_min`, using the hub's existing
extrema calculation after its existing order normalization/expiration checks.
Only the side actually included in the new packet is recorded.
`seenAt` means hub packet receipt, never order creation or transaction execution.
Observations describe the uploaded book, whose completeness is not guaranteed.
They do not guarantee executable quantity or order fulfillment.

Each fixed UTC hour gets at most one representative: the earliest valid
observation. Repeated timestamps, transport retries, and additional scans in that
hour cannot add weight. Out-of-order observations can replace a representative
with an earlier one. No missing buckets are forward-filled. The same price
observed in a later hour is a legitimate new time sample; unchanged order IDs
are not a reason to erase real coverage of a stable market. A replay received
in a later hour cannot be distinguished from a fresh sighting when the packet
has no original observation timestamp.

## Retention and persistence

All storage knobs live in `ORDER_HISTORY_POLICY` in
`content/js/core/market-history-config.mjs`: one-hour buckets, 90-day retention,
hourly maintenance. These are storage defaults, not confidence thresholds.
Maintenance runs even without incoming packets. Startup, snapshots, and writes
also prune observations older than retention, reject future dates, and remove
empty series. Order expiration remains handled by the existing price hub:
expired orders cannot contribute new samples. A historical observation remains
valid evidence after its original order expires and stays until retention.

The existing hub persistence debounce writes both caches; the historical file
uses temporary-file-plus-rename replacement. There can be up to the debounce
interval (currently 400 ms) of unflushed observations if the process crashes.
Write failures are logged. Corrupt/incompatible archives stop startup instead
of being silently overwritten. Schema, bucket width, or representative changes
require an explicit migration/new archive; reducing retention prunes on load.

Read endpoint (explicit server required):

`GET /api/v1/market/order-history?server=europe&items=T1_CARROT&locations=Martlock&qualities=1&sides=buy,sell`

Optional filters are comma-separated; omitted filters return all series for the
requested server. Response includes schema/source/policy metadata.

## Future strategy layer

`long-term-price.mjs` is independent of UI and fees. The `median-28d` strategy
uses the last 28 completed UTC days: median of available hourly representatives
within each day, then equal-weight median of those daily values. A busy day
cannot dominate a quiet day. No minimum-day/stale confidence cutoff is imposed;
results return coverage, last observation, window and `confidence: unassessed`.
Alternate windows and estimator functions can be supplied without changing the
collector or copying the algorithm. Returned references have no fee/tick logic.

`aodpLongTermReference(row, { server, now })` accepts an AODP daily sales history
row and calculates the same windowed daily median reference. Its source is
`aodp-sales-history`, type is `sales-history-average`, and it has **no book side**.
It does not fetch data or pretend that AODP sales averages are buy-order history.
Neither function is connected to the planner. Existing 4H behavior is retained.

## Verification

`npm run prices:history:test` covers all identity dimensions, UTC normalization,
invalid/expired/future data, repeat observations, hour boundaries, first sample
selection, restoration and dedupe across restart, configurable retention,
incompatible archives, equal daily weighting, strategy extensions, AODP source
labeling, actual hub ingestion/extrema, atomic persistence and filtered routes.
Hub IO is isolated in memory; tests do not modify the operator's live files.
