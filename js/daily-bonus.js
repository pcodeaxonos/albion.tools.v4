import { escapeHtml } from './utils.js';
import { initNav } from './nav.js';
import { initFloatingLabels } from './forms.js';
import { initStore, getAll, createRow, updateRow, deleteRow } from './db/store.js';
import { getBonusFamilies, getBonusFamilyLabel } from './bonus-families.js';
import { addDays, bonusDayIso, bonusWindowLabel } from './bonus-day.js';
import { bonusCityLabel } from './bonus-cities.js';
import { refreshTodayBonusChip } from './today-bonus.js';
import { showPageLoader, hidePageLoader } from './loader.js';
import { initTableSort, sortHeaderHtml } from './table-sort.js';
import { bindCalcSticky } from './calc-sticky.js';
import { bindLogTableRows } from './log-table.js';
import { showToast } from './toast.js';
import { itemIconHtml } from './item-icon.js';
import { getStandardCombos } from './settings.js';

const TABLE = 'dailyBonuses';

const state = {
    month: toYearMonth(bonusDayIso()),
    editingId: null,
    sort: { key: 'date', direction: 'desc' }
};

function toYearMonth(isoDate) {
    return isoDate.slice(0, 7);
}

function lastDayOfMonth(month) {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(year, monthNum, 0).getDate();
}

function datesForLogMonth(month, recordedDates) {
    const today = bonusDayIso();
    const last = lastDayOfMonth(month);
    const dates = [];
    for (let day = 1; day <= last; day++) {
        const iso = `${month}-${String(day).padStart(2, '0')}`;
        if (iso > today && !recordedDates.has(iso)) {
            continue;
        }
        dates.push(iso);
    }
    return dates;
}

function formatDate(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
}

const BONUS_ANALYSIS_ITEMS = [
    { name: 'Scholar Robe', key: 'ARMOR_CLOTH_SET1', values: [[10428, 6246], [28441, 16479], [71220, 41386], [166004, 96520], [382200, 223640]] },
    { name: 'Cleric Robe', key: 'ARMOR_CLOTH_SET2', values: [[9870, 6349], [26918, 16697], [66115, 40174], [152440, 94028], [348880, 217902]] },
    { name: 'Mage Robe', key: 'ARMOR_CLOTH_SET3', values: [[9112, 6308], [24006, 16194], [58904, 38236], [139680, 89210], [320540, 207780]] }
];
const ANALYSIS_TIERS = [4, 5, 6, 7, 8];

function analysisDefaultTiers() {
    const tiers = [...new Set(getStandardCombos()
        .map((combo) => Number(combo.tier))
        .filter((tier) => ANALYSIS_TIERS.includes(tier)))];
    return tiers.length ? tiers : [4, 5, 6];
}

function number(value) {
    return new Intl.NumberFormat('tr-TR').format(value);
}

function renderAnalysisCard(item, tier, rank) {
    const [market, material] = item.values[tier - 4];
    const profit = market - material;
    const percent = Math.round((profit / material) * 100);
    const materialCount = 2 ** (tier + 1);
    return `
        <article class="bonus-analysis-card">
            <div class="bonus-analysis-card-main">
                <span class="bonus-analysis-rank">${rank}</span>
                <div class="bonus-analysis-icon">${itemIconHtml(`T${tier}_${item.key}`, { size: 64, className: 'item-icon' })}</div>
                <div class="bonus-analysis-item-copy"><h3>${escapeHtml(item.name)}</h3><p>Cloth Robe</p></div>
                <dl class="bonus-analysis-prices">
                    <div><dt>BM Fiyatı</dt><dd>${number(market)}</dd></div>
                    <div class="is-profit"><dt>Kâr / Adet</dt><dd>+${number(profit)} <small>(%${percent})</small></dd></div>
                </dl>
            </div>
            <div class="bonus-analysis-material"><div><span>Hammadde Maliyeti</span><strong>${number(material)}</strong></div><div><span>Gerekli Hammadde</span><strong>T${tier} Cloth · ${number(materialCount)}</strong></div></div>
        </article>`;
}

function renderTierColumn(tier) {
    return `
        <section class="bonus-analysis-tier-column is-tier-${tier}" data-analysis-tier="${tier}">
            <header><strong>T${tier}</strong><span>En Kârlı 3 Item</span></header>
            <div>${BONUS_ANALYSIS_ITEMS.map((item, index) => renderAnalysisCard(item, tier, index + 1)).join('')}</div>
        </section>`;
}

