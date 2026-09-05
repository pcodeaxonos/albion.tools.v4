import { escapeHtml } from './utils.js';
import { placesOrder } from './market-fees.js';

export const PRICE_SIDES = ['buy', 'sell'];

export function normalizePriceSide(value, fallback = 'buy') {
    return value === 'sell' || value === 'buy' ? value : fallback;
}

function isLiveDate(value) {
    return Boolean(value) && !String(value).startsWith('0001');
}

/**
 * @param {'buy' | 'sell'} intent  buy = purchasing, sell = listing/selling
 * Purchase: buy book +1, sell book +0 (instant take).
 * Sale: sell book −1, buy book +0 (instant take).
 */
export function quoteFromRow(row, side, intent) {
    const posting = placesOrder(intent, side);

    if (side === 'buy') {
        if (!row || !(row.buy_price_max > 0)) {
            return null;
        }
        const tick = intent === 'buy' ? 1 : 0;
        return {
            price: row.buy_price_max + tick,
            book: row.buy_price_max,
            date: isLiveDate(row.buy_price_max_date) ? row.buy_price_max_date : null,
            side: 'buy',
            intent,
            tick,
            setup: posting
        };
    }

    if (!row || !(row.sell_price_min > 0)) {
        return null;
    }

    const tick = intent === 'sell' ? -1 : 0;
    return {
        price: Math.max(1, row.sell_price_min + tick),
        book: row.sell_price_min,
        date: isLiveDate(row.sell_price_min_date) ? row.sell_price_min_date : null,
        side: 'sell',
        intent,
        tick,
        setup: posting
    };
}

export function priceSideHint(side, intent) {
    if (intent === 'buy') {
        return side === 'buy' ? 'buy +1' : 'sell';
    }
    return side === 'sell' ? 'sell −1' : 'buy';
}

export function priceFieldClass({ manual, missing }) {
    if (manual) {
        return ' is-manual';
    }
    return missing ? ' is-missing' : '';
}

export function priceFieldTitle({ manual, missing }) {
    return !manual && missing ? 'Fiyat yok — elle girebilirsin' : '';
}

export function priceInputValue(manualRaw, fetchedPrice) {
    if (manualRaw != null) {
        return manualRaw;
    }
    if (!Number.isFinite(fetchedPrice)) {
        return '';
    }
    return Math.round(fetchedPrice).toLocaleString('tr-TR');
}

function setPriceInputDisplay(input, value) {
    const next = value == null ? '' : String(value);
    input.value = next;
    input.classList.toggle('is-filled', next.length > 0);
}

export function applyPriceFieldState(field, { manual, missing, displayValue } = {}) {
    if (!field) {
        return;
    }
    const isManual = Boolean(manual);
    const isMissing = Boolean(missing) && !isManual;
    field.classList.toggle('is-manual', isManual);
    field.classList.toggle('is-missing', isMissing);
    const title = priceFieldTitle({ manual: isManual, missing: isMissing });
    if (title) {
        field.title = title;
    } else {
        field.removeAttribute('title');
    }

    const input = field.querySelector('.form-control');
    if (!input || isManual) {
        return;
    }

    if (displayValue !== undefined) {
        setPriceInputDisplay(input, displayValue);
        return;
    }

    if (isMissing) {
        setPriceInputDisplay(input, '');
    }
}

export function incompleteClass(value) {
    if (value == null || value === '') {
        return ' is-missing';
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return ' is-missing';
    }
    return '';
}

export function priceSideToggleHtml(name, selected) {
    return PRICE_SIDES.map((side) => {
        const pressed = side === selected;
        return `
            <button type="button" class="price-side-btn${pressed ? ' is-active' : ''}"
                data-price-for="${escapeHtml(name)}" data-price-side="${side}"
                aria-pressed="${pressed ? 'true' : 'false'}">
                ${side === 'buy' ? 'Buy' : 'Sell'}
            </button>
        `;
    }).join('');
}
