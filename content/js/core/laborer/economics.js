import { purchaseCost, saleProceeds } from '../market-fees.js';
import { priceIssue } from './prices.js';

function ratio(numerator, denominator) {
    const value = denominator > 0 ? numerator / denominator : null;
    return Number.isFinite(value) ? value : null;
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
    let rewardNet = 0;
    if (!journal.rewardsVerified || !Array.isArray(journal.rewards)) issues.push(`${journal.filled}: doğrulanmış reward modeli yok`);
    for (const reward of journal.rewards || []) {
        if (!(reward.quantity >= 0) || !Number.isFinite(reward.quantity)) { issues.push('Geçersiz reward miktarı'); continue; }
        if (reward.quantity === 0) continue;
        if (reward.item === 'SILVER') { rewardNet += reward.quantity; continue; }
        const quote = quoteFor(reward.item, 'sell');
        const issue = priceIssue(quote);
        if (issue) issues.push(issue);
        else rewardNet += saleProceeds(quote.price, { premium, setup: quote.setup }) * reward.quantity;
    }
    if (issues.length) return { status: 'unknown', issues };
    const gross = purchaseCost(purchase.price, { setup: purchase.setup });
    if (![gross, rewardNet, gross - rewardNet].every(Number.isFinite)) return { status: 'unknown', issues: ['Cycle ekonomi değeri sayı sınırını aşıyor.'] };
    return { status: 'ok', gross, rewardNet, net: gross - rewardNet };
}

export function evaluatePlan({ plan, acquisition, quantity, sale, premium, setupCost = 0 }) {
    const issue = priceIssue(sale);
    if (issue || plan.status !== 'ok' || !Number.isFinite(acquisition) || acquisition < 0 || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isFinite(setupCost) || setupCost < 0) {
        return { status: 'unknown', issues: [issue, ...(plan.issues || []), ...(!Number.isFinite(acquisition) ? ['Başlangıç maliyeti bilinmiyor'] : []), ...(!Number.isFinite(setupCost) ? ['Yeni setup toplam maliyeti bilinmiyor'] : [])].filter(Boolean) };
    }
    const grossJournalCost = plan.sequence.reduce((sum, cycle) => sum + cycle.economics.gross, 0) * quantity;
    const rewardNet = plan.sequence.reduce((sum, cycle) => sum + cycle.economics.rewardNet, 0) * quantity;
    const levelingCost = acquisition * quantity + grossJournalCost - rewardNet;
    const contractNet = netSale(sale, quantity, premium);
    const profit = contractNet - levelingCost;
    if (contractNet == null || ![grossJournalCost, rewardNet, levelingCost, profit, setupCost + acquisition * quantity, plan.hours, plan.cost].every(Number.isFinite) || plan.hours < 0) return { status: 'unknown', issues: ['Ekonomi / progression değeri sayı sınırını aşıyor.'] };
    let cash = acquisition * quantity + setupCost;
    let peakCapital = cash;
    for (const cycle of plan.sequence) {
        cash += cycle.economics.gross * quantity;
        peakCapital = Math.max(peakCapital, cash);
        cash -= cycle.economics.rewardNet * quantity;
    }
    const initialCapital = acquisition * quantity + (plan.sequence[0]?.economics.gross || 0) * quantity + setupCost;
    const days = plan.hours / 24;
    if (![initialCapital, peakCapital, profit - setupCost].every(Number.isFinite)) return { status: 'unknown', issues: ['Sermaye değeri sayı sınırını aşıyor.'] };
    return { status: 'ok', cycles: plan.sequence.length, journals: plan.sequence.length * quantity, days,
        grossJournalCost, rewardNet, levelingCost, contractGross: sale.price * quantity, contractNet,
        profit, perLaborer: ratio(profit, quantity), profitDay: ratio(profit, days),
        profitSlotDay: ratio(profit / quantity, days),
        roi: ratio(profit, levelingCost),
        breakEven: breakEven(levelingCost / quantity, { premium, setup: sale.setup }),
        setupCost, profitAfterSetup: profit - setupCost, initialCapital, peakCapital };
}

export function compareContinue({ plan, currentSale, nextSale, quantity, premium }) {
    const issues = [priceIssue(currentSale), priceIssue(nextSale), ...(plan.issues || [])].filter(Boolean);
    if (issues.length || plan.status !== 'ok' || !(plan.hours > 0) || !Number.isSafeInteger(quantity) || quantity < 1) return { status: 'unknown', issues };
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
    const valid = rows.filter((row) => row.economics?.status === 'ok');
    const best = (key) => valid.filter((row) => Number.isFinite(row.economics[key])).sort((a, b) => b.economics[key] - a.economics[key] || a.tier - b.tier)[0] || null;
    return { total: best('profit'), efficiency: best('profitSlotDay') };
}
