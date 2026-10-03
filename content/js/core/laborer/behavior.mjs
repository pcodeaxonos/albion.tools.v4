// XML has no carry-over flag. Evidence supplied with the feature: T2 excess
// fame remains at T3 after a subsequent zero-loot job (1/360).
export const LABOURER_PROGRESSION_CARRY_OVER = true;
export const progressionBehavior = {
    carryOver: LABOURER_PROGRESSION_CARRY_OVER,
    source: 'verified-behavior', confidence: 'behavioral/high',
    evidence: 'T2 Generalist tier-up excess 1 fame observed at T3 (1/360) after a zero-fame job.',
    advanceMode: 'one-tier-per-job'
};
