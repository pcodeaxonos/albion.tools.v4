# Island yield stability

The score estimates sensitivity to a realistic next collection batch, using both typical and upper realistic impact, rather
than the confidence interval of the current mean. It does not freeze averages.
Economy consumers still receive the existing ratio of totals from all valid,
unmarked records in the same item type/item/city/Premium/water-or-focus group.

For each output metric separately:

1. Sum same-date records into independent daily batches. Undated legacy records
   remain separate batches. No valid metric data gives level 0. Any valid data gives at least level 1.
   One batch gives level 1 because variation cannot be estimated yet. There are
   no level-specific count limits.
2. Estimate realistic rates after Tukey outer-fence trimming (`Q1 - 3 IQR` to
   `Q3 + 3 IQR`). This trims only the predictive history, never the actual mean.
   When IQR is zero, repeated median rates form the predictive core.
3. Estimate next input `q` as the 95th percentile of core batch sizes, with the
   same outer-fence protection against malformed sizes.
4. Estimate robust normal-equivalent dispersion as
   `sigma = max(MAD / 0.67449, IQR / 1.34898)`. Use the union of empirical
   2.5–97.5 percentiles and `median ± 1.95996 sigma`. Require at least one
   indivisible output unit of rate variation (`1/q`); clip the lower rate at zero.
5. At both rate endpoints `r`, calculate exactly
   `newMean = mean + q/(Q+q) * (r-mean)`, where `Q` is the current total input.
   The largest absolute displacement is the upper realistic impact.
6. Typical impact is the empirical mean absolute displacement when replaying
   valid core batches as next records, preserving their observed size/rate
   pairing. It has a rounding floor of `0.25/(Q + median next size)`: uniform
   output rounding noise in [-0.5, +0.5] has expected absolute size 0.25.
   The median core size is exposed as the typical next sample size.

The normal constants and Tukey fences are conventional robust-statistics
choices. The 95% empirical size and normal-equivalent rate envelope are scenario
policy, **not** a guaranteed 95% prediction interval for arbitrary game outcomes.
New collection patterns or results outside this envelope can change a level-4
mean. A zero observed mean cannot prove zero future outcomes; its relative
diagnostic relative impact is infinite if a scenario permits a positive
outcome. Scoring uses an absolute display-step denominator floor at small means
instead of making all near-zero yields permanently fragile.

## Score policy

The previous policy compared every impact to a 0.01 quantity display step.
At yield 20, a 0.10 change is just 0.5% but counted as ten steps, giving level 1.
It also combined the 95th-percentile batch size with both rate-envelope tails
for every grade. Thus the last decimal and a pessimistic corner dominated 2/3.

For levels 2/3, a material step is 1% of actual yield (at least its display
quantum), or one percentage point for return ratios. Also normalize by 1% of
current mean with a one-display-step floor, and by 1% of a positive UI reference.
Take the maximum of these applicable normalized impacts. This accounts for
absolute return/yield changes and the UI's relative percentage together.

Let `T` be normalized typical impact and `U` normalized upper impact. The final
stability score is `S = sqrt(T * U)`, the geometric mean: equal weighting in log
space lets the tail contribute without entirely replacing normal behavior.
This is a policy sensitivity index, not a probability or a statistically
estimated confidence interval. Lower values mean greater stability.

| Level | Conditions |
| --- | --- |
| 0 | No valid data |
| 1 | Data exists but insufficient independent history or larger impacts |
| 2 | T <= 1 and S <= 2 |
| 3 | T <= 0.5 and S <= 1 |
| 4 | T <= 0.5, upper continuous decision impact <= 0.5, no material direction reversal |

For 4, upper decision impact retains the real-relative and reference-relative
limits (half a 1% step), plus the percentage-point step for return ratios.
Material direction uses the existing level-4 reference limit as a neutral band:
`abs((mean-reference)/reference) <= maxImpactSteps * RELATIVE_STEP` is neutral.
Outside that band, direction is positive or negative. Only a current material
positive-to-negative or negative-to-positive scenario reversal blocks level 4;
neutral sign changes and movement into/out of neutral do not independently block it.
Actual return rounding and raw signs remain diagnostic. Integer
reference-deviation rounding is diagnostic only: an integer transition is
allowed when the underlying continuous deviation displacement is within the
unchanged half-percentage-point reference limit. Two-decimal raw yield rounding
is also diagnostic only: neither a
0.005 absolute yield tolerance nor unchanged raw quantity labels gates level 4.
`maximumAbsoluteChange`, `possibleDisplayedValues`, `rawImpactSteps` and
`rawDisplayStable` preserve the raw precision diagnostics. `impactSteps` and
`displayStable` expose the decision predicate used by observed confidence and forecasts.
Also test the reference crossing inside the interval because absolute percentage
deltas have an interior minimum. A possible 2% to 3% rounded deviation transition
does not itself prevent 4; a real displacement above 0.5 percentage points or
a material reference direction reversal does. `deviationDisplayStable` preserves the
integer comparison; `currentContinuousDeviation`, `possibleContinuousDeviations`
and `maximumDeviationPercentagePointChange` expose the real percentage effects.
`level4Conditions` and `level4FailedConditions` name the exact decision gates.

