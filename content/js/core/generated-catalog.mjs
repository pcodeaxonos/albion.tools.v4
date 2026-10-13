const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const identity = (row, fields) => JSON.stringify(fields.map(field => row[field]));

// Reconcile source updates against the last known source, preserving later manual changes and deletions.
export function mergeGeneratedCatalog(source, current, previous, definition) {
    if (!previous) return { rows: source, baseline: source };
    const fields = definition.seedIdentity;
    const byCurrent = new Map(current.map(row => [identity(row, fields), row]));
    const byPrevious = new Map(previous.map(row => [identity(row, fields), row]));
    const sourceKeys = new Set(source.map(row => identity(row, fields)));
    const reserved = new Set([...current, ...previous].map(row => String(row[definition.key])));
    let nextId = Math.max(0, ...[...current, ...previous].map(row => Number(row[definition.key]) || 0)) + 1;
    const rows = [], baseline = [];
    for (const seed of source) {
        const key = identity(seed, fields), saved = byCurrent.get(key), old = byPrevious.get(key);
        let id = saved?.[definition.key] ?? old?.[definition.key] ?? seed[definition.key];
        if (!saved && !old && reserved.has(String(id))) id = nextId++;
        reserved.add(String(id));
        const canonical = { ...seed, [definition.key]: id };
        baseline.push(canonical);
        if (old && !saved) continue;
        const merged = { ...canonical };
        if (saved) for (const field of new Set([...Object.keys(saved), ...Object.keys(old || {})])) {
            if (field === definition.key) continue;
            if (!old || !equal(saved[field], old[field])) {
                if (Object.hasOwn(saved, field)) merged[field] = saved[field]; else delete merged[field];
            }
        }
        rows.push(merged);
    }
    for (const row of current) {
        const key = identity(row, fields);
        if (!sourceKeys.has(key) && (!byPrevious.has(key) || !equal(row, byPrevious.get(key)))) rows.push(row);
    }
    return { rows, baseline };
}
