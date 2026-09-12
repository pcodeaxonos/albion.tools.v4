import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import {
    getSettings,
    saveSettings,
    SERVERS,
    PRICE_SOURCES,
    ENCHANT_POWERS,
    enchantPowerLabel,
    cityHasIsland,
    localPriceHost
} from './settings.js';
import { initStore } from './db/store.js';
import { loadActiveCities } from './cities.js';
import { priceSideToggleHtml } from './price-side.js';
import { feeMetaText } from './market-fees.js';
import { escapeHtml } from './utils.js';
import { sessionAdcState } from './pipeline-status.js';
import {
    localDataSummary,
    formatDataBytes,
    downloadLocalData,
    parseLocalDataSnapshot,
    applyLocalData,
    syncWithHub,
    setLocalDataAutoPush,
    fetchHubDataMeta
} from './local-data.js';

const CLIENT_RELEASES = 'https://github.com/ao-data/albiondata-client/releases';

function clientCommand() {
    return `albiondata-client.exe -i ${localPriceHost()}`;
}

let hubPollTimer = 0;

function renderServerOptions(selected) {
    return SERVERS.map((server) => {
        const current = server.id === selected ? ' selected' : '';
        return `<option value="${escapeHtml(server.id)}"${current}>${escapeHtml(server.label)}</option>`;
    }).join('');
}

function renderPriceSourceOptions(selected) {
    return PRICE_SOURCES.map((source) => {
        const current = source.id === selected ? ' selected' : '';
        return `<option value="${escapeHtml(source.id)}"${current}>${escapeHtml(source.label)}</option>`;
    }).join('');
}

function renderEnchantPowerOptions(selected) {
    return ENCHANT_POWERS.map((power) => {
        const current = power === selected ? ' selected' : '';
        return `<option value="${power}"${current}>${escapeHtml(enchantPowerLabel(power))}</option>`;
    }).join('');
}

function renderIslandCityChecks(cities, islandCities) {
    if (cities.length === 0) {
        return '<p class="text-muted settings-note">Şehir listesi yüklenemedi.</p>';
    }

    return `
        <div class="settings-island-grid">
            ${cities.map((city) => {
                const checked = cityHasIsland(city.marketApiName, islandCities) ? ' checked' : '';
                return `
                    <label class="form-check">
                        <input class="form-check-input" type="checkbox"
                            data-island-city="${escapeHtml(city.marketApiName)}"${checked}>
                        <span class="form-check-label">${escapeHtml(city.displayName)}</span>
                    </label>
                `;
            }).join('')}
        </div>
    `;
}

