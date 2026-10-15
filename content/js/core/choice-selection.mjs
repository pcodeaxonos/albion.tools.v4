/** Scalar preferences remain compatible with include/exclude selections. */
export function readChoiceSelection(value, all = 'all') {
    if (value && typeof value === 'object') {
        const list = items => [...new Set((Array.isArray(items) ? items : []).map(String))].filter(item => item !== String(all));
        const excluded = list(value.excluded);
        return { included: list(value.included).filter(item => !excluded.includes(item)), excluded };
    }
    if (typeof value === 'string' && value.startsWith('{')) {
        try { return readChoiceSelection(JSON.parse(value), all); } catch { return { included: [], excluded: [] }; }
    }
    return { included: value == null || String(value) === String(all) ? [] : [String(value)], excluded: [] };
}
export function writeChoiceSelection(selection, all = 'all') {
    const { included, excluded } = readChoiceSelection(selection, all);
    return excluded.length || included.length > 1 ? JSON.stringify({ included, excluded }) : included[0] ?? all;
}
export function changeChoiceSelection(current, value, event = {}, all = 'all') {
    let { included, excluded } = readChoiceSelection(current, all);
    value = String(value);
    const toggle = values => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
    if (value === String(all)) return { included: [], excluded: [] };
    if (event.shiftKey) { included = included.filter(item => item !== value); excluded = toggle(excluded); }
    else if (event.ctrlKey || event.metaKey) { excluded = excluded.filter(item => item !== value); included = toggle(included); }
    else { excluded = excluded.filter(item => item !== value); included = included.includes(value) ? [] : [value]; }
    return { included, excluded };
}
export function choiceMatches(selection, value, all = 'all', matches = (option, candidate) => option === String(candidate)) {
    const { included, excluded } = readChoiceSelection(selection, all);
    return (!included.length || included.some(option => matches(option, value))) && !excluded.some(option => matches(option, value));
}
export function choiceState(selection, value, all = 'all') {
    const { included, excluded } = readChoiceSelection(selection, all);
    return { active: String(value) === String(all) ? !included.length && !excluded.length : included.includes(String(value)), excluded: excluded.includes(String(value)) };
}
export function validChoiceSelection(selection, values, all = 'all') {
    const allowed = values.map(String);
    const parsed = readChoiceSelection(selection, all);
    return writeChoiceSelection(Object.fromEntries(Object.entries(parsed).map(([key, list]) => [key, list.filter(value => allowed.includes(value))])), all);
}
