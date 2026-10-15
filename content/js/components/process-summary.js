import { escapeHtml as esc } from '../utils/utils.js';

export function processSummaryHtml({ label, phase = 'idle', status = 'Hazır', progress = '—', value = 0, max = 1, attributes = '', stateAttributes = '', metrics = [] }) {
    return `<section class="app-process-summary" data-monitor-phase="${esc(phase)}" aria-label="${esc(label)}" ${attributes}>
        <div class="app-process-summary-state" ${stateAttributes}><span class="app-process-summary-dot" aria-hidden="true"></span><strong data-monitor-label role="status">${esc(status)}</strong><span data-monitor-progress>${esc(progress)}</span></div>
        <progress data-monitor-bar max="${esc(max)}" value="${esc(value)}" aria-label="${esc(label)} ilerlemesi"></progress>
        <dl>${metrics.map(({ label, value = '—', tone = 'inherit', attributes = '', valueAttributes = '' }) => `<div data-process-tone="${esc(tone)}" ${attributes}><dt>${esc(label)}</dt><dd ${valueAttributes}>${esc(value)}</dd></div>`).join('')}</dl>
    </section>`;
}