function renderPage(container, cities) {
    const settings = getSettings();
    const packets = settings.priceSource === 'packets';

    container.innerHTML = `
        <section class="settings-hero">
            <h1>Ayarlar</h1>
            <p>Hesap ve sunucu. Tool’lar bunları varsayılan alır; sayfa içinde geçici seçim yapılabilir.</p>
        </section>

        <form class="form-section settings-form" id="settingsForm" action="#">
            <div class="form-grid">
                <label class="form-check">
                    <input class="form-check-input" type="checkbox" id="settingPremium"
                        ${settings.premium ? 'checked' : ''}>
                    <span class="form-check-label">
                        Premium
                        <span class="settings-fee-meta" id="settingFeeNote">${escapeHtml(feeMetaText(settings.premium))}</span>
                    </span>
                </label>
                <label class="form-check">
                    <input class="form-check-input" type="checkbox" id="settingFarmWater"
                        ${settings.farmWater ? 'checked' : ''}>
                    <span class="form-check-label">
                        Ekin sulama
                        <span class="settings-fee-meta">Farming, Pasture yemi ve Ada Planlayıcı. Kapalıysa seed return sulamasız. Varsayılan: sulama yok.</span>
                    </span>
                </label>
                <label class="form-check">
                    <input class="form-check-input" type="checkbox" id="settingRefineFollowSpecialty"
                        ${settings.refineFollowSpecialty ? 'checked' : ''}>
                    <span class="form-check-label">
                        Refine şehri hammaddeyle değişsin
                        <span class="settings-fee-meta">Ore → Thetford, hide → Martlock. Kapalıysa işle şehri senin seçtiğin yerde kalır.</span>
                    </span>
                </label>
                <div class="form-floating">
                    <select class="form-select is-filled" id="settingPriceSource">
                        ${renderPriceSourceOptions(settings.priceSource)}
                    </select>
                    <label for="settingPriceSource">Fiyat kaynağı</label>
                </div>
                <div class="form-floating">
                    <select class="form-select is-filled" id="settingServer">
                        ${renderServerOptions(settings.server)}
                    </select>
                    <label for="settingServer">Sunucu</label>
                </div>
                <div class="form-floating">
                    <select class="form-select is-filled" id="settingEnchantPower">
                        ${renderEnchantPowerOptions(settings.enchantPower)}
                    </select>
                    <label for="settingEnchantPower">Standart ayar</label>
                </div>
            </div>
            <div class="settings-packet" id="settingsPacket" ${packets ? '' : 'hidden'}>
                <p class="settings-packet-status" id="settingsPacketStatus">Yerel hub kontrol ediliyor…</p>
                <p class="settings-packet-copy">Albion Data Client oyun paketlerini çözer ve bu makinedeki huba gönderir. Kısayoldan açılan ADC kamu AODP’ye gider; start.bat client’ı <code>-i http://127.0.0.1:3001</code> ile yeniden açar. ADC konumu Join paketinden öğrenir — zone geçmeden market verisi göndermez. Fiyatı istediğin marketi açman gerekir.</p>
                <div class="settings-command">
                    <code id="settingsClientCommand">${escapeHtml(clientCommand())}</code>
                    <button type="button" class="btn btn-outline-secondary" id="settingsCopyCommand">Kopyala</button>
                </div>
                <p class="settings-packet-links">
                    <a href="${CLIENT_RELEASES}" target="_blank" rel="noreferrer">Client indir</a>
                    <span>· start.bat hem siteyi hem fiyat hub’ını açar</span>
                </p>
            </div>
            <div class="settings-sides">
                <div class="price-side-field">
                    <span class="price-side-label" id="settingBuySideLabel">Alım</span>
                    <div class="price-side" role="radiogroup" aria-labelledby="settingBuySideLabel">
                        ${priceSideToggleHtml('buy', settings.buyPriceSide)}
                    </div>
                </div>
                <div class="price-side-field">
                    <span class="price-side-label" id="settingSellSideLabel">Satış</span>
                    <div class="price-side" role="radiogroup" aria-labelledby="settingSellSideLabel">
                        ${priceSideToggleHtml('sell', settings.sellPriceSide)}
                    </div>
                </div>
            </div>
            <p class="text-muted settings-note" id="settingsNote">${escapeHtml(sourceNote(settings.priceSource))}</p>
            <div class="settings-islands">
                <h2>Ada şehirleri</h2>
                <p class="text-muted settings-island-hint">Ada kurduğun şehirleri işaretle. Boş bırakırsan hepsi ada sayılır — Farming listesi birden silikleşmez. Ada olmayan şehirler silik görünür, yine seçilebilir.</p>
                ${renderIslandCityChecks(cities, settings.islandCities)}
            </div>
            <p class="settings-status" id="settingsStatus" hidden></p>
        </form>

        <section class="settings-data" id="settingsData">
            <h2>Veri</h2>
            <p>Ayarlar, günlük bonuslar, tool tercihleri ve veritabanı tabloları bu tarayıcı origin’inde saklanır. Live Server (:5500) ile yerel sunucu (:3000) ayrı hafızadır.</p>
            <div class="settings-data-actions">
                <button type="button" class="btn btn-outline-primary" id="settingsExportData">Dışa aktar</button>
                <button type="button" class="btn btn-outline-secondary" id="settingsImportData">İçe aktar</button>
                <input type="file" id="settingsImportFile" accept="application/json,.json" hidden>
            </div>
            <p class="settings-data-meta" id="settingsDataMeta">${escapeHtml(localMetaText())}</p>
            <label class="form-check">
                <input class="form-check-input" type="checkbox" id="settingDataSync"
                    ${settings.dataSync ? 'checked' : ''}>
                <span class="form-check-label">
                    Hub ile otomatik eşle
                    <span class="settings-fee-meta">start.bat fiyat hub’ını (:3001) açınca 5500 ve 3000 birleşir. Günlük bonuslar silinmez, tarihe göre toplanır.</span>
                </span>
            </label>
            <p class="settings-packet-status" id="settingsDataSyncStatus">Hub kontrol ediliyor…</p>
            <div class="settings-data-actions">
                <button type="button" class="btn btn-outline-secondary" id="settingsPullData">Hub’dan al</button>
                <button type="button" class="btn btn-outline-secondary" id="settingsPushData">Hub’a gönder</button>
            </div>
            <p class="settings-status" id="settingsDataStatus" hidden></p>
        </section>
    `;

    bindPage(container);
}

