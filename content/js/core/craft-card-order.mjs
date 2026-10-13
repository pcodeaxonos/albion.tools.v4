export const CRAFT_CARD_ORDER_ENDPOINT = '/api/v1/craft-card-order';
export const LEGACY_CRAFT_CARD_ORDER_KEY = 'albiontools.v4.dailyBonusCardOrder';

export function validCraftFamily(family) {
    return typeof family === 'string' && family.length <= 100
        && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(family);
}

export function validCraftCardOrder(order) {
    return Array.isArray(order) && order.length <= 500
        && order.every(key => typeof key === 'string' && key.length > 0 && key.length <= 200)
        && new Set(order).size === order.length;
}
