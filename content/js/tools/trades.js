import { escapeHtml } from '../utils/utils.js';
import { initNav } from '../core/nav.js';
import { initStore } from '../db/store.js';
import { showPageLoader, hidePageLoader } from '../components/loader.js';
import { recordCurrentToolVisit } from '../core/usage.js';
import {
    bindTradeLive,
    fetchTradeSnapshot,
    isTradeLiveConnected,
    startTradeLive,
    getLastTradeEventAt
} from '../core/trade-live.js';

const ROW_H = 26;
const ACTIVITY_LIMIT = 40;
const TOP_ITEMS_LIMIT = 40;
const TOP_CITIES_LIMIT = 24;

const KIND_META = {
    mail_buy: { label: 'Market Buy', side: 'buy' },
    mail_sell: { label: 'Market Sell', side: 'sell' },
    mail_buy_expired: { label: 'Market Buy Expired', side: 'buy' },
    mail_sell_expired: { label: 'Market Sell Expired', side: 'sell' },
    blackmarket_sell_expired: { label: 'Black Market Expired', side: 'sell' },
    instant_buy: { label: 'Instant Buy', side: 'buy' },
    instant_sell: { label: 'Instant Sell', side: 'sell' },
    crafting: { label: 'Crafting', side: 'other' },
    player_in: { label: 'Player Incoming', side: 'other' },
    player_out: { label: 'Player Outgoing', side: 'other' }
};

const DATE_PRESETS = [
    { id: 'today', label: 'Bugün' },
    { id: '24h', label: 'Son 24 saat' },
    { id: '7d', label: 'Son 7 gün' },
    { id: '30d', label: 'Son 30 gün' },
    { id: '90d', label: 'Son 90 gün' },
    { id: 'all', label: 'Tümü' },
    { id: 'custom', label: 'Özel aralık' }
];

const state = {
    all: [],
    filtered: [],
    byId: new Map(),
    live: false,
    lastEventAt: null,
    error: null,
    filters: {
        datePreset: 'all',
        dateFrom: '',
        dateTo: '',
        city: '',
        kinds: new Set(),
        itemQuery: '',
        tier: '',
        enchant: '',
        quality: '',
        search: ''
    },
    tableSort: { key: 'occurredAt', dir: 'desc' },
    itemSort: { key: 'trades', dir: 'desc' },
    citySort: { key: 'trades', dir: 'desc' },
    activity: [],
    newIds: new Set(),
    selectedId: null,
    scrollTop: 0
};

let root = null;
let unbindLive = null;
let highlightTimer = 0;

function kindLabel(kind) {
    return KIND_META[kind]?.label || kind || 'Unknown';
}

function kindSide(kind) {
    return KIND_META[kind]?.side || 'other';
}

function kindClass(kind) {
    const side = kindSide(kind);
    if (side === 'buy') return 'trades-kind-buy';
    if (side === 'sell') return 'trades-kind-sell';
    return 'trades-kind-other';
}

function formatInt(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString('tr-TR');
}

function formatSilverFull(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString('tr-TR');
}

function formatSilverCompact(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}b`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}m`;
    if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}k`;
    return `${sign}${Math.round(abs).toLocaleString('tr-TR')}`;
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} ${time}`;
}

