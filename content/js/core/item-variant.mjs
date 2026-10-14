/** Tier and enchant identity shared by item badges and variation filters. */
export function itemVariant(uniqueName) {
    const id = String(uniqueName || '');
    const tier = id.match(/^T([1-8])_/)?.[1];
    return tier ? { tier, enchant: id.match(/@(\d+)$/)?.[1] || '0' } : { tier: '', enchant: '' };
}
