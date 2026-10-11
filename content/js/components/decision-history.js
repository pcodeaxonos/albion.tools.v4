import { escapeHtml as esc } from '../utils/utils.js';
import { formatSilver } from '../utils/format.js';

// Plot only recorded observations on a real time axis. Gaps remain gaps.
export function decisionHistoryHtml(series) {
    const sides = ['sell', 'buy'].map(side => ({ side, points: (series?.[side]?.points || [])
        .map(point => ({ at: Date.parse(point.at), price: point.price }))
        .filter(point => Number.isFinite(point.at) && Number.isFinite(point.price) && point.price > 0)
        .sort((a, b) => a.at - b.at) }));
    const all = sides.flatMap(row => row.points);
    if (!all.length) return '<p class="decision-panel-empty">Geçerli geçmiş gözlemi yok.</p>';
    const first = Math.min(...all.map(p => p.at)), last = Math.max(...all.map(p => p.at));
    const low = Math.min(...all.map(p => p.price)), high = Math.max(...all.map(p => p.price));
    const pad = (high - low || high * .1) * .1;
    const x = at => 62 + (at - first) / (last - first || 1) * 472;
    const y = price => 16 + (high + pad - price) / (high - low + 2 * pad) * 140;
    const grid = Array.from({ length: 4 }, (_, i) => {
        const price = low - pad + (high - low + 2 * pad) * i / 3;
        return `<line x1="62" x2="534" y1="${y(price)}" y2="${y(price)}"/><text x="54" y="${y(price) + 4}" text-anchor="end">${esc(formatSilver(price))}</text>`;
    }).join('');
    const points = sides.map(({ side, points }) => `<g class="decision-series-${side}">${points.map((p, index) => {
        const prior = points[index - 1];
        const line = prior && p.at - prior.at <= 3600000 ? `<line x1="${x(prior.at)}" y1="${y(prior.price)}" x2="${x(p.at)}" y2="${y(p.price)}"/>` : '';
        return `${line}<circle cx="${x(p.at)}" cy="${y(p.price)}" r="2"><title>${esc(`${side} · ${new Date(p.at).toLocaleString('tr-TR')} · ${formatSilver(p.price)}`)}</title></circle>`;
    }).join('')}</g>`).join('');
    const date = at => new Date(at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    return `<svg class="decision-history-chart" viewBox="0 0 550 190" role="img" aria-label="Gerçek Buy ve Sell teklif gözlemleri">${grid}${points}<text x="62" y="181">${esc(date(first))}</text><text x="534" y="181" text-anchor="end">${esc(date(last))}</text></svg><div class="decision-history-legend"><span>Sell teklif</span><span>Buy teklif</span></div>`;
}
