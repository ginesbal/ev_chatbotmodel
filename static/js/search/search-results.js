class SearchResults {
  constructor() {
    this.elements = {
      tabAll: document.getElementById('tabAll'),
      tabSaved: document.getElementById('tabSaved'),
      grid: document.getElementById('results-grid'),
      loading: document.getElementById('results-loading'),
      allCount: document.getElementById('tabAllCount'),
      savedCount: document.getElementById('tabSavedCount'),
      visibleCount: document.getElementById('visibleCount'),
      visibleEnd: document.getElementById('visibleEnd'),
      totalCount: document.getElementById('totalCount'),
      summaryPage: document.querySelector('.results-summary-page')
    };

    this.state = {
      currentTab: 'all',
      originalContent: null,
      originalTotal: null,
      originalVisibleStart: null,
      originalVisibleEnd: null,
      isLoading: false
    };

    this.init();
  }

  init() {
    if (!this.elements.tabAll || !this.elements.tabSaved || !this.elements.grid) return;

    // store original values
    this.state.originalContent = this.elements.grid.innerHTML;
    this.state.originalTotal = this.elements.totalCount?.textContent || '0';
    this.state.originalVisibleStart = this.elements.visibleCount?.textContent || '1';
    this.state.originalVisibleEnd = this.elements.visibleEnd?.textContent || '0';

    // tab click handlers
    this.elements.tabAll.addEventListener('click', () => this.switchTab('all'));
    this.elements.tabSaved.addEventListener('click', () => this.switchTab('saved'));

    // keyboard navigation
    [this.elements.tabAll, this.elements.tabSaved].forEach(tab => {
      tab.addEventListener('keydown', (e) => this.handleTabKeydown(e));
    });

    // listen for favorites changes from saved.js
    document.addEventListener('evision:favsChanged', (e) => {
      const count = e.detail?.size ?? 0;
      if (this.elements.savedCount) {
        this.elements.savedCount.textContent = String(count);
      }
      // refresh saved tab if currently active
      if (this.state.currentTab === 'saved') {
        this.loadSavedVehicles();
      }
    });

    // initialize saved count
    const initCount = JSON.parse(localStorage.getItem('evison_favorites') || '[]').length;
    if (this.elements.savedCount) {
      this.elements.savedCount.textContent = String(initCount);
    }

    // handle unsave clicks in saved tab
    this.elements.grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fav-btn]');
      if (!btn || this.state.currentTab !== 'saved') return;

      const card = btn.closest('.card');
      if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
      }
      setTimeout(() => this.loadSavedVehicles(), 300);
    });
  }

  handleTabKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const current = e.target;
      const next = e.key === 'ArrowRight'
        ? (current === this.elements.tabAll ? this.elements.tabSaved : this.elements.tabAll)
        : (current === this.elements.tabSaved ? this.elements.tabAll : this.elements.tabSaved);
      next.focus();
      next.click();
    }
  }

  async switchTab(tab) {
    if (this.state.currentTab === tab || this.state.isLoading) return;

    this.state.currentTab = tab;

    if (tab === 'saved') {
      this.setTabActive(this.elements.tabSaved, true);
      this.setTabActive(this.elements.tabAll, false);
      await this.loadSavedVehicles();
    } else {
      this.setTabActive(this.elements.tabAll, true);
      this.setTabActive(this.elements.tabSaved, false);
      this.restoreOriginalContent();
    }
  }

  setTabActive(tab, isActive) {
    tab.setAttribute('aria-selected', String(isActive));

    if (isActive) {
      tab.classList.add('results-tab-active');
      const badge = tab.querySelector('.results-tab-badge');
      if (badge) badge.classList.remove('results-tab-badge-inactive');
    } else {
      tab.classList.remove('results-tab-active');
      const badge = tab.querySelector('.results-tab-badge');
      if (badge) badge.classList.add('results-tab-badge-inactive');
    }
  }

  async loadSavedVehicles() {
    this.showLoading();

    try {
      const response = await fetch('/saved/fragment', {
        headers: {
          'X-Requested-With': 'fetch',
          'Accept': 'text/html'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      this.elements.grid.innerHTML = html || this.getEmptyStateHTML();

      // re-initialize favorite buttons
      if (typeof window.EVisonInitFavButtons === 'function') {
        window.EVisonInitFavButtons(this.elements.grid);
      }

      // update counts
      const count = this.elements.grid.querySelectorAll('.card,[data-fav-key]').length;
      this.updateStats(count, true);

    } catch (error) {
      console.error('Failed to load saved vehicles:', error);
      this.elements.grid.innerHTML = this.getErrorStateHTML();
    } finally {
      this.hideLoading();
    }
  }

  restoreOriginalContent() {
    this.showLoading();

    setTimeout(() => {
      this.elements.grid.innerHTML = this.state.originalContent;

      // re-initialize favorite buttons
      if (typeof window.EVisonInitFavButtons === 'function') {
        window.EVisonInitFavButtons(this.elements.grid);
      }

      // restore original counts
      if (this.elements.visibleCount) {
        this.elements.visibleCount.textContent = this.state.originalVisibleStart;
      }
      if (this.elements.visibleEnd) {
        this.elements.visibleEnd.textContent = this.state.originalVisibleEnd;
      }
      if (this.elements.totalCount) {
        this.elements.totalCount.textContent = this.state.originalTotal;
      }
      if (this.elements.allCount) {
        this.elements.allCount.textContent = this.state.originalTotal;
      }
      if (this.elements.summaryPage) {
        this.elements.summaryPage.style.display = '';
      }

      this.hideLoading();
    }, 100);
  }

  updateStats(count, isSaved = false) {
    if (isSaved) {
      // saved tab: show "1–N" format where N is the count
      if (this.elements.visibleCount) {
        this.elements.visibleCount.textContent = count > 0 ? '1' : '0';
      }
      if (this.elements.visibleEnd) {
        this.elements.visibleEnd.textContent = String(count);
      }
    } else {
      // all tab: restore original values
      if (this.elements.visibleCount) {
        this.elements.visibleCount.textContent = this.state.originalVisibleStart;
      }
      if (this.elements.visibleEnd) {
        this.elements.visibleEnd.textContent = this.state.originalVisibleEnd;
      }
    }

    if (this.elements.totalCount) {
      this.elements.totalCount.textContent = String(count);
    }

    if (this.elements.savedCount) {
      this.elements.savedCount.textContent = String(count);
    }

    if (this.elements.summaryPage) {
      this.elements.summaryPage.style.display = isSaved ? 'none' : '';
    }
  }

  getEmptyStateHTML() {
    return `
      <div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <svg class="w-16 h-16 text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" 
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <p class="text-xl font-medium mb-2">No saved vehicles</p>
        <p class="text-muted max-w-md mb-6">Click the heart icon on any vehicle to save it to your list.</p>
      </div>
    `;
  }

  getErrorStateHTML() {
    return `
      <div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <svg class="w-16 h-16 text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" 
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p class="text-xl font-medium mb-2">Failed to load saved vehicles</p>
        <p class="text-muted max-w-md mb-6">There was a problem loading your saved vehicles. Please try again.</p>
        <button class="btn btn-primary" onclick="document.getElementById('tabSaved').click()">Retry</button>
      </div>
    `;
  }

  showLoading() {
    this.state.isLoading = true;
    if (this.elements.loading) this.elements.loading.style.display = 'flex';
    if (this.elements.grid) this.elements.grid.setAttribute('aria-busy', 'true');
  }

  hideLoading() {
    this.state.isLoading = false;
    if (this.elements.loading) this.elements.loading.style.display = 'none';
    if (this.elements.grid) this.elements.grid.setAttribute('aria-busy', 'false');
  }
}

// initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.searchResults = new SearchResults();
  });
} else {
  window.searchResults = new SearchResults();
}