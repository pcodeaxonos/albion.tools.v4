// The loot entries identify possible assets, not the realised quantity at a
// particular happiness. Unknown roll/yield semantics never become zero returns.
export function rewardAssets(journal) {
    return [...new Set([...journal.loot.map((row) => row.item).filter(Boolean), journal.empty].filter(Boolean))];
}

export function observedRewards(journal, quantities) {
    if (journal.loot.some((row) => !row.item)) return { status: 'unsupported', issues: ['Loot item kimliği mevcut item DB ile eşleştirilemedi.'] };
    const issues = [];
    const rewards = rewardAssets(journal).map((item) => {
        const raw = quantities?.[item];
        const quantity = raw == null || raw === '' ? null : Number(raw);
        if (quantity == null || !Number.isFinite(quantity) || quantity < 0) issues.push(`${item}: cycle başına gerçek dönüş miktarı gerekli (dönmediyse 0).`);
        return { item, quantity };
    });
    return issues.length ? { status: 'unknown', issues } : { status: 'ok', rewards, source: 'observed-manual', issues: [] };
}
