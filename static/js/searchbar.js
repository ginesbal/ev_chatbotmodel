// Search bar — vertical-scroll placeholder rotation.
// Exits the current prompt up + fades, snaps the next line below, then
// releases it back to baseline. Pauses on focus, on typed content, and
// when the tab is hidden. Skipped entirely under prefers-reduced-motion.
(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ROTATION_MS = 3500;
    const SLIDE_MS = 280;

    document.querySelectorAll('form.search-component').forEach((form) => {
        const input = form.querySelector('.search-input');
        const span = form.querySelector('.search-placeholder-visual');
        if (!input || !span) return;

        let prompts;
        try { prompts = JSON.parse(input.dataset.placeholders || '[]'); }
        catch { return; }
        const hasPrompts = Array.isArray(prompts) && prompts.length >= 2;

        if (hasPrompts) span.textContent = prompts[0];
        form.dataset.jsReady = '';

        let idx = 0;
        let timer = null;
        let paused = false;

        const swap = () => {
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
            if (!hasPrompts || reduceMotion) return;
            stop();
            timer = setInterval(swap, ROTATION_MS);
        };
        const stop = () => {
            if (timer) { clearInterval(timer); timer = null; }
        };

        input.addEventListener('focus', () => {
            form.dataset.hasFocus = '';
            paused = true;
            stop();
        });
        input.addEventListener('blur', () => {
            delete form.dataset.hasFocus;
            paused = false;
            if (input.value.length === 0) start();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else if (!paused && input.value.length === 0) start();
        });

        start();
    });
})();
