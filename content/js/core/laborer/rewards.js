// One loot resolution feeds both reward silver and progression fame. Yield is
// an explicit scenario, not an invented happiness-to-XP formula.
export function rewardAssets(journal) {
    return [...new Set([...journal.loot.map((row) => row.item).filter(Boolean), journal.empty].filter(Boolean))];
}

export function resolveRewards(journal, { returnYield = 1, quantities } = {}) {
    if (journal.loot.some((row) => !row.item)) return { status: 'unsupported', issues: ['Loot item kimliği mevcut item DB ile eşleştirilemedi.'] };
    const issues = [];
    const totalWeight = journal.loot.reduce((sum, row) => sum + row.weight, 0);
    if (quantities === undefined && (!(totalWeight > 0) || !Number.isFinite(journal.baseLootAmount) || journal.baseLootAmount < 0 || !Number.isFinite(returnYield) || returnYield < 0 || returnYield > 1.5)) return { status: 'unsupported', issues: ['Geçersiz journal loot / return yield verisi.'] };
    const expectedLoot = journal.loot.map((row) => {
        const raw = quantities?.[row.item];
        const quantity = quantities === undefined ? journal.baseLootAmount * returnYield * row.weight / totalWeight * row.amount : raw == null || raw === '' ? null : Number(raw);
        if (!Number.isFinite(quantity) || quantity < 0) issues.push(`${row.item}: cycle başına gerçek dönüş miktarı gerekli (dönmediyse 0).`);
        if (!(row.amount > 0) || !Number.isFinite(row.labourerFame) || row.labourerFame < 0) issues.push(`${row.item}: geçersiz loot/fame verisi.`);
        // Silver is a payout per loot result, not one labourer-fame grant per coin.
        const fameUnits = row.item === 'SILVER' ? quantity / row.amount : quantity;
        return { item: row.item, quantity, labourerFame: fameUnits * row.labourerFame };
    });
    const rewards = expectedLoot.map(({ item, quantity }) => ({ item, quantity }));
    // An item ID proves that the empty journal exists, not that a job returns it.
    // Include it only in an explicit observation or when the data proves return.
    if (journal.empty && (quantities !== undefined || journal.emptyReturnVerified === true)) {
        const raw = quantities?.[journal.empty];
        const quantity = quantities === undefined ? 1 : raw == null || raw === '' ? null : Number(raw);
        if (!Number.isFinite(quantity) || quantity < 0) issues.push(`${journal.empty}: cycle başına gerçek dönüş miktarı gerekli (dönmediyse 0).`);
        rewards.push({ item: journal.empty, quantity });
    }
    const expectedLabourerFame = expectedLoot.reduce((sum, row) => sum + row.labourerFame, 0);
    if (!Number.isFinite(expectedLabourerFame) || rewards.some((reward) => !Number.isFinite(reward.quantity))) issues.push('Loot/fame değeri sayı sınırını aşıyor.');
    return issues.length ? { status: 'unknown', issues } : { status: 'ok', expectedLoot, expectedLabourerFame, rewards,
        source: quantities === undefined ? 'expected-weighted-loot' : 'observed-manual', returnYield, issues: [] };
}

export const observedRewards = (journal, quantities = {}) => resolveRewards(journal, { quantities });
