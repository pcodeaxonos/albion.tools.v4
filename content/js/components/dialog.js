let initialized = false;

export function initDialogBackdropClose() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('click', event => {
        const dialog = event.target;
        if (!(dialog instanceof HTMLDialogElement) || !dialog.matches('.app-dialog[open]')) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
            dialog.close();
        }
    });
}
