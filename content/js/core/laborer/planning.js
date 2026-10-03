import { mechanicIssues } from './data.js';

const MAX_SEARCH_STATES = 10000;
const MAX_PATH_CYCLES = 256;

// Expected loot-derived progression is a planning scenario, not a guaranteed
// stochastic hitting time. Journal fill fame is never read here.
export function applyCycle(state, journal, mechanics) {
    // Unknown carry-over must never silently act like verified discard.
    if (typeof mechanics.carryOver !== 'boolean') return null;
    const stage = mechanics.stages?.[state.tier];
    if (!(stage?.requiredFame > 0) || !Number.isFinite(journal.fame) || journal.fame < 0 || !Number.isFinite(state.progress) || state.progress < 0 ||
        (stage.accepted && !stage.accepted.includes(journal.filled))) return null;
    let tier = state.tier;
    let progress = state.progress + journal.fame;
    // One completed job may advance exactly once. Excess remains available for
    // the next job, whose journal is selected from the next XML acceptance list.
    if (progress >= stage.requiredFame - 1e-8) {
        progress = mechanics.carryOver ? progress - mechanics.stages[tier].requiredFame : 0;
        tier = stage.nextTier ?? tier + 1;
    }
    progress = Math.max(0, Math.round(progress * 1e6) / 1e6);
    if (!Number.isFinite(progress) || progress > Number.MAX_SAFE_INTEGER) return null;
    return { tier, progress };
}

function summarizeRoute(result) {
    const actualHours = result.sequence.reduce((sum, cycle) => sum + cycle.jobHours, 0);
    const planningDays = result.sequence.reduce((sum, cycle) => sum + Math.ceil(cycle.jobHours / 24), 0);
    return { ...result, reachable: true, cycles: result.sequence.length,
        journalsUsed: result.sequence.map((cycle) => cycle.journal), planningDays,
        mechanicalHours: actualHours, endingTier: result.end.tier, endingFame: result.end.progress,
        hours: planningDays * 24, actualHours, scenario: 'expected-loot' };
}

export function planMechanics({ mechanics, startTier, progress = 0, targetTier, manual = {} }) {
    const issues = mechanicIssues(mechanics);
    if (issues.length) return { status: 'unsupported', reachable: false, issues };
    if (!Number.isInteger(startTier) || !Number.isInteger(targetTier) || targetTier < startTier || !mechanics.stages[startTier] || !Number.isFinite(progress) || progress < 0) return { status: 'unsupported', reachable: false, issues: ['Geçersiz başlangıç / hedef progression state'] };
    let current = { tier: startTier, progress };
    const sequence = [];
    while (current.tier < targetTier && sequence.length < MAX_PATH_CYCLES) {
        const stage = mechanics.stages[current.tier];
        const candidates = (stage?.journals || []).filter((journal) =>
            (!manual[current.tier] || manual[current.tier] === journal.filled) &&
            (journal.fame > 0 || current.progress >= stage.requiredFame) &&
            applyCycle(current, journal, mechanics));
        const preference = (journal) => Number(journal.tier === current.tier) *
            (journal.type === mechanics.profession ? 2 : journal.filled.includes('_TROPHY_GENERAL_') ? 1 : 0);
        candidates.sort((a, b) => preference(b) - preference(a) || b.fame - a.fame || a.filled.localeCompare(b.filled));
        const journal = candidates[0];
        if (!journal) return { status: 'unsupported', reachable: false, issues: [`T${current.tier}: kullanılabilir journal bulunamadı.`] };
        const next = applyCycle(current, journal, mechanics);
        sequence.push({ from: current, to: next, journal: journal.filled, fame: journal.fame,
            threshold: stage.requiredFame, jobHours: stage.jobLengthSeconds / 3600 || mechanics.cycleHours });
        current = next;
    }
    if (current.tier !== targetTier) return { status: 'unsupported', reachable: false, issues: ['Mekanik rota cycle sınırına ulaştı.'] };
    return summarizeRoute({ status: 'ok', sequence, end: current, issues: [] });
}

export function planProgression(options) {
    const mechanical = planMechanics(options);
    if (!mechanical.reachable) return mechanical;
    const economic = optimizeProgression(options);
    if (economic.status === 'ok') return { ...summarizeRoute(economic), mechanical, economicAvailable: true };
    const sequence = mechanical.sequence.map((cycle) => ({ ...cycle, economics: options.journalEconomics(options.mechanics.stages[cycle.from.tier].journals.find((journal) => journal.filled === cycle.journal), cycle.from) }));
    return { ...mechanical, mechanical, sequence, cost: null, optimal: false, economicAvailable: false,
        issues: ['Ekonomik optimizasyon için fiyat eksik; progression mekanik rota ile gösteriliyor.', ...(economic.issues || [])] };
}

