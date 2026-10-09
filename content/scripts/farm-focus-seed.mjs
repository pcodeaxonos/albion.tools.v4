// Import into the existing editable catalog only. Never replace manual defaults.
export function seedFarmFocus(rows, items, inputField) {
    const byId = new Map(items.map(item => [Number(item.id), item]));
    return rows.map(row => {
        const item = byId.get(Number(row[inputField]));
        return { ...row,
            defaultFocusPerUse: Object.hasOwn(row, 'defaultFocusPerUse') ? row.defaultFocusPerUse : item?.activeFarmFocusCost ?? 1000,
            maxNurtureCount: row.maxNurtureCount ?? item?.activeFarmMaxCycles ?? null };
    });
}
