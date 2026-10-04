import { planDayHours } from './economy-config.js';

// Catalog animal focusCost is per nurture. Plants need character watering
// specialisation, which the V2 draft does not store; never assume zero skill.
export function dailyFocusRequirement(item, { focused, capacity, hours }) {
    if (!focused) return 0;
    if (!Number.isFinite(item.focusCost) || item.focusCost < 0 || !(hours > 0) || !Number.isFinite(capacity)) return null;
    return item.focusCost * capacity * planDayHours() / hours;
}
