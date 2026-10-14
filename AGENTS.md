# Albion Tools project instructions

## Locked design standard

- Before creating or modifying HTML, including dynamically generated markup, first locate and inspect the relevant locked/approved design and its shared components and styles.
- Prepare the HTML according to that design standard: preserve its composition, layout, geometry, spacing, typography, and interaction patterns, and reuse the existing shared primitives.
- Apply this requirement to pages, dialogs, lists, alternate states, and dynamic rendering. Do not introduce a different design unless the user explicitly requests a design change.

## Island planner geometry

- The grid cell allocated to the island image must always have a 1:1 aspect ratio at every breakpoint. The image must fill that square cell without stretching or letterboxing.
- Derive the desktop grid row and island column from the same dynamic square size. Place the summary immediately below that row with only the standard grid gap; do not stretch the row independently and leave empty space below the island.
- Keep slot overlays aligned with the rendered image when the square resizes. Preserve the bounded viewport and panel scrollports.

## Work efficiently

- Start with the smallest relevant context and use targeted searches/reads.
- Do not avoid builds, tests, or debugging when they are needed for correctness.
- Understand the relevant flow before editing; avoid speculative fixes and unrelated refactors.
- Run the narrowest useful verification after changes.
- Solve the underlying cause, not the immediate symptom. Do not add temporary workarounds or one-off compatibility patches when a shared abstraction or source-of-truth can address the problem permanently.
- Avoid hard-coded duplicated values, paths, selectors, and route lists. Put repeated or cross-cutting configuration behind a named shared primitive, and generate derived artifacts from it so a small change stays local.
- Before adding a new exception, check whether the existing system can be extended instead. Prefer a coherent design that minimizes future edits across files.

## Apply changes across shared structures

- Treat screenshots, examples, and named locations as evidence of the requested behavior, not as the entire implementation scope. Unless the user explicitly limits scope, find every analogous use of the same semantic structure and apply the change consistently, including alternate states, dynamic rendering, dialogs, lists, and other tools that consume it.
- Think about the overall design before fixing a local symptom. Trace the shared component, rendering path, styles, and source data; implement the behavior at the common source so all consumers benefit. Do not stop after fixing only the illustrated instance.
- Write generic, reusable code driven by semantic data and shared configuration. Do not hard-code particular items, cities, pages, selectors, labels, or special cases merely to satisfy an example. Derive labels, states, and presentation from the actual data rather than guessing from the displayed text.
- Extend an existing shared primitive before adding local code. Where analogous implementations are duplicated, consolidate the relevant behavior into a common primitive instead of copying the same patch into each location. Preserve domain-specific differences and avoid unrelated refactors.
- Before completing a change, check the analogous consumers and relevant states for consistent behavior; verify the shared implementation and its integrations, not just the example shown by the user.

## Tool split layout

- Locked desktop contract (992px+): tool pages must fit the viewport with no horizontal or vertical page scrollbar. Carry available width/height through the shared shell with `min-width: 0` / `min-height: 0`; long controls, tables, and reports scroll only inside their designated panels. Do not hide overflow or scrollbar tracks to disguise content exceeding the page. Preserve mobile page scrolling and the approved composition. Verify all tool routes at desktop widths and short viewport heights after shared layout changes.

Pages with filters/forms plus a result or table use `.tool-split`:

- Place selection and form controls in `.tool-split-controls`.
- Put logs, tables, and calculated output in `.tool-split-result`.
- Do not replace this with a full-width `.calc-toolbar`.
- On desktop (992px+), keep the controls sticky; below that, stack controls above results.
- Tables retain `.calc-table` and `bindCalcSticky`.
- Place fee, RR, scenario, profitability, and timestamp notes below the result/table.
- Never use `overflow: hidden` to suppress page scrolling or force a table into view. Establish a bounded flex/grid height chain with `min-height: 0`, then assign `overflow: auto` to the intended table or panel scrollport. Use clipping only for deliberate visual clipping (such as media) and document the reason.

## Standard form inputs

- Labelled choice, city/icon picker, and range fields use `.choice-field.form-field`. Put the caption and optional top-right action in `.form-field-heading`, the caption in a `div.form-field-label`, and controls below it. Manage vertical spacing with the shared container `gap`, never label margins. Reuse `fieldHeadingHtml` and `fieldAllButtonHtml` from `content/js/components/form-field.js` for generated headings and “Tümü” actions; floating inputs retain `.form-floating` and their accessible labels.

- The same semantic UI component uses one shared class across tools/pages. Reuse the existing component first; express necessary differences with a base class plus modifier/state, never a new tool-prefixed copy.
- Shared segmented choices live in `content/scss/app/_segmented-choice.scss`, form controls in `_tool-controls.scss`, market price inputs in `_market-fields.scss`, and market rows/cards in `_market-resources.scss`. Tool styles contain only domain-specific differences. Keep JavaScript hooks on scoped `data-*` attributes.
- Run `npm run css:check` after UI changes. Retired class names are errors; duplicate/near-duplicate blocks and possible unused selectors are advisory and need semantic review (`--all` prints the full list).

