import { escapeHtml } from './utils.js';
import { SETUP_FEE } from './market-fees.js';

const sessions = new Map();
const TOKEN_CAPS = {
    qty: 'adet',
    price: 'fiyat',
    silver: 'gümüş',
    cost: 'maliyet',
    sell: 'net',
    rr: 'iade',
    pct: 'oran',
    fee: 'kesinti',
    profit: 'kâr',
    factor: 'çarpan',
    city: 'şehir',
    spec: 'uzman',
    bonus: 'bonus',
    focus: 'focus'
};

export function calcExplainShell(id) {
    return `<aside class="calc-explain" id="${escapeHtml(id)}" aria-live="polite"></aside>`;
}

export function explainNum(value, { kind = 'silver', signed = false, tone, cap } = {}) {
    const missing = !Number.isFinite(value);
    let text = '—';
    if (!missing) {
        if (kind === 'pct' || kind === 'rr') {
            text = `${(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
        } else if (kind === 'factor') {
            text = value.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 3
            });
        } else if (kind === 'qty') {
            text = value.toLocaleString('tr-TR');
        } else {
            const amount = Math.round(value);
            text = amount.toLocaleString('tr-TR');
            if (signed && value > 0) {
                text = `+${text}`;
            }
        }
    }

    const cls = tone || kind;
    const profitTone = ((kind === 'profit' || tone === 'profit') && !missing)
        ? (value > 0 ? ' is-profit' : value < 0 ? ' is-loss' : '')
        : '';
    const miss = missing ? ' is-missing' : '';
    const inner = `<span class="calc-explain-n is-${escapeHtml(cls)}${profitTone}${miss}">${escapeHtml(text)}</span>`;
    if (!cap) {
        return inner;
    }
    return `<span class="calc-explain-token is-${escapeHtml(cls)}${profitTone}${miss}">
        <span class="calc-explain-token-cap">${escapeHtml(cap)}</span>
        ${inner}
    </span>`;
}

export function explainOp(symbol) {
    return `<span class="calc-explain-op">${escapeHtml(symbol)}</span>`;
}

export function explainText(text) {
    return `<span class="calc-explain-word">${escapeHtml(text)}</span>`;
}

export function explainBits(parts) {
    return parts.filter(Boolean).join(' ');
}

function formatKindOf(resultKind) {
    if (resultKind === 'rr' || resultKind === 'pct') {
        return 'pct';
    }
    if (resultKind === 'fee') {
        return 'pct';
    }
    if (resultKind === 'factor' || resultKind === 'qty') {
        return resultKind;
    }
    return 'silver';
}

export function explainStep({ icon, label, note, formula, result, resultKind = 'silver', resultCap, signed = false }) {
    const formulaHtml = Array.isArray(formula) ? explainBits(formula) : (formula ?? '');
    const cap = resultCap ?? TOKEN_CAPS[resultKind] ?? TOKEN_CAPS.silver;
    const out = result === undefined
        ? ''
        : `<span class="calc-explain-out">${explainNum(result, {
            kind: formatKindOf(resultKind),
            tone: resultKind,
            cap,
            signed
        })}</span>`;

    return `
        <div class="calc-explain-step">
            <div class="calc-explain-who">
                ${icon ?? ''}
                <div class="calc-explain-who-text">
                    <span class="calc-explain-label">${escapeHtml(label)}</span>
                    ${note ? `<p class="calc-explain-note">${escapeHtml(note)}</p>` : ''}
                </div>
            </div>
            <div class="calc-explain-math">
                ${formulaHtml ? `<span class="calc-explain-formula">${formulaHtml}</span>` : ''}
                ${formulaHtml && out ? explainOp('=') : ''}
                ${out}
            </div>
        </div>
    `;
}

export function explainChips(items) {
    if (!items?.length) {
        return '';
    }
    return `<div class="calc-explain-chips">${items.map((item) => `
        <span class="calc-explain-chip is-${escapeHtml(item.tone || 'city')}"${item.title ? ` title="${escapeHtml(item.title)}"` : ''}>
            <span class="calc-explain-chip-label">${escapeHtml(item.label)}</span>
            ${item.html ?? explainNum(item.value, {
                kind: item.kind ?? 'qty',
                tone: item.tone,
                cap: item.cap ?? TOKEN_CAPS[item.tone] ?? 'bonus'
            })}
        </span>
    `).join('')}</div>`;
}

export function explainFlow(nodes) {
    if (!nodes?.length) {
        return '';
    }
    return `<ol class="calc-explain-flow">${nodes.map((node, index) => `
        ${index ? '<li class="calc-explain-flow-arrow" aria-hidden="true"></li>' : ''}
        <li class="calc-explain-flow-node is-${escapeHtml(node.tone || 'cost')}">
            ${node.icon ?? ''}
            <span class="calc-explain-flow-cap">${escapeHtml(node.label)}</span>
            ${explainNum(node.value, {
                kind: node.kind ?? formatKindOf(node.tone),
                tone: node.tone,
                signed: node.signed
            })}
        </li>
    `).join('')}</ol>`;
}

export function explainSaleSteps({ price, tax, setup, sell, label, icon }) {
    const cut = tax + (setup ? SETUP_FEE : 0);
    const keep = 1 - cut;
    return [
        explainStep({
            icon,
            label: label || 'Satış fiyatı',
            note: 'Piyasada görünen fiyat; henüz vergi düşülmedi',
            result: price,
            resultKind: 'price',
            resultCap: 'satış fiyatı'
        }),
        explainStep({
            label: 'Pazar kesintisi',
            note: setup
                ? 'Satış vergisi + emir komisyonu (setup)'
                : 'Yalnız satış vergisi; anında satışta setup yok',
            formula: setup
                ? [
                    explainNum(tax, { kind: 'pct', tone: 'fee', cap: 'vergi' }),
                    explainOp('+'),
                    explainNum(SETUP_FEE, { kind: 'pct', tone: 'fee', cap: 'setup' })
                ]
                : [explainNum(tax, { kind: 'pct', tone: 'fee', cap: 'vergi' })],
            result: cut,
            resultKind: 'fee',
            resultCap: 'kesinti'
        }),
        explainStep({
            label: 'Cebine kalan',
            note: 'Fiyatın kesinti sonrası kısmı',
            formula: [
                explainNum(price, { tone: 'price', cap: 'fiyat' }),
                explainOp('×'),
                explainNum(keep, { kind: 'pct', tone: 'sell', cap: 'kalan' })
            ],
            result: sell,
            resultKind: 'sell',
            resultCap: 'net satış'
        })
    ];
}

export function explainProfitFoot({ sell, cost, profit, pct }) {
    const outcome = Number.isFinite(profit)
        ? (profit > 0 ? ' is-win' : profit < 0 ? ' is-lose' : '')
        : '';
    return `
        <div class="calc-explain-foot${outcome}">
            <div class="calc-explain-kpi">
                <span class="calc-explain-kpi-label">Cebine kalan</span>
                ${explainNum(sell, { tone: 'sell', cap: 'net satış' })}
            </div>
            <span class="calc-explain-op">−</span>
            <div class="calc-explain-kpi">
                <span class="calc-explain-kpi-label">Üretim maliyeti</span>
                ${explainNum(cost, { tone: 'cost', cap: 'maliyet' })}
            </div>
            <span class="calc-explain-op">=</span>
            <div class="calc-explain-kpi is-main">
                <span class="calc-explain-kpi-label">Sonuç</span>
                ${explainNum(profit, { tone: 'profit', cap: 'kâr / zarar', signed: true })}
            </div>
            <div class="calc-explain-kpi">
                <span class="calc-explain-kpi-label">Maliyete oran</span>
                ${explainNum(pct, { kind: 'pct', tone: 'profit', cap: 'kâr %' })}
            </div>
        </div>
    `;
}

function explainLegendHtml() {
    const items = [
        ['qty', 'adet'],
        ['price', 'fiyat'],
        ['cost', 'maliyet'],
        ['rr', 'iade'],
        ['fee', 'kesinti'],
        ['sell', 'net satış'],
        ['profit', 'kâr']
    ];
    return `<ul class="calc-explain-legend" aria-label="Sayıların anlamı">${items.map(([tone, label]) => `
        <li class="calc-explain-legend-item is-${tone}">${escapeHtml(label)}</li>
    `).join('')}</ul>`;
}

export function explainPanelHtml({ icon, title, hint, flow, groups, footer }) {
    const body = (groups ?? []).map((group) => `
        <li class="calc-explain-group${group.tone ? ` is-${escapeHtml(group.tone)}` : ''}">
            <h4 class="calc-explain-group-title">${escapeHtml(group.title)}</h4>
            ${group.intro ?? ''}
            ${group.lines.join('')}
        </li>
    `).join('');

    return `
        <div class="calc-explain-head">
            ${icon ?? ''}
            <div>
                <h3 class="calc-explain-title">${escapeHtml(title)}</h3>
                ${hint ? `<p class="calc-explain-hint">${escapeHtml(hint)}</p>` : ''}
            </div>
        </div>
        ${explainLegendHtml()}
        ${flow ?? ''}
        <ol class="calc-explain-groups">${body}</ol>
        ${footer ?? ''}
    `;
}

export function explainEmptyHtml(message) {
    return `<p class="calc-explain-empty">${escapeHtml(message)}</p>`;
}

export function explainHint(hovered) {
    return hovered
        ? 'Satırın üzerine gelindi · tıklayınca bu satır kilitlenir'
        : 'Seçili satır · başka satıra gelince formül geçici değişir';
}

export function bindCalcExplain({
    panel,
    table,
    rowKey,
    keys,
    defaultKey,
    render
}) {
    if (!panel || !table) {
        return;
    }

    const id = panel.id || table.className;
    const session = sessions.get(id) ?? { selected: null, hovered: null };
    session.opts = { panel, table, rowKey, keys, defaultKey, render };
    session.paint = () => paint(session);
    sessions.set(id, session);

    table.classList.add('has-explain');
    if (table.dataset.explainBound !== 'on') {
        table.dataset.explainBound = 'on';
        table.addEventListener('pointerover', (event) => {
            const tr = rowFromEvent(table, event);
            if (!tr) {
                return;
            }
            const key = rowKey(tr);
            if (!key || session.hovered === key) {
                return;
            }
            session.hovered = key;
            session.paint();
        });
        table.addEventListener('pointerout', (event) => {
            const next = event.relatedTarget instanceof Element
                ? event.relatedTarget.closest('tbody tr')
                : null;
            if (next && table.contains(next)) {
                return;
            }
            if (session.hovered == null) {
                return;
            }
            session.hovered = null;
            session.paint();
        });
        table.addEventListener('click', (event) => {
            const tr = rowFromEvent(table, event);
            if (!tr) {
                return;
            }
            const key = rowKey(tr);
            if (!key) {
                return;
            }
            session.selected = key;
            session.paint();
        });
    }

    session.paint();
}

export function refreshCalcExplain(panel) {
    if (!panel) {
        return;
    }
    sessions.get(panel.id)?.paint?.();
}

function rowFromEvent(table, event) {
    const tr = event.target instanceof Element ? event.target.closest('tbody tr') : null;
    return tr && table.contains(tr) ? tr : null;
}

function availableKeys(session) {
    try {
        return new Set(session.opts.keys?.() ?? []);
    } catch {
        return new Set();
    }
}

function resolveKey(session) {
    const known = availableKeys(session);
    const hovered = session.hovered && known.has(session.hovered) ? session.hovered : null;
    const selected = session.selected && known.has(session.selected) ? session.selected : null;
    if (hovered) {
        return hovered;
    }
    if (selected) {
        return selected;
    }
    const fallback = session.opts.defaultKey?.() ?? [...known][0] ?? null;
    if (fallback) {
        session.selected = fallback;
    }
    return fallback;
}

function paint(session) {
    const { panel, table, rowKey, render } = session.opts;
    const key = resolveKey(session);
    table.querySelectorAll('tbody tr').forEach((tr) => {
        const id = rowKey(tr);
        tr.classList.toggle('is-explain', Boolean(session.selected) && id === session.selected);
        tr.classList.toggle('is-explain-hover', Boolean(session.hovered) && id === session.hovered);
    });

    if (!key) {
        panel.innerHTML = explainEmptyHtml('Hesaplamak için tabloda bir satıra gelin veya tıklayın.');
        return;
    }

    panel.innerHTML = render(key, { hovered: session.hovered === key });
}
