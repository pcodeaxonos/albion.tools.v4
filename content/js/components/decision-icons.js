// Package assets are kept as authored SVGs and inlined, preserving currentColor.
const ASSETS = Object.freeze({ search: '02-search', need: '03-mode-need', have: '04-mode-have', primary: '05-craft-primary', BUY_NOW: '06-buy-now', BUY_ORDER: '07-buy-order', CRAFT_NOW: '08-craft-now', CRAFT_WITH_ORDERS: '09-craft-order', info: '10-info', expand: '11-chevron-down', up: '12-trend-up', down: '13-trend-down' });
const icons = new Map();
export async function loadDecisionIcons() {
    await Promise.all(Object.entries(ASSETS).map(async ([key, file]) => {
        const response = await fetch(`content/icons/decision-engine/${file}.svg`);
        if (response.ok) icons.set(key, (await response.text()).replace('<svg ', '<svg aria-hidden="true" focusable="false" '));
    }));
}
export function decisionIcon(key) { return icons.get(key) || ''; }
