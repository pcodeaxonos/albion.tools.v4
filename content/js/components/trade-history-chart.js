import { escapeHtml } from '../utils/utils.js';

const PRICE_KINDS = new Set(['mail_sell', 'instant_sell']);
const VIEW = { width: 640, height: 260, left: 88, right: 16, top: 16, bottom: 46 };

export function tradeHistorySeries(trades, resolveCity) {
    const cities = new Map();
    for (const trade of trades) {
        if (!PRICE_KINDS.has(trade.kind) || !Number.isFinite(trade._unit) || trade._unit <= 0 || !Number.isFinite(trade._ts) || trade._ts <= 0 || !Number.isFinite(trade._qty) || trade._qty <= 0) continue;
        const city = resolveCity(trade.cityKey);
        if (!cities.has(city.key)) cities.set(city.key, { ...city, points: [] });
        cities.get(city.key).points.push({ time: trade._ts, price: trade._unit, quantity: trade._qty });
    }
    return [...cities.values()].map(city => ({ ...city, points: city.points.sort((a, b) => a.time - b.time) }));
}

export function tradeHistoryChartHtml(series, { itemName, formatPrice, formatDate }) {
    if (!itemName) return '<p class="trades-empty">Grafik için fiyat önerilerinden bir item seçin.</p>';
    const heading = `<h3>${escapeHtml(itemName)} · Fiyat geçmişi</h3>`;
    if (!series.length) return `${heading}<p class="trades-empty">Seçili filtrelerde fiyat grafiği için işlem yok.</p>`;
    let first = Infinity, last = -Infinity, low = Infinity, high = -Infinity;
    for (const city of series) for (const point of city.points) {
        first = Math.min(first, point.time); last = Math.max(last, point.time);
        low = Math.min(low, point.price); high = Math.max(high, point.price);
    }
    const padding = (high - low || high * .1) * .1;
    low = Math.max(0, low - padding); high += padding;
    const { width, height, left, right, top, bottom } = VIEW;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const dayKey = time => {
        const date = new Date(time);
        return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    };
    const days = [...new Set(series.flatMap(city => city.points.map(point => dayKey(point.time))))].sort((a, b) => a - b);
    const dayIndices = new Map(days.map((day, index) => [day, index]));
    const positions = new Map();
    for (const city of series) {
        const groups = new Map();
        for (const point of city.points) {
            const day = dayKey(point.time);
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day).push(point);
        }
        for (const [day, points] of groups) points.forEach((point, index) => {
            positions.set(point, left + (dayIndices.get(day) + (index + 1) / (points.length + 1)) / days.length * plotWidth);
        });
    }
    const x = point => positions.get(point);
    const y = price => top + (high - price) / (high - low) * plotHeight;
    const grid = Array.from({ length: 5 }, (_, i) => {
        const price = low + (high - low) * i / 4, at = y(price);
        return `<line class="trades-chart-grid" x1="${left}" x2="${width - right}" y1="${at}" y2="${at}"/><text x="${left - 8}" y="${at + 4}" text-anchor="end">${escapeHtml(formatPrice(price))}</text>`;
    }).join('');
    const lines = series.map(city => `<g data-city="${escapeHtml(city.key)}" class="trades-chart-series"><polyline points="${city.points.map(p => `${x(p)},${y(p.price)}`).join(' ')}"/>${city.points.map(p => `<circle cx="${x(p)}" cy="${y(p.price)}" r="3"><title>${escapeHtml(`${city.label} · ${formatDate(p.time)} · ${formatPrice(p.price)} Silver · ${p.quantity} adet`)}</title></circle>`).join('')}</g>`).join('');
    const dateLabel = time => new Date(time).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const dates = days.length === 1 ? `<text x="${left + plotWidth / 2}" y="${height - 16}" text-anchor="middle">${escapeHtml(dateLabel(first))}</text>` : `<text x="${left}" y="${height - 16}">${escapeHtml(dateLabel(first))}</text><text x="${width - right}" y="${height - 16}" text-anchor="end">${escapeHtml(dateLabel(last))}</text>`;
    return `${heading}<p class="trades-chart-note">Her nokta bir satış · İşlem günleri eşit aralıklı, gün içi satışlar sırayla</p><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(itemName)} için şehirlere göre satış birim fiyatı (Silver) geçmişi">${grid}${lines}${dates}</svg><div class="trades-chart-legend">${series.map(city => `<span data-city="${escapeHtml(city.key)}">${escapeHtml(city.label.toLocaleUpperCase('en-US'))}</span>`).join('')}</div>`;
}
