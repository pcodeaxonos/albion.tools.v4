import { escapeHtml } from './utils.js';
import { getAll } from './db/store.js';

const CITY_TYPE_LABELS = {
    Royal: 'Royal',
    Caerleon: 'Caerleon',
    Brecilien: 'Brecilien'
};

export function loadCities() {
    return getAll('cities');
}

export function loadActiveCities() {
    return loadCities()
        .filter((city) => city.isActive)
        .sort((a, b) => a.id - b.id);
}

export function renderCitiesTable(cities, container) {
    const activeCities = cities
        .filter((city) => city.isActive)
        .sort((a, b) => a.id - b.id);

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
