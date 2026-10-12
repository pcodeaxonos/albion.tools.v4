import { maximizeLinear, allocateInternalFeed } from './placement-model.js';

export function salesProfileValue(profiles, limits, purchaseLimits = null) {
    const quantities = profiles.map(profile => profile.sale.quantity);
    const purchases = new Map();
    for (const profile of profiles) for (const line of profile.purchases ?? []) purchases.set(line.id, (purchases.get(line.id) ?? 0) + line.quantity);
    let net = profiles.reduce((sum, profile) => sum + profile.net, 0);
    for (const transfer of allocateInternalFeed(profiles)) {
        quantities[transfer.producer] -= transfer.used;
        net += transfer.cycles * profiles[transfer.consumer].feed.marketCycleCost - transfer.used * transfer.unitValue;
        const feed = profiles[transfer.consumer].feedPurchase;
        if (feed) purchases.set(feed.id, (purchases.get(feed.id) ?? 0) - transfer.cycles * feed.quantityPerCycle);
    }
    if (purchaseLimits) for (const [id, quantity] of purchases) if (quantity > 1e-7 && (!Number.isFinite(purchaseLimits.get(id)) || quantity > purchaseLimits.get(id) + 1e-7)) return -Infinity;
    const groups = new Map();
    profiles.forEach((profile, i) => {
        const group = groups.get(profile.sale.id) ?? { quantity: 0, unitValue: profile.sale.unitValue };
        group.quantity += quantities[i];
        groups.set(profile.sale.id, group);
    });
    for (const [id, group] of groups) net -= Math.max(0, group.quantity - limits.get(id)) * group.unitValue;
    return net;
}

// Fractional plots, sales and feed transfers give a capacity-aware upper bound.
// The common engine still decides all integer placements and feed allocation.
export function salesPlacementUpper(fixed, options, remaining, limits, purchaseLimits = null) {
    const all = [...fixed, ...options];
    const ids = [...new Set(all.map(profile => profile.sale.id))];
    const feeds = new Map();
    all.forEach(profile => { if (profile.feed) feeds.set(JSON.stringify([profile.feed.marketCycleCost, profile.feed.choices]), profile.feed); });
    const edges = [...feeds].flatMap(([key, feed]) => feed.choices.filter(choice => ids.includes(choice.id)).map(choice => ({ key, ...choice, saving: feed.marketCycleCost / choice.quantity })));
    const width = options.length + edges.length + ids.length;
    const counts = options.length, salesOffset = counts + edges.length;
    const unit = id => all.find(profile => profile.sale.id === id).sale.unitValue;
    const objective = [...options.map(profile => profile.net - profile.sale.quantity * profile.sale.unitValue), ...edges.map(edge => edge.saving), ...ids.map(unit)];
    const constraints = [];
    const row = capacity => ({ coefficients: Array(width).fill(0), capacity });
    const slots = row(remaining);
    options.forEach((_, i) => { slots.coefficients[i] = 1; });
    constraints.push(slots);
    ids.forEach((id, index) => {
        const supply = profile => profile.sale.id === id ? profile.sale.quantity : 0;
        const balance = row(fixed.reduce((sum, profile) => sum + supply(profile), 0));
        options.forEach((profile, i) => { balance.coefficients[i] = -supply(profile); });
        edges.forEach((edge, i) => { if (edge.id === id) balance.coefficients[counts + i] = 1; });
        balance.coefficients[salesOffset + index] = 1;
        const capacity = row(limits.get(id));
        capacity.coefficients[salesOffset + index] = 1;
        constraints.push(balance, capacity);
    });
    feeds.forEach((_, key) => {
        const cycles = profile => profile.feed && JSON.stringify([profile.feed.marketCycleCost, profile.feed.choices]) === key ? profile.feed.cycles : 0;
        const demand = row(fixed.reduce((sum, profile) => sum + cycles(profile), 0));
        options.forEach((profile, i) => { demand.coefficients[i] = -cycles(profile); });
        edges.forEach((edge, i) => { if (edge.key === key) demand.coefficients[counts + i] = 1 / edge.quantity; });
        constraints.push(demand);
    });
    // Seed/replacement/material quantities cannot be repaired by internal feed.
    // Ignoring external feed here loosens the bound safely; integer scoring and
    // the final engine validate the full shared procurement capacity.
    if (purchaseLimits) for (const [id, limit] of purchaseLimits) {
        const quantity = profile => (profile.purchases ?? []).filter(line => line.id === id && line.id !== profile.feedPurchase?.id).reduce((sum, line) => sum + line.quantity, 0);
        const available = limit - fixed.reduce((sum, profile) => sum + quantity(profile), 0);
        if (available < -1e-7) return -Infinity;
        const procurement = row(Math.max(0, available));
        options.forEach((profile, i) => { procurement.coefficients[i] = quantity(profile); });
        constraints.push(procurement);
    }
    const solution = maximizeLinear(objective, constraints);
    // Repair floating point deficits to certify a feasible dual bound.
    const dual = solution.dual;
    const deficit = i => objective[i] - constraints.reduce((sum, constraint, j) => sum + dual[j] * constraint.coefficients[i], 0);
    ids.forEach((_, index) => {
        const balanceIndex = 1 + index * 2, capacityIndex = balanceIndex + 1;
        const missingFeed = Math.max(0, ...edges.map((edge, i) => edge.id === ids[index] ? deficit(counts + i) : 0));
        dual[balanceIndex] += missingFeed;
        dual[capacityIndex] += Math.max(0, deficit(salesOffset + index));
    });
    dual[0] += Math.max(0, ...options.map((_, i) => deficit(i)));
    const constant = fixed.reduce((sum, profile) => sum + profile.net - profile.sale.quantity * profile.sale.unitValue, 0);
    return constant + constraints.reduce((sum, constraint, i) => sum + constraint.capacity * dual[i], 0);
}
