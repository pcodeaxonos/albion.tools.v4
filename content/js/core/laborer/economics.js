import { purchaseCost, saleProceeds } from '../market-fees.js';
import { priceIssue } from './prices.js';

function ratio(numerator, denominator) {
    const value = denominator > 0 ? numerator / denominator : null;
    return Number.isFinite(value) ? value : null;
}

// Only prices consumed by this route affect its status. Missing alternatives
// considered by the optimizer are not dependencies of the chosen result.
export function economicPriceState({ plan, sale, acquisitionQuote }) {
    const quotes = [sale, acquisitionQuote, ...(plan.sequence || []).flatMap(cycle =>
        [cycle.economics?.purchase, ...(cycle.economics?.rewardPrices || []).map(reward => reward.quote)])].filter(Boolean);
    const dependencies = [...new Map(quotes.map(quote => [JSON.stringify([quote.item, quote.city, quote.side, quote.intent]), quote])).values()];
    const missing = dependencies.filter(quote => priceIssue(quote));
    const status = missing.some(quote => quote.status !== 'stale') ? 'MISSING' : missing.length ? 'STALE' : dependencies.some(quote => quote.mode === 'manual') ? 'MANUAL' : 'LIVE';
    return { status, dependencies, missing };
}

export function netSale(quote, quantity, premium) {
    if (priceIssue(quote) || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    const value = saleProceeds(quote.price, { premium, setup: quote.setup }) * quantity;
    return Number.isFinite(value) ? value : null;
}

export function breakEven(cost, { premium, setup }) {
    const multiplier = saleProceeds(1, { premium, setup });
    const price = Number.isFinite(cost) && multiplier > 0 ? Math.max(1, Math.ceil(cost / multiplier)) : null;
    return Number.isFinite(price) ? price : null;
}

export function cycleEconomics(journal, quoteFor, premium) {
    const purchase = quoteFor(journal.filled, 'buy');
    const issues = [priceIssue(purchase)].filter(Boolean);
    let rewardNet = 0, rewardGross = 0;
    const rewardPrices = [];
    const missingRewards = [];
    if (!journal.rewardsVerified || !Array.isArray(journal.rewards)) issues.push(`${journal.filled}: doğrulanmış reward modeli yok`);
    for (const reward of journal.rewards || []) {
        if (!(reward.quantity >= 0) || !Number.isFinite(reward.quantity)) { issues.push('Geçersiz reward miktarı'); continue; }
        if (reward.quantity === 0) continue;
        if (reward.item === 'SILVER') { rewardNet += reward.quantity; rewardGross += reward.quantity; continue; }
        const quote = quoteFor(reward.item, 'sell');
        const issue = priceIssue(quote);
        rewardPrices.push({ item: reward.item, quantity: reward.quantity, quote });
        if (issue) { issues.push(issue); missingRewards.push(reward.item); }
        else { rewardGross += quote.price * reward.quantity; rewardNet += saleProceeds(quote.price, { premium, setup: quote.setup }) * reward.quantity; }
    }
    const gross = priceIssue(purchase) ? null : purchaseCost(purchase.price, { setup: purchase.setup });
    const rewardsAvailable = issues.length === Number(Boolean(priceIssue(purchase))) && journal.rewardsVerified && Array.isArray(journal.rewards);
    if (issues.length) return { status: 'unknown', economicStatus: 'partial', missingReason: priceIssue(purchase) ? 'missingJournalPrice' : 'missingRewardPrice',
        purchase, rewardPrices, missingRewards, gross, rewardGross: rewardsAvailable ? rewardGross : null,
        rewardNet: rewardsAvailable ? rewardNet : null, net: null, issues };
    if (![gross, rewardNet, gross - rewardNet].every(Number.isFinite)) return { status: 'unknown', issues: ['Cycle ekonomi değeri sayı sınırını aşıyor.'] };
    return { status: 'ok', economicStatus: 'ok', purchase, rewardPrices, gross, rewardGross, rewardNet, expectedRewardValue: rewardNet, expectedLoot: journal.expectedLoot, expectedLabourerFame: journal.expectedLabourerFame, net: gross - rewardNet };
}

export function evaluatePlan({ plan, acquisition, quantity, sale, premium, setupCost = 0 }) {
    if (plan.status !== 'ok' || !Number.isSafeInteger(quantity) || quantity < 1 ||
        (acquisition != null && (!Number.isFinite(acquisition) || acquisition < 0)) ||
        (setupCost != null && (!Number.isFinite(setupCost) || setupCost < 0))) {
        return { status: 'unknown', issues: [...(plan.issues || []), 'Geçersiz maliyet veya laborer adedi.'] };
    }
    const issues = [...(plan.issues || []), priceIssue(sale),
        acquisition == null ? 'Başlangıç maliyeti bilinmiyor' : null,
        setupCost == null ? 'Yeni setup toplam maliyeti bilinmiyor' : null].filter(Boolean);
    if (plan.economicAvailable === false) return {
        status: 'partial', issues, optimal: false, scenario: plan.scenario,
        economicStatus: 'partial', missingReason: plan.sequence.some(cycle => cycle.economics?.missingReason === 'missingJournalPrice') ? 'missingJournalPrice' : 'missingRewardPrice',
        missingRewards: [...new Set(plan.sequence.flatMap(cycle => cycle.economics?.missingRewards || []))],
        cycles: plan.sequence.length, journals: plan.sequence.length * quantity,
        days: plan.hours / 24, actualHours: plan.actualHours,
        acquisitionCapital: acquisition == null ? null : acquisition * quantity,
        grossJournalCost: plan.sequence.every((cycle) => Number.isFinite(cycle.economics?.gross)) ? plan.sequence.reduce((sum, cycle) => sum + cycle.economics.gross, 0) * quantity : null,
        rewardNet: plan.sequence.every((cycle) => Number.isFinite(cycle.economics?.rewardNet)) ? plan.sequence.reduce((sum, cycle) => sum + cycle.economics.rewardNet, 0) * quantity : null, levelingCost: null,
        contractNet: netSale(sale, quantity, premium), contractGross: sale.status === 'ok' ? sale.price * quantity : null,
        profit: null, perLaborer: null, profitDay: null, profitSlotDay: null, roi: null,
        breakEven: null, setupCost, profitAfterSetup: null, initialCapital: null, peakCapital: null
    };
    const grossJournalCost = plan.sequence.reduce((sum, cycle) => sum + cycle.economics.gross, 0) * quantity;
    const rewardNet = plan.sequence.reduce((sum, cycle) => sum + cycle.economics.rewardNet, 0) * quantity;
    const levelingCost = acquisition == null ? null : acquisition * quantity + grossJournalCost - rewardNet;
    const contractNet = netSale(sale, quantity, premium);
    const profit = contractNet == null || levelingCost == null ? null : contractNet - levelingCost;
    let cash = acquisition == null || setupCost == null ? null : acquisition * quantity + setupCost;
    let peakCapital = cash;
    if (cash != null) for (const cycle of plan.sequence) {
        cash += cycle.economics.gross * quantity;
        peakCapital = Math.max(peakCapital, cash);
        cash -= cycle.economics.rewardNet * quantity;
    }
    const initialCapital = acquisition == null || setupCost == null ? null : acquisition * quantity + (plan.sequence[0]?.economics.gross || 0) * quantity + setupCost;
    const days = plan.hours / 24;
    const profitAfterSetup = profit == null || setupCost == null ? null : profit - setupCost;
    const values = [grossJournalCost, rewardNet, levelingCost, profit, initialCapital, peakCapital, profitAfterSetup, plan.hours, plan.cost];
    if (values.some((value) => value != null && !Number.isFinite(value)) || plan.hours < 0 || (sale.status === 'ok' && contractNet == null)) return { status: 'unknown', issues: ['Ekonomi / progression değeri sayı sınırını aşıyor.'] };
    return { status: profit == null || initialCapital == null ? 'partial' : 'ok', issues,
        optimal: plan.optimal, scenario: plan.scenario, cycles: plan.sequence.length,
        journals: plan.sequence.length * quantity, days, actualHours: plan.actualHours ?? plan.hours,
        grossJournalCost, rewardNet, levelingCost, contractGross: contractNet == null ? null : sale.price * quantity, contractNet,
        profit, perLaborer: profit == null ? null : ratio(profit, quantity), profitDay: profit == null ? null : ratio(profit, days),
        profitSlotDay: profit == null ? null : ratio(profit / quantity, days),
        roi: profit == null || levelingCost == null ? null : ratio(profit, levelingCost),
        breakEven: levelingCost == null ? null : breakEven(levelingCost / quantity, { premium, setup: sale.setup }),
        setupCost, profitAfterSetup, initialCapital, peakCapital };
}

export function compareContinue({ plan, currentSale, nextSale, quantity, premium }) {
    const priceIssues = [priceIssue(currentSale), priceIssue(nextSale)].filter(Boolean);
    const issues = [...priceIssues, ...(plan.issues || [])];
    // Scope warnings about unpriced alternatives do not invalidate the chosen
    // priced route's actual cost or its opportunity-value comparison.
    if (priceIssues.length || plan.economicAvailable === false || plan.status !== 'ok' || !(plan.hours > 0) || !Number.isSafeInteger(quantity) || quantity < 1) return { status: 'unknown', issues };
    const opportunityCost = netSale(currentSale, quantity, premium);
    const incrementalCost = plan.cost * quantity;
    const nextNet = netSale(nextSale, quantity, premium);
    const additionalProfit = nextNet - opportunityCost - incrementalCost;
    if (opportunityCost == null || nextNet == null || ![incrementalCost, additionalProfit].every(Number.isFinite)) return { status: 'unknown', issues: ['Devam etme ekonomisi sayı sınırını aşıyor.'] };
    const days = plan.hours / 24;
    return { status: 'ok', opportunityCost, incrementalCost, additionalProfit, days, cycles: plan.sequence.length,
        additionalProfitDay: ratio(additionalProfit, days),
        marginalBreakEven: breakEven((opportunityCost + incrementalCost) / quantity, { premium, setup: nextSale.setup }) };
}

export function optimum(rows) {
    const valid = rows.filter((row) => ['ok', 'partial'].includes(row.economics?.status));
    const best = (key) => valid.filter((row) => Number.isFinite(row.economics[key])).sort((a, b) => b.economics[key] - a.economics[key] || a.tier - b.tier)[0] || null;
    return { total: best('profit'), efficiency: best('profitSlotDay') };
}