function formatTimeOnly(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function parseTierEnchant(itemId) {
    const id = String(itemId || '');
    let tier = null;
    let enchant = null;
    const t = id.match(/(?:^|_)T(\d)(?:_|$|@)/i) || id.match(/^T(\d)/i);
    if (t) tier = Number(t[1]);
    const e = id.match(/@(\d+)$/);
    if (e) enchant = Number(e[1]);
    return { tier, enchant };
}

function enrich(trade) {
    const { tier, enchant } = parseTierEnchant(trade.itemId);
    const cityKey = trade.locationName
        || (trade.clusterIndex === '@BLACK_MARKET' ? 'Black Market' : null)
        || (trade.clusterIndex ? trade.clusterIndex : null)
        || 'Unknown';
    return {
        ...trade,
        tier,
        enchant,
        quality: trade.quality != null && Number.isFinite(Number(trade.quality))
            ? Number(trade.quality)
            : null,
        cityKey,
        _ts: trade.occurredAt ? Date.parse(trade.occurredAt) : 0,
        _total: Number(trade.totalPriceSilver) || 0,
        _qty: Number(trade.quantity) || 0
    };
}

function identityOf(trade) {
    if (trade.sourceId != null && trade.sourceId !== '') {
        return `id:${trade.sourceId}`;
    }
    return `fb:${trade.rawType}|${trade.clusterIndex}|${trade.characterGuid}|${trade.occurredAt}|${trade.itemId}|${trade.quantity}|${trade.totalPriceSilver}`;
}

function dateRangeBounds(filters) {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    switch (filters.datePreset) {
        case 'today':
            return { from: startOfToday.getTime(), to: null };
        case '24h':
            return { from: now - 24 * 3600_000, to: null };
        case '7d':
            return { from: now - 7 * 24 * 3600_000, to: null };
        case '30d':
            return { from: now - 30 * 24 * 3600_000, to: null };
        case '90d':
            return { from: now - 90 * 24 * 3600_000, to: null };
        case 'custom': {
            let from = null;
            let to = null;
            if (filters.dateFrom) {
                const d = Date.parse(`${filters.dateFrom}T00:00:00`);
                from = Number.isNaN(d) ? null : d;
            }
            if (filters.dateTo) {
                const d = Date.parse(`${filters.dateTo}T23:59:59.999`);
                to = Number.isNaN(d) ? null : d;
            }
            return { from, to };
        }
        default:
            return { from: null, to: null };
    }
}

function matchesFilters(trade, filters) {
    const { from, to } = dateRangeBounds(filters);
    if (from != null && trade._ts < from) return false;
    if (to != null && trade._ts > to) return false;

    if (filters.city) {
        if (filters.city === 'Unknown') {
            if (trade.locationName || trade.clusterIndex === '@BLACK_MARKET') return false;
            if (trade.clusterIndex && trade.cityKey !== 'Unknown') return false;
        } else if (filters.city === 'Black Market') {
            if (trade.clusterIndex !== '@BLACK_MARKET' && trade.cityKey !== 'Black Market') return false;
        } else if (trade.cityKey !== filters.city && trade.locationName !== filters.city && trade.clusterIndex !== filters.city) {
            return false;
        }
    }

    if (filters.kinds.size > 0 && !filters.kinds.has(trade.kind)) return false;

    if (filters.itemQuery) {
        const q = filters.itemQuery.toLowerCase();
        const hay = `${trade.itemId || ''} ${trade.itemName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
    }

    if (filters.tier !== '' && filters.tier != null) {
        if (trade.tier == null || String(trade.tier) !== String(filters.tier)) return false;
    }

    if (filters.enchant !== '' && filters.enchant != null) {
        const want = Number(filters.enchant);
        const got = trade.enchant == null ? 0 : Number(trade.enchant);
        if (got !== want) return false;
    }

    if (filters.quality !== '' && filters.quality != null) {
        if (filters.quality === 'na') {
            if (trade.quality != null) return false;
        } else if (trade.quality == null || String(trade.quality) !== String(filters.quality)) {
            return false;
        }
    }

    if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [
            trade.itemId,
            trade.itemName,
            trade.cityKey,
            trade.locationName,
            trade.clusterIndex,
            trade.counterparty,
            kindLabel(trade.kind)
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
    }

    return true;
}

function recomputeFiltered() {
    const list = [];
    for (const trade of state.all) {
        if (matchesFilters(trade, state.filters)) list.push(trade);
    }
    sortTrades(list, state.tableSort);
    state.filtered = list;
}

function sortTrades(list, sort) {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const key = sort.key;
    list.sort((a, b) => {
        let av;
        let bv;
        switch (key) {
            case 'occurredAt':
                av = a._ts; bv = b._ts; break;
            case 'kind':
                av = kindLabel(a.kind); bv = kindLabel(b.kind); break;
            case 'item':
                av = a.itemName || a.itemId || ''; bv = b.itemName || b.itemId || ''; break;
            case 'city':
                av = a.cityKey || ''; bv = b.cityKey || ''; break;
            case 'quantity':
                av = a._qty; bv = b._qty; break;
            case 'unit':
                av = Number(a.unitPriceSilver) || 0; bv = Number(b.unitPriceSilver) || 0; break;
            case 'total':
                av = a._total; bv = b._total; break;
            case 'tax':
                av = Number(a.taxRate) || 0; bv = Number(b.taxRate) || 0; break;
            case 'fee':
                av = Number(a.distanceFeeSilver) || 0; bv = Number(b.distanceFeeSilver) || 0; break;
            case 'counterparty':
                av = a.counterparty || ''; bv = b.counterparty || ''; break;
            default:
                av = a._ts; bv = b._ts;
        }
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string') return av.localeCompare(bv, 'tr') * dir;
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
    });
}

function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function computeKpis(list) {
    let buy = 0;
    let sell = 0;
    let qty = 0;
    let total = 0;
    let today = 0;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTs = startOfToday.getTime();
    const values = [];

    for (const t of list) {
        const silver = t._total;
        total += silver;
        qty += t._qty;
        values.push(silver);
        if (t._ts >= todayTs) today += 1;
        const side = kindSide(t.kind);
        if (side === 'buy') buy += silver;
        else if (side === 'sell') sell += silver;
    }

    const count = list.length;
    return {
        count,
        total,
        buy,
        sell,
        net: sell - buy,
        qty,
        avg: count ? total / count : 0,
        med: median(values) ?? 0,
        today
    };
}

function computeKindBreakdown(list) {
    const map = new Map();
    for (const t of list) {
        const k = t.kind || 'unknown';
        map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()]
        .map(([kind, count]) => ({ kind, count, label: kindLabel(kind) }))
        .sort((a, b) => b.count - a.count);
}

function computeCityBreakdown(list) {
    const map = new Map();
    for (const t of list) {
        const key = t.cityKey || 'Unknown';
        let row = map.get(key);
        if (!row) {
            row = { city: key, trades: 0, silver: 0, qty: 0 };
            map.set(key, row);
        }
        row.trades += 1;
        row.silver += t._total;
        row.qty += t._qty;
    }
    const rows = [...map.values()];
    const sort = state.citySort;
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (typeof av === 'string') return av.localeCompare(bv, 'tr') * dir;
        return (av - bv) * dir;
    });
    return rows.slice(0, TOP_CITIES_LIMIT);
}

function computeItemBreakdown(list) {
    const map = new Map();
    for (const t of list) {
        const key = t.itemId || t.itemName || '(unknown)';
        let row = map.get(key);
        if (!row) {
            row = {
                key,
                itemId: t.itemId,
                itemName: t.itemName || t.itemId || '(unknown)',
                trades: 0,
                qty: 0,
                buy: 0,
                sell: 0,
                lastTs: 0,
                lastAt: null
            };
            map.set(key, row);
        }
        row.trades += 1;
        row.qty += t._qty;
        const side = kindSide(t.kind);
        if (side === 'buy') row.buy += t._total;
        if (side === 'sell') row.sell += t._total;
        if (t._ts >= row.lastTs) {
            row.lastTs = t._ts;
            row.lastAt = t.occurredAt;
        }
    }
    const rows = [...map.values()].map((r) => ({ ...r, net: r.sell - r.buy }));
    const sort = state.itemSort;
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
        let av;
        let bv;
        switch (sort.key) {
            case 'item': av = a.itemName; bv = b.itemName; break;
            case 'qty': av = a.qty; bv = b.qty; break;
            case 'buy': av = a.buy; bv = b.buy; break;
            case 'sell': av = a.sell; bv = b.sell; break;
            case 'net': av = a.net; bv = b.net; break;
            case 'last': av = a.lastTs; bv = b.lastTs; break;
            default: av = a.trades; bv = b.trades;
        }
        if (typeof av === 'string') return av.localeCompare(bv, 'tr') * dir;
        return (av - bv) * dir;
    });
    return rows.slice(0, TOP_ITEMS_LIMIT);
}

function chartGranularity(list) {
    if (!list.length) return 'day';
    let min = Infinity;
    let max = -Infinity;
    for (const t of list) {
        if (!t._ts) continue;
        if (t._ts < min) min = t._ts;
        if (t._ts > max) max = t._ts;
    }
    const span = max - min;
    if (span <= 36 * 3600_000) return 'hour';
    if (span <= 10 * 24 * 3600_000) return 'day';
    if (span <= 100 * 24 * 3600_000) return 'day';
    return 'week';
}

function bucketKey(ts, grain) {
    const d = new Date(ts);
    if (grain === 'hour') {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;
    }
    if (grain === 'week') {
        const tmp = new Date(d);
        tmp.setHours(0, 0, 0, 0);
        tmp.setDate(tmp.getDate() - ((tmp.getDay() + 6) % 7));
        return `${tmp.getFullYear()}-W${String(tmp.getMonth() + 1).padStart(2, '0')}-${String(tmp.getDate()).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeSeries(list) {
    const grain = chartGranularity(list);
    const map = new Map();
    for (const t of list) {
        if (!t._ts) continue;
        const key = bucketKey(t._ts, grain);
        let row = map.get(key);
        if (!row) {
            row = { key, count: 0, silver: 0 };
            map.set(key, row);
        }
        row.count += 1;
        row.silver += t._total;
    }
    const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { grain, rows };
}

function uniqueCities(all) {
    const set = new Map();
    for (const t of all) {
        const key = t.cityKey || 'Unknown';
        set.set(key, (set.get(key) || 0) + 1);
    }
    return [...set.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([city]) => city);
}

function filtersActive() {
    const f = state.filters;
    return f.datePreset !== 'all'
        || f.city
        || f.kinds.size > 0
        || f.itemQuery
        || f.tier !== ''
        || f.enchant !== ''
        || f.quality !== ''
        || f.search;
}

function clearFilters() {
    state.filters = {
        datePreset: 'all',
        dateFrom: '',
        dateTo: '',
        city: '',
        kinds: new Set(),
        itemQuery: '',
        tier: '',
        enchant: '',
        quality: '',
        search: ''
    };
}

function ingestInitial(trades) {
    state.all = [];
    state.byId = new Map();
    for (const raw of trades || []) {
        const trade = enrich(raw);
        const id = identityOf(trade);
        trade._uid = id;
        state.byId.set(id, trade);
        state.all.push(trade);
    }
    state.activity = state.all
        .slice()
        .sort((a, b) => b._ts - a._ts)
        .slice(0, ACTIVITY_LIMIT);
    recomputeFiltered();
}

function ingestAdded(trades) {
    if (!trades?.length) return;
    const fresh = [];
    for (const raw of trades) {
        const trade = enrich(raw);
        const id = identityOf(trade);
        if (state.byId.has(id)) continue;
        trade._uid = id;
        state.byId.set(id, trade);
        state.all.push(trade);
        state.newIds.add(id);
        fresh.push(trade);
    }
    if (!fresh.length) return;
    state.activity = [...fresh].reverse().concat(state.activity).slice(0, ACTIVITY_LIMIT);
    recomputeFiltered();
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
        state.newIds.clear();
        renderDynamic();
    }, 3500);
}

function renderShell() {
    root.innerHTML = `
        <div class="trades-root">
            <header class="trades-head">
                <h1>Trade Dashboard</h1>
                <div class="trades-head-meta">
                    <span class="trades-live" data-live-status>
                        <span class="trades-live-dot" aria-hidden="true"></span>
                        <span data-live-label>CONNECTING</span>
                    </span>
                    <span data-trade-count>0 trades</span>
                    <span data-last-event></span>
                </div>
            </header>
            <div data-trades-error hidden class="trades-error"></div>
            <section class="trades-filters" data-filters aria-label="Filtreler"></section>
            <section class="trades-kpi" data-kpi aria-label="Özet"></section>
            <section class="trades-mid">
                <div class="trades-panel">
                    <div class="trades-panel-head"><span>Zaman · Trade / Silver</span><span data-chart-grain></span></div>
                    <div class="trades-panel-body"><div class="trades-chart" data-chart></div></div>
                </div>
                <div class="trades-panel">
                    <div class="trades-panel-head"><span>Top Items</span></div>
                    <div class="trades-panel-body" data-top-items></div>
                </div>
                <div class="trades-panel trades-activity">
                    <div class="trades-panel-head"><span>Live Activity</span><span>Türler</span></div>
                    <div class="trades-panel-body" style="display:grid;grid-template-rows:1fr auto;min-height:10rem">
                        <div data-activity></div>
                        <div data-kinds style="border-top:1px solid var(--color-border);max-height:8rem;overflow:auto"></div>
                    </div>
                </div>
            </section>
            <section class="trades-mid" style="min-height:8rem;grid-template-columns:1fr 1fr">
                <div class="trades-panel">
                    <div class="trades-panel-head"><span>Şehirler</span></div>
                    <div class="trades-panel-body" data-cities></div>
                </div>
                <div class="trades-panel">
                    <div class="trades-panel-head"><span>Filtrelenmiş kayıt</span><span data-filtered-count></span></div>
                    <div class="trades-panel-body" data-filter-hint style="padding:0.55rem;font-size:0.78rem;color:var(--color-text-muted)"></div>
                </div>
            </section>
            <section class="trades-table-wrap">
                <div class="trades-table-head">
                    <span>Trades</span>
                    <span data-table-meta></span>
                </div>
                <div class="trades-virt" data-virt>
                    <div class="trades-virt-inner" data-virt-inner>
                        <table class="trades-virt-table">
                            <colgroup>
                                <col class="c-date"><col class="c-type"><col class="c-item"><col class="c-city">
                                <col class="c-qty"><col class="c-unit"><col class="c-total"><col class="c-tax">
                                <col class="c-fee"><col class="c-party">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th data-table-sort="occurredAt">Date</th>
                                    <th data-table-sort="kind">Type</th>
                                    <th data-table-sort="item">Item</th>
                                    <th data-table-sort="city">City</th>
                                    <th class="num" data-table-sort="quantity">Qty</th>
                                    <th class="num" data-table-sort="unit">Unit</th>
                                    <th class="num" data-table-sort="total">Total</th>
                                    <th class="num" data-table-sort="tax">Tax</th>
                                    <th class="num" data-table-sort="fee">Fee</th>
                                    <th data-table-sort="counterparty">Party</th>
                                </tr>
                            </thead>
                            <tbody data-virt-body></tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
        <dialog class="app-dialog trades-detail-dialog" data-detail-dialog>
            <button type="button" class="app-dialog-close" aria-label="Kapat" data-detail-close></button>
            <div class="trades-detail-sheet" data-detail-sheet></div>
        </dialog>
    `;
    bindStaticEvents();
}

function bindStaticEvents() {
    const virt = root.querySelector('[data-virt]');
    virt.addEventListener('scroll', () => {
        state.scrollTop = virt.scrollTop;
        renderVirtualRows();
    }, { passive: true });

    root.querySelector('[data-virt-body]').addEventListener('click', (event) => {
        const tr = event.target.closest('tr[data-uid]');
        if (!tr) return;
        openDetail(tr.getAttribute('data-uid'));
    });

    root.querySelectorAll('[data-table-sort]').forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-table-sort');
            if (state.tableSort.key === key) {
                state.tableSort.dir = state.tableSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                state.tableSort = { key, dir: key === 'occurredAt' ? 'desc' : 'asc' };
            }
            sortTrades(state.filtered, state.tableSort);
            renderVirtualRows();
            updateSortHeaders();
        });
    });

    root.querySelector('[data-detail-close]').addEventListener('click', () => {
        root.querySelector('[data-detail-dialog]').close();
    });

    root.querySelector('[data-detail-dialog]').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
    });
}

