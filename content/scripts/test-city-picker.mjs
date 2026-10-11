import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ CSS: { escape: (value) => value } });
const module = new vm.SourceTextModule(fs.readFileSync('content/js/components/city-picker.js', 'utf8'), { context });
const dependencies = {
    '../utils/utils.js': { escapeHtml: (value) => value },
    '../db/store.js': { getAll: () => [] },
    '../core/cities.js': { loadActiveCities: () => [], orderCities: (cities) => cities },
    '../core/settings.js': { getCityPickerStyle: () => 'standard', cityHasIsland: () => true }
};
await module.link((specifier) => {
    const exports = dependencies[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
});
await module.evaluate();
const { bindCityField, setCityFieldValue, cityFieldHtml } = module.namespace;

function classes(initial = []) {
    const values = new Set(initial);
    return {
        contains: (value) => values.has(value), add: (value) => values.add(value),
        remove: (value) => values.delete(value),
        toggle(value, enabled) { enabled ? values.add(value) : values.delete(value); },
        [Symbol.iterator]: () => values[Symbol.iterator]()
    };
}
function field(id, style, values = ['Martlock', 'Lymhurst']) {
    const listeners = {};
    const input = { dataset: {}, value: 'Martlock', tagName: style === 'standard' ? 'SELECT' : 'INPUT', options: values.map((value) => ({ value })), addEventListener: (name, handler) => { listeners[name] = handler; } };
    const nodes = values.map((value) => ({ dataset: { cityValue: value }, classList: classes(), setAttribute() {}, closest() { return this; } }));
    return {
        dataset: { cityField: id }, classList: classes([`city-field--${style}`]), input, nodes,
        querySelector: (selector) => selector === 'select' && style !== 'standard' ? null : input,
        querySelectorAll: () => style === 'standard' ? [] : nodes,
        addEventListener: (name, handler) => { listeners[name] = handler; }, contains: (node) => nodes.includes(node),
        change(value) {
            if (style === 'standard') { input.value = value; listeners.change({ target: input }); }
            else listeners.click({ target: nodes.find((node) => node.dataset.cityValue === value) });
        }
    };
}
function container(fields) {
    return {
        fields, classList: classes(), querySelectorAll() { return this.fields; },
        querySelector(selector) {
            const id = selector.match(/data-city-field="([^"]+)"/)?.[1];
            const target = id ? this.fields.find((entry) => entry.dataset.cityField === id) : this.fields[0];
            return selector.includes('[data-city-input]') ? target?.input : target;
        }
    };
}

for (const style of ['standard', 'horizontal', 'diagonal']) {
    const root = container(['first', 'second', 'third'].map((id) => field(id, style)));
    const state = {};
    root.fields.forEach((entry) => bindCityField(root, entry.dataset.cityField, (value) => { state[entry.dataset.cityField] = value; }));
    root.fields[0].change('Lymhurst');
    assert.deepEqual(state, { first: 'Lymhurst', second: 'Lymhurst', third: 'Lymhurst' });
    assert.ok(root.fields.every((entry) => entry.input.value === 'Lymhurst'));
    root.fields[1].change('Martlock');
    assert.deepEqual(state, { first: 'Lymhurst', second: 'Martlock', third: 'Lymhurst' });
    setCityFieldValue(root, 'first', 'Martlock');
    assert.equal(state.first, 'Lymhurst', 'programmatic restoration must not notify or cascade');
}

// A primary callback can replace the DOM (island planner) before other callbacks run.
for (const style of ['horizontal', 'diagonal']) {
    const root = container([field('filter', style), field('required', style)]);
    root.fields[0].input.dataset.cityAllowAll = 'true';
    const changes = [];
    root.fields.forEach((entry) => bindCityField(root, entry.dataset.cityField, (value) => changes.push([entry.dataset.cityField, value])));
    root.fields[0].change('Martlock');
    assert.equal(root.fields[0].input.value, '');
    assert.equal(root.fields[1].input.value, 'Martlock', 'required city fields must not clear');
    assert.equal(root.classList.contains('city-selected'), false);
    assert.deepEqual(changes, [['filter', '']]);
    root.fields[0].change('Lymhurst');
    assert.equal(root.fields[0].input.value, 'Lymhurst');
    root.fields[0].change('Lymhurst');
    assert.equal(root.fields[0].input.value, '');
    root.fields[1].change('Lymhurst');
    assert.equal(root.fields[1].input.value, 'Lymhurst', 'required city selection remains selected on repeated clicks');
}
assert.match(cityFieldHtml({ id: 'filter', label: 'Şehir', selected: '', allowAll: true }), /<option value="" selected>Tüm şehirler<\/option>/);
assert.doesNotMatch(cityFieldHtml({ id: 'required', label: 'Şehir', selected: '' }), /Tüm şehirler/);
// A tool can request real crests without changing the user's global preference.
const crestHtml = cityFieldHtml({ id: 'crest-test', label: 'Şehir', selected: 'Martlock', style: 'crests', cities: [{ name: 'Martlock', displayName: 'Martlock', marketApiName: 'Martlock' }] });
assert.match(crestHtml, /city-field--crests/);
assert.match(crestHtml, /assets\/cities\/martlock\.png/);
assert.match(crestHtml, /aria-pressed="true"/);
assert.match(cityFieldHtml({ id: 'unchanged', label: 'Şehir', selected: '' }), /city-field--standard/);

const root = container(['first', 'second'].map((id) => field(id, 'standard')));
const state = {};
bindCityField(root, 'first', (value) => {
    state.first = value;
    root.fields = ['first', 'second'].map((id) => field(id, 'standard'));
});
bindCityField(root, 'second', (value) => { state.second = value; });
root.fields[0].change('Lymhurst');
assert.equal(state.second, 'Lymhurst');
assert.equal(root.fields[1].input.value, 'Lymhurst');

const restricted = container([field('first', 'standard'), field('disabled', 'standard'), field('unavailable', 'standard', ['Martlock'])]);
restricted.fields[1].input.disabled = true;
const notified = [];
restricted.fields.forEach((entry) => bindCityField(restricted, entry.dataset.cityField, () => notified.push(entry.dataset.cityField)));
restricted.fields[0].change('Lymhurst');
assert.deepEqual(notified, ['first']);
console.log('City picker synchronization tests passed.');

const market={name:'Black Market',displayName:'Black Market',marketApiName:'Black Market',mapPosition:{x:46,y:68},iconHtml:'<svg viewBox="0 0 24 24"></svg>'};
assert.match(cityFieldHtml({id:'target',label:'Nereye',selected:'Black Market',cities:[market],style:'crests'}),/<span class="city-crest"[^>]*><svg/);
assert.match(cityFieldHtml({id:'target',label:'Nereye',selected:'Black Market',cities:[market],style:'diagonal'}),/--x:46%;--y:68%/);

for (const style of ['standard','horizontal','diagonal']) {
    const independent=container([field('source',style),field('target',style)]);
    const events=[];
    independent.fields.forEach(entry=>bindCityField(independent,entry.dataset.cityField,value=>events.push([entry.dataset.cityField,value]),{syncPeers:false}));
    independent.fields[0].change('Lymhurst');
    assert.equal(independent.fields[0].input.value,'Lymhurst');
    assert.equal(independent.fields[1].input.value,'Martlock');
    assert.deepEqual(events,[['source','Lymhurst']]);
}
console.log('Independent route endpoints and custom destination icons/positions passed.');
