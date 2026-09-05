import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { getSettings, saveSettings, SERVERS, ENCHANT_POWERS, enchantPowerLabel } from './settings.js';
import { priceSideToggleHtml } from './price-side.js';
import { feeMetaText } from './market-fees.js';
import { escapeHtml } from './utils.js';

function renderServerOptions(selected) {
    return SERVERS.map((server) => {
        const current = server.id === selected ? ' selected' : '';
        return `<option value="${escapeHtml(server.id)}"${current}>${escapeHtml(server.label)}</option>`;
    }).join('');
}

function renderEnchantPowerOptions(selected) {
    return ENCHANT_POWERS.map((power) => {
        const current = power === selected ? ' selected' : '';
        return `<option value="${power}"${current}>${escapeHtml(enchantPowerLabel(power))}</option>`;
    }).join('');
}

function renderPage(container) {
    const settings = getSettings();

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
            <p class="text-muted settings-note">Sunucu market API’yi seçer. Alım: buy +1 veya sell fiyatı. Satış: sell −1 veya buy fiyatı. Standart ayar Enchanting tablosunda 4.3 / 5.2 / 6.1 gibi aynı IP bandını vurgular (varsayılan 7).</p>
            <p class="settings-status" id="settingsStatus" hidden></p>
        </form>
    `;

    bindPage(container);
}

function selectedSide(container, name, fallback) {
    return container.querySelector(`[data-price-for="${name}"].is-active`)?.dataset.priceSide ?? fallback;
}

function persist(container) {
    const premium = Boolean(container.querySelector('#settingPremium')?.checked);
    saveSettings({
        premium,
        server: container.querySelector('#settingServer')?.value,
        buyPriceSide: selectedSide(container, 'buy', 'buy'),
        sellPriceSide: selectedSide(container, 'sell', 'sell'),
        enchantPower: container.querySelector('#settingEnchantPower')?.value
    });

    const feeNote = container.querySelector('#settingFeeNote');
    if (feeNote) {
        feeNote.textContent = feeMetaText(premium);
    }

    const status = container.querySelector('#settingsStatus');
    if (!status) {
        return;
    }
    status.hidden = false;
    status.textContent = 'Kaydedildi.';
}

function bindPage(container) {
    initFloatingLabels(container);

    container.querySelector('#settingsForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        persist(container);
    });

    container.querySelector('#settingPremium')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingServer')?.addEventListener('change', () => persist(container));
    container.querySelector('#settingEnchantPower')?.addEventListener('change', () => persist(container));

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
}

function init() {
    initNav();
    const container = document.getElementById('settingsPage');
    if (!container) {
        return;
    }
    renderPage(container);
}

init();
