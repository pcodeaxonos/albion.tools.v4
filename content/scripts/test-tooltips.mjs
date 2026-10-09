import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = new Map();
const timers = new Map();
let nextTimer = 0;
let observe;
function element(text = '') {
    const attributes = new Map();
    const classes = new Set();
    return {
        dataset: { appTooltip: text }, style: {}, isConnected: true, textContent: '', children: [],
        replaceChildren() { this.children = []; this.textContent = ''; },
        append(node) { this.children.push(node); },
        setAttribute: (key, value) => attributes.set(key, value),
        getAttribute: key => attributes.get(key) ?? null,
        removeAttribute: key => attributes.delete(key),
        classList: { add: key => classes.add(key), remove: key => classes.delete(key) },
        contains(node) { return node === this; }, closest() { return this; },
        getBoundingClientRect: () => ({ left: 980, top: 700, bottom: 730, width: 300, height: 80 }),
        matches() { return this.open === true; },
        showPopover() { this.open = true; }, hidePopover() { this.open = false; }
    };
}
const tips = [];
const document = {
    body: { append: node => tips.push(node) }, activeElement: null,
    createElement: () => element(), addEventListener: (name, callback) => listeners.set(name, callback)
};
const context = vm.createContext({ document, window: { addEventListener() {} }, innerWidth: 1024, innerHeight: 768,
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} }
});
const module = new vm.SourceTextModule(fs.readFileSync('content/js/components/tooltip.js', 'utf8'), { context });
await module.link(() => { throw new Error('Unexpected dependency'); });
await module.evaluate();
const formatted = element();
module.namespace.renderTooltipContent(formatted, 'Fiyat geçmişi\n- 27 gün kullanıldı.\n• 3 eksik gün dışarıda.\nSon veri: 09.10.2026 13:00', document);
assert.equal(formatted.children[0].className, 'app-tooltip-heading');
assert.equal(formatted.children[0].textContent, 'Fiyat geçmişi');
assert.deepEqual(formatted.children[1].children.map(node => node.textContent), ['27 gün kullanıldı.', '3 eksik gün dışarıda.', 'Son veri: 09.10.2026 13:00']);
module.namespace.renderTooltipContent(formatted, 'İlk açıklama. İkinci açıklama. Son açıklama.', document);
assert.equal(formatted.children[0].children.length, 3, 'sentences become separate list items');
module.namespace.renderTooltipContent(formatted, '<img onerror=alert(1)>\nİkinci satır', document);
assert.equal(formatted.children[0].textContent, '<img onerror=alert(1)>', 'content is rendered as text');
module.namespace.initTooltips(); module.namespace.initTooltips();
assert.equal(tips.length, 1, 'initialization is idempotent');
const tip = tips[0];
const flush = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
const source = element('Kısa açıklama');
source.setAttribute('aria-describedby', 'existing-description');
listeners.get('pointerover')({ target: source, pointerType: 'mouse' }); flush();
assert.equal(tip.textContent, 'Kısa açıklama');
assert.ok(tip.open);
assert.equal(tip.style.left, '716px', 'tooltip stays within the right edge');
assert.equal(tip.style.top, '612px', 'tooltip flips above the lower edge');
assert.equal(source.getAttribute('aria-describedby'), `existing-description ${tip.id}`);
listeners.get('keydown')({ key: 'Escape' });
assert.equal(tip.open, false);
assert.equal(source.getAttribute('aria-describedby'), 'existing-description');
document.activeElement = source;
listeners.get('focusin')({ target: source }); flush();
listeners.get('scroll')({ target: document.body }); flush();
assert.ok(tip.open, 'keyboard tooltip survives automatic panel scrolling');
source.dataset.appTooltip = 'Güncellenen açıklama';
observe([{type:'attributes', target:source}]); flush();
assert.equal(tip.textContent, 'Güncellenen açıklama', 'dynamic values refresh while open');
source.isConnected = false;
observe([{type:'childList', target:document.body}]);
assert.equal(tip.open, false, 'rendered-away controls close their tooltip');
assert.equal(source.getAttribute('aria-describedby'), 'existing-description');
console.log('Tooltips: dynamic controls, focus, Escape, viewport bounds, accessibility and cleanup passed.');
