import { escapeHtml as esc } from '../utils/utils.js';
const number = n => n.toLocaleString('tr-TR',{maximumFractionDigits:0});
const date = n => new Date(n).toLocaleString('tr-TR');
export function priceSparklineHtml(points) {
    if (points.length < 2) return '';
    const low=Math.min(...points.map(p=>p.price)),high=Math.max(...points.map(p=>p.price)),first=points[0].time,last=points.at(-1).time;
    return `<svg class="market-sparkline" viewBox="0 0 40 16" role="img" aria-label="AODP sell-order history, son 7 günlük gerçek fiyat gözlemleri"><polyline points="${points.map(p=>`${2+(p.time-first)/(last-first||1)*36},${14-(p.price-low)/(high-low||1)*12}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5"/>${points.map(p=>`<circle cx="${2+(p.time-first)/(last-first||1)*36}" cy="${14-(p.price-low)/(high-low||1)*12}" r="1.5" fill="currentColor"><title>${esc(`${date(p.time)} · ${number(p.price)} Silver · AODP sell-order history`)}</title></circle>`).join('')}</svg>`;
}
/** Each input series retains its source, city and book side; missing buckets stay missing. */
export function priceVolumeChartHtml(series, { days, now=Date.now(), width=620, height=190, empty='Fiyat geçmişi verisi yok' }={}) {
    const start = now-days*86400000;
    const visible = series.map(s => ({...s,points:s.points.filter(p => p.time>=start && p.time<=now && Number.isFinite(p.price) && p.price>0)})).filter(s => s.points.length);
    if (!visible.length) return `<p class="market-chart-empty">${esc(empty)}</p>`;
    const points = visible.flatMap(s => s.points), max = Math.max(...points.map(p=>p.price))*1.1;
    const quantities = points.filter(p=>Number.isSafeInteger(p.quantity) && p.quantity>0), volume = Math.max(1,...quantities.map(p=>p.quantity));
    const left=54,right=width-48,bottom=height-24,plotHeight=bottom-20;
    // Keep labels at native pixel size; compact panels reduce tick count,
    // rather than scaling the whole SVG and making its text unreadable.
    const ticks=Math.min(5,Math.max(2,Math.floor(plotHeight/24)+1));
    const x = t => left+(t-start)/(now-start)*(right-left), y = p => bottom-p/max*plotHeight;
    const title = (s,p) => esc(`${date(p.time)} · ${s.city} · ${s.label} · ${number(p.price)} Silver${p.quantity==null?'':` · ${number(p.quantity)} adet`} · ${s.source}`);
    const grid = Array.from({length:ticks},(_,i)=>{const fraction=i/(ticks-1);return `<line x1="${left}" x2="${right}" y1="${20+fraction*plotHeight}" y2="${20+fraction*plotHeight}" stroke="#164153"/><text x="49" y="${24+fraction*plotHeight}" text-anchor="end">${number(max*(1-fraction))}</text>${quantities.length?`<text x="${right+6}" y="${24+fraction*plotHeight}">${number(volume*(1-fraction))}</text>`:''}`;}).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fiyat (sol: Silver), hacim (sağ: adet); gerçek kaynak gözlemleri"><text x="${left}" y="12">Silver</text><text x="${right}" y="12">${quantities.length?'Adet':'Hacim yok'}</text>${grid}${visible.map(s=>`<g data-chart-series="${esc(s.key)}">${s.points.filter(p=>Number.isSafeInteger(p.quantity)&&p.quantity>0).map(p=>`<rect x="${x(p.time)-2}" y="${bottom-p.quantity/volume*plotHeight}" width="4" height="${p.quantity/volume*plotHeight}" fill="#357cba" opacity=".45"><title>${title(s,p)}</title></rect>`).join('')}${s.points.map(p=>`<circle cx="${x(p.time)}" cy="${y(p.price)}" r="2.6" fill="${esc(s.color)}"><title>${title(s,p)}</title></circle>`).join('')}</g>`).join('')}<text x="${left}" y="${height-6}">${esc(new Date(start).toLocaleDateString('tr-TR'))}</text><text x="${right}" y="${height-6}" text-anchor="end">${esc(new Date(now).toLocaleDateString('tr-TR'))}</text></svg>`;
}