function renderBonusAnalysisDialog() {
    const defaultTiers = analysisDefaultTiers();
    return `
        <button type="button" class="app-dialog-close" aria-label="Kapat" data-analysis-close></button>
        <div class="bonus-analysis-sheet">
            <header class="bonus-analysis-head">
                <div><p class="bonus-analysis-eyebrow">GÜNLÜK CRAFT BONUS ANALİZİ</p><h2>Cloth Robe <span>· ${formatDate(bonusDayIso())}</span></h2><p>Artifactsiz ilk üç item için Black Market fiyatına göre en kârlı seçenekler.</p></div>
                <button type="button" class="btn btn-primary bonus-analysis-refresh" data-analysis-refresh>↻ Fiyatları Yenile</button>
            </header>
            <section class="bonus-analysis-controls" aria-label="Analiz filtreleri">
                <div class="bonus-analysis-select"><span>Bonus grubu</span><strong>Cloth Robe</strong><small>Fort Sterling</small></div>
                <div class="bonus-analysis-select"><span>Market</span><strong>Black Market</strong><small>Satış fiyatı</small></div>
                <div class="bonus-analysis-tiers" role="group" aria-label="Tier seçimi">
                    ${ANALYSIS_TIERS.map((tier) => `<button type="button" class="is-tier-${tier}${defaultTiers.includes(tier) ? ' is-active' : ''}" data-analysis-filter="${tier}">T${tier}</button>`).join('')}
                    <button type="button" data-analysis-filter="all">Tüm Tierlar</button>
                </div>
            </section>
            <div class="bonus-analysis-note">Her tier için, bonus grubundaki en kârlı üç normal item gösterilir. Kâr = Black Market fiyatı − hammadde maliyeti.</div>
            <section class="bonus-analysis-grid" id="bonusAnalysisGrid">
                ${ANALYSIS_TIERS.map(renderTierColumn).join('')}
            </section>
            <footer class="bonus-analysis-foot"><span>Son güncelleme: Tasarım önizlemesi</span><span>Öncelikli tierlar: T4 · T5 · T6</span></footer>
        </div>`;
}

function openBonusAnalysis(container) {
    let dialog = container.querySelector('#bonusAnalysisDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'bonusAnalysisDialog';
        dialog.className = 'app-dialog bonus-analysis-dialog';
        container.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    }
    dialog.innerHTML = renderBonusAnalysisDialog();
    dialog.querySelector('[data-analysis-close]')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-analysis-refresh]')?.addEventListener('click', (event) => {
        event.currentTarget.textContent = '✓ Fiyatlar Güncel';
        window.setTimeout(() => { event.currentTarget.textContent = '↻ Fiyatları Yenile'; }, 1300);
    });
    const filterButtons = [...dialog.querySelectorAll('[data-analysis-filter]')];
    const applyTierFilters = () => {
        const showAll = dialog.querySelector('[data-analysis-filter="all"]')?.classList.contains('is-active');
        const selected = new Set(filterButtons
            .filter((button) => button.dataset.analysisFilter !== 'all' && button.classList.contains('is-active'))
            .map((button) => button.dataset.analysisFilter));
        dialog.querySelectorAll('[data-analysis-tier]').forEach((column) => {
            column.hidden = !showAll && !selected.has(column.dataset.analysisTier);
        });
    };
    filterButtons.forEach((button) => button.addEventListener('click', () => {
        if (button.dataset.analysisFilter === 'all') {
            if (button.classList.contains('is-active')) {
                return;
            }
            button.classList.add('is-active');
            filterButtons.filter((el) => el.dataset.analysisFilter !== 'all').forEach((el) => el.classList.remove('is-active'));
        } else {
            const allButton = dialog.querySelector('[data-analysis-filter="all"]');
            if (allButton?.classList.contains('is-active')) {
                allButton.classList.remove('is-active');
                button.classList.add('is-active');
                applyTierFilters();
                return;
            }
            const selectedTierButtons = filterButtons.filter((el) =>
                el.dataset.analysisFilter !== 'all' && el.classList.contains('is-active')
            );
            if (button.classList.contains('is-active') && selectedTierButtons.length === 1) {
                allButton?.classList.add('is-active');
                selectedTierButtons.forEach((el) => el.classList.remove('is-active'));
                applyTierFilters();
                return;
            }
            button.classList.toggle('is-active');
        }
        applyTierFilters();
    }));
    applyTierFilters();
    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        dialog.setAttribute('open', '');
    }
}

