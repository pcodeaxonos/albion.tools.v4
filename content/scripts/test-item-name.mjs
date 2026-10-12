import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = new Map(), copied = [], toasts = [];
let removed = false, restored = false;
const field = { select() {}, remove() { removed = true; } };
const document = {
    addEventListener(type, handler, capture) {
        assert.equal(capture, true);
        assert.ok(!listeners.has(type), 'listeners are installed once');
        listeners.set(type, handler);
    },
    activeElement: { focus() { restored = true; } },
    querySelector: () => null,
    body: { appendChild() {} },
    createElement: () => field,
    execCommand: () => true
};
const navigator = { clipboard: { async writeText(text) { copied.push(text); } } };
const context = vm.createContext({ document, navigator });
const module = new vm.SourceTextModule(fs.readFileSync('content/js/components/item-name.js', 'utf8'), { context });
await module.link(async (specifier) => {
    const exports = specifier.includes('toast') ? { showToast: (...args) => toasts.push(args) }
        : { escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
    return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
});
await module.evaluate();
assert.match(module.namespace.itemNameHtml('<Sword>', 'Full "Sword"'), /data-copy-item-name="Full &quot;Sword&quot;"/);
assert.match(module.namespace.itemNameHtml('<Sword>'), /&lt;Sword>/);
const prefixed = module.namespace.itemNameHtml('Sword', 'Full Sword', { copyPrefix: '6.2' });
assert.match(prefixed, /data-copy-item-name="6\.2 Full Sword"/);
assert.match(prefixed, />Sword<\/span>/);
module.namespace.initItemNameCopy();
module.namespace.initItemNameCopy();
function activate(type, key) {
    const event = { type, key, target: { closest: () => ({ dataset: { copyItemName: 'Elder Sword' } }) },
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    listeners.get(type)(event);
    return event;
}
const click = activate('click');
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(copied, ['Elder Sword']);
assert.ok(click.prevented && click.stopped, 'copy does not activate a parent row or card');
activate('keydown', 'Enter'); activate('keydown', ' '); activate('keydown', 'ArrowDown');
await new Promise(resolve => setImmediate(resolve));
assert.equal(copied.length, 3, 'only Enter and Space activate keyboard copy');
navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
activate('click');
await new Promise(resolve => setImmediate(resolve));
assert.equal(toasts.at(-1)[1].kind, 'error');
navigator.clipboard = undefined;
activate('click');
assert.equal(field.value, 'Elder Sword');
assert.ok(removed && restored, 'fallback cleans up and restores focus');

const explain = new vm.SourceTextModule(fs.readFileSync('content/js/utils/calc-explain.js', 'utf8'), { context });
await explain.link(async (specifier) => {
    if (specifier.includes('item-name')) return module;
    const exports = specifier.includes('market-fees') ? { SETUP_FEE: 0.025 }
        : { escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
    return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
});
await explain.evaluate();
const panel = explain.namespace.explainPanelHtml({ title: 'T8 Sword · Craft', copyName: 'Elder Sword' });
assert.match(panel, /data-copy-item-name="Elder Sword"/);
assert.match(panel, />T8 Sword · Craft<\/span>/);
const step = explain.namespace.explainStep({ label: 'Alt Sword 8.3', copyName: 'Elder Sword' });
assert.match(step, /data-copy-item-name="Elder Sword"/);
assert.match(explain.namespace.explainSaleSteps({ label: 'Sword', copyName: 'Elder Sword' })[0], /data-copy-item-name="Elder Sword"/);
assert.doesNotMatch(explain.namespace.explainStep({ label: 'Malzeme toplamı' }), /data-copy-item-name/);
console.log('Item name copy tests passed');
