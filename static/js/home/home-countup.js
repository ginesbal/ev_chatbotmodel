(() => {
  'use strict';

  const DATA_SRC = 'https://evtable.com/all-manual-2024-03-09-1.js';

  function normBrand(s) {
    if (!s) return '';
    s = s.trim().toLowerCase();
    s = s.replace('–', '-').replace('—', '-'); // unify dashes
    s = s.replace('-', ' ');                   // treat hyphen like space
    s = s.replace(/\s+/g, ' ');                // collapse spaces
    return s;
  }

  function computeCounts(data) {
    const ids = new Set();
    const makes = new Set();

    for (const r of Array.isArray(data) ? data : []) {
      const pid = r?.permanentId ?? r?.id;
      if (pid !== undefined && pid !== null) ids.add(String(pid));

      const mk = typeof r?.make === 'string' ? normBrand(r.make) : '';
      if (mk) makes.add(mk);
    }
    return { vehicles: ids.size, brands: makes.size };
  }

  function applyCounts({ vehicles, brands }) {
    const vehEl = document.getElementById('vehicleCount')
      || document.querySelector('.hero-stats .stat-number:nth-of-type(1)');
    const brEl  = document.getElementById('brandCount')
      || document.querySelector('.hero-stats .stat-number:nth-of-type(2)');

    if (vehEl) vehEl.dataset.target = String(vehicles);
    if (brEl)  brEl.dataset.target  = String(brands);

    // if StatsAnimator is present, let it animate.
    // Otherwise, set text immediately with a tiny inline animation.
    if (!(window.StatsAnimator && typeof window.StatsAnimator.animateNumbers === 'function')) {
      const nf = new Intl.NumberFormat();
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const animateTo = (el, target) => {
        if (!el) return;
        if (reduce) { el.textContent = nf.format(target); return; }
        const start = performance.now();
        const duration = 800;
        const from = parseInt((el.textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
        function tick(now) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const val = Math.round(from + (target - from) * eased);
          el.textContent = nf.format(val);
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      };

      animateTo(vehEl, vehicles);
      animateTo(brEl, brands);
    }

    // Let listeners know counts are ready
    document.dispatchEvent(new CustomEvent('ev:counts-ready', {
      detail: { vehicles, brands }
    }));
  }

  function ensureRowData() {
    // Already present?
    if (Array.isArray(window.rowData) && window.rowData.length) {
      return Promise.resolve(window.rowData);
    }

    // Load dataset dynamically
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = DATA_SRC;
      s.async = true;
      s.onload = () => {
        if (Array.isArray(window.rowData) && window.rowData.length) resolve(window.rowData);
        else reject(new Error('rowData missing after dataset load'));
      };
      s.onerror = () => reject(new Error('Failed to load dataset: ' + DATA_SRC));
      document.head.appendChild(s);

      // Timeout guard
      setTimeout(() => {
        if (!Array.isArray(window.rowData)) reject(new Error('Dataset load timeout'));
      }, 7000);
    });
  }

  function init() {
    const host = document.querySelector('.hero-stats');
    if (!host || host.dataset.countInitialized === '1') return;
    host.dataset.countInitialized = '1';

    ensureRowData()
      .then(data => computeCounts(data))
      .then(applyCounts)
      .catch(err => {
        // Non-fatal: leave server-rendered numbers alone
        console.warn('[home-countup] counts not applied:', err && err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
