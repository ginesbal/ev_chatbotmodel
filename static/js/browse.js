// Browse page: All <-> Saved tab swapping (fragment fetch) + counts update
(() => {
    const grid = document.getElementById('results-grid');
    const tabAll = document.getElementById('tabAll');
    const tabSav = document.getElementById('tabSaved');
    const visEl = document.getElementById('visibleCount');
    const totEl = document.getElementById('totalCount');
    const log = (...a) => console.info('[browse:saved-tab]', ...a);

    if (!grid || !tabAll || !tabSav) return;

    let originalHTML = grid.innerHTML;
    let inflight;

    function selectTab(saved) {
        tabAll.setAttribute('aria-selected', String(!saved));
        tabSav.setAttribute('aria-selected', String(saved));
        tabAll.style.background = saved ? 'transparent' : 'var(--surface)';
        tabSav.style.background = saved ? 'var(--surface)' : 'transparent';
    }

    function setCounts(n) {
        if (visEl) visEl.textContent = String(n);
        if (totEl) totEl.textContent = String(n);
    }

    async function showSaved() {
        selectTab(true);
        try {
            inflight?.abort();
            inflight = new AbortController();
            const res = await fetch('/saved/fragment', {
                headers: { 'X-Requested-With': 'fetch', 'Accept': 'text/html' },
                credentials: 'same-origin',
                signal: inflight.signal
            });
            if (!res.ok) throw new Error(`GET /saved/fragment ${res.status}`);
            const html = await res.text();
            grid.innerHTML = html;

            // Re-bind favorite buttons within the new fragment (if your helper exists)
            window.EVisonInitFavButtons?.(grid);

            const n = grid.querySelectorAll('.card,[data-fav-key]').length;
            setCounts(n);
            log('rendered saved cards', { count: n });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('[browse:saved-tab] failed to load fragment', err);
        } finally {
            inflight = null;
        }
    }

    function showAll() {
        selectTab(false);
        grid.innerHTML = originalHTML;

        // Re-bind favorites in the restored DOM
        window.EVisonInitFavButtons?.(grid);

        const n = grid.querySelectorAll('.card,[data-fav-key]').length;
        setCounts(n);
        log('restored all cards', { count: n });
    }

    // Bind clicks
    tabAll.addEventListener('click', showAll);
    tabSav.addEventListener('click', showSaved);

    // If favorites change while on the Saved tab, refresh the fragment
    document.addEventListener('evision:favsChanged', () => {
        if (tabSav.getAttribute('aria-selected') === 'true') showSaved();
    });

    // If user unsaves an item while on Saved tab, refresh quickly
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-fav-btn]');
        if (!btn) return;
        if (tabSav.getAttribute('aria-selected') === 'true') {
            // small delay so server state updates first
            setTimeout(showSaved, 0);
        }
    });
})();
