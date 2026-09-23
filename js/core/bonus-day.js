export const BONUS_RESET_HOUR = 13;

function pad(value) {
    return String(value).padStart(2, '0');
}

export function toIsoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    return toIsoDate(date);
}

export function bonusDayIso(now = new Date()) {
    const at = new Date(now.getTime());
    if (at.getHours() < BONUS_RESET_HOUR) {
        at.setDate(at.getDate() - 1);
    }
    return toIsoDate(at);
}

export function formatDayMonth(isoDate) {
    const [, month, day] = isoDate.split('-');
    return `${day}.${month}`;
}

export function bonusResetClock() {
    return `${pad(BONUS_RESET_HOUR)}:00`;
}

export function bonusWindowLabel(isoDate) {
    const clock = bonusResetClock();
    return `${formatDayMonth(isoDate)} ${clock} – ${formatDayMonth(addDays(isoDate, 1))} ${clock}`;
}
