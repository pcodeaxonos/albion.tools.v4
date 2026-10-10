# Laborer Contract Calculator

Canonical route: `/pages/tools/laborer-contract/`.

## Sources of truth

Current snapshot imported on 2026-10-03. Generated manifests retain SHA-256 hashes.
Earlier investigation missed the labourer definitions: placement references are
not the mechanic source.

- [buildings.xml](https://github.com/ao-data/ao-bin-dumps/blob/master/buildings.xml):
  77 definitions with tier, contract, profession, hire price, progression threshold,
  job duration, next tier and exact accepted full journal IDs. Runtime profiles are
  generated from XML; the old three threshold profiles remain regression tests only.
- [items.json](https://github.com/ao-data/ao-bin-dumps/blob/master/items.json):
  journal base loot, weights, quantities, enchantments, silver payouts and labourerfame.
  Journal maxfame is filling capacity and never enters progression.
- AODP: market prices and historical volume only; existing shared market fees apply.
- `content/js/core/laborer/behavior.mjs`: single carry-over configuration,
  source verified-behavior, confidence behavioral/high. Evidence: 1/360 remaining
  fame after a T2 Generalist tier-up and a zero-fame T3 job. This is not an XML flag.

NPC acquisition uses the first XML stage: T2, 1,000 silver per laborer. Ten cost
10,000 silver. New acquisition ignores the selected starting contract tier and
applies no market fees to the NPC cost.

## Expected return scenarios

One resolver supplies loot and progression fame; reward valuation consumes that
same loot. Expected item units use base loot, normalized weights, amount and
explicit return yield. Fame uses those units and each entry's labourerfame.
Silver grants fame per resolved payout, not per silver coin.

Baseline return yield is 100%, selectable from 50–150%. No happiness-to-XP formula
is invented. Results are expected-loot scenarios, not guaranteed random outcomes
or exact stochastic hitting times. Expected economics includes an empty journal only when its return is verified
by data; existence of an empty item ID alone does not prove return. Manual cycle inspection
requires observed quantities for every asset including the empty journal;
explicit zero is valid, blank remains unknown.

## Planning and partial results

Each completed job checks current-tier acceptance, adds resolved fame and advances
at most one tier, preserving excess. The next job checks the new tier's accepted
journals again. T8 is terminal. XML job length is 79,200 seconds / 22 hours.
Operational planning counts each job as one day, labeled Planlama günü; actual
job hours are shown separately. Quantity scales money and journals, not time.

Bounded dynamic search minimizes total net journal cost over progression states,
including carry-over and acceptance. It does not assume a greedy silver/fame ratio
is optimal. Manual choices constrain candidates. Search limits or missing-price
alternatives retain feasible results but flag optimization as limited to evaluated
priced routes; a global optimum is not claimed.

Missing contract sale quotes do not erase cycles, days, journal costs, capital or
break-even when their own inputs exist. Missing acquisition/setup inputs affect
dependent metrics only. Missing quotes never mean zero. Continuation includes the
current contract's net sell-now opportunity cost. Shared fee calculations and
manual quote/reset behavior are retained.

## Generation and verification

The importer requires buildings.xml, items.json and gamedata.json in an explicit
dump directory. It generates 11 professions, 77 contracts and 133 journals.

```sh
node content/scripts/build-laborer-catalog.mjs /path/to/dump
node --experimental-vm-modules content/scripts/test-laborer-contract.mjs
node node_modules/sass/sass.js content/scss/main.scss output/css/site.css --no-source-map
```

The checked-in current XML fixture covers all 77 definitions. Tests cover exact
acceptance/thresholds, NPC acquisition quantity, weighted loot fame, yield, silver,
maxfame isolation, zero loot, carry-over, one advance per job, next-stage acceptance,
T8, all professions, dynamic search, missing-price partial results, fees and time.

The decision strip shows sell-now net proceeds, the verified total-net-profit
option, and that option's planning time and capital. Profit per slot-day and
marginal continuation stay in the comparison and the selected tier; they are
not folded into the recommendation. A tier is recommended only when the existing
total-profit optimum is a complete live or manual result whose route is not
flagged as a limited priced-route search. Missing or stale prices are not
treated as zero profit. When other tiers cannot be verified, the recommendation
states how many were left out.

Desktop layout is scenario controls, the decision strip, tier comparison, and
the selected tier. Journal strategy, return yield, and setup start closed.
Cost, journal plan, rewards, fees, and one price editor are disclosures.
Missing, stale, and manual prices open that editor; each quote is editable
once. Game data and debug start closed. Mechanic errors and missing-price
alerts stay visible. Comparison rows stay in tier order.

Row selection remains presentation state separate from the starting tier.
Desktop panels use bounded heights and internal scrollports; narrow screens
retain stacked flow. No independent market or fee implementation was introduced.

Mechanical feasibility is calculated independently of all market quotes. If no
priced route exists, the deterministic fallback prefers the current-tier profession
journal, then current-tier Generalist, then highest accepted expected fame. This
route is explicitly not an economic recommendation. Missing prices retain cycles,
planning days, actual hours, thresholds and carry-over; only acquisition-only
capital is exposed separately, never as a complete initial/peak capital estimate.

Economic audit: quotes record the selected AODP field and distinguish absent rows,
zero prices, absent/future/stale timestamps. AODP suffixless timestamps are UTC,
normalized in the shared price resolver. Cycle valuation retains independently
known purchase and reward totals when another part is missing. The test script
accepts an optional path to an actual AODP response and prints a Fletcher trace.

Selected-tier missing prices are collected from the actual route purchase/reward
quotes plus contract and market acquisition quotes. Unpriced optimizer alternatives
are excluded. Those quotes, the journal observation quotes, and other tiers'
missing quotes share one editor. The same server, item, city, book side, and
intent is not editable in a second place. Missing, stale, and manual entries
are visible for correction or reset; reset deletes that exact key. Result price
state is LIVE / MANUAL / STALE / MISSING. No other-city, opposite-book or
stale-price substitution was introduced. Mechanical planning remains unchanged.