function sourceNote(priceSource) {
    if (priceSource === 'packets') {
        return 'Fiyatlar senin gördüğün market paketlerinden gelir. Sunucu seçimi bu kaynakta kullanılmaz. Alım: buy +1 veya sell. Satış: sell −1 veya buy. Standart ayar Enchanting tablosunda aynı IP bandını vurgular.';
    }
    return 'Sunucu market API’yi seçer. Alım: buy +1 veya sell fiyatı. Satış: sell −1 veya buy fiyatı. Standart ayar Enchanting tablosunda 4.3 / 5.2 / 6.1 gibi aynı IP bandını vurgular (varsayılan 7).';
}

function selectedSide(container, name, fallback) {
    return container.querySelector(`[data-price-for="${name}"].is-active`)?.dataset.priceSide ?? fallback;
}

function selectedIslandCities(container) {
    const inputs = [...container.querySelectorAll('[data-island-city]')];
    if (inputs.length === 0) {
        return null;
    }
    return inputs
        .filter((input) => input.checked)
        .map((input) => input.dataset.islandCity)
        .filter(Boolean);
}

function persist(container) {
    const premium = Boolean(container.querySelector('#settingPremium')?.checked);
    const priceSource = container.querySelector('#settingPriceSource')?.value;
    const islandCities = selectedIslandCities(container);
    saveSettings({
        premium,
        farmWater: Boolean(container.querySelector('#settingFarmWater')?.checked),
        priceSource,
        server: container.querySelector('#settingServer')?.value,
        buyPriceSide: selectedSide(container, 'buy', 'buy'),
        sellPriceSide: selectedSide(container, 'sell', 'sell'),
        enchantPower: container.querySelector('#settingEnchantPower')?.value,
        refineFollowSpecialty: Boolean(container.querySelector('#settingRefineFollowSpecialty')?.checked),
        ...(islandCities !== null ? { islandCities } : {})
    });

    const feeNote = container.querySelector('#settingFeeNote');
    if (feeNote) {
        feeNote.textContent = feeMetaText(premium);
    }

    const packet = container.querySelector('#settingsPacket');
    if (packet) {
        packet.hidden = priceSource !== 'packets';
    }

    const note = container.querySelector('#settingsNote');
    if (note) {
        note.textContent = sourceNote(priceSource);
    }

    const status = container.querySelector('#settingsStatus');
    if (status) {
        status.hidden = false;
        status.textContent = 'Kaydedildi.';
    }

    syncHubPolling(container);
}

function localMetaText() {
    const summary = localDataSummary();
    if (summary.keys === 0) {
        return 'Bu origin’de henüz kayıtlı veri yok.';
    }
    return `Bu origin’de ${summary.keys} anahtar · ${formatDataBytes(summary.bytes)}`;
}

function setDataStatus(container, message, kind = 'ok') {
    const status = container.querySelector('#settingsDataStatus');
    if (!status) {
        return;
    }
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('is-error', kind === 'error');
}

