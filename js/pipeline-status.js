import { escapeHtml } from './utils.js';
import { getSettings, getServer, LOCAL_PRICE_HOST, PRICE_SOURCES } from './settings.js';
import { startPriceLive, noteHubSnapshot, PRICES_EVENT } from './price-live.js';

const ROOT_ID = 'appStatus';
const POLL_MS = 5000;
const HUB_TIMEOUT_MS = 1500;
const API_TIMEOUT_MS = 3500;
const LIVE_MS = 15 * 60 * 1000;
const OPEN_KEY = 'albiontools.v4.statusOpen';
const FRESH_MS = 8000;
const ZONE_FIX = 'Oyunda bir zone geç (şehir kapısı veya teleport). ADC konum almadan market paketi göndermez; sonra Trading Post’u aç.';
const INGEST_FIX = 'ADC kamu AODP’ye gidiyor, :3001’e değil. ADC penceresini kapatıp start.bat çalıştır.';

let pollTimer = 0;
let inFlight = 0;
let lastReport = null;
let freshUntil = 0;
let freshText = '';

function sourceLabel(id) {
    return PRICE_SOURCES.find((source) => source.id === id)?.label ?? id;
}

function relativeTime(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
        return '—';
    }
    const delta = Math.max(0, Date.now() - then);
    const seconds = Math.round(delta / 1000);
    if (seconds < 10) {
        return 'şimdi';
    }
    if (seconds < 60) {
        return `${seconds} sn önce`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} dk önce`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 48) {
        return `${hours} sa önce`;
    }
    return `${Math.round(hours / 24)} gün önce`;
}

function ageMs(iso) {
    const then = Date.parse(iso);
    return Number.isFinite(then) ? Math.max(0, Date.now() - then) : Infinity;
}

async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
            throw new Error(String(response.status));
        }
        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

function step(id, state, title, detail, fix, code = null) {
    return { id, state, title, detail, fix, code };
}

export function sessionAdcState(hub, packets = true) {
    if (!packets) {
        const marketAt = hub?.sessionMarketAt || null;
        if (marketAt && ageMs(marketAt) <= LIVE_MS) {
            return step(
                'adc',
                'ok',
                'Albion Data Client',
                `Canlı · son emir ${relativeTime(marketAt)}`,
                null
            );
        }
        return step(
            'adc',
            'info',
            'Albion Data Client',
            'Paket kaynağı kullanılmıyor',
            null
        );
    }

    const err = 'err';
    if (!hub) {
        return step(
            'adc',
            'err',
            'Albion Data Client',
            'Hub olmadan kontrol edilemez',
            'Önce hub’ı aç.'
        );
    }

    const marketAt = hub.sessionMarketAt || null;
    const clientAt = hub.sessionClientAt || hub.lastPowAt || null;
    const droppedAt = hub.sessionDroppedMarketAt || null;
    const marketAge = ageMs(marketAt);
    const clientAge = ageMs(clientAt);
    const droppedAge = ageMs(droppedAt);
    const cachedOrders = hub.orders ?? 0;
    const unknown = Array.isArray(hub.unknownLocations)
        ? hub.unknownLocations.filter(Boolean)
        : [];

    if (marketAt && marketAge <= LIVE_MS) {
        return step(
            'adc',
            'ok',
            'Albion Data Client',
            `Canlı · son emir ${relativeTime(marketAt)}`,
            null
        );
    }

    if (droppedAt && droppedAge <= LIVE_MS && (!marketAt || droppedAge <= marketAge)) {
        const loc = unknown.length ? ` · ${unknown.slice(-3).join(', ')}` : '';
        return step(
            'adc',
            'warn',
            'Albion Data Client',
            `Market paketi geldi ama şehir yok${loc}`,
            ZONE_FIX,
            'location'
        );
    }

    if (hub.adcProcess === false) {
        const last = marketAt ? ` · son emir ${relativeTime(marketAt)}` : '';
        return step(
            'adc',
            err,
            'Albion Data Client',
            `ADC kapalı${last}`,
            'start.bat ile ADC’yi aç. Zone geç, marketi yenile.',
            'dead'
        );
    }

    if (marketAt) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · son emir ${relativeTime(marketAt)}`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (cachedOrders > 0) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · ${cachedOrders} sipariş önbellekte`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (clientAt && clientAge <= LIVE_MS) {
        return step(
            'adc',
            'info',
            'Albion Data Client',
            `Beklemede · ADC bağlı, bu oturumda emir yok (son sinyal ${relativeTime(clientAt)})`,
            'Marketi açınca taze paket gelir.',
            'idle'
        );
    }

    if (hub.adcProcess === true) {
        return step(
            'adc',
            'warn',
            'Albion Data Client',
            'ADC açık ama hub’a paket düşmedi',
            INGEST_FIX,
            'ingest'
        );
    }

    return step(
        'adc',
        err,
        'Albion Data Client',
        'Hub’a bu oturumda hiç paket düşmemiş',
        'start.bat ADC’yi -i http://127.0.0.1:3001 ile aç. AFM kapalı olsun. Zone geç, marketi aç.',
        'missing'
    );
}

async function probe() {
    const settings = getSettings();
    const packets = settings.priceSource === 'packets';
    const steps = [];

    steps.push(step(
        'source',
        packets ? 'ok' : 'info',
        'Fiyat kaynağı',
        sourceLabel(settings.priceSource),
        packets ? null : 'Paket hattını kullanmak için Ayarlar → Oyundaki paketler.'
    ));

    let hub = null;
    try {
        hub = await fetchJson(`${LOCAL_PRICE_HOST}/api/v2/stats/status`, HUB_TIMEOUT_MS);
        noteHubSnapshot(hub);
        const orders = hub.orders ?? 0;
        const cities = Array.isArray(hub.cities) && hub.cities.length > 0
            ? hub.cities.join(', ')
            : 'şehir yok';
        steps.push(step(
            'hub',
            'ok',
            'Fiyat hub :3001',
            `${orders} sipariş · ${cities}`,
            null
        ));
    } catch {
        steps.push(step(
            'hub',
            'err',
            'Fiyat hub :3001',
            'Kapalı veya yanıt yok',
            'start.bat çalıştır. Hub penceresi açık kalmalı.'
        ));
    }

    if (hub) {
        steps.push(sessionAdcState(hub, packets));
    } else {
        steps.push(sessionAdcState(null, packets));
    }

    if (packets) {
        const hubOk = steps.find((item) => item.id === 'hub')?.state === 'ok';
        const adc = steps.find((item) => item.id === 'adc');
        const adcOk = adc?.state === 'ok';
        if (hubOk && adcOk) {
            steps.push(step('tools', 'ok', 'Tool fiyatları', 'Yerel kitaptan okunuyor', null));
        } else if (hubOk && adc?.code === 'idle') {
            const last = hub?.sessionMarketAt ? relativeTime(hub.sessionMarketAt) : null;
            steps.push(step(
                'tools',
                'info',
                'Tool fiyatları',
                last
                    ? `Önbellekteki fiyatlar kullanılıyor · son emir ${last}`
                    : 'Önbellekteki fiyatlar kullanılıyor',
                'Marketi aç veya eksik fiyatı elle gir.'
            ));
        } else if (hubOk) {
            const cached = (hub?.orders ?? 0) > 0;
            steps.push(step(
                'tools',
                'warn',
                'Tool fiyatları',
                cached
                    ? 'Önbellekteki eski fiyatlar duruyor — taze paket yok'
                    : 'Hub açık, taze emir yok — kırmızı alanlar boş kalır',
                adc?.code === 'location' || adc?.code === 'dead' || adc?.code === 'ingest'
                    ? (adc.fix || ZONE_FIX)
                    : 'Marketi aç veya eksik fiyatı elle gir.'
            ));
        } else {
            steps.push(step(
                'tools',
                'err',
                'Tool fiyatları',
                'Paket kaynağı seçili ama hub yok',
                'start.bat veya Ayarlar’dan AODP API’ye dön.'
            ));
        }
    } else {
        try {
            const host = getServer().host;
            await fetchJson(
                `${host}/api/v2/stats/prices/T4_BAG?locations=Caerleon&qualities=1`,
                API_TIMEOUT_MS
            );
            steps.push(step(
                'api',
                'ok',
                `AODP API (${getServer().label})`,
                'Yanıt var',
                null
            ));
            steps.push(step('tools', 'ok', 'Tool fiyatları', 'AODP API’den okunuyor', null));
        } catch {
            steps.push(step(
                'api',
                'err',
                `AODP API (${getServer().label})`,
                'Yanıt yok',
                'Ağ / sunucu seçimini kontrol et veya paket kaynağına geç.'
            ));
            steps.push(step(
                'tools',
                'err',
                'Tool fiyatları',
                'API kapalı',
                'AODP veya yerel paket hattını düzelt.'
            ));
        }
    }

    const worst = rank(steps);
    return { steps, worst, packets, hub };
}

function rank(steps) {
    if (steps.some((item) => item.state === 'err')) {
        return 'err';
    }
    if (steps.some((item) => item.state === 'warn')) {
        return 'warn';
    }
    if (steps.some((item) => item.code === 'idle')) {
        return 'info';
    }
    return 'ok';
}

function summaryText(report) {
    const blocked = report.steps.find((item) => item.state === 'err')
        ?? report.steps.find((item) => item.state === 'warn')
        ?? report.steps.find((item) => item.code === 'idle');
    if (!blocked) {
        return report.packets ? 'Paket hattı çalışıyor' : 'AODP API çalışıyor';
    }
    if (blocked.code === 'idle') {
        return blocked.detail;
    }
    return blocked.fix ? `${blocked.title}: ${blocked.fix}` : `${blocked.title}: ${blocked.detail}`;
}

function summaryShort(report) {
    const adc = report.steps.find((item) => item.id === 'adc');
    if (adc?.code === 'location') {
        return 'Konum yok';
    }
    if (adc?.code === 'ingest') {
        return 'Yanlış ingest';
    }
    if (adc?.code === 'dead') {
        return 'ADC kapalı';
    }
    if (adc?.code === 'idle') {
        return 'Beklemede';
    }
    if (report.worst === 'ok') {
        return report.packets ? 'Paketler canlı' : 'API canlı';
    }
    if (report.worst === 'warn') {
        return 'Dikkat';
    }
    if (report.worst === 'info') {
        return 'Beklemede';
    }
    return 'Tıkanma';
}

function renderSteps(steps) {
    return `
        <ul class="app-status-steps">
            ${steps.map((item) => `
                <li class="app-status-step is-${item.state}">
                    <span class="app-status-step-mark" aria-hidden="true"></span>
                    <span class="app-status-step-body">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>${escapeHtml(item.detail)}</span>
                        ${item.fix && item.state !== 'ok' ? `<em>${escapeHtml(item.fix)}</em>` : ''}
                    </span>
                </li>
            `).join('')}
        </ul>
    `;
}

function isOpen() {
    return sessionStorage.getItem(OPEN_KEY) === '1';
}

function setOpen(root, open) {
    sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
    root.classList.toggle('is-open', open);
    const toggle = root.querySelector('.app-status-toggle');
    const panel = root.querySelector('.app-status-panel');
    if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (panel) {
        panel.hidden = !open;
    }
}

function paint(root, report) {
    lastReport = report;
    root.dataset.state = report.worst;
    const label = root.querySelector('.app-status-label');
    const hint = root.querySelector('.app-status-hint');
    const panel = root.querySelector('.app-status-panel');
    const fresh = Date.now() < freshUntil;
    root.classList.toggle('is-fresh', fresh);
    if (label) {
        label.textContent = fresh ? freshText : summaryShort(report);
    }
    if (hint) {
        hint.textContent = fresh ? 'Sayfadaki ilgili fiyatlar güncelleniyor' : summaryText(report);
    }
    if (panel) {
        panel.innerHTML = renderSteps(report.steps);
    }
}

function signalFresh(root, detail) {
    const cities = (detail.cities ?? []).join(', ') || 'market';
    const count = detail.items?.length ?? 0;
    freshUntil = Date.now() + FRESH_MS;
    freshText = count ? `Yeni paket · ${cities} · ${count} eşya` : `Yeni paket · ${cities}`;
    if (lastReport) {
        paint(root, lastReport);
    } else {
        root.classList.add('is-fresh');
        const label = root.querySelector('.app-status-label');
        const hint = root.querySelector('.app-status-hint');
        if (label) {
            label.textContent = freshText;
        }
        if (hint) {
            hint.textContent = 'Sayfadaki ilgili fiyatlar güncelleniyor';
        }
    }
    window.setTimeout(() => {
        if (Date.now() >= freshUntil && lastReport) {
            paint(root, lastReport);
        }
    }, FRESH_MS + 50);
}

function syncHeight(root) {
    const toggle = root.querySelector('.app-status-toggle');
    const height = Math.ceil((toggle || root).getBoundingClientRect().height);
    document.documentElement.style.setProperty('--status-bar-height', `${height}px`);
}

function mount(content) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'app-status';
        root.innerHTML = `
            <button type="button" class="app-status-toggle" aria-expanded="false" aria-controls="appStatusPanel">
                <span class="app-status-dot" aria-hidden="true"></span>
                <span class="app-status-copy">
                    <span class="app-status-label">Kontrol ediliyor…</span>
                    <span class="app-status-hint">Hub, ADC, kaynak ve API</span>
                </span>
                <span class="app-status-chevron" aria-hidden="true"></span>
            </button>
            <div class="app-status-panel" id="appStatusPanel" hidden></div>
        `;
        const topbar = content.querySelector('.app-topbar');
        if (topbar) {
            topbar.after(root);
        } else {
            content.prepend(root);
        }
        root.querySelector('.app-status-toggle')?.addEventListener('click', () => {
            setOpen(root, !root.classList.contains('is-open'));
        });
    }

    setOpen(root, isOpen());
    syncHeight(root);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => syncHeight(root)).observe(root);
    }
    return root;
}

async function tick(root) {
    if (inFlight > 0) {
        return;
    }
    inFlight += 1;
    try {
        const report = await probe();
        paint(root, report);
        syncHeight(root);
    } catch (error) {
        console.error(error);
        paint(root, {
            worst: 'err',
            packets: getSettings().priceSource === 'packets',
            steps: [step('probe', 'err', 'Durum', 'Kontrol başarısız', 'Sayfayı yenile.')]
        });
    } finally {
        inFlight -= 1;
    }
}

export function initPipelineStatus() {
    const content = document.querySelector('.app-content');
    if (!content) {
        return;
    }

    const root = mount(content);
    startPriceLive();
    window.addEventListener(PRICES_EVENT, (event) => signalFresh(root, event.detail));
    tick(root);
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => tick(root), POLL_MS);
    window.addEventListener('pagehide', () => window.clearInterval(pollTimer));
}
