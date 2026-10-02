export function liquidity(history, quantity) {
    if (!history || !(history.n > 0) || !Number.isFinite(history.avgItemCount)) return { status: 'unknown', label: 'Yeterli veri yok' };
    const dailyVolume = history.avgItemCount;
    const weak = dailyVolume < quantity || history.n < 3;
    return { status: weak ? 'low' : 'observed', dailyVolume, samples: history.n,
        label: weak ? `Düşük likidite — ${quantity} contract’ın satılması zaman alabilir.` : `Gözlenen hacim: ${dailyVolume.toFixed(1)}/gün (${history.n} örnek)` };
}