function renderFilters() {
    const el = root.querySelector('[data-filters]');
    const cities = uniqueCities(state.all);
    const f = state.filters;
    const customVisible = f.datePreset === 'custom';

    el.classList.toggle('is-active', filtersActive());
    el.innerHTML = `
        <div>
            <label class="form-label" for="tradesDate">Tarih</label>
            <select class="form-select" data-filter="datePreset" id="tradesDate">
                ${DATE_PRESETS.map((p) => `<option value="${p.id}" ${f.datePreset === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
            </select>
        </div>
        <div ${customVisible ? '' : 'hidden'}>
            <label class="form-label" for="tradesFrom">Başlangıç</label>
            <input class="form-control" type="date" data-filter="dateFrom" id="tradesFrom" value="${escapeHtml(f.dateFrom)}">
        </div>
        <div ${customVisible ? '' : 'hidden'}>
            <label class="form-label" for="tradesTo">Bitiş</label>
            <input class="form-control" type="date" data-filter="dateTo" id="tradesTo" value="${escapeHtml(f.dateTo)}">
        </div>
        <div>
            <label class="form-label" for="tradesCity">Şehir</label>
            <select class="form-select" data-filter="city" id="tradesCity">
                <option value="">Tümü</option>
                ${cities.map((c) => `<option value="${escapeHtml(c)}" ${f.city === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
        </div>
        <div style="grid-column: span 2">
            <span class="form-label">İşlem</span>
            <div class="trades-kind-filters" data-kind-filters>
                ${Object.keys(KIND_META).map((k) => `
                    <label class="trades-kind-chip${f.kinds.has(k) ? ' is-on' : ''}">
                        <input type="checkbox" value="${k}" ${f.kinds.has(k) ? 'checked' : ''}>
                        ${escapeHtml(KIND_META[k].label)}
                    </label>
                `).join('')}
            </div>
        </div>
        <div class="trades-filters-search">
            <label class="form-label" for="tradesItem">Item</label>
            <input class="form-control" data-filter="itemQuery" id="tradesItem" placeholder="ad veya item id" value="${escapeHtml(f.itemQuery)}" autocomplete="off">
        </div>
        <div>
            <label class="form-label" for="tradesTier">Tier</label>
            <select class="form-select" data-filter="tier" id="tradesTier">
                <option value="">Tümü</option>
                ${[1, 2, 3, 4, 5, 6, 7, 8].map((t) => `<option value="${t}" ${String(f.tier) === String(t) ? 'selected' : ''}>T${t}</option>`).join('')}
            </select>
        </div>
        <div>
            <label class="form-label" for="tradesEnchant">Enchant</label>
            <select class="form-select" data-filter="enchant" id="tradesEnchant">
                <option value="">Tümü</option>
                ${[0, 1, 2, 3].map((e) => `<option value="${e}" ${String(f.enchant) === String(e) ? 'selected' : ''}>.${e}</option>`).join('')}
            </select>
        </div>
        <div>
            <label class="form-label" for="tradesQuality">Quality</label>
            <select class="form-select" data-filter="quality" id="tradesQuality">
                <option value="">Tümü</option>
                <option value="na" ${f.quality === 'na' ? 'selected' : ''}>N/A</option>
                ${[1, 2, 3, 4, 5].map((q) => `<option value="${q}" ${String(f.quality) === String(q) ? 'selected' : ''}>Q${q}</option>`).join('')}
            </select>
        </div>
        <div class="trades-filters-search">
            <label class="form-label" for="tradesSearch">Arama</label>
            <input class="form-control" data-filter="search" id="tradesSearch" placeholder="item, şehir, party, cluster…" value="${escapeHtml(f.search)}" autocomplete="off">
        </div>
        <div class="trades-filters-actions">
            <button type="button" class="btn btn-outline-secondary" data-filter-clear>Tümünü Temizle</button>
        </div>
    `;

    el.querySelectorAll('[data-filter]').forEach((input) => {
        const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
            const key = input.getAttribute('data-filter');
            state.filters[key] = input.value;
            if (key === 'datePreset') renderFilters();
            recomputeFiltered();
            renderDynamic();
        });
    });

    el.querySelectorAll('[data-kind-filters] input[type="checkbox"]').forEach((box) => {
        box.addEventListener('change', () => {
            const next = new Set();
            el.querySelectorAll('[data-kind-filters] input[type="checkbox"]:checked').forEach((c) => {
                next.add(c.value);
            });
            state.filters.kinds = next;
            el.querySelectorAll('.trades-kind-chip').forEach((chip) => {
                const on = chip.querySelector('input')?.checked;
                chip.classList.toggle('is-on', !!on);
            });
            recomputeFiltered();
            renderDynamic();
        });
    });

    el.querySelector('[data-filter-clear]').addEventListener('click', () => {
        clearFilters();
        renderFilters();
        recomputeFiltered();
        renderDynamic();
    });
}

function renderLiveStatus() {
    const wrap = root.querySelector('[data-live-status]');
    const label = root.querySelector('[data-live-label]');
    wrap.classList.remove('is-live', 'is-offline');
    if (state.live) {
        wrap.classList.add('is-live');
        label.textContent = 'LIVE';
    } else {
        wrap.classList.add('is-offline');
        label.textContent = 'DISCONNECTED';
    }
    root.querySelector('[data-trade-count]').textContent =
        `${formatInt(state.all.length)} trades`;
    const last = state.lastEventAt || getLastTradeEventAt();
    root.querySelector('[data-last-event]').textContent = last
        ? `Last event: ${formatTimeOnly(last)}`
        : '';
}

function renderKpi() {
    const k = computeKpis(state.filtered);
    const el = root.querySelector('[data-kpi]');
    const netClass = k.net > 0 ? 'is-pos' : k.net < 0 ? 'is-neg' : '';
    const cells = [
        ['Trades', formatInt(k.count), ''],
        ['Silver', formatSilverCompact(k.total), ''],
        ['Buy', formatSilverCompact(k.buy), ''],
        ['Sell', formatSilverCompact(k.sell), ''],
        ['Net', formatSilverCompact(k.net), netClass],
        ['Qty', formatInt(k.qty), ''],
        ['Avg', formatSilverCompact(k.avg), ''],
        ['Median', formatSilverCompact(k.med), ''],
        ['Today', formatInt(k.today), '']
    ];
    el.innerHTML = cells.map(([label, value, cls]) => `
        <div class="trades-kpi-item">
            <span class="trades-kpi-value ${cls}">${escapeHtml(value)}</span>
            <span class="trades-kpi-label">${escapeHtml(label)}</span>
        </div>
    `).join('');
}

function renderChart() {
    const { grain, rows } = computeSeries(state.filtered);
    root.querySelector('[data-chart-grain]').textContent = grain;
    const host = root.querySelector('[data-chart]');
    if (!rows.length) {
        host.innerHTML = '<div class="trades-empty">Grafik için kayıt yok</div>';
        return;
    }
    const w = 640;
    const h = 150;
    const padL = 8;
    const padR = 8;
    const padT = 8;
    const padB = 22;
    const maxCount = Math.max(...rows.map((r) => r.count), 1);
    const maxSilver = Math.max(...rows.map((r) => r.silver), 1);
    const bw = (w - padL - padR) / rows.length;
    const bars = rows.map((r, i) => {
        const x = padL + i * bw;
        const ch = ((h - padT - padB) * r.count) / maxCount;
        const sh = ((h - padT - padB) * r.silver) / maxSilver;
        const label = grain === 'hour' ? r.key.slice(11) : r.key.slice(5);
        const show = rows.length <= 16 || i % Math.ceil(rows.length / 12) === 0;
        return `
            <rect class="trades-chart-bar" x="${x + bw * 0.08}" y="${h - padB - ch}" width="${bw * 0.38}" height="${ch}" data-tip="${escapeHtml(r.key)} · ${r.count}">
            </rect>
            <rect class="trades-chart-bar is-volume" x="${x + bw * 0.5}" y="${h - padB - sh}" width="${bw * 0.38}" height="${sh}">
            </rect>
            ${show ? `<text class="trades-chart-axis" x="${x + bw / 2}" y="${h - 6}" text-anchor="middle">${escapeHtml(label)}</text>` : ''}
        `;
    }).join('');
    host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Trade zaman serisi">${bars}</svg>`;
}

function renderKinds() {
    const rows = computeKindBreakdown(state.filtered);
    const el = root.querySelector('[data-kinds]');
    el.innerHTML = `<ul class="trades-kind-list">${rows.map((r) => `
        <li>
            <button type="button" data-kind-filter="${escapeHtml(r.kind)}" class="${state.filters.kinds.size === 1 && state.filters.kinds.has(r.kind) ? 'is-active' : ''}">
                <span>${escapeHtml(r.label)}</span>
                <span class="count">${formatInt(r.count)}</span>
            </button>
        </li>
    `).join('')}</ul>`;
    el.querySelectorAll('[data-kind-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const kind = btn.getAttribute('data-kind-filter');
            if (state.filters.kinds.size === 1 && state.filters.kinds.has(kind)) {
                state.filters.kinds = new Set();
            } else {
                state.filters.kinds = new Set([kind]);
            }
            renderFilters();
            recomputeFiltered();
            renderDynamic();
        });
    });
}

