const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** Extract only explicit game attributes. Missing attributes remain unknown. */
export function collectRecipeMechanics(node, output = new Map(), parentName = '') {
    if (!node || typeof node !== 'object') return output;
    if (Array.isArray(node)) { for (const child of node) collectRecipeMechanics(child, output, parentName); return output; }
    const base = node['@uniquename'] || parentName;
    const enchant = number(node['@enchantmentlevel']);
    const uniqueName = base ? `${base}${enchant > 0 ? `@${enchant}` : ''}` : '';
    const requirements = list(node.craftingrequirements);
    // Multiple recipes cannot be flattened into an invented universal batch.
    if (uniqueName && requirements.length === 1) {
        const req = requirements[0];
        const lines = list(req.craftresource).map(line => ({ uniqueName: `${line['@uniquename']}${number(line['@enchantmentlevel']) > 0 ? `@${number(line['@enchantmentlevel'])}` : ''}`, qty: number(line['@count']), appliesRr: line['@maxreturnamount'] !== '0' }));
        if (lines.length && lines.every(line => line.qty > 0)) output.set(uniqueName, { uniqueName, batchYield: number(req['@amountcrafted']), baseSilverPerBatch: number(req['@silver']), baseFocusPerBatch: number(req['@craftingfocus']), lines });
    }
    for (const [key, value] of Object.entries(node)) if (!key.startsWith('@') && key !== 'craftingrequirements') collectRecipeMechanics(value, output, base);
    return output;
}

export function matchingRecipeMechanics(recipe, metadata) {
    if (!recipe || !metadata || recipe.uniqueName !== metadata.uniqueName) return null;
    const signature = lines => lines.map(line => `${line.uniqueName}|${line.qty}|${line.appliesRr !== false}`).sort().join(';');
    return signature(recipe.lines) === signature(metadata.lines) ? metadata : null;
}