function bindPage(container) {
    initFloatingLabels(container);

    container.querySelector('#settingsForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        persist(container);
    });

    container.querySelector('#settingPremium')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingRefineFollowSpecialty')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingPriceSource')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingServer')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingEnchantPower')?.addEventListener('change', () => persist(container));
    container.querySelectorAll('[data-island-city]').forEach((input) => {
        input.addEventListener('change', () => persist(container));
    });

    container.querySelector('#settingsCopyCommand')?.addEventListener('click', async () => {
        const button = container.querySelector('#settingsCopyCommand');
        try {
            await navigator.clipboard.writeText(clientCommand());
            if (button) {
                button.textContent = 'Kopyalandı';
                setTimeout(() => {
                    button.textContent = 'Kopyala';
                }, 1500);
            }
        } catch {
            if (button) {
                button.textContent = 'Kopyalanamadı';
            }
        }
    });

    container.querySelectorAll('[data-price-for]').forEach((button) => {
        button.addEventListener('click', () => {
            const name = button.dataset.priceFor;
            const side = button.dataset.priceSide;
            container.querySelectorAll(`[data-price-for="${name}"]`).forEach((option) => {
                const pressed = option.dataset.priceSide === side;
                option.classList.toggle('is-active', pressed);
                option.setAttribute('aria-pressed', pressed ? 'true' : 'false');
            });
            persist(container);
        });
    });

    bindDataSection(container);
    syncHubPolling(container);
    refreshDataSyncStatus(container);
}

function bindDataSection(container) {
    const fileInput = container.querySelector('#settingsImportFile');

    container.querySelector('#settingsExportData')?.addEventListener('click', () => {
        try {
            downloadLocalData();
            setDataStatus(container, 'JSON indirildi.');
        } catch (error) {
            setDataStatus(container, error.message || 'Dışa aktarılamadı.', 'error');
        }
    });

    container.querySelector('#settingsImportData')?.addEventListener('click', () => {
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) {
            return;
        }
        if (!window.confirm('Bu dosyadaki veri mevcut tarayıcı verisinin üzerine yazılır. Devam edilsin mi?')) {
            return;
        }
        try {
            const snapshot = parseLocalDataSnapshot(await file.text());
            applyLocalData(snapshot);
            if (getSettings().dataSync) {
                await syncWithHub('push').catch(() => {});
            }
            location.reload();
        } catch (error) {
            setDataStatus(container, error.message || 'İçe aktarılamadı.', 'error');
        }
    });

    container.querySelector('#settingDataSync')?.addEventListener('change', async (event) => {
        const enabled = Boolean(event.target.checked);
        saveSettings({ dataSync: enabled });
        setLocalDataAutoPush(enabled);
        if (enabled) {
            try {
                const result = await syncWithHub('auto');
                if (result.status === 'pulled' || result.status === 'merged') {
                    location.reload();
                    return;
                }
                setDataStatus(container, syncResultText(result));
            } catch {
                setDataStatus(container, 'Hub kapalı; eşleme bekleniyor.', 'error');
            }
        } else {
            setDataStatus(container, 'Otomatik eşleme kapalı.');
        }
        refreshDataSyncStatus(container);
    });

    container.querySelector('#settingsPullData')?.addEventListener('click', async () => {
        if (!window.confirm('Hub’daki kayıtlar buradakilerle birleştirilir. Günlük bonuslar silinmez. Devam edilsin mi?')) {
            return;
        }
        try {
            const result = await syncWithHub('pull');
            if (result.status === 'pulled' || result.status === 'merged') {
                location.reload();
                return;
            }
            setDataStatus(container, syncResultText(result));
            refreshDataSyncStatus(container);
        } catch {
            setDataStatus(container, 'Hub kapalı. start.bat çalıştır.', 'error');
            refreshDataSyncStatus(container);
        }
    });

    container.querySelector('#settingsPushData')?.addEventListener('click', async () => {
        try {
            const result = await syncWithHub('push');
            setDataStatus(container, syncResultText(result));
            refreshDataSyncStatus(container);
        } catch {
            setDataStatus(container, 'Hub kapalı. start.bat çalıştır.', 'error');
            refreshDataSyncStatus(container);
        }
    });
}