All limits and precisions live in `island-yield-stability.mjs`. They represent
one/two material steps and half a rounding step, not sample-count cutoffs.
Total quantity enters every influence exactly once as `q/(Q+q)`. The rounding
floor is the same leverage applied to next-record rate uncertainty:
`q/(Q+q) * (0.25/q) = 0.25/(Q+q)`. It is a lower bound via `max`, never
an extra discount. After impacts are computed, there is no quantity/count bonus
or multiplier. In particular, `sqrt(T*U)` retains one leverage factor when both
impacts have the same leverage; it does not square the quantity attenuation.
Repeating a distribution reduces sensitivity without awarding points
for a fixed number of plots or logs. Individual updates can shift the estimated
distribution or cross rounding boundaries; strict monotonicity under arbitrary
new observations is neither forced nor guaranteed.

Output and return scores combine by taking the lower level, with a minimum of
1 whenever either required metric has valid data. Missing required metric
history prevents higher grades. Animal products have only an output metric.

## Diagnostics and verification

`yieldAverage(..., { includeConfidence: true, stabilityOptions })` exposes
`confidence.harvest` and `confidence.seedReturn`, with `sampleQuantity`,
`currentMean`, `realisticNextSampleSize`, `testedNextMin`, `testedNextMax`,
`worstCaseNewMean`, `newMeanMin`, `newMeanMax`, `maximumAbsoluteChange`,
`maximumRelativeChange`, `currentDisplayedRoundedValue`,
`possibleDisplayedValues`, `impactSteps`, `displayStable`, and `level`.
New diagnostics also include `totalSampleQuantity`, `recordCount` (valid raw
records), `typicalNextSampleSize`, `typicalImpact`, `upperRealisticImpact`,
`typicalImpactSteps`, `upperImpactSteps`, `displayedValueImpact` (rounded actual
steps and percentage-point changes), `finalStabilityScore`, `confidenceLevel`
and `reason`. `n` remains the independent daily batch count in the metric;
the card's existing `avg.n` remains its raw record count. The combined result
exposes `limitingMetric` and the selected metric's diagnostics.
The UI passes its actual baseline values through `stabilityOptions`.

Run `npm run island:stability:test`, `npm run island:test`, and
`node content/scripts/test-island-yield-validation.mjs`.

## Quantity-target forecast

The separate forecast layer solves for required total input quantity Q rather
than appending up to 128 synthetic records. There is no projection horizon.
Observed confidence, averages, filters and grade thresholds are unchanged.
`metricYieldStability` delegates to `evaluateYieldMetricHistory`, which owns
the shared impact arithmetic and level decision. Forecasts call the same
shared evaluator with a stationary distribution and candidate quantity.

The scenarios use the existing robust core and observed size distribution:

- Expected: robust empirical rates, with their input-weighted expected mean.
- Optimistic: rates winsorized at the core's 25th/75th percentiles.
- Cautious: a stationary mixture of 75% robust core and 12.5% each robust
  predictive tail. Original outliers never enter this mixture.

Sizes, rate/size pairing, the engine's upper-size percentile, and its quantization
floors are retained. The stationary scenario mean/distribution is fixed while Q
varies. This avoids re-estimating dispersion from an arbitrarily ordered,
interpolated and integer-rounded finite prefix of future records. It is a
conditional stationary-distribution estimate, not a prediction of each future
record or of the transient path from a contaminated mean to its robust center.
Different scenarios can legitimately have equal or non-ordered counts.

For an endpoint r and fixed mean mu, its influence is
`q/(Q+q) * abs(r-mu)`. A constant absolute tolerance t would give the analytic
bound `Q >= q * (abs(r-mu)/t - 1)`. The full grade-4 predicate also contains
expected absolute influence at multiple batch sizes, percentage/reference
normalization, and rounded display constraints. To keep that logic in one
place, the implementation uses exponential bracketing + integer binary search
on Q with the shared evaluator. Under a fixed mean/distribution, influences
shrink and the rounded scenario interval contracts; the predicate is monotone.
The first passing integer Q is returned, not a forced record count.

