// Search bar behavior: clear button, feedback, focus "/" shortcut, defensive states
(() => {
    function initSearchForm(form) {
        const input = form.querySelector('.search-input');
        const clearBtn = form.querySelector('#search-clear');
        const submit = form.querySelector('.search-submit');
        const feedback = form.querySelector('#search-feedback');

        if (!input || !submit || !feedback) return;

        const setBusy = (busy) => {
            form.setAttribute('aria-busy', String(busy));
            submit.toggleAttribute('disabled', busy);
        };

        const showFeedback = (msg, state = '') => {
            feedback.hidden = !msg;
            feedback.textContent = msg || '';
            if (state) feedback.dataset.state = state;
            else feedback.removeAttribute('data-state');
        };

        const updateClear = () => {
            if (!clearBtn) return;
            clearBtn.hidden = input.value.trim().length === 0;
        };

        input.addEventListener('input', () => {
            updateClear();
            const q = input.value.trim();
            if (q.length > 2) {
                showFeedback(`Press Enter to search for “${q}”`, 'ready');
                form.removeAttribute('data-invalid');
            } else {
                showFeedback('');
            }
        });

        clearBtn?.addEventListener('click', () => {
            input.value = '';
            input.focus();
            updateClear();
            showFeedback('');
            form.removeAttribute('data-invalid');
        });

        // Form submit validation + polish
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
            // SSR navigation will occur; this is just a11y polish pre-nav.
        });

        // init state
        updateClear();
        setBusy(false);
    }

    // Bind every search component on the page (robust if multiple forms exist)
    document.querySelectorAll('form.search-component').forEach(initSearchForm);

    // "/" to focus the first search input (don’t hijack when typing in inputs/areas)
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
            const clearBtn = form?.querySelector('#search-clear');
            if (active.value) {
                active.value = '';
                clearBtn && (clearBtn.hidden = true);
                const feedback = form?.querySelector('#search-feedback');
                if (feedback) { feedback.hidden = true; feedback.textContent = ''; feedback.removeAttribute('data-state'); }
            } else {
                active.blur();
            }
        }
    });
})();
