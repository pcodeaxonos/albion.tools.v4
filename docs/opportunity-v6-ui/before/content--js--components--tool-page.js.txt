import { escapeHtml } from '../utils/utils.js';

// Every tool owns the same height chain; only the contents of its slots vary.
// fillControls lets panels share spare desktop height; content-sized is the default.
export function toolPageHtml({ key, head, topControls = '', controls = '', fillControls = false, summary = '', result = '', resultClass = '', bottomResult = '', overlays = '' }) {
    return `${head}
        <section class="page-body">
            ${topControls ? `<div class="tool-page-top-controls tool-split-controls">${topControls}</div>` : ''}
            <div class="tool-split">
                <section class="left">
                    <div class="controls tool-split-controls${fillControls ? ' tool-split-controls--fill' : ''}" data-controls="${escapeHtml(key)}">${controls}</div>
                    ${summary.trim() ? `<div class="summary">${summary}</div>` : ''}
                </section>
                <section class="right">
                    <div class="result tool-split-result ${escapeHtml(resultClass)}">${result}</div>
                </section>
            </div>
            ${bottomResult ? `<div class="tool-page-bottom-result tool-split-result">${bottomResult}</div>` : ''}
        </section>${overlays}`;
}