- New inputs must follow the existing shared form standard, including field structure, labels, dimensions, spacing, and interaction states.
- Reuse shared form components and classes (such as `.form-floating` and `.form-control`) instead of introducing a custom appearance for an individual input.
- Do not add input-specific CSS to bypass the shared standard. Extend the shared form primitive when a reusable capability is needed.

- Filters with an explicit “Tümü” choice use `filterChoiceFieldHtml` from `content/js/components/form-field.js`: uppercase caption, compact top-right “Tümü” action, and joined equal-width `.segmented-choice--filter` cells with the shared gold active state. Keep all-choice actions out of the option row; preserve single/multiple-selection behavior through semantic values. Do not override this component in tool styles. City maps/crests and select controls retain their specialized presentation.

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

## Copyable item names (mandatory)

- Every displayed item or material name in new or modified UI must be copyable. This applies to tables, lists, cards, result summaries, dialogs, and dynamically rendered content. Never omit this behavior when adding or changing an item-name display.
- Use `itemNameHtml(name, copyName = name)` from `content/js/components/item-name.js`; reuse the shared copy behavior and styling instead of adding page-specific clipboard handlers or rendering item names as plain text.
- In calculation detail panels, pass the full item name as `copyName` to `explainPanelHtml`, `explainStep`, or `explainSaleSteps` when their title/label displays an item or material name.
- Copy the full item name only, without surrounding tier/enchantment badges, quantities, prices, bonuses, or other metadata. When the visible name is shortened, pass the full name as `copyName`.
- Preserve mouse-click and keyboard (Enter/Space) activation, accessible labeling, copy feedback, and isolation from parent row/card actions. Extend the shared component if a new UI context needs support.
- Before completing any UI work involving item names, check every added or modified item-name render path for this rule, including alternate states and dynamic updates. Verify copying when the shared component or its integration changes.

## Item visuals

Item and material images that sit in a row, cell, card, or other slot with spare space use `.item-visual`.

- Wrap the image in `<span class="item-visual">`. `itemIconHtml(id, { visual: true })` does this.
- Keep `.item-icon` on the image. Do not set a fixed width or height on that image, and do not add a page-specific icon size.
- The slot stretches to the free block size of its table cell or grid row, stays square, and the image fills it. A grid row uses `grid-template-columns: auto …` so the slot can take that block size.
- Use a fixed size only for a slot that must stay small, such as an autocomplete row, chip, form aside, or map marker. Those do not use `.item-visual`.

## DOM selectors

- Render SVG icons inline as `<svg>`; do not use `<img>` to display SVG files.

- Do not introduce HTML `id` attributes for application controls or JavaScript selectors.
- Use descriptive `data-*` hooks instead: `data-price-check`, or value-bearing attributes such as `data-product="milk"`.
- Scope attribute selectors to their owning tool container where possible.
- Retain an `id` only where an HTML accessibility relationship requires an ID reference; never use it as a JavaScript selector.

## Shared JavaScript startup

- Put page-wide startup behavior in `content/js/core/app-runtime.js`; every tool entry imports this module. Do not create separate startup modules or repeat shared initialization in tool entries.
- Preserve startup order: critical data/sync preparation, menu, appStatus, empty page content structure, then tool-specific content/data. Domain services and reusable input/item components remain separate libraries.

## Locked result sorting and view controls

- Use `sortChoicesHtml` and `viewSwitchToolbarHtml` from `content/js/components/view-switch.js`. Pass sorting as the toolbar's third argument, immediately to the left of list/card buttons, in every view and empty state. Keep sorting out of filter panels and unrelated status bars.
- Use compact inline SVG buttons with shared `view-switch-button` dimensions, active/focus states, accessible labels and `aria-pressed`. Sorting tooltips use only 1–2 descriptive words; show direction with an arrow when needed. Results without a view switch use the same sorting primitive beside their heading. Preserve domain sorting, missing-value rules and persistence; do not duplicate component markup or tool-specific button styles.

## Locked city presentation

- On tool pages, every city name uses the shared `content/js/components/city-name.js` component and its canonical `[data-city]` identity. Render the English market name with `lang="en"`; uppercase is applied by shared CSS, never JavaScript. Use the shared city color tokens.
- Reuse `cityNameHtml`, `cityNameAttributes`, `cityBadgeHtml`, and `cityRouteHtml` for text, native options, badges, and routes. Preserve picker geometry and city-specific interactions. Do not duplicate city markup, normalization, uppercase rules, or color styles in tools. Apply to tables, cards, dialogs, notes, empty states, and dynamic updates. Database/admin and other non-tool data views retain their original presentation.

## Tooltip wording

- Keep tooltips concise: use 1–2 descriptive words, never long explanatory sentences. Put detailed explanations in the appropriate help or detail panel. Apply this rule to shared components and all new or modified tooltips.