function optimizeProgression({ mechanics, startTier, progress = 0, targetTier, manual = {}, journalEconomics }) {
    const issues = mechanicIssues(mechanics);
    if (issues.length) return { status: 'unsupported', issues };
    if (!Number.isInteger(startTier) || !Number.isInteger(targetTier) || targetTier < startTier || !mechanics.stages[startTier] || !mechanics.stages[targetTier] && targetTier > Math.max(...Object.keys(mechanics.stages).map(Number)) + 1 || !Number.isFinite(progress) || progress < 0 || progress > Number.MAX_SAFE_INTEGER) return { status: 'unsupported', issues: ['Geçersiz başlangıç / hedef progression state'] };
    const memo = new Map();
    const missing = new Set();
    const cycleCache = new Map();
    let searched = 0;
    let limited = false;
    function solve(state, depth) {
        if (state.tier === targetTier) return { cost: 0, sequence: [], end: state };
        if (state.tier > targetTier) return null;
        if (depth >= MAX_PATH_CYCLES || searched >= MAX_SEARCH_STATES) { limited = true; return null; }
        const key = `${state.tier}:${state.progress}:${depth}`;
        if (memo.has(key)) return memo.get(key);
        searched++;
        const stage = mechanics.stages[state.tier];
        if (!Number.isSafeInteger(stage?.requiredFame) || stage.requiredFame <= 0 || !stage.journals?.length) { missing.add(`T${state.tier}: doğrulanmış journal/progression ilişkisi yok`); return null; }
        const candidates = stage.journals.filter((journal) => (!manual[state.tier] || manual[state.tier] === journal.filled) && (journal.fame > 0 || state.progress >= stage.requiredFame)).sort((a, b) => b.fame - a.fame);
        if (!candidates.length) missing.add(`T${state.tier}: seçilen journal desteklenmiyor`);
        let best = null;
        for (const journal of candidates) {
            const cycleKey = `${state.tier}:${journal.filled}`;
            if (!cycleCache.has(cycleKey)) cycleCache.set(cycleKey, journalEconomics(journal, state));
            const economics = cycleCache.get(cycleKey);
            if (economics.status !== 'ok') { (economics.issues || []).forEach((issue) => missing.add(issue)); continue; }
            if (![economics.net, economics.gross, economics.rewardNet].every(Number.isFinite)) { missing.add(`${journal.filled}: geçersiz ekonomi`); continue; }
            const next = applyCycle(state, journal, mechanics);
            if (!next) { missing.add(`${journal.filled}: geçersiz progression`); continue; }
            const tail = solve(next, depth + 1);
            if (!tail) continue;
            const cost = economics.net + tail.cost;
            if (!Number.isFinite(cost)) { missing.add('Progression maliyeti sayı sınırını aşıyor'); continue; }
            if (!best || cost < best.cost || (cost === best.cost && tail.sequence.length + 1 < best.sequence.length)) best = { cost, end: tail.end, sequence: [{ from: state, to: next, journal: journal.filled, fame: journal.fame, jobHours: (stage.jobLengthSeconds / 3600) || mechanics.cycleHours, economics }, ...tail.sequence] };
        }
        memo.set(key, best);
        return best;
    }
    const result = solve({ tier: startTier, progress }, 0);
    // A missing alternative cannot erase a usable route, but prevents claiming
    // a global optimum. Return its actual costs plus the scope limitation.
    const warnings = [...missing, ...(limited ? ['Arama sınırı: bulunan rota gösteriliyor; global optimum doğrulanmadı.'] : [])];
    if (!result) return { status: limited ? 'unsupported' : 'unknown', issues: warnings };
    // Daily island routine: each job occupies a whole planning day.
    // Keep the actual game duration in cycleHours; round each cycle, not the total.
    return { ...result, status: 'ok', hours: result.sequence.reduce((sum, cycle) => sum + Math.ceil(cycle.jobHours / 24) * 24, 0),
        actualHours: result.sequence.reduce((sum, cycle) => sum + cycle.jobHours, 0),
        optimal: !missing.size && !limited, scenario: 'expected-loot', issues: warnings };
}