function syncResultText(result) {
    if (result.status === 'pushed') {
        return 'Hub’a gönderildi.';
    }
    if (result.status === 'pulled') {
        return 'Hub’dan alındı.';
    }
    if (result.status === 'merged') {
        return 'Hub ile birleştirildi.';
    }
    if (result.status === 'empty') {
        return 'Aktarılacak veri yok.';
    }
    return 'Tamam.';
}

async function refreshDataSyncStatus(container) {
    const status = container.querySelector('#settingsDataSyncStatus');
    const metaLine = container.querySelector('#settingsDataMeta');
    if (metaLine) {
        metaLine.textContent = localMetaText();
    }
    if (!status) {
        return;
    }

    if (!getSettings().dataSync) {
        status.classList.remove('is-up', 'is-down');
        status.textContent = 'Otomatik eşleme kapalı. JSON ile taşıyabilir veya kutuyu açabilirsin.';
        return;
    }

    try {
        const meta = await fetchHubDataMeta();
        status.classList.remove('is-down');
        status.classList.add('is-up');
        if (meta.empty) {
            status.textContent = 'Hub açık · henüz ortak kayıt yok. Bu origin’den “Hub’a gönder” veya bir tool kullan.';
            return;
        }
        const when = meta.exportedAt ? relativeTime(meta.exportedAt) : '—';
        const origin = meta.origin ? shortOrigin(meta.origin) : '—';
        status.textContent = `Hub açık · son kayıt ${when} · ${meta.keyCount ?? 0} anahtar · kaynak ${origin}`;
    } catch {
        status.classList.remove('is-up');
        status.classList.add('is-down');
        status.textContent = 'Hub kapalı. start.bat çalışınca Live Server ve :3000 otomatik eşlenir.';
    }
}

function shortOrigin(origin) {
    try {
        const url = new URL(origin);
        return url.port ? `${url.hostname}:${url.port}` : url.host;
    } catch {
        return origin;
    }
}

function syncHubPolling(container) {
    stopHubPolling();
    if (getSettings().priceSource !== 'packets') {
        return;
    }
    refreshHubStatus(container);
    hubPollTimer = window.setInterval(() => refreshHubStatus(container), 4000);
}

function stopHubPolling() {
    if (hubPollTimer) {
        window.clearInterval(hubPollTimer);
        hubPollTimer = 0;
    }
}

async function refreshHubStatus(container) {
    const status = container.querySelector('#settingsPacketStatus');
    if (!status || getSettings().priceSource !== 'packets') {
        return;
    }

    try {
        const response = await fetch(`${localPriceHost()}/api/v2/stats/status`);
        if (!response.ok) {
            throw new Error('bad status');
        }
        const data = await response.json();
        const adc = sessionAdcState(data, true);
        const when = data.sessionMarketAt
            ? relativeTime(data.sessionMarketAt)
            : 'bu oturumda yok';
        const cities = Array.isArray(data.cities) && data.cities.length > 0
            ? data.cities.join(', ')
            : '—';
        status.classList.remove('is-down', 'is-up', 'is-warn');
        if (adc.state === 'ok' || adc.code === 'idle') {
            status.classList.add('is-up');
        } else {
            status.classList.add('is-warn');
        }
        status.textContent = adc.state === 'ok'
            ? `Hub açık · son emir ${when} · ${data.orders ?? 0} sipariş · ${cities}`
            : adc.code === 'idle'
                ? `Hub açık · beklemede · son emir ${when} · ${data.orders ?? 0} sipariş · ${cities}`
                : `${adc.detail}. ${adc.fix || ''}`.trim();
    } catch {
        status.classList.remove('is-up');
        status.classList.add('is-down');
        status.textContent = 'Hub kapalı. start.bat çalıştır, sonra Albion Data Client’ı yukarıdaki komutla aç.';
    }
}

function relativeTime(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
        return iso;
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
    return `${Math.round(minutes / 60)} sa önce`;
}

async function init() {
    initNav();
    const container = document.getElementById('settingsPage');
    if (!container) {
        return;
    }

    let cities = [];
    try {
        await initStore();
        cities = loadActiveCities();
    } catch (error) {
        console.error(error);
    }

    renderPage(container, cities);
    window.addEventListener('pagehide', stopHubPolling);
}

init();
