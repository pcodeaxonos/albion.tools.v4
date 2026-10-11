import { escapeHtml } from '../utils/utils.js';
import { showToast } from './toast.js';

/** Keep the copied name independent of tier badges, bonuses and other metadata. */
export function itemNameHtml(name, copyName = name) {
    return `<span class="item-name-copy" data-copy-item-name="${escapeHtml(copyName)}" role="button" tabindex="0" title="Item adını kopyala" aria-label="${escapeHtml(copyName)} adını kopyala">${escapeHtml(name)}</span>`;
}

let initialized = false;

async function copyName(name) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(name);
        } else {
            // Older browsers and HTTP LAN hosts do not expose the Clipboard API.
            const field = document.createElement('textarea');
            const focused = document.activeElement;
            field.value = name;
            field.className = 'item-name-copy-buffer';
            const parent = document.querySelector('dialog[open]') || document.body;
            parent.appendChild(field);
            try {
                field.select();
                if (!document.execCommand('copy')) throw new Error('Copy failed');
            } finally {
                field.remove();
                focused?.focus({ preventScroll: true });
            }
        }
        showToast(`${name} kopyalandı.`);
    } catch {
        showToast('Item adı kopyalanamadı. Tarayıcının pano iznini kontrol edin.', { kind: 'error' });
    }
}

export function initItemNameCopy() {
    if (initialized) return;
    initialized = true;
    const activate = (event) => {
        const target = event.target.closest?.('[data-copy-item-name]');
        if (!target || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void copyName(target.dataset.copyItemName);
    };
    document.addEventListener('click', activate, true);
    document.addEventListener('keydown', activate, true);
}
