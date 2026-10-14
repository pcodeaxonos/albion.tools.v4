import { ANOMALY_STRATEGY } from './opportunity-status.mjs';
import { OPPORTUNITY_POLICY } from './market-opportunities.mjs';
import { scanQuoteBookSteps, runScanSteps } from './market-opportunity-scan.mjs';
import { OBSERVATION_POLICY } from './market-observation.mjs';

/** Keep only fields used by the shadow report, then release the full per-cell traces. */
function compactEvaluation(scan) {
    const evaluation = scan.evaluation;
    if (!evaluation) return null;
    const rows = new Map(evaluation.rows.map(row => [row.id, {
        eligible: Boolean(row.eligible),
        type: row.primary?.id || ANOMALY_STRATEGY[row.anomalies?.[0]] || row.pattern,
        monitored: !row.eligible && Boolean(row.anomalies?.length),
        validationStatus: row.validationStatus
    }]));
    const snapshots = new Map(evaluation.snapshots.map(row => [`${row.itemId}|${row.city}|${row.quality}`, {
        buy: row.buy && { reference: row.buy.reference, referenceLevel: row.buy.referenceLevel,
            validationReasons: row.buy.validationReasons, quarantinedObservations: row.buy.quarantinedObservations },
        sell: row.sell && { reference: row.sell.reference, referenceLevel: row.sell.referenceLevel,
            validationReasons: row.sell.validationReasons, quarantinedObservations: row.sell.quarantinedObservations }
    }]));
    delete scan.evaluation;
    return { rows, snapshots, scanned: scan.scanned, truncated: scan.truncated,
        candidateCount: scan.candidateCount, verified: scan.counts?.verified,
        quarantinedCells: scan.counts?.suspicious, elapsedMs: scan.elapsedMs,
        top20: scan.opportunities.slice(0, 20).map(row => row.id) };
}

/** Bounded, serializable comparison. No claim of accuracy without labeled outcomes. */
export function shadowEvaluate(options) { return runScanSteps(shadowEvaluationSteps(options)); }

export function* shadowEvaluationSteps({ validatedScan, legacyScan, ...options }) {
    // quote-service passes the validated payload itself. Compact it before starting
    // the legacy pass so two full per-cell evidence traces are never held together.
    let validated = validatedScan;
    let next = validated ? compactEvaluation(validated) : null;

    const legacy = legacyScan || (yield* scanQuoteBookSteps({ ...options, includeEvaluation: true,
        policy: { ...OPPORTUNITY_POLICY, validationMode: 'legacy' } }));
    const old = compactEvaluation(legacy);

    if (!next) {
        validated = yield* scanQuoteBookSteps({ ...options, includeEvaluation: true, policy: OPPORTUNITY_POLICY });
        next = compactEvaluation(validated);
    }

    const changes = [...new Set([...old.snapshots.keys(), ...next.snapshots.keys()])].map(id => {
        const before = old.snapshots.get(id), after = next.snapshots.get(id);
        const beforeRow = old.rows.get(id), afterRow = next.rows.get(id);
        return { id, before: Boolean(beforeRow), after: Boolean(afterRow?.eligible),
            referenceChanges: ['buy', 'sell'].map(side => ({ side, from: before?.[side]?.reference ?? null,
                to: after?.[side]?.reference ?? null })).filter(change => change.from !== change.to)
                .map(change => ({ ...change,
                    delta: change.from !== null && change.to !== null ? change.to - change.from : null,
                    relativeDelta: change.from > 0 && change.to !== null ? (change.to - change.from) / change.from : null })),
            reasons: [...new Set([afterRow?.validationStatus,
                ...[after?.buy, after?.sell].flatMap(side => side?.validationReasons || [])].filter(Boolean))] };
    });
    const typeCounts = (rows, include) => [...rows.values()].filter(include).reduce((counts, row) => {
        counts[row.type] = (counts[row.type] || 0) + 1; return counts;
    }, {});

    return { version: 1, scannedAt: validated.scannedAt, elapsedMs: old.elapsedMs + next.elapsedMs,
        evaluated: next.scanned, oldCandidates: old.candidateCount, newCandidates: next.candidateCount,
        verified: next.verified, quarantinedCells: next.quarantinedCells,
        changedReferences: changes.reduce((total, change) => total + change.referenceChanges.length, 0),
        changedReferenceCells: changes.filter(change => change.referenceChanges.length).length,
        removed: changes.filter(change => change.before && !change.after).length,
        added: changes.filter(change => !change.before && change.after).length,
        types: { legacy: typeCounts(old.rows, () => true), validated: typeCounts(next.rows, row => row.eligible),
            monitored: typeCounts(next.rows, row => row.monitored) },
        top20: { legacy: old.top20, validated: next.top20 },
        affected: changes.filter(change => change.before !== change.after || change.referenceChanges.length)
            .sort((a, b) => Number(b.before && !b.after) - Number(a.before && !a.after)
                || Math.max(0, ...b.referenceChanges.map(change => Math.abs(change.relativeDelta ?? 0)))
                    - Math.max(0, ...a.referenceChanges.map(change => Math.abs(change.relativeDelta ?? 0)))
                || a.id.localeCompare(b.id)).slice(0, OBSERVATION_POLICY.shadowLimit),
        quarantinedObservations: [...next.snapshots.values()].reduce((total, snapshot) => total
            + [snapshot.buy, snapshot.sell].reduce((n, side) => n + (side?.quarantinedObservations || 0), 0), 0),
        referenceLevels: [...next.snapshots.values()].reduce((counts, snapshot) => {
            for (const side of [snapshot.buy, snapshot.sell]) {
                const level = side?.referenceLevel ?? 0; counts[level] = (counts[level] || 0) + 1;
            }
            return counts;
        }, {}),
        truthLabels: false, falseNegatives: null, limited: old.truncated || next.truncated,
        validated: { ...validated, evaluation: undefined } };
}
