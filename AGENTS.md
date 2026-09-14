# Albion Tools project instructions

## Work efficiently

- Start with the smallest relevant context and use targeted searches/reads.
- Do not avoid builds, tests, or debugging when they are needed for correctness.
- Understand the relevant flow before editing; avoid speculative fixes and unrelated refactors.
- Run the narrowest useful verification after changes.

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
- Use `bindLogTableRows` from `js/log-table.js`; do not bind row click handlers ad hoc.
- Keep shared log styling on `.log-table`; use page-specific classes only for additional states.

## Dialogs

- Native modal panels use `<dialog class="app-dialog …">`.
- Include an empty `<button class="app-dialog-close" aria-label="Kapat" data-*-close></button>` as the direct close control.
- The shared CSS draws its X with pseudo-elements; do not add an X glyph, SVG, or text.
- The close button sits outside the dialog on the right. Keep the dialog `overflow: visible`, scroll the inner sheet, and reserve room in the dialog max-width.
