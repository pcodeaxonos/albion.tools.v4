# Albion Tools project instructions

## Work efficiently

- Start with the smallest relevant context and use targeted searches/reads.
- Do not avoid builds, tests, or debugging when they are needed for correctness.
- Understand the relevant flow before editing; avoid speculative fixes and unrelated refactors.
- Run the narrowest useful verification after changes.
- Solve the underlying cause, not the immediate symptom. Do not add temporary workarounds or one-off compatibility patches when a shared abstraction or source-of-truth can address the problem permanently.
- Avoid hard-coded duplicated values, paths, selectors, and route lists. Put repeated or cross-cutting configuration behind a named shared primitive, and generate derived artifacts from it so a small change stays local.
- Before adding a new exception, check whether the existing system can be extended instead. Prefer a coherent design that minimizes future edits across files.

## Tool split layout

Pages with filters/forms plus a result or table use `.tool-split`:

- Place selection and form controls in `.tool-split-controls`.
- Put logs, tables, and calculated output in `.tool-split-result`.
- Do not replace this with a full-width `.calc-toolbar`.
- On desktop (992px+), keep the controls sticky; below that, stack controls above results.
- Tables retain `.calc-table` and `bindCalcSticky`.
- Place fee, RR, scenario, profitability, and timestamp notes below the result/table.

## Editable log tables

- Use `.table.table-striped.log-table.calc-table` for editable day/month logs.
- Apply `is-editing` to the selected row while the form is in update mode.
- Use `bindLogTableRows` from `js/components/log-table.js`; do not bind row click handlers ad hoc.
- Keep shared log styling on `.log-table`; use page-specific classes only for additional states.

## Dialogs

- Native modal panels use `<dialog class="app-dialog …">`.
- Include an empty `<button class="app-dialog-close" aria-label="Kapat" data-*-close></button>` as the direct close control.
- The shared CSS draws its X with pseudo-elements; do not add an X glyph, SVG, or text.
- The close button sits outside the dialog on the right. Keep the dialog `overflow: visible`, scroll the inner sheet, and reserve room in the dialog max-width.

## DOM selectors

- Render SVG icons inline as `<svg>`; do not use `<img>` to display SVG files.

- Do not introduce HTML `id` attributes for application controls or JavaScript selectors.
- Use descriptive `data-*` hooks instead: `data-price-check`, or value-bearing attributes such as `data-product="milk"`.
- Scope attribute selectors to their owning tool container where possible.
- Retain an `id` only where an HTML accessibility relationship requires an ID reference; never use it as a JavaScript selector.
