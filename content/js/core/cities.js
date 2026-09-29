import { escapeHtml } from '../utils/utils.js';
import { getAll } from '../db/store.js';
import { getCityPickerOrder, getDefaultCity } from './settings.js';

const CITY_TYPE_LABELS = {
    Royal: 'Royal',
    Caerleon: 'Caerleon',
    Brecilien: 'Brecilien'
};

export function loadCities() {
    return getAll('cities');
}

/**
 * The sole ordering rule for city lists.  Every consumer must use this rather
 * than applying a local, purpose-specific city order.
 */
export function orderCities(cities, order = getCityPickerOrder()) {
    const list = [...(cities || [])];
    const label = (city) => String(city.displayName || city.marketApiName || city.name || '');
    const dataOrder = (left, right) => {
        const leftId = Number(left.id);
        const rightId = Number(right.id);
        const idOrder = (Number.isFinite(leftId) ? leftId : Number.MAX_SAFE_INTEGER)
            - (Number.isFinite(rightId) ? rightId : Number.MAX_SAFE_INTEGER);
        return idOrder || label(left).localeCompare(label(right), 'tr-TR');
    };
    if (order === 'alphabetical') {
        return list.sort((left, right) => label(left).localeCompare(label(right), 'tr-TR'));
    }
    if (order !== 'map-ring') {
        return list.sort(dataOrder);
    }

    const mapIndex = (city) => {
        const value = Number(city.mapOrder);
        return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    };
    const mapOrder = (left, right) => mapIndex(left) - mapIndex(right) || dataOrder(left, right);
    const royal = list.filter((city) => city.cityType === 'Royal').sort(mapOrder);
    const otherCities = list.filter((city) => city.cityType !== 'Royal').sort(mapOrder);
    const start = royal.findIndex((city) => city.marketApiName === getDefaultCity());
    const ring = start < 0 ? royal : [...royal.slice(start), ...royal.slice(0, start)];
    return [...ring, ...otherCities];
}

export function loadActiveCities() {
    return orderCities(loadCities().filter((city) => city.isActive));
}

export function renderCitiesTable(cities, container) {
    const activeCities = orderCities(cities.filter((city) => city.isActive));

    if (activeCities.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Aktif şehir bulunamadı.</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Id</th>
                        <th>Name</th>
                        <th>Display Name</th>
                        <th>Market API Name</th>
                        <th>City Type</th>
                        <th>Active</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeCities.map(renderCityRow).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderCityRow(city) {
    const cityType = CITY_TYPE_LABELS[city.cityType] ?? city.cityType;
    const activeLabel = city.isActive ? 'Evet' : 'Hayır';

    return `
        <tr>
            <td>${city.id}</td>
            <td>${escapeHtml(city.name)}</td>
            <td>${escapeHtml(city.displayName)}</td>
            <td>${escapeHtml(city.marketApiName)}</td>
            <td>${escapeHtml(cityType)}</td>
            <td>${activeLabel}</td>
        </tr>
    `;
}
