import assert from 'node:assert/strict';
import { inspectCityControls, checkCityPickerArchitecture } from './check-city-picker-architecture.mjs';

assert.equal(inspectCityControls('<button data-filter="city">Martlock</button>').length, 1);
assert.equal(inspectCityControls('<select data-field="buy-city"></select>').length, 1);
assert.equal(inspectCityControls('<button data-chart-city="${city}"></button>').length, 1);
assert.equal(inspectCityControls('cityFieldHtml({ label, style: "crests" })').length, 1);
assert.equal(inspectCityControls('FILTERS.map(([key, caption]) => choices(key, caption, values))', { citySchema: true }).length, 1);
assert.equal(inspectCityControls('if (key === "city") return cityFilterFieldHtml({ values }); return choices(key, caption, values)', { citySchema: true }).length, 0);
// Price-table navigation and island ownership checkboxes are different semantic controls.
assert.equal(inspectCityControls('<button data-market-city="${city}"></button><input type="checkbox" data-island-city="${city}">').length, 0);
assert.equal(inspectCityControls('<button data-city-value="${city}"></button>', { sharedPicker: true }).length, 0);
assert.deepEqual(checkCityPickerArchitecture().errors, []);
console.log('City picker architecture guards passed, including dynamic filter schemas.');
