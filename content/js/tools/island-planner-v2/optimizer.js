import { placementValue } from '../../core/island/placement-model.js';

// Count search: fixed productions participate in every score and relaxation.
// The continuous relaxation permits fractional plots; its optimum is therefore
// an upper bound on every integer completion, including all feed synergies.
export async function optimizePlacement(options, fixed, slotCount, { cancelled = () => false, focusBudget = null } = {}) {
    const limited = focusBudget != null;
    if (limited && (!Number.isFinite(focusBudget) || focusBudget < 0)) throw new Error('Geçerli günlük Focus bütçesi girin.');
    const focusOf = profile => profile.focusPerDay ?? (profile.entry?.focus ? null : 0);
    const fixedFocus = fixed.reduce((sum, profile) => sum + (focusOf(profile) ?? NaN), 0);
    if (limited && (!Number.isFinite(fixedFocus) || fixedFocus > focusBudget)) throw new Error('Mevcut slotların Focus ihtiyacı bilinmiyor veya günlük bütçeyi aşıyor.');
    const baseline = placementValue(fixed).net;
    const profiles = new Map();
    for (const option of options) {
        if (limited && (!Number.isFinite(focusOf(option)) || focusOf(option) + fixedFocus > focusBudget)) continue;
        const key = JSON.stringify([option.supplies, option.feed, limited ? focusOf(option) : null]);
        if (!profiles.has(key) || option.net > profiles.get(key).net) profiles.set(key, option);
    }
    const choices = [...profiles.values()].sort((a, b) => b.net - a.net);
    let best = { net: baseline, marginalNet: 0, entries: [] };
    let visited = 0, pruned = 0;
    const selected = [];
    const feasible = () => !limited || fixedFocus + selected.reduce((sum, profile) => sum + focusOf(profile), 0) <= focusBudget + 1e-7;
    const evaluate = () => {
        if (!feasible()) return;
        const net = placementValue([...fixed, ...selected]).net;
        if (net > best.net + 1e-7) best = { net, marginalNet: net - baseline, entries: selected.map(profile => profile.entry) };
    };
    // Cheap incumbents improve pruning, without restricting the exact search.
    for (const choice of choices) {
        for (let count = 1; count <= slotCount; count++) {
            selected.push(choice); evaluate();
        }
        selected.length = 0;
    }
    async function search(index, remaining) {
        if (!feasible()) return;
        if (++visited % 128 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (cancelled()) throw new Error('Plan değişti; otomatik doldurma iptal edildi.');
        }
        evaluate(); // Leaving all remaining slots empty is a real candidate.
        if (!remaining || index === choices.length) return;
        const upper = placementValue([...fixed, ...selected], choices.slice(index), remaining, { focusBudget }).upper;
        // Only the certified dual bound can prune; equal optima need no new plan.
        if (upper <= best.net) { pruned++; return; }
        const length = selected.length;
        for (let count = remaining; count >= 0; count--) {
            selected.length = length;
            selected.push(...Array(count).fill(choices[index]));
            await search(index + 1, remaining - count);
        }
        selected.length = length;
    }
    if (cancelled()) throw new Error('Plan değişti; otomatik doldurma iptal edildi.');
    await search(0, slotCount);
    return { ...best, baseline, metadata: { candidates: options.length, profiles: choices.length, visited, pruned, focusBudget, objective: 'afterNet - beforeNet' } };
}
