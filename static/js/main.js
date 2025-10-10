// Simple, focused application controller
const EVApp = {
  init() {
    this.setupSearch();
    this.setupSaved();
    this.setupFilters();
    this.setupTheme();
  },

  // Search functionality
  setupSearch() {
    const forms = document.querySelectorAll('.search-form');
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        const input = form.querySelector('input[type="search"]');
        if (!input.value.trim()) {
          e.preventDefault();
          input.focus();
        }
      });
    });

    // Keyboard shortcut: / to focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !this.isTyping()) {
        e.preventDefault();
        const input = document.querySelector('input[type="search"]');
        if (input) input.focus();
      }
    });
  },

  // Saved vehicles
  setupSaved() {
    const saved = this.getSaved();
    this.updateSavedCount(saved.length);

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.save-btn');
      if (!btn) return;

      const id = btn.dataset.id;
      if (!id) return;

      const saved = this.getSaved();
      const index = saved.indexOf(id);
      
      if (index === -1) {
        saved.push(id);
      } else {
        saved.splice(index, 1);
      }

      localStorage.setItem('ev_saved', JSON.stringify(saved));
      this.updateSaveButton(btn, index === -1);
      this.updateSavedCount(saved.length);

      // If on saved page and removed, hide the card
      if (window.location.pathname === '/saved' && index !== -1) {
        const card = btn.closest('.card');
        if (card) {
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 300);
        }
      }
    });

    // Set initial states
    this.updateAllSaveButtons();
  },

  getSaved() {
    try {
      return JSON.parse(localStorage.getItem('ev_saved') || '[]');
    } catch {
      return [];
    }
  },

  updateSaveButton(btn, isSaved) {
    btn.classList.toggle('is-saved', isSaved);
    btn.setAttribute('aria-pressed', isSaved);
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isSaved ? 'fas fa-heart' : 'far fa-heart';
    }
  },

  updateAllSaveButtons() {
    const saved = this.getSaved();
    document.querySelectorAll('.save-btn').forEach(btn => {
      const isSaved = saved.includes(btn.dataset.id);
      this.updateSaveButton(btn, isSaved);
    });
  },

  updateSavedCount(count) {
    const badge = document.getElementById('saved-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  },

  // Filters
  setupFilters() {
    const form = document.getElementById('filter-form');
    if (!form) return;

    // Auto-submit on change for better UX
    const selects = form.querySelectorAll('select');
    selects.forEach(select => {
      select.addEventListener('change', () => form.submit());
    });
  },

  // Theme toggle
  setupTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.dataset.theme === 'dark';
      html.dataset.theme = isDark ? 'light' : 'dark';
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
      
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
      }
    });
  },

  isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }
};

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EVApp.init());
} else {
  EVApp.init();
}