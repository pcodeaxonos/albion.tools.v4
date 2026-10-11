import assert from 'node:assert/strict';
import { cssRules, inspectRules } from './check-css-architecture.mjs';

const rules = cssRules(`
@media (max-width: 600px) {
  .farm-field, .craft-field, .price-field { display: grid; gap: 1rem; padding: 0; margin: 0; min-width: 0; }
  .duplicate { margin: 0; padding: 0; gap: 1rem; display: grid; min-width: 0; }
}
.outside { display: grid; gap: 1rem; padding: 0; margin: 0; min-width: 0; }
.label::after { content: "}"; }
`);
assert.equal(rules.length, 4);
const warnings = inspectRules(rules, ['farm', 'craft', 'price']);
assert.equal(warnings.filter(w => w.startsWith('Grouped')).length, 1);
assert.equal(warnings.filter(w => w.startsWith('Identical')).length, 1);
assert.equal(inspectRules(cssRules('.a {display:flex} .b {display:flex}'), []).length, 0);
console.log('CSS architecture scanner tests passed.');