function renderActivity() {
    const el = root.querySelector('[data-activity]');
    if (!state.activity.length) {
        el.innerHTML = '<div class="trades-empty">Henüz aktivite yok</div>';
        return;
    }
    el.innerHTML = `<ul class="trades-activity-list">${state.activity.map((t) => `
        <li class="${state.newIds.has(t._uid) ? 'is-new' : ''}" data-uid="${escapeHtml(t._uid)}">
            <span class="time">${escapeHtml(formatTimeOnly(t.occurredAt))}</span>
            <span class="main"><span class="${kindClass(t.kind)}">${escapeHtml(kindLabel(t.kind))}</span>
            · ${escapeHtml(t.cityKey || '—')} · ${escapeHtml(t.itemName || t.itemId || '—')} ×${formatInt(t.quantity)}</span>
            <span class="silver">${escapeHtml(formatSilverCompact(t.totalPriceSilver))}</span>
        </li>
    `).join('')}</ul>`;
    el.querySelectorAll('[data-uid]').forEach((li) => {
        li.addEventListener('click', () => openDetail(li.getAttribute('data-uid')));
    });
}

function renderCities() {
    const rows = computeCityBreakdown(state.filtered);
    const el = root.querySelector('[data-cities]');
    el.innerHTML = `
        <table class="trades-mini-table">
            <thead>
                <tr>
                    <th data-city-sort="city">Şehir</th>
                    <th class="num" data-city-sort="trades">Trade</th>
                    <th class="num" data-city-sort="silver">Silver</th>
                    <th class="num" data-city-sort="qty">Qty</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r) => `
                    <tr data-city-pick="${escapeHtml(r.city)}">
                        <td>${escapeHtml(r.city)}</td>
                        <td class="num">${formatInt(r.trades)}</td>
                        <td class="num">${escapeHtml(formatSilverCompact(r.silver))}</td>
                        <td class="num">${formatInt(r.qty)}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4" class="trades-empty">Kayıt yok</td></tr>'}
            </tbody>
        </table>
    `;
    el.querySelectorAll('[data-city-sort]').forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-city-sort');
            if (state.citySort.key === key) {
                state.citySort.dir = state.citySort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                state.citySort = { key, dir: key === 'city' ? 'asc' : 'desc' };
            }
            renderCities();
        });
    });
    el.querySelectorAll('[data-city-pick]').forEach((tr) => {
        tr.addEventListener('click', () => {
            state.filters.city = tr.getAttribute('data-city-pick');
            renderFilters();
            recomputeFiltered();
            renderDynamic();
        });
    });
}

function renderTopItems() {
    const rows = computeItemBreakdown(state.filtered);
    const el = root.querySelector('[data-top-items]');
    el.innerHTML = `
        <table class="trades-mini-table">
            <thead>
                <tr>
                    <th data-item-sort="item">Item</th>
                    <th class="num" data-item-sort="trades">#</th>
                    <th class="num" data-item-sort="qty">Qty</th>
                    <th class="num" data-item-sort="buy">Buy</th>
                    <th class="num" data-item-sort="sell">Sell</th>
                    <th class="num" data-item-sort="net">Net</th>
                    <th data-item-sort="last">Last</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r) => `
                    <tr data-item-pick="${escapeHtml(r.itemId || r.itemName)}">
                        <td title="${escapeHtml(r.itemId || '')}">${escapeHtml(r.itemName)}</td>
                        <td class="num">${formatInt(r.trades)}</td>
                        <td class="num">${formatInt(r.qty)}</td>
                        <td class="num">${escapeHtml(formatSilverCompact(r.buy))}</td>
                        <td class="num">${escapeHtml(formatSilverCompact(r.sell))}</td>
                        <td class="num">${escapeHtml(formatSilverCompact(r.net))}</td>
                        <td>${escapeHtml(formatDateTime(r.lastAt))}</td>
                    </tr>
                `).join('') || '<tr><td colspan="7" class="trades-empty">Kayıt yok</td></tr>'}
            </tbody>
        </table>
    `;
    el.querySelectorAll('[data-item-sort]').forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-item-sort');
            if (state.itemSort.key === key) {
                state.itemSort.dir = state.itemSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                state.itemSort = { key, dir: key === 'item' ? 'asc' : 'desc' };
            }
            renderTopItems();
        });
    });
    el.querySelectorAll('[data-item-pick]').forEach((tr) => {
        tr.addEventListener('click', () => {
            state.filters.itemQuery = tr.getAttribute('data-item-pick') || '';
            renderFilters();
            recomputeFiltered();
            renderDynamic();
        });
    });
}

function updateSortHeaders() {
    root.querySelectorAll('[data-table-sort]').forEach((th) => {
        const key = th.getAttribute('data-table-sort');
        if (state.tableSort.key === key) {
            th.setAttribute('aria-sort', state.tableSort.dir === 'asc' ? 'ascending' : 'descending');
        } else {
            th.removeAttribute('aria-sort');
        }
    });
}

function renderVirtualRows() {
    const virt = root.querySelector('[data-virt]');
    const inner = root.querySelector('[data-virt-inner]');
    const body = root.querySelector('[data-virt-body]');
    const list = state.filtered;
    root.querySelector('[data-table-meta]').textContent =
        `${formatInt(list.length)} / ${formatInt(state.all.length)}`;
    root.querySelector('[data-filtered-count]').textContent = formatInt(list.length);
    root.querySelector('[data-filter-hint]').textContent = list.length
        ? 'Tablo, KPI ve analizler aynı filtre kümesini kullanır. Satıra tıklayınca detay açılır.'
        : 'Bu filtrelerle eşleşen trade bulunamadı.';

    if (!list.length) {
        inner.style.height = 'auto';
        body.innerHTML = `<tr><td colspan="10"><div class="trades-empty">Bu filtrelerle eşleşen trade bulunamadı.</div></td></tr>`;
        return;
    }

    const totalH = list.length * ROW_H + 28;
    inner.style.height = `${totalH}px`;
    const viewH = virt.clientHeight || 320;
    const scrollTop = virt.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 5);
    const visible = Math.ceil(viewH / ROW_H) + 10;
    const end = Math.min(list.length, start + visible);
    const offsetY = start * ROW_H;

    body.innerHTML = `
        <tr aria-hidden="true"><td colspan="10" style="height:${start * ROW_H}px;padding:0;border:0"></td></tr>
        ${list.slice(start, end).map((t) => `
            <tr data-uid="${escapeHtml(t._uid)}" class="${state.newIds.has(t._uid) ? 'is-new' : ''}">
                <td>${escapeHtml(formatDateTime(t.occurredAt))}</td>
                <td class="${kindClass(t.kind)}">${escapeHtml(kindLabel(t.kind))}</td>
                <td title="${escapeHtml(t.itemId || '')}">${escapeHtml(t.itemName || t.itemId || '—')}</td>
                <td title="${escapeHtml(t.clusterIndex || '')}">${escapeHtml(t.cityKey || '—')}</td>
                <td class="num">${formatInt(t.quantity)}</td>
                <td class="num">${escapeHtml(formatSilverFull(t.unitPriceSilver))}</td>
                <td class="num">${escapeHtml(formatSilverFull(t.totalPriceSilver))}</td>
                <td class="num">${t.taxRate == null ? '—' : escapeHtml(String(t.taxRate))}</td>
                <td class="num">${escapeHtml(formatSilverFull(t.distanceFeeSilver))}</td>
                <td>${escapeHtml(t.counterparty || '—')}</td>
            </tr>
        `).join('')}
        <tr aria-hidden="true"><td colspan="10" style="height:${Math.max(0, (list.length - end) * ROW_H)}px;padding:0;border:0"></td></tr>
    `;
    updateSortHeaders();
}

function openDetail(uid) {
    const trade = state.byId.get(uid);
    if (!trade) return;
    state.selectedId = uid;
    const sheet = root.querySelector('[data-detail-sheet]');
    const rows = [
        ['Trade ID', trade.sourceId],
        ['Date', trade.occurredAt],
        ['Kind', kindLabel(trade.kind)],
        ['Raw Type', trade.rawType],
        ['MailTypeText', trade.rawMailTypeText],
        ['Location', trade.locationName],
        ['Cluster', trade.clusterIndex],
        ['Item ID', trade.itemId],
        ['Item Name', trade.itemName],
        ['Tier', trade.tier],
        ['Enchant', trade.enchant],
        ['Quality', trade.quality],
        ['Quantity', trade.quantity],
        ['Unit Price', formatSilverFull(trade.unitPriceSilver)],
        ['Total', formatSilverFull(trade.totalPriceSilver)],
        ['Tax Rate', trade.taxRate],
        ['Tax Setup', trade.taxSetupRate],
        ['Distance Fee', formatSilverFull(trade.distanceFeeSilver)],
        ['Counterparty', trade.counterparty],
        ['Character GUID', trade.characterGuid],
        ['Order Amount', trade.orderAmount],
        ['Order Total', formatSilverFull(trade.orderTotalSilver)]
    ];
    sheet.innerHTML = `
        <h2>Trade Detayı</h2>
        <dl class="trades-detail-grid">
            ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v == null || v === '' ? '—' : String(v))}</dd>`).join('')}
        </dl>
    `;
    const dialog = root.querySelector('[data-detail-dialog]');
    if (typeof dialog.showModal === 'function') dialog.showModal();
}