function rowsForMonth(month) {
    return getAll(TABLE)
        .filter((row) => toYearMonth(row.date) === month)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function runningCount(monthRows, throughDate, slotKey, familyKey) {
    return monthRows.filter((row) =>
        row.date <= throughDate && row[slotKey] === familyKey
    ).length;
}

function renderFamilyOptions(selected) {
    const { grouped } = getBonusFamilies();
    const groups = [];

    groups.push(`<option value="">Seçin</option>`);

    for (const [group, families] of grouped) {
        const options = families.map((family) => {
            const isSelected = family.key === selected ? ' selected' : '';
            return `<option value="${escapeHtml(family.key)}"${isSelected}>${escapeHtml(family.label)}</option>`;
        }).join('');
        groups.push(`<optgroup label="${escapeHtml(group)}">${options}</optgroup>`);
    }

    return groups.join('');
}

function renderRateOptions(selected) {
    return ['10', '20'].map((rate) => {
        const isSelected = String(selected) === rate ? ' selected' : '';
        return `<option value="${rate}"${isSelected}>${rate}%</option>`;
    }).join('');
}

function findByDate(date) {
    return getAll(TABLE).find((row) => row.date === date) ?? null;
}

function todayEntryPrompt(today) {
    return `Veri gir: ${bonusWindowLabel(today)} için günlük bonus kaydı yok. İki bonusu seçip kaydet.`;
}

function promptTodayIfMissing(container) {
    const today = bonusDayIso();
    if (findByDate(today) || toYearMonth(today) !== state.month) {
        return;
    }

    fillForm(container, null, today);
    setFormMessage(container, todayEntryPrompt(today));
    container.querySelector('#bonusForm')?.scrollIntoView({ block: 'nearest' });
    container.querySelector('#slot1FamilyKey')?.focus();
}

function setFormMessage(container, text, kind = 'info') {
    const el = container.querySelector('#bonusFormMessage');
    if (!el) {
        return;
    }

    if (!text) {
        el.hidden = true;
        el.textContent = '';
        el.className = 'alert alert-info';
        return;
    }

    el.hidden = false;
    el.textContent = text;
    el.className = kind === 'error' ? 'alert alert-info' : 'alert alert-info';
}

function updateRepeatPreview(container) {
    const date = container.querySelector('#bonusDate')?.value;
    const slot1 = container.querySelector('#slot1FamilyKey')?.value;
    const slot2 = container.querySelector('#slot2FamilyKey')?.value;
    const preview = container.querySelector('#bonusRepeatPreview');

    if (!preview) {
        return;
    }

    const windowHtml = date
        ? `<span class="bonus-window">${escapeHtml(bonusWindowLabel(date))}</span>`
        : '';

    if (!date || !slot1 || !slot2) {
        preview.innerHTML = windowHtml
            ? `${windowHtml}<span class="text-muted">Bonusları seçince bu ayki #1 / #2 sayıları görünür.</span>`
            : '<span class="text-muted">Bonusları seçince bu ayki #1 / #2 sayıları görünür.</span>';
        return;
    }

    const month = toYearMonth(date);
    const monthRows = rowsForMonth(month).filter((row) => row.id !== state.editingId);
    const count1 = runningCount(monthRows, date, 'slot1FamilyKey', slot1) + 1;
    const count2 = runningCount(monthRows, date, 'slot2FamilyKey', slot2) + 1;

    preview.innerHTML = `
        ${windowHtml}
        <span><strong>#1</strong> ${escapeHtml(getBonusFamilyLabel(slot1))} · ${count1}</span>
        <span><strong>#2</strong> ${escapeHtml(getBonusFamilyLabel(slot2))} · ${count2}</span>
        <span class="text-muted">${escapeHtml(month)} içinde</span>
    `;
}

function fillForm(container, row, presetDate = null) {
    const dateInput = container.querySelector('#bonusDate');
    const slot1 = container.querySelector('#slot1FamilyKey');
    const rate1 = container.querySelector('#slot1Rate');
    const slot2 = container.querySelector('#slot2FamilyKey');
    const rate2 = container.querySelector('#slot2Rate');
    const submit = container.querySelector('#bonusSubmit');
    const cancel = container.querySelector('#bonusCancelEdit');
    const remove = container.querySelector('#bonusDelete');

    if (row) {
        state.editingId = row.id;
        dateInput.value = row.date;
        slot1.value = row.slot1FamilyKey;
        rate1.value = String(row.slot1Rate);
        slot2.value = row.slot2FamilyKey;
        rate2.value = String(row.slot2Rate);
        submit.textContent = 'Güncelle';
        cancel.hidden = false;
        remove.hidden = false;
    } else {
        state.editingId = null;
        dateInput.value = presetDate || dateInput.value || bonusDayIso();
        slot1.value = '';
        rate1.value = '10';
        slot2.value = '';
        rate2.value = '10';
        submit.textContent = 'Kaydet';
        cancel.hidden = true;
        remove.hidden = true;
    }

    initFloatingLabels(container);
    updateRepeatPreview(container);
    updateLogHighlights(container);
}

function selectedFamilyKeys(container) {
    return [...new Set(
        ['#slot1FamilyKey', '#slot2FamilyKey']
            .map((selector) => container.querySelector(selector)?.value)
            .filter(Boolean)
    )];
}

function logRowClasses(row, highlightKeys) {
    const classes = [];
    if (state.editingId === row.id) {
        classes.push('is-editing');
    }

    const match1 = highlightKeys.includes(row.slot1FamilyKey);
    const match2 = highlightKeys.includes(row.slot2FamilyKey);
    if (match1 || match2) {
        classes.push('is-bonus-match');
    }
    if (highlightKeys.length > 1 && match1 && match2) {
        classes.push('is-bonus-match-both');
    }

    return classes.length ? ` class="${classes.join(' ')}"` : '';
}

function familyCell(familyKey, highlightKeys) {
    const hit = highlightKeys.includes(familyKey) ? ' is-bonus-hit' : '';
    const city = bonusCityLabel(familyKey);
    const cityHtml = city
        ? `<span class="bonus-log-city">${escapeHtml(city)}</span>`
        : '';
    return `<td class="bonus-log-family${hit}" data-family-key="${escapeHtml(familyKey)}"><span class="bonus-log-family-main"><span class="bonus-log-family-name">${escapeHtml(getBonusFamilyLabel(familyKey))}</span></span>${cityHtml}</td>`;
}

function updateLogHighlights(container) {
    const table = container.querySelector('.bonus-log-table');
    if (!table) {
        return;
    }

    const keys = selectedFamilyKeys(container);
    table.classList.toggle('is-filtering', keys.length > 0);

    table.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
        const match1 = keys.includes(tr.dataset.slot1);
        const match2 = keys.includes(tr.dataset.slot2);
        tr.classList.toggle('is-editing', String(state.editingId) === tr.dataset.id);
        tr.classList.toggle('is-bonus-match', match1 || match2);
        tr.classList.toggle('is-bonus-match-both', keys.length > 1 && match1 && match2);
        tr.querySelectorAll('[data-family-key]').forEach((td) => {
            td.classList.toggle('is-bonus-hit', keys.includes(td.dataset.familyKey));
        });
    });
}

