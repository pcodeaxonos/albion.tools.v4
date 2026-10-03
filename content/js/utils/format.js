const DEFAULT_LOCALE = 'tr-TR';

export function formatSilver(value, {
    unsigned = false,
    digits = 0,
    signed = false,
    rounding = 'math'
} = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }

    const amount = unsigned ? Math.abs(value) : value;
    const displayAmount = rounding === 'math' && digits === 0 ? Math.round(amount) : amount;
    let text = displayAmount.toLocaleString(DEFAULT_LOCALE, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits > 0 && Math.abs(amount) < 10
            ? Math.min(digits, 1)
            : 0
    });

    if (signed && value > 0) {
        text = `+${text}`;
    }
    return text;
}

export function formatPct(ratio, {
    unsigned = false,
    digits = 1,
    rounding = 'locale'
} = {}) {
    if (!Number.isFinite(ratio)) {
        return '—';
    }

    const amount = unsigned ? Math.abs(ratio) : ratio;
    const scaled = amount * 100;
    const displayAmount = rounding === 'math' && digits === 0 ? Math.round(scaled) : scaled;
    return `${displayAmount.toLocaleString(DEFAULT_LOCALE, {
        maximumFractionDigits: digits
    })}%`;
}

export function formatQuantity(value, { digits = 1 } = {}) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    return value.toLocaleString(DEFAULT_LOCALE, { maximumFractionDigits: digits });
}

export function formatDateTime(iso, { empty = '' } = {}) {
    if (!iso) {
        return empty;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return empty;
    }

    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}.${mm} ${hh}:${min}`;
}

export function formatIsoDate(isoDate) {
    const [year, month, day] = String(isoDate || '').split('-');
    if (!year || !month || !day) {
        return '';
    }
    return `${day}.${month}.${year}`;
}

export function formatRelativeDateTime(value, { now = new Date(), empty = '—' } = {}) {
    if (value == null || value === '') return empty;
    const date = new Date(value);
    const current = new Date(now);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(current.getTime())) return empty;

    // Compare calendar days so midnight and daylight-saving changes stay correct.
    const calendarDay = day => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
    const days = (calendarDay(current) - calendarDay(date)) / 86400000;
    let label;
    if (days === 0) label = 'Bugün';
    else if (days === 1) label = 'Dün';
    else if (days > 1 && days < 7) label = `${days} gün önce`;
    else if (days >= 7 && days < 28) label = `${Math.floor(days / 7)} hafta önce`;
    else {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yy = String(date.getFullYear()).slice(-2);
        label = `${dd}.${mm}.${yy}`;
    }
    const clock = date.toLocaleTimeString(DEFAULT_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${label} ${clock}`;
}
