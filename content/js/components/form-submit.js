// Keep a single submission in flight while the database confirms it.
export async function runFormSubmission(form, submit) {
    if (!form || form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
    const buttons = [...form.querySelectorAll('[type="submit"]')].map(button => [button, button.disabled]);
    for (const [button] of buttons) button.disabled = true;
    try { return await submit(); }
    finally {
        delete form.dataset.submitting;
        form.removeAttribute('aria-busy');
        for (const [button, disabled] of buttons) button.disabled = disabled;
    }
}