function refreshLog(container) {
    const log = container.querySelector('#bonusLog');
    if (!log) {
        return;
    }

    log.innerHTML = renderLogTable(state.month, selectedFamilyKeys(container));
    bindLogRows(container);
    bindLogSort(container);
    bindCalcSticky(container);
}

function bindLogSort(container) {
    const table = container.querySelector('.bonus-log-table');
    if (!table) {
        return;
    }

    initTableSort(table, {
        initial: state.sort,
        onSort({ key, direction }) {
            state.sort = { key, direction };
        }
    });
}

function renderGapRow(date) {
    return `
        <tr class="is-gap" data-date="${escapeHtml(date)}" title="Kayıt yok">
            <td class="text-nowrap" data-sort-value="${escapeHtml(date)}" title="${escapeHtml(bonusWindowLabel(date))}">${escapeHtml(formatDate(date))}</td>
            <td></td>
            <td class="num"></td>
            <td class="num"></td>
            <td></td>
            <td class="num"></td>
            <td class="num"></td>
        </tr>
    `;
}

function renderLogTable(month, highlightKeys = []) {
    const rows = rowsForMonth(month);
    const byDate = new Map();
    for (const row of rows) {
        const list = byDate.get(row.date) ?? [];
        list.push(row);
        byDate.set(row.date, list);
    }

    const dates = datesForLogMonth(month, byDate);

    if (dates.length === 0) {
        return `
            <div class="alert alert-info">
                ${escapeHtml(month)} için gösterilecek gün yok.
            </div>
        `;
    }

    const emptyMonthNote = rows.length === 0 && getAll(TABLE).length > 0
        ? `<div class="alert alert-info">Bu ayda kayıtlı bonus yok. Günlük bonus oyundan çekilmez; buraya sen yazarsın. Kayıtlı günler için ay seçiciden başka aya geç.</div>`
        : '';

    const filtering = highlightKeys.length > 0 ? ' is-filtering' : '';
    const sort = state.sort;
    const body = dates.slice().reverse().flatMap((date) => {
        const records = byDate.get(date);
        if (!records) {
            return [renderGapRow(date)];
        }

        return records.map((row) => {
            const count1 = runningCount(rows, row.date, 'slot1FamilyKey', row.slot1FamilyKey);
            const count2 = runningCount(rows, row.date, 'slot2FamilyKey', row.slot2FamilyKey);

            return `
            <tr data-id="${row.id}" data-slot1="${escapeHtml(row.slot1FamilyKey)}" data-slot2="${escapeHtml(row.slot2FamilyKey)}"${logRowClasses(row, highlightKeys)}>
                <td class="text-nowrap" data-sort-value="${escapeHtml(row.date)}" title="${escapeHtml(bonusWindowLabel(row.date))}">${escapeHtml(formatDate(row.date))}</td>
                ${familyCell(row.slot1FamilyKey, highlightKeys)}
                <td class="num" data-sort-value="${escapeHtml(String(row.slot1Rate))}">${escapeHtml(String(row.slot1Rate))}%</td>
                <td class="num" data-sort-value="${count1}">${count1}</td>
                ${familyCell(row.slot2FamilyKey, highlightKeys)}
                <td class="num" data-sort-value="${escapeHtml(String(row.slot2Rate))}">${escapeHtml(String(row.slot2Rate))}%</td>
                <td class="num" data-sort-value="${count2}">${count2}</td>
            </tr>
        `;
        });
    }).join('');

    return `
        ${emptyMonthNote}
        <div class="table-responsive calc-table-wrap">
            <table class="table table-striped log-table bonus-log-table calc-table${filtering}">
                <thead>
                    <tr>
                        ${sortHeaderHtml('Tarih', { key: 'date', type: 'date', direction: sort.key === 'date' ? sort.direction : null, title: 'Bonus günü (13:00 – ertesi 13:00)' })}
                        ${sortHeaderHtml('Bonus 1', { key: 'slot1', type: 'text', direction: sort.key === 'slot1' ? sort.direction : null, title: 'İlk günlük craft bonusu' })}
                        ${sortHeaderHtml('%', { key: 'rate1', type: 'number', className: 'num', direction: sort.key === 'rate1' ? sort.direction : null, title: 'İlk bonusun oranı' })}
                        ${sortHeaderHtml('#1', { key: 'count1', type: 'number', className: 'num', direction: sort.key === 'count1' ? sort.direction : null, title: 'Bu ayda 1. bonusun kaçıncı gelişi' })}
                        ${sortHeaderHtml('Bonus 2', { key: 'slot2', type: 'text', direction: sort.key === 'slot2' ? sort.direction : null, title: 'İkinci günlük craft bonusu' })}
                        ${sortHeaderHtml('%', { key: 'rate2', type: 'number', className: 'num', direction: sort.key === 'rate2' ? sort.direction : null, title: 'İkinci bonusun oranı' })}
                        ${sortHeaderHtml('#2', { key: 'count2', type: 'number', className: 'num', direction: sort.key === 'count2' ? sort.direction : null, title: 'Bu ayda 2. bonusun kaçıncı gelişi' })}
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
        <p class="text-muted bonus-log-hint">Tarih, 13:00’te başlayan günü gösterir (ör. 23.08 → 23.08 13:00 – 24.08 13:00). #1 ve #2, seçilen ayda aynı bonusun o güne kadar kaç kez geldiğini gösterir. Bonus seçince o ailenin geçtiği günler işaretlenir.</p>
    `;
}

