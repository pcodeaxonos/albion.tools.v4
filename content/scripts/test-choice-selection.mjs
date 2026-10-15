import assert from 'node:assert/strict';
import { changeChoiceSelection as change, readChoiceSelection as read, writeChoiceSelection as write, choiceMatches as matches, validChoiceSelection } from '../js/core/choice-selection.mjs';
import { filterPotentialRows, potentialPreferences, potentialDefaults } from '../js/core/potential-price-view.mjs';

for (const all of ['', 'all', 0]) {
    let selection = change(all, '2', {}, all);
    selection = change(selection, '7', { ctrlKey: true }, all);
    assert.deepEqual(selection, { included: ['2', '7'], excluded: [] });
    selection = change(selection, '2', { shiftKey: true }, all);
    assert.deepEqual(selection, { included: ['7'], excluded: ['2'] });
    assert(!matches(write(selection, all), '2', all));
    assert(matches(write(selection, all), '7', all));
    selection = change(selection, '7', { metaKey: true }, all);
    assert(matches(write(selection, all), '28', all), 'empty inclusion means all except excluded');
    selection = change(selection, '2', { shiftKey: true }, all);
    assert.equal(write(selection, all), all);
    assert.deepEqual(change({ included: ['7'], excluded: ['2'] }, all, { shiftKey: true }, all), { included: [], excluded: [] });
    assert.deepEqual(change('7', '7', {}, all), { included: [], excluded: [] });
    assert.deepEqual(read(write({ included: ['2', '7'], excluded: ['28'] }, all), all), { included: ['2', '7'], excluded: ['28'] });
}
const selection = write({ included: ['2', '7'], excluded: [] }, '');
assert.equal(validChoiceSelection(selection, [2, 7, 28], ''), selection);
assert.equal(potentialPreferences({ days: selection }).days, selection, 'multi preferences survive restore');
const rows = [2, 7, 28].map(days => ({ id: String(days), days, city: days === 28 ? 'Lymhurst' : 'Bridgewatch' }));
assert.deepEqual(filterPotentialRows(rows, { ...potentialDefaults(), days: selection }).map(row => row.days), [2, 7]);
const city = write({ included: [], excluded: ['Lymhurst'] }, '');
assert.equal(filterPotentialRows(rows, { ...potentialDefaults(), city }).length, 2);
const threshold = write({ included: ['0.35'], excluded: ['0.7'] }, '');
assert(matches(threshold, .5, '', (option, value) => value >= Number(option)));
assert(!matches(threshold, .8, '', (option, value) => value >= Number(option)));
console.log('Shared choice selection: modifiers, all/reset, exclusions, preferences, domain filtering and thresholds passed.');
