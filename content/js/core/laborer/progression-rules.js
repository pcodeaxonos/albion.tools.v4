import { resolveRewards } from './rewards.js';

// Building mechanics and exact accepted IDs join item loot here. Neither
// journal fill fame nor profession/tier guesses decide compatibility.
export function progressionRules(data, type, { returnYield = 1 } = {}) {
    const manifest = data.mechanics;
    const rules = manifest.byType?.[type];
    if (!rules) return { verified: false, reasons: ['Laborer XML tanımı bulunamadı.'] };
    const journalIndex = new Map(data.journals.map((journal) => [journal.filled, journal]));
    return { ...rules, source: manifest.source, carryOver: manifest.carryOver, advanceMode: manifest.advanceMode,
        cycleHours: rules.stages[Object.keys(rules.stages)[0]].jobLengthSeconds / 3600,
        stages: Object.fromEntries(Object.entries(rules.stages).map(([tier, stage]) => [tier, { ...stage,
            journals: stage.accepted.map((filled) => {
                const journal = journalIndex.get(filled);
                if (!journal) return { filled, fame: null, rewardsVerified: false };
                const resolution = resolveRewards(journal, { returnYield: returnYield * stage.yieldMultiplier });
                return { ...journal, ...resolution, fame: resolution.expectedLabourerFame, rewardsVerified: resolution.status === 'ok' };
            })
        }])) };
}
