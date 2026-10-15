import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { durableStorageVmSource } from './fixtures/durable-storage-vm.mjs';
import { POTENTIAL_SNAPSHOT_KEY, POTENTIAL_PRICE_TABLE, potentialSnapshotRows, potentialDecisionRows, potentialPriceDecision } from '../js/core/potential-price-snapshot.mjs';
import { SALE_ESTIMATOR } from '../js/core/potential-sale-horizon.mjs';
import { tradeEvidenceKey } from '../js/core/trade-potential-evidence.mjs';

const entries = new Map();
const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
const request = { server:'europe', city:'Martlock', itemId:'T4_TURNIP', quality:1, side:'sell' };
const key = days => JSON.stringify([tradeEvidenceKey(request), days]);
const saved = { savedSnapshot:true, estimator:SALE_ESTIMATOR, reliable:true, price:100, days:7,
    validUntil:new Date(Date.now()+86400000).toISOString(), savedAt:new Date().toISOString(), source:'Oyun Market History' };
storage.setItem(POTENTIAL_SNAPSHOT_KEY, JSON.stringify({
    [key(7)]:saved, [key(14)]:{...saved, days:14, validUntil:'2020-01-01T00:00:00Z'},
    [key(28)]:{...saved, days:28, reliable:false, price:null, reason:'Eksik işlem geçmişi'}, bad:{savedSnapshot:true}
}));
const original = storage.getItem(POTENTIAL_SNAPSHOT_KEY);
const rows = potentialSnapshotRows(storage, () => 'Turnips');
assert.equal(rows.length,3);
assert.deepEqual(rows.map(row=>row.status),['Geçerli','Süresi doldu','Yetersiz veri']);
assert.equal(rows[2].reason,'Eksik işlem geçmişi');
const decisions = potentialDecisionRows(storage, () => 'Turnips');
assert.equal(new Set(decisions.map(row=>row.id)).size,decisions.length,'one record per item/server/city/quality/side/horizon');
assert.deepEqual(decisions.map(row=>row.price),[100,null,null],'expired and rejected evidence is not a usable price');
assert.equal(decisions[0].price,potentialPriceDecision(saved,request,7).price,'table and planner share the admission decision');
const legacy = {...saved,estimator:'old-peak-model'};
assert.equal(potentialPriceDecision(legacy,request,7).price,null);
assert.equal(potentialPriceDecision(saved,request,28).price,null,'duration cannot leak across decisions');
assert.equal(potentialPriceDecision({...saved,periodPrice:120,recentPrice:110,currentOrder:100},request,7).basis,'—');
const variations = [request,{...request,city:'Bridgewatch'},{...request,server:'west'},
    {...request,quality:2},{...request,side:'buy'},{...request,itemId:'T5_CABBAGE'}];
const variantRows = Object.fromEntries(variations.map(scope=>[JSON.stringify([tradeEvidenceKey(scope),scope.side==='buy'?90:7]),saved]));
const variantStorage = {getItem:()=>JSON.stringify(variantRows)};
assert.equal(potentialDecisionRows(variantStorage).length,variations.length,'required market variations remain independent');
assert.equal(storage.getItem(POTENTIAL_SNAPSHOT_KEY),original,'view never modifies the original records');

const context = vm.createContext({ console, URL, URLSearchParams, setTimeout, clearTimeout, localStorage:storage,
    location:{ pathname:'/', search:'', hash:'' }, document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){},dispatchEvent(){}}, CustomEvent:class {} });
const modules = new Map();
function moduleFor(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    let code = fs.readFileSync(file,'utf8');
    if (file.endsWith('durable-storage.mjs')) code = durableStorageVmSource;
    if (file.endsWith(`${path.sep}forms.js`)) code = 'export function initFloatingLabels() {}';
    if (file.endsWith('app-runtime.js')) code = 'export const renderMatsHtml = () => ""; export const renderRecipesHtml = () => "";';
    if (file.endsWith(`${path.sep}admin.js`)) code = code.replace(/boot\(\);\s*$/, 'export { state, renderTableView, openCreateForm, openEditForm };');
    const module = new vm.SourceTextModule(code,{context,identifier:file});
    modules.set(file,module);
    return module;
}
const adminModule = moduleFor('content/js/db/admin.js');
await adminModule.link((specifier,parent)=>moduleFor(path.resolve(path.dirname(parent.identifier),specifier)));
await adminModule.evaluate();
const admin = adminModule.namespace;
const store = modules.get(path.resolve('content/js/db/store.js')).namespace;
storage.setItem('albiontools.v4.items',JSON.stringify([{id:1,uniqueName:request.itemId,localizedName:'Turnips'}]));
assert.equal(store.getRowCount(POTENTIAL_PRICE_TABLE),3);
assert.equal(store.getAll(POTENTIAL_PRICE_TABLE)[1].price,null);
assert.equal(store.getAll(POTENTIAL_PRICE_TABLE)[1].validUntil,'2020-01-01T00:00:00Z','one projection retains the recorded detail fields');
assert.equal(store.searchRows(POTENTIAL_PRICE_TABLE,'Turnips').length,3);
assert.equal(store.searchRows(POTENTIAL_PRICE_TABLE,'Eksik').length,1);
assert.equal(JSON.parse(store.exportTableJson(POTENTIAL_PRICE_TABLE)).length,3);
assert.throws(()=>store.queueStoreTransaction(()=>store.replaceAllRows(POTENTIAL_PRICE_TABLE,[])),/salt okunur/);
assert.equal(storage.getItem(POTENTIAL_SNAPSHOT_KEY),original);
admin.state.tableName = POTENTIAL_PRICE_TABLE;
const html = admin.renderTableView();
assert.match(html,/calc-table/);
assert.match(html,/data-copy-item-name="Turnips"/);
assert.match(html,/Eksik işlem geçmişi/);
assert.match(html,/id="btnToggleDetails"/);
assert.ok(!html.includes('Geçerlilik sonu'),'detail columns stay hidden by default');
assert.ok(!/btnCreate|btnImport|btnReseed|db-row-delete|<tr[^>]*tabindex/.test(html),'computed records have no editing actions');
await admin.openEditForm(POTENTIAL_PRICE_TABLE,rows[0].id);
assert.equal(admin.state.mode,null);
admin.state.showDetailColumns = true;
const detailHtml = admin.renderTableView();
assert.match(detailHtml,/Geçerlilik sonu/);
assert.match(detailHtml,/Süresi doldu/);
assert.match(detailHtml,/<time datetime=/,'timestamps are rendered as localized time elements');
assert.ok(!fs.readFileSync('pages/admin/db/index.html','utf8').includes('data-page-info-head'));
console.log('Potential price database view: live source, statuses, names/copy, search, export, read-only actions and removed info hook passed.');