function renderError() {
    const el = root.querySelector('[data-trades-error]');
    if (!state.error) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = state.error;
}

function renderDynamic() {
    renderLiveStatus();
    renderError();
    renderKpi();
    renderChart();
    renderKinds();
    renderActivity();
    renderCities();
    renderTopItems();
    renderVirtualRows();
}

function onLiveEvent(detail) {
    if (!detail) return;
    if (detail.type === 'connection') {
        state.live = !!detail.connected;
        if (detail.connected) state.error = null;
        renderLiveStatus();
        return;
    }
    if (detail.type === 'status') {
        return;
    }
    if (detail.type === 'error') {
        state.error = detail.message || 'Trade hub hatası';
        renderError();
        return;
    }
    if (detail.type === 'initial') {
        state.live = true;
        state.error = null;
        state.lastEventAt = detail.at || new Date().toISOString();
        ingestInitial(detail.trades || []);
        renderFilters();
        renderDynamic();
        return;
    }
    if (detail.type === 'added') {
        state.live = true;
        state.error = null;
        state.lastEventAt = detail.at || new Date().toISOString();
        ingestAdded(detail.trades || []);
        renderDynamic();
    }
}

async function bootstrapData() {
    startTradeLive();
    unbindLive = bindTradeLive(onLiveEvent);
    state.live = isTradeLiveConnected();

    // REST snapshot as reliable first paint; SSE initial may also arrive.
    try {
        const snap = await fetchTradeSnapshot();
        if (!state.all.length && Array.isArray(snap.trades)) {
            state.lastEventAt = snap.at;
            ingestInitial(snap.trades);
            renderFilters();
            renderDynamic();
        }
    } catch (error) {
        state.error = error.message || String(error);
        renderError();
    }
}

async function main() {
    root = document.querySelector('[data-trades]');
    if (!root) return;

    showPageLoader('Trade Dashboard yükleniyor…');
    try {
        initNav();
        await initStore();
        recordCurrentToolVisit();
        renderShell();
        renderFilters();
        renderDynamic();
        await bootstrapData();
    } finally {
        hidePageLoader();
    }
}

main();
