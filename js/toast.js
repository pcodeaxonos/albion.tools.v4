const HOST_ID = 'app-toast-host';
const DEFAULT_DURATION = 3200;
const EXIT_MS = 220;

let hideTimer = 0;
let exitTimer = 0;

function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) {
        return host;
    }
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'app-toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-relevant', 'additions text');
    document.body.appendChild(host);
    return host;
}

function clearTimers() {
    if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
    }
    if (exitTimer) {
        window.clearTimeout(exitTimer);
        exitTimer = 0;
    }
}

function removeToast(el) {
    if (!el || !el.isConnected) {
        return;
    }
    el.classList.remove('is-in');
    el.classList.add('is-out');
    exitTimer = window.setTimeout(() => {
        el.remove();
        exitTimer = 0;
    }, EXIT_MS);
}

/**
 * Fixed toast — does not affect page layout.
 * @param {string} message
 * @param {{ kind?: 'success' | 'error' | 'info', duration?: number }} [options]
 */
export function showToast(message, options = {}) {
    const text = String(message || '').trim();
    if (!text) {
        return;
    }

    const kind = options.kind === 'error' || options.kind === 'info' ? options.kind : 'success';
    const duration = Number.isFinite(options.duration) ? Math.max(1200, options.duration) : DEFAULT_DURATION;
    const host = ensureHost();

    clearTimers();
    host.querySelectorAll('.app-toast').forEach((node) => node.remove());

    const el = document.createElement('div');
    el.className = `app-toast app-toast--${kind}`;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = `
        <span class="app-toast__bar" aria-hidden="true"></span>
        <p class="app-toast__text"></p>
        <button type="button" class="app-toast__close" aria-label="Kapat"></button>
    `;
    el.querySelector('.app-toast__text').textContent = text;

    const dismiss = () => {
        clearTimers();
        removeToast(el);
    };

    el.querySelector('.app-toast__close')?.addEventListener('click', dismiss);
    el.addEventListener('click', (event) => {
        if (event.target.closest('.app-toast__close')) {
            return;
        }
        dismiss();
    });

    host.appendChild(el);
    requestAnimationFrame(() => {
        el.classList.add('is-in');
    });

    hideTimer = window.setTimeout(dismiss, duration);
}
