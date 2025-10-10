// Compute & render vehicle / brand counts on the homepage.
// Uses server-provided data-targets as fallback and overrides with rowData when available.
(() => {
    function getEls() {
        const vehEl = document.getElementById('vehicleCount');
        const brandEl = document.getElementById('brandCount');
        return { vehEl, brandEl };
    }

    function normBrand(s) {
        if (!s) return '';
        return String(s)
            .trim()
            .toLowerCase()
            .replace(/–|—/g, '-')   // normalize dashes
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ');
    }

    function computeCounts(data) {
        const ids = new Set();
        const brands = new Set();
        for (const r of Array.isArray(data) ? data : []) {
            const pid = r?.permanentId ?? r?.id;
            if (pid !== undefined && pid !== null) ids.add(String(pid));
            if (typeof r?.make === 'string' && r.make.trim()) {
                brands.add(normBrand(r.make));
            }
        }
        return { vehicles: ids.size, brandCount: brands.size };
    }

    function renderCounts(v, b) {
        const nf = new Intl.NumberFormat();
        const { vehEl, brandEl } = getEls();
        if (vehEl) {
            vehEl.textContent = nf.format(v);
            vehEl.setAttribute('data-target', String(v));
        }
        if (brandEl) {
            brandEl.textContent = nf.format(b);
            brandEl.setAttribute('data-target', String(b));
        }

        // Let any listeners (e.g., count-up animations) know we updated
        document.dispatchEvent(new CustomEvent('evision:countsUpdated', {
            detail: { vehicles: v, brands: b }
        }));
    }

    function renderFromAttributes() {
        const { vehEl, brandEl } = getEls();
        const v = Number(vehEl?.getAttribute('data-target') || vehEl?.textContent || 0);
        const b = Number(brandEl?.getAttribute('data-target') || brandEl?.textContent || 0);
        renderCounts(Number.isFinite(v) ? v : 0, Number.isFinite(b) ? b : 0);
    }

    function tryRenderFromRowData() {
        if (Array.isArray(window.rowData) && window.rowData.length) {
            const { vehicles, brandCount } = computeCounts(window.rowData);
            if (vehicles || brandCount) {
                renderCounts(vehicles, brandCount);
                return true;
            }
        }
        return false;
    }

    function injectDatasetFallback() {
        const src = 'https://evtable.com/all-manual-2024-03-09-1.js';
        if (document.querySelector(`script[src="${src}"]`)) return; // already present
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => { tryRenderFromRowData() || renderFromAttributes(); };
        s.onerror = () => { console.warn('Could not load EV dataset for counts:', src); renderFromAttributes(); };
        document.head.appendChild(s);
    }

    function init() {
        // Start with whatever server gave us
        renderFromAttributes();

        // If rowData is already present (defer order likely ensures this), use it
        if (tryRenderFromRowData()) return;

        // If not present yet, attempt a gentle fallback: wait a tick, then inject if still absent
        setTimeout(() => {
            if (!tryRenderFromRowData()) injectDatasetFallback();
        }, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