function renderPage(container) {
    const families = getBonusFamilies().families;
    const monthInput = state.month;
    const today = bonusDayIso();
    const defaultDate = toYearMonth(today) === state.month ? today : `${state.month}-01`;

    container.innerHTML = `
        <section class="bonus-hero">
            <div class="bonus-hero-head"><h1>Günlük Bonus</h1><button type="button" class="bonus-analysis-trigger" id="openBonusAnalysis"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V5m0 14h16M7 15l3-3 3 2 5-6"/><path d="M15 8h3v3"/></svg><span>Craft Analizi</span></button></div>
            <p>Her gün iki craft / refine bonusu. Gün 13:00’te yenilenir. Oyun API’sinden gelmez; buraya kaydedilir. Unutulan günler boş bırakılabilir.</p>
        </section>

        <div class="tool-split">
            <div class="tool-split-controls">
                <div class="bonus-toolbar">
                    <div class="form-floating bonus-month-field">
                        <input type="month" class="form-control is-filled" id="bonusMonth" value="${escapeHtml(monthInput)}" placeholder=" ">
                        <label for="bonusMonth">Ay</label>
                    </div>
                    <p class="text-muted bonus-toolbar-note">Seçenekler eşya aileleridir (Sword, Hide, Bag) — tekil T4 Broadsword değil.</p>
                </div>
                ${families.length === 0
                    ? '<div class="alert alert-info">Bonus aileleri yüklenemedi. Veritabanında itemCategories olmalı.</div>'
                    : `
                <form class="form-section bonus-form" id="bonusForm">
                    <div class="alert alert-info" id="bonusFormMessage" hidden></div>
                    <div class="form-grid">
                        <div class="form-floating">
                            <input type="date" class="form-control is-filled" id="bonusDate" name="date" value="${escapeHtml(defaultDate)}" max="${escapeHtml(today)}" placeholder=" " required>
                            <label for="bonusDate">Tarih</label>
                        </div>
                        <div class="bonus-repeat" id="bonusRepeatPreview"></div>
                        <div class="bonus-slots">
                            <div class="form-floating bonus-slot-family">
                                <select class="form-select" id="slot1FamilyKey" name="slot1FamilyKey" required>
                                    ${renderFamilyOptions('')}
                                </select>
                                <label for="slot1FamilyKey">Bonus 1</label>
                            </div>
                            <div class="form-floating bonus-slot-family">
                                <select class="form-select" id="slot2FamilyKey" name="slot2FamilyKey" required>
                                    ${renderFamilyOptions('')}
                                </select>
                                <label for="slot2FamilyKey">Bonus 2</label>
                            </div>
                            <div class="form-floating bonus-slot-rate">
                                <select class="form-select" id="slot1Rate" name="slot1Rate" required>
                                    ${renderRateOptions('10')}
                                </select>
                                <label for="slot1Rate">Oran 1</label>
                            </div>
                            <div class="form-floating bonus-slot-rate">
                                <select class="form-select" id="slot2Rate" name="slot2Rate" required>
                                    ${renderRateOptions('10')}
                                </select>
                                <label for="slot2Rate">Oran 2</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" id="bonusSubmit">Kaydet</button>
                        <button type="button" class="btn btn-outline-secondary" id="bonusCancelEdit" hidden>Vazgeç</button>
                        <button type="button" class="btn btn-outline-danger" id="bonusDelete" hidden>Sil</button>
                    </div>
                </form>
                `}
            </div>
            <section class="tool-split-result bonus-log" id="bonusLog">${renderLogTable(state.month)}</section>
        </div>
    `;

    bindPage(container);
    fillForm(container, null);
    promptTodayIfMissing(container);
    bindCalcSticky(container);
}

