// Search bar behavior: sliding placeholder rotation, clear action,
// feedback states, Escape-to-clear. Visibility of the clear button is
// driven by CSS (:has + :placeholder-shown); JS only owns the rotation
// and the focus/invalid state data-attributes.
(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ROTATION_MS = 3800;
    const SLIDE_MS = 260;

    function startPlaceholderRotation(form, input) {
        const span = form.querySelector('.search-placeholder-visual');
        if (!span) return;

        let prompts;
        try { prompts = JSON.parse(input.dataset.placeholders || '[]'); }
        catch { return; }
        if (!Array.isArray(prompts) || prompts.length < 2) return;

        span.textContent = prompts[0];

        if (reduceMotion) return;

        let idx = 0;
        let timer = null;
        let paused = false;

        const swap = () => {
            // don't animate when the user is focused or typing
            if (paused || input.value.length > 0) return;

            // exit up
            span.dataset.phAnim = 'out';

            setTimeout(() => {
                idx = (idx + 1) % prompts.length;
                span.textContent = prompts[idx];

                // snap below (no transition), then release on next frame
                span.dataset.phAnim = 'in';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        delete span.dataset.phAnim;
                    });
                });
            }, SLIDE_MS);
        };

        const start = () => {
            stop();
            timer = setInterval(swap, ROTATION_MS);
        };
        const stop = () => {
            if (timer) { clearInterval(timer); timer = null; }
        };

        input.addEventListener('focus', () => { paused = true; stop(); });
        input.addEventListener('blur', () => {
            paused = false;
            if (input.value.length === 0) start();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else if (!paused && input.value.length === 0) start();
        });

        start();
    }

    function initSearchForm(form) {
        const input = form.querySelector('.search-input');
        const clearBtn = form.querySelector('#search-clear');
        const submit = form.querySelector('.search-submit');
        const feedback = form.querySelector('#search-feedback');

        if (!input || !submit) return;

        form.dataset.jsReady = '';

        const setBusy = (busy) => {
            form.setAttribute('aria-busy', String(busy));
            submit.toggleAttribute('disabled', busy);
        };

        const showFeedback = (msg, state = '') => {
            if (!feedback) return;
            feedback.hidden = !msg;
            feedback.textContent = msg || '';
            if (state) feedback.dataset.state = state;
            else feedback.removeAttribute('data-state');
        };

        input.addEventListener('focus', () => { form.dataset.hasFocus = ''; });
        input.addEventListener('blur', () => { delete form.dataset.hasFocus; });

        input.addEventListener('input', () => {
            const q = input.value.trim();
            form.removeAttribute('data-invalid');
            if (q.length > 2) {
                showFeedback(`Press Enter to search for “${q}”`, 'ready');
            } else {
                showFeedback('');
            }
        });

        clearBtn?.addEventListener('click', () => {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            showFeedback('');
            form.removeAttribute('data-invalid');
        });

        form.addEventListener('submit', (e) => {
            const q = input.value.trim();
            if (!q) {
                e.preventDefault();
                form.setAttribute('data-invalid', 'true');
                showFeedback('Type something to search.', 'error');
                input.focus();
                return;
            }
            setBusy(true);
            showFeedback('Searching…', 'loading');
        });

        setBusy(false);
        startPlaceholderRotation(form, input);
    }

    document.querySelectorAll('form.search-component').forEach(initSearchForm);

    // Escape in the search input clears it (or blurs if already empty).
    // The global "/" focus shortcut was removed — it wasn't discoverable.
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (e.key === 'Escape' && active?.classList.contains('search-input')) {
            const form = active.closest('form.search-component');
            if (active.value) {
                active.value = '';
                active.dispatchEvent(new Event('input', { bubbles: true }));
                const feedback = form?.querySelector('#search-feedback');
                if (feedback) { feedback.hidden = true; feedback.textContent = ''; feedback.removeAttribute('data-state'); }
                form?.removeAttribute('data-invalid');
            } else {
                active.blur();
            }
        }
    });
})();
