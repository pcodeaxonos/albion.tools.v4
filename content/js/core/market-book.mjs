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

export const BOOK_NEAR_PRICE_RATIO = .03;
export function observedBookVolume(book, side) {
    const orders = latestBookOrders(book).filter(order => Number.isFinite(order.price) && order.price > 0);
    if (!orders.length) return null;
    const price = side === 'sell' ? Math.min(...orders.map(order => order.price)) : Math.max(...orders.map(order => order.price));
    const exact = orders.filter(order => order.price === price);
    const near = orders.filter(order => side === 'sell' ? order.price <= price * (1 + BOOK_NEAR_PRICE_RATIO) : order.price >= price * (1 - BOOK_NEAR_PRICE_RATIO));
    const sum = rows => rows.every(order => Number.isSafeInteger(order.observedAmount) && order.observedAmount > 0)
        && Number.isSafeInteger(rows.reduce((total, order) => total + order.observedAmount, 0))
        ? rows.reduce((total, order) => total + order.observedAmount, 0) : null;
    return { price, exact: sum(exact), near: sum(near), nearRatio: BOOK_NEAR_PRICE_RATIO, observedAt: orders[0].seenAt, coverage: 'partial' };
}
