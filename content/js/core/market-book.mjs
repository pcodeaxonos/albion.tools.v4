/** Partial snapshots merge identities; absence never proves removal. Retained orders are historical evidence only. */
export function mergePartialBook(previous, incoming) {
    const orders = new Map(previous?.orders || []);
    for (const [id, order] of incoming.orders) orders.set(id, order);
    return { ...incoming, coverage: 'partial', orders };
}

/** Cached identities remain evidence, but current quotes use only the latest observed batch. */
export function latestBookOrders(book) {
    const orders = [...(book?.orders?.values() || [])];
    const stamp = order => Date.parse(order.seenAt);
    const latest = orders.reduce((value, order) => Number.isFinite(stamp(order)) ? Math.max(value, stamp(order)) : value, -Infinity);
    return Number.isFinite(latest) ? orders.filter(order => stamp(order) === latest) : [];
}
