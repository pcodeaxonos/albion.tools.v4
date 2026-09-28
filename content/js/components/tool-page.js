import { escapeHtml } from '../utils/utils.js';

// Every tool owns the same height chain; only the contents of its slots vary.
export function toolPageHtml({ key, head, controls = '', summary = '', result = '', resultClass = '', overlays = '' }) {
    return `${head}
        <section class="page-body">
            <div class="tool-split">
                <section class="left">
                    <div class="controls tool-split-controls" data-controls="${escapeHtml(key)}">${controls}</div>
                    <div class="summary">${summary}</div>
                </section>
                <section class="right">
                    <div class="result tool-split-result ${escapeHtml(resultClass)}">${result}</div>
                </section>
            </div>
        </section>${overlays}`;
}
