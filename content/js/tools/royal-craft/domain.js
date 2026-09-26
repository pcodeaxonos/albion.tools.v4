export function parseKind(kind) {
    const [type, slot] = String(kind || '').split('-');
    return { type: type || '', slot: slot || '' };
}

export function setVariants(setUniqueName) {
    if (!setUniqueName || !/_SET1$/.test(setUniqueName)) {
        return setUniqueName ? [setUniqueName] : [];
    }
    return [1, 2, 3].map((n) => setUniqueName.replace(/_SET1$/, `_SET${n}`));
}

export function shortItemName(label) {
    return String(label || '')
        .replace(/^(Adept|Expert|Master|Grandmaster|Elder)'s\s+/i, '')
        .trim();
}
