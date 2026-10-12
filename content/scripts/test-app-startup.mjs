import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Check the real orchestration with delayed critical services, independently of UI details.
const source = fs.readFileSync('content/js/core/app-runtime.js', 'utf8');
const startup = source.slice(source.indexOf('async function startApp()'), source.lastIndexOf('await startApp();'));
const events = [];
let finishSync, finishStore;
const sync = new Promise(resolve => { finishSync = resolve; });
const store = new Promise(resolve => { finishStore = resolve; });
const root = {
    querySelector: () => null,
    hasChildNodes: () => false,
    set innerHTML(value) { events.push('structure'); assert.equal(value, 'skeleton'); }
};
const context = vm.createContext({
    bootLocalDataSync: () => { events.push('sync'); return sync; },
    initStore: () => { events.push('store'); return store; },
    redirectToDailyBonusWhenNeeded: () => events.push('redirect-check'),
    initPageLayout: () => events.push('layout'),
    renderMenu: () => events.push('menu'),
    recordCurrentToolVisit: () => events.push('visit'),
    initTodayBonusChip: () => events.push('bonus'),
    initPipelineStatus: () => events.push('status'),
    document: { querySelector: () => root },
    pageById: () => ({ id: 'refining', title: 'Refining' }),
    currentPageId: () => 'refining',
    escapeHtml: value => value,
    toolPageHtml: () => 'skeleton'
});
const ready = vm.runInContext(startup + '\nstartApp()', context);
assert.deepEqual(events, ['sync'], 'nothing renders while sync is pending');
finishSync();
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(events, ['sync', 'store'], 'nothing renders while store is pending');
finishStore();
await ready;
events.push('content');
assert.deepEqual(events, ['sync', 'store', 'redirect-check', 'layout', 'menu', 'visit', 'bonus', 'status', 'structure', 'content']);

events.length = 0;
context.bootLocalDataSync = () => { throw new Error('critical failure'); };
await assert.rejects(vm.runInContext(startup + '\nstartApp()', context), /critical failure/);
assert.deepEqual(events, [], 'critical failure prevents rendering');
console.log('PASS critical barriers, menu → status → structure → content, critical failure');
