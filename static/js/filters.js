(function () {
    function onReady(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    onReady(function () {
        const form = document.getElementById('filter-form');
        if (!form) return;

        // Server defaults 
        const DEFAULTS = {
            max_price: '',
            min_range: '',
            seats: '',
            sort: 'score_desc',
            drivetrain: 'any'
        };

        function pruneDefaults(f) {
            // remove empty/defaults for simple inputs/selects
            for (const [name, defVal] of Object.entries(DEFAULTS)) {
                const el = f.elements.namedItem(name);
                if (!el) continue
                const val = (el.value || '').trim();

                if (val === '' || val === String(defVal)) {
                    // avoid sending this param when it's empty/default
                    el.removeAttribute('name');
                }
            }

            // if search_query is blank, drop it
            const sq = f.elements.namedItem('search_query');
            if (sq && !String(sq.value || '').trim()) {
                sq.removeAttribute('name');
            }

            // reset pagination on every submit
            const pg = f.elements.namedItem('page');
            if (pg) pg.value = '1';

            // note: is_suv is a checkbox; unchecked = not submitted by default.
            // If checked, it will submit (desired).
        }

        form.addEventListener('submit', function () { pruneDefaults(form); });
    });
})();
