import { mechanicIssues } from './data.js';

const MAX_SEARCH_STATES = 10000;
const MAX_PATH_CYCLES = 256;

// Journals contain verified deterministic progression fame and resolved expected
// reward economics. Journal fill fame is deliberately never read by this engine.
export function applyCycle(state, journal, mechanics) {
    const stage = mechanics.stages?.[state.tier];
    if (!(stage?.requiredFame > 0) || !(journal.fame > 0) || !Number.isSafeInteger(journal.fame) || !Number.isSafeInteger(state.progress) || state.progress < 0 || state.progress >= stage.requiredFame) return null;
    let tier = state.tier;
    let progress = state.progress + journal.fame;
    while (mechanics.stages[tier] && progress >= mechanics.stages[tier].requiredFame) {
        progress = mechanics.carryOver ? progress - mechanics.stages[tier].requiredFame : 0;
        tier++;
        if (!mechanics.carryOver) break;
    }
    return { tier, progress };
}

export function planProgression({ mechanics, startTier, progress = 0, targetTier, manual = {}, journalEconomics }) {
    const issues = mechanicIssues(mechanics);
    if (issues.length) return { status: 'unsupported', issues };
    if (!Number.isInteger(startTier) || !Number.isInteger(targetTier) || targetTier < startTier || !Number.isSafeInteger(progress) || progress < 0 || (mechanics.stages[startTier] && progress >= mechanics.stages[startTier].requiredFame)) return { status: 'unsupported', issues: ['Geçersiz başlangıç / hedef progression state'] };
    const memo = new Map();
    const missing = new Set();
    let limited = false;
    function solve(state, depth) {
        if (state.tier === targetTier) return { cost: 0, sequence: [], end: state };
        if (state.tier > targetTier) return null;
        if (depth >= MAX_PATH_CYCLES || memo.size >= MAX_SEARCH_STATES) { limited = true; return null; }
        const key = `${state.tier}:${state.progress}:${depth}`;
        if (memo.has(key)) return memo.get(key);
        const stage = mechanics.stages[state.tier];
        if (!Number.isSafeInteger(stage?.requiredFame) || stage.requiredFame <= 0 || !stage.journals?.length) { missing.add(`T${state.tier}: doğrulanmış journal/progression ilişkisi yok`); return null; }
        const candidates = stage.journals.filter((journal) => !manual[state.tier] || manual[state.tier] === journal.filled);
        if (!candidates.length) missing.add(`T${state.tier}: seçilen journal desteklenmiyor`);
        let best = null;
        for (const journal of candidates) {
            const economics = journalEconomics(journal, state);
            if (economics.status !== 'ok') { (economics.issues || []).forEach((issue) => missing.add(issue)); continue; }
            if (![economics.net, economics.gross, economics.rewardNet].every(Number.isFinite)) { missing.add(`${journal.filled}: geçersiz ekonomi`); continue; }
            const next = applyCycle(state, journal, mechanics);
            if (!next) { missing.add(`${journal.filled}: geçersiz progression`); continue; }
            const tail = solve(next, depth + 1);
            if (!tail) continue;
            const cost = economics.net + tail.cost;
            if (!Number.isFinite(cost)) { missing.add('Progression maliyeti sayı sınırını aşıyor'); continue; }
            if (!best || cost < best.cost || (cost === best.cost && tail.sequence.length + 1 < best.sequence.length)) best = { cost, end: tail.end, sequence: [{ from: state, to: next, journal: journal.filled, economics }, ...tail.sequence] };
        }
        memo.set(key, best);
        return best;
    }
    const result = solve({ tier: startTier, progress }, 0);
    // Missing alternatives prevent claiming an economic optimum, even if another
    // branch was priceable. Never silently optimize only the priced subset.
    if (!result || missing.size || limited) return { status: limited ? 'unsupported' : 'unknown', issues: [...missing, ...(limited ? ['Progression arama sınırı aşıldı'] : [])] };
    return { ...result, status: 'ok', hours: result.sequence.length * mechanics.cycleHours, issues: [] };
}