`requiredAdditionalQuantity = max(0, targetQuantity - currentQuantity)`.
Quantity conversion distinguishes raw valid log rows from independent daily
batches. The previous `records` field divided additional quantity by the median
robust daily batch size, so its unit was batches, not raw user records. It is
replaced by explicitly named diagnostics:
`rawRecordCount`, `independentBatchCount`, `medianRawRecordQuantity`,
`medianIndependentBatchQuantity`, `requiredAdditionalQuantity`,
`estimatedAdditionalRawRecords`, and `estimatedAdditionalIndependentBatches`.
Raw size uses the median input of valid unmarked harvest rows; batch size uses
the same robust batch sizes as the confidence engine. Each estimated count is
the ceiling of additional quantity divided by its corresponding median.
`approximateAdditionalRawRecords` and `approximateAdditionalIndependentBatches`
preserve the unrounded ratios. Conversion describes existing entry/collection
patterns and does not predict how many slots a future user entry will contain.
The tooltip shows only slots, computed directly from additional quantity and
the item's units per slot, independently of either count conversion.
Each required metric retains its own valid current quantity; additional input
is added once to each, so missing old return observations do not receive credit
for harvest-only quantity.

Zero data and already-4 groups hide the forecast. At least two independent
batches and two robust observations per required metric are needed to estimate
a distribution. No sign or rounding boundary independently marks a target
unreachable. A numeric safety limit at `Number.MAX_SAFE_INTEGER` avoids
claiming a precise integer target outside JavaScript's range. Neither is a
record-count horizon. Each scenario keeps its own result; aggregate status
uses only expected. Known optimistic/cautious estimates remain visible even
when expected is unreachable.

The forecast has no categorical reachability guard: Q-search calls the shared
evaluator until its new material/continuous predicate passes. Each scenario includes
`reachabilityDebug` per metric: stationary mean, continuous deviation, distance
to rounding boundaries, and evaluator probes at current Q, 1000 Q and 1000000 Q.
Probes show continuous impacts, material directions and failed conditions.
`rawDirectionStable` and `returnPercentageDisplayStable` preserve old label
comparisons; neither independently gates confidence or search reachability.

With the ten 100-input batches used in the boundary analysis, mean=9.5001 and
reference=9.5 formerly required Q=1452824; material direction now requires
Q=2959. Exact mean=reference=9.5 formerly had no finite target; now Q=2959.
Return mean=1.025 with +/-0.05 rate variation and reference=1 formerly had no
finite target; now Q=2806. At nine inputs per slot these are approximately
218, 218 and 201 additional slots from current Q=1000. Continuous limits,
influence arithmetic, robust scenarios and exponential/binary Q search are unchanged.

Debug includes current quantity, required total/additional quantity, raw-record
and independent-batch counts/medians/conversions, evaluator call count,
last-satisfied conditions from the shared engine's `level4FailedConditions`,
thresholds in normalized steps, and per-metric mean, current/target quantity,
impact and displayed-value diagnostics. The UI shows large finite estimates
in the dots' tooltip, with three colored scenario rows showing only additional
slots. Hover/focus remains on the
dots and Escape dismisses the popover. A data-keyed bounded cache is retained;
search yields between exponential steps.

### Reproducing the former +383 example

Ten 100-input records alternating yield 9.5 and 10.5 have current Q=1000,
robust mean=10 and a predictive radius about 1.4529246. The actual quantity
label's half step (0.005) is the binding tolerance. The stationary target is
Q=28959, additional quantity 27959, or 279.59 records (displayed as ~280).
At Q=28958 the original grade-4 predicate still fails.

The former sequential algorithm's first 4 is reproducibly +383. At +300 its
mean is 9.9958709677 and strict upper impact is already below 0.5 steps, but the
scenario still crosses 9.99/10.00. Its deterministic quantile prefix and output
rounding shift the mean close to a display boundary. At +383 the prefix mean
moves to 9.9994656489 and the rounded interval fits. Thus +383 is valid for that
specific synthetic path, but was not a unique distribution-level quantity
requirement. That ~280 result used the former level-4 raw precision criterion.

With the decision-based level-4 predicate, the same reference-free example
requires Q=2806, additional quantity 1806, or 18.06 records (rounded to ~19).
The binding condition is upper relative yield impact <= 0.5%; at Q=2805 it
still fails. With UI reference yield 9.5, retaining integer deviation stability
formerly gave Q=6358, additional quantity 5358, or ~54 batches. After removing
that rounded-deviation predicate, the first target is Q=2959, additional
quantity 1959, or ~20 batches: continuous reference impact is binding.
Q-search, scenario parameters, typical/upper impact calculations, and all
existing thresholds are unchanged. Only the level-4 decision predicate and
the corresponding forecast boundary guard/diagnostics changed.

Run `npm run island:forecast:test` to verify first-passing quantity, large
estimates, independent scenarios, cache behavior, observed-score invariance,
and the legacy +383 comparison.
