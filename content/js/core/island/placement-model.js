const EPSILON = 1e-9;

// Maximise c*x subject to A*x <= b, x >= 0. All capacities are nonnegative,
// so slack variables provide a feasible initial basis. Bland's rule avoids cycles.
export function maximizeLinear(objective, constraints) {
    const n = objective.length, m = constraints.length;
    const rows = constraints.map(({ coefficients, capacity }, i) =>
        [...coefficients, ...Array.from({ length: m }, (_, j) => i === j ? 1 : 0), capacity]);
    rows.push([...objective.map(value => -value), ...Array(m).fill(0), 0]);
    const basis = Array.from({ length: m }, (_, i) => n + i);
    const last = n + m;
    while (true) {
        const column = rows[m].findIndex((value, i) => i < last && value < -EPSILON);
        if (column < 0) break;
        let pivot = -1, ratio = Infinity;
        for (let i = 0; i < m; i++) {
            if (rows[i][column] <= EPSILON) continue;
            const next = rows[i][last] / rows[i][column];
            if (next < ratio - EPSILON || (Math.abs(next - ratio) <= EPSILON && (pivot < 0 || basis[i] < basis[pivot]))) {
                pivot = i; ratio = next;
            }
        }
        if (pivot < 0) throw new Error('Yerleştirme üst sınırı sınırsız; kaynak modeli geçersiz.');
        const divisor = rows[pivot][column];
        rows[pivot] = rows[pivot].map(value => value / divisor);
        for (let i = 0; i <= m; i++) {
            if (i === pivot) continue;
            const factor = rows[i][column];
            rows[i] = rows[i].map((value, j) => value - factor * rows[pivot][j]);
        }
        basis[pivot] = column;
    }
    const values = Array(n).fill(0);
    basis.forEach((column, i) => { if (column < n) values[column] = Math.max(0, rows[i][last]); });
    return { value: rows[m][last], values, dual: rows[m].slice(n, last).map(value => Math.max(0, value)) };
}

// Prices and quantities come exclusively from the island calculation engine.
// Different feeds keep their own sale opportunity value and nutrition quantity.
export function placementValue(fixed, options = [], remaining = 0, { focusBudget = null } = {}) {
    const all = [...fixed, ...options];
    const supplies = new Map();
    const demands = new Map();
    for (const profile of all) {
        for (const supply of profile.supplies) supplies.set(supply.id, supply.unitValue);
        if (profile.feed) demands.set(JSON.stringify([profile.feed.marketCycleCost, profile.feed.choices]), profile.feed);
    }
    const groups = [...demands.entries()];
    const edges = groups.flatMap(([key, feed]) => feed.choices.flatMap(choice => {
        if (!supplies.has(choice.id) || !(choice.quantity > 0)) return [];
        const saving = feed.marketCycleCost / choice.quantity - supplies.get(choice.id);
        return saving > 0 ? [{ key, id: choice.id, quantity: choice.quantity, saving }] : [];
    }));
    const count = options.length;
    const objective = [...options.map(profile => profile.net), ...edges.map(edge => edge.saving)];
    const constraints = [];
    if (count) constraints.push({ coefficients: [...options.map(() => 1), ...edges.map(() => 0)], capacity: remaining });
    if (count && focusBudget != null) constraints.push({
        coefficients: [...options.map(profile => profile.focusPerDay ?? 0), ...edges.map(() => 0)],
        capacity: Math.max(0, focusBudget - fixed.reduce((sum, profile) => sum + (profile.focusPerDay ?? 0), 0))
    });
    const supplyRows = new Map();
    for (const [id] of supplies) {
        supplyRows.set(id, constraints.length);
        const quantity = profile => profile.supplies.filter(supply => supply.id === id).reduce((sum, supply) => sum + supply.quantity, 0);
        constraints.push({ coefficients: [...options.map(profile => -quantity(profile)), ...edges.map(edge => edge.id === id ? 1 : 0)], capacity: fixed.reduce((sum, profile) => sum + quantity(profile), 0) });
    }
    for (const [key] of groups) {
        const cycles = profile => profile.feed && JSON.stringify([profile.feed.marketCycleCost, profile.feed.choices]) === key ? profile.feed.cycles : 0;
        constraints.push({ coefficients: [...options.map(profile => -cycles(profile)), ...edges.map(edge => edge.key === key ? 1 / edge.quantity : 0)], capacity: fixed.reduce((sum, profile) => sum + cycles(profile), 0) });
    }
    const solution = maximizeLinear(objective, constraints);
    const fixedNet = fixed.reduce((sum, profile) => sum + profile.net, 0);
    // Certify the relaxation bound using a feasible dual, rather than trusting
    // a rounded primal score. First repair feed columns via supply prices, then
    // repair all count columns via the slot constraint. Raising the slot price
    // cannot invalidate feed columns because their slot coefficient is zero.
    const dual = solution.dual;
    const deficit = column => objective[column] - constraints.reduce((sum, row, i) => sum + dual[i] * row.coefficients[column], 0);
    if (count) {
        edges.forEach((edge, i) => {
            const missing = deficit(count + i);
            if (missing > 0) dual[supplyRows.get(edge.id)] += missing + EPSILON * Math.max(1, Math.abs(objective[count + i]));
        });
        const missing = Math.max(0, ...options.map((_, i) => deficit(i)));
        if (missing > 0) dual[0] += missing + EPSILON * Math.max(1, ...objective.map(Math.abs));
        if (objective.some((_, i) => deficit(i) > EPSILON)) throw new Error('Yerleştirme üst sınırı doğrulanamadı.');
    }
    return { net: fixedNet + solution.value,
        upper: count ? fixedNet + constraints.reduce((sum, row, i) => sum + row.capacity * dual[i], 0) : fixedNet + solution.value,
        allocations: edges.map((edge, i) => ({ ...edge, used: solution.values[count + i] })) };
}

export function allocateInternalFeed(profiles) {
    const result = placementValue(profiles);
    const supplies = profiles.map(profile => profile.supplies.map(supply => ({ ...supply })));
    const needs = profiles.map(profile => profile.feed?.cycles ?? 0);
    const transfers = [];
    for (const edge of result.allocations) {
        let remaining = edge.used;
        for (let consumer = 0; consumer < profiles.length && remaining > EPSILON; consumer++) {
            const feed = profiles[consumer].feed;
            if (!feed || JSON.stringify([feed.marketCycleCost, feed.choices]) !== edge.key) continue;
            for (let producer = 0; producer < profiles.length && remaining > EPSILON && needs[consumer] > EPSILON; producer++) {
                for (const supply of supplies[producer].filter(supply => supply.id === edge.id)) {
                    const used = Math.min(remaining, supply.quantity, needs[consumer] * edge.quantity);
                    if (used <= EPSILON) continue;
                    transfers.push({ producer, consumer, id: edge.id, used, cycles: used / edge.quantity, unitValue: supply.unitValue });
                    supply.quantity -= used; needs[consumer] -= used / edge.quantity; remaining -= used;
                }
            }
        }
        if (remaining > 1e-6) throw new Error('İç yem dağıtımı kaynak kapasitesiyle uyuşmuyor.');
    }
    return transfers;
}