function bindPage(container) {
    initFloatingLabels(container);

    container.querySelector('#openBonusAnalysis')?.addEventListener('click', () => openBonusAnalysis(container));

    container.querySelector('#bonusMonth')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) {
            return;
        }
        state.month = value;
        state.editingId = null;
        renderPage(container);
    });

    container.querySelector('#bonusDate')?.addEventListener('change', () => {
        const date = container.querySelector('#bonusDate')?.value;
        if (date) {
            const existing = findByDate(date);
            if (existing && existing.id !== state.editingId) {
                fillForm(container, existing);
                setFormMessage(container, 'Bu tarihte kayıt var — güncellenecek.');
                return;
            }
        }
        updateRepeatPreview(container);
    });

    ['slot1FamilyKey', 'slot2FamilyKey'].forEach((id) => {
        container.querySelector(`#${id}`)?.addEventListener('change', () => {
            updateRepeatPreview(container);
            updateLogHighlights(container);
        });
    });

    container.querySelector('#bonusForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveEntry(container);
    });

    container.querySelector('#bonusCancelEdit')?.addEventListener('click', () => {
        setFormMessage(container, '');
        fillForm(container, null);
        refreshLog(container);
        promptTodayIfMissing(container);
    });

    container.querySelector('#bonusDelete')?.addEventListener('click', () => {
        if (!state.editingId) {
            return;
        }
        deleteRow(TABLE, state.editingId);
        showToast('Kayıt silindi.');
        fillForm(container, null);
        refreshLog(container);
        refreshTodayBonusChip();
        promptTodayIfMissing(container);
    });

    bindLogRows(container);
    bindLogSort(container);
}

