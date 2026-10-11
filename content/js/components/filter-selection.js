/** Repeating a selected filter clears it to the group's all value. */
export function toggleAllFilter(current, selected, all = 'all') {
    return String(current) === String(selected) ? all : selected;
}
