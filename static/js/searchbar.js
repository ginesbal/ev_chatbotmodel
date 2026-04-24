// Search bar behavior: clear action, feedback states, "/" focus, Escape
// Visibility of clear + kbd is pure CSS (:placeholder-shown / :focus-within).
(() => {
    function initSearchForm(form) {
        const input = form.querySelector('.search-input');
        const clearBtn = form.querySelector('#search-clear');
        const submit = form.querySelector('.search-submit');
        const feedback = form.querySelector('#search-feedback');

        if (!input || !submit) return;

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
    }

    document.querySelectorAll('form.search-component').forEach(initSearchForm);

    // "/" focuses the first search input; Escape clears or blurs
    document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const inField = active &&
            (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !inField) {
            const firstInput = document.querySelector('.search-component .search-input');
            if (firstInput) {
                e.preventDefault();
                firstInput.focus();
                firstInput.select();
            }
        } else if (e.key === 'Escape' && active?.classList.contains('search-input')) {
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
