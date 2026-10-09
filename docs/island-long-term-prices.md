# Ada Planlayıcı V2 — Uzun Vadeli

`npm run prices` starts the hub and its collector automatically. The first round
starts after 1.5 seconds; subsequent rounds run one hour after the preceding round.
Only the hub owns this scheduler. Browsers read references; they cannot trigger
collection. API/network failures are contained and reported through the existing
`/api/v2/stats/status` response's `collector` field.

Scope comes from `islandMarketItemIds`: active plant seed/output and animal
baby/grown/meat/product foreign keys, plus mount outputs and all their recipe
inputs. Crops also cover animal feed choices. `allPriceItemIds()` uses the same
primitive. Cities come from active `data/cities.json` rows. At implementation time
this is 180 items × 7 cities × quality 1. Region/host comes from the shared server
catalog and the existing hub server assignment, currently Europe. No plan is
required. AODP URLs are packed by their encoded length, with the documented 4096
character cap; gzip, request pacing, timeouts and bounded retries are enabled.
429 Retry-After is honored; long cooldowns defer further requests to a later round.
See the [AODP API documentation](https://www.albion-online-data.com/api/).

## Quote history and storage

Packets remain in `.price-order-history.json`. AODP writes durable, fsynced append
transactions to `.aodp-quote-history.json.journal`, behind
`QuoteHistoryRepository`. Once a day, an atomic checkpoint replaces
`.aodp-quote-history.json`; sequence numbers make interrupted journal rotation
safe. Restart restores checkpoint + journal, including the dedupe cursor and
anchor cache. The checkpoint age survives restart. Invalid/corrupt archives or
journals disable this collector, preserve the files and expose an explicit
repository-error status; the packet hub stays available. Write failures stop
further appends until restart rather than appending behind a potentially torn
transaction. No silent repair or dropped corrupt tail is attempted.

An append transaction contains `sequence`, `writtenAt`, and `events`. Events are
`current` (latest source quote), `quote` (new observation), or `anchor` (sales
history). A checkpoint is `kind: albion.tools.aodp-repository`, version 1, with
`sequence`, `checkpointAt`, `history`, `current`, and `anchors`.

History series retain server/item/city/quality/side independently. AODP points
carry `price`, `bucketAt`, `seenAt`, `sourceQuoteAt`, `fetchedAt`, and
`source: aodp-current`. Identity lives on the containing series or journal event.
Buy uses `buy_price_max` and its own date; Sell uses `sell_price_min` and its own
date. Zero/missing/invalid/future dates and quotes beyond configured retention do
not produce observations. No missing side is manufactured.

`bucketAt` and `seenAt` describe collection time. `sourceQuoteAt` describes the
AODP quote time. An old current quote first fetched today cannot create an
observation in yesterday's bucket. A source timestamp must advance before another
hourly historical sample is accepted. Same-time price corrections can update
the current quote without increasing historical weight. Same price with an
advanced source time can create a new sample. Within each hour/source the first
observation is the representative. No missed-hour backfill or forward fill runs.

Hourly observations have 90-day retention. This comfortably covers the target
28-day estimator, so no separate older daily aggregate store is introduced.
Retention, checkpoint frequency, collection schedule and selection policy live
in `market-history-config.mjs`.

## Reference and economy

For a particular server/item/city/quality/side, select one representative per UTC
hour across sources: packet observations take precedence over AODP when both
occupy the same hour. Sources are preserved in storage and reported in reference
metadata. They never count as two votes in that hour.

For completed UTC days in the trailing target window:

`reference = median(daily medians(valid selected hourly observations))`

Each day receives equal weight regardless of scan count. Empty hours/days are
omitted. One completed day with sufficient coverage is enough, then available days participate up to the
28-day target; this is configurable, with no required 28-day warm-up. Today's
incomplete UTC day is excluded. Estimator code contains no ticks or fees.

Quote days additionally require at least 12 distinct hourly buckets and a 12-hour
first-to-last observation span, configured by `median-28d.quoteDayCoverage`.
Calendar completion alone does not qualify a day. Per-identity `dayCoverage`
reports calendar completion, bucket count, observed bucket ratio, first/last
observation, span, admission and reasons. Rejected partial days are marked
`partial-day`, including the current UTC day. `validDays` and `validBuckets`
count only admitted days. This is a coverage rule, not calibrated confidence.
Sales-history daily averages retain their existing calendar-day policy.
Fallbacks retain rejected quote-day coverage for the existing metadata tooltip.
Storage is unchanged; archived points are evaluated on each reference request.

With no sufficiently covered completed quote day, Buy can use `current-buy-fallback`. Sell can use
`sales-history-anchor`, the median of completed daily AODP sales averages in the
28-day window. This is explicitly a sales-average reference, not historical
`sell_price_min`. Anchors refresh daily, including cached absence. Once a
covered completed quote day is available, the quote-history reference is preferred.
Anchors and quote history are selected, never blindly averaged. There is no
spread-derived Buy series and no other-city/server fallback.

The browser reads `/api/v1/market/long-term` with an explicit server and requested
identities. `longTermQuote` passes the reference to the existing `quoteFromRow`
layer: Buy purchases receive the shared +1 tick and Sell listings the shared −1
tick. `purchaseCost`/`saleProceeds` still apply setup and tax. The existing V2
economy and placement optimizer consume these ordinary quotes; feed opportunity
cost, total marginal net-profit objective, occupied/locked slots, missing-price
screening and final engine validation stay on the common path. Newly generated
autofill candidates never use Focus; existing occupied slots retain their state.
Buy, Sell, 4H and fixed-price precedence remain available.

UI adds only the Uzun Vadeli option and compact source/day/bucket labels at the
selected purchase/sale prices. Tooltips retain source time, provenance and
fallback reason. No invented confidence percentage is displayed.

## Verification

`node content/scripts/audit-quote-coverage.mjs [ISO-time]` replays checkpoint,
journal and packet history without scheduling collection or writing storage.
It compares calendar-only selection with the configured coverage policy and
reports source transitions and per-day bucket ranges.

- `npm run prices:collector:test`: batching, timestamps/dedupe, isolation,
  provenance, invalid inputs, source representative selection, adaptive medians,
  UTC boundary, fallback/anchor, retention/checkpoint/restart/corruption, retry,
  catalog scope and automatic startup without browser or market traffic.
- `npm run prices:history:test`: existing packet ingestion/archive regressions.
- `npm run island:test`: existing economics plus Long Term UI/provider,
  shared ticks/fees/feed and optimizer integration with missing prices and Focus.
- `npm run laborer:test` and the laborer end-to-end fixture test.
- `npm run prices:collector:live`: opt-in real AODP smoke; starts its own hub,
  waits for automatic collection, queries status and references, restarts and
  checks again. It stops only its own child process.

Actual network proof is saved in `docs/aodp-live-proof.json`. Initial collection
recorded 328 valid Buy and 680 valid Sell observations, with zero market packets
in that hub session. Restart recorded zero new observations and deduped all 1008
unchanged quotes. Wheat/Martlock returned current-buy-fallback and a 28-day
sales-history-anchor on the first day. An already running hub must be restarted
to load this implementation.