function bindLogRows(container) {
    bindLogTableRows(container, (id) => {
        const record = getAll(TABLE).find((item) => String(item.id) === id);
        if (!record) {
            return;
        }
        fillForm(container, record);
        setFormMessage(container, '');
        refreshLog(container);
    });

    container.querySelectorAll('.bonus-log-table tbody tr.is-gap[data-date]').forEach((row) => {
        row.addEventListener('click', () => {
            const date = row.dataset.date;
            fillForm(container, null, date);
            setFormMessage(container, '');
            refreshLog(container);
            container.querySelector(`.bonus-log-table tbody tr.is-gap[data-date="${date}"]`)?.classList.add('is-editing');
        });
    });
}

function saveEntry(container) {
    const date = container.querySelector('#bonusDate').value;
    const slot1FamilyKey = container.querySelector('#slot1FamilyKey').value;
    const slot1Rate = container.querySelector('#slot1Rate').value;
    const slot2FamilyKey = container.querySelector('#slot2FamilyKey').value;
    const slot2Rate = container.querySelector('#slot2Rate').value;

    if (!date || !slot1FamilyKey || !slot2FamilyKey || !slot1Rate || !slot2Rate) {
        showToast('Tarih, iki bonus ve iki oran gerekli.', { kind: 'error' });
        return;
    }

    if (slot1FamilyKey === slot2FamilyKey) {
        showToast('İki slot aynı bonus ailesi olamaz.', { kind: 'error' });
        return;
    }

    const payload = new FormData();
    payload.set('date', date);
    payload.set('slot1FamilyKey', slot1FamilyKey);
    payload.set('slot1Rate', slot1Rate);
    payload.set('slot2FamilyKey', slot2FamilyKey);
    payload.set('slot2Rate', slot2Rate);

    const existing = findByDate(date);
    const targetId = state.editingId ?? existing?.id;

    if (targetId) {
        const current = getAll(TABLE).find((row) => row.id === targetId);
        if (current && current.date !== date && existing) {
            showToast('Bu tarihte zaten başka bir kayıt var.', { kind: 'error' });
            return;
        }
        updateRow(TABLE, targetId, payload);
        showToast('Kayıt güncellendi.');
    } else {
        createRow(TABLE, payload);
        showToast('Kayıt eklendi.');
    }

    state.month = toYearMonth(date);
    const next = addDays(date, 1);
    state.editingId = null;

    const monthInput = container.querySelector('#bonusMonth');
    if (monthInput) {
        monthInput.value = state.month;
    }

    fillForm(container, null);

    const dateInput = container.querySelector('#bonusDate');
    if (dateInput && !findByDate(next) && toYearMonth(next) === state.month && next <= bonusDayIso()) {
        dateInput.value = next;
    }

    initFloatingLabels(container);
    updateRepeatPreview(container);
    refreshLog(container);
    refreshTodayBonusChip();
}

async function init() {
    initNav();
    const container = document.getElementById('dailyBonus');
    if (!container) {
        return;
    }

    showPageLoader('Günlük bonus yükleniyor…');

    try {
        await initStore();
        state.month = toYearMonth(bonusDayIso());
        renderPage(container);
    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="alert alert-info">Günlük bonus yüklenemedi. Sayfayı bir static server ile açın.</div>';
    } finally {
        hidePageLoader();
    }
}

init();
