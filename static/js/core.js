// unified evision application
class EVisionApp {
  constructor() {
    this.config = {
      apiBase: '/api',
      searchDebounce: 300,
      cacheTimeout: 60000, // 1 minute
    };

    this.state = {
      saved: new Set(),
      searchCache: new Map(),
      currentSearch: null,
      filters: {},
    };

    this.init();
  }

  async init() {
    // load saved state from backend
    await this.loadSavedState();

    // setup all interactions
    this.setupSearch();
    this.setupFilters();
    this.setupSaveButtons();
    this.setupRealtimeSearch();

    // listen for cross-tab changes
    this.setupCrossTabSync();
  }

  // ========== state management ==========

  async loadSavedState() {
    try {
      const response = await fetch('/api/saved');
      const data = await response.json();

      this.state.saved = new Set(data.keys);
      this.updateSavedUI();
    } catch (error) {
      console.error('Failed to load saved state:', error);
    }
  }

  async toggleSaved(vehicleId) {
    const isSaved = this.state.saved.has(vehicleId);

    // optimistic update
    if (isSaved) {
      this.state.saved.delete(vehicleId);
    } else {
      this.state.saved.add(vehicleId);
    }
    this.updateSaveButton(vehicleId, !isSaved);

    try {
      const method = isSaved ? 'DELETE' : 'POST';
      const response = await fetch(`/api/saved/${vehicleId}`, { method });

      if (!response.ok) {
        throw new Error('Failed to update saved state');
      }

      const data = await response.json();
      this.updateSavedCount(data.count);

      // broadcast to other tabs
      this.broadcastStateChange();

    } catch (error) {
      // Revert on failure
      if (isSaved) {
        this.state.saved.add(vehicleId);
      } else {
        this.state.saved.delete(vehicleId);
      }
      this.updateSaveButton(vehicleId, isSaved);

      console.error('Failed to save vehicle:', error);
      this.showNotification('Failed to update saved vehicles', 'error');
    }
  }

  // ========== Search Implementation ==========

  setupSearch() {
    const searchForms = document.querySelectorAll('.search-form');

    searchForms.forEach(form => {
      const input = form.querySelector('input[type="search"]');
      if (!input) return;

      // Prevent form submission, use AJAX instead
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.performSearch(input.value);
      });

      // Real-time suggestions
      let debounceTimer;
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();

        // Show search insights
        if (query.length >= 2) {
          debounceTimer = setTimeout(() => {
            this.showSearchInsights(query);
          }, this.config.searchDebounce);
        }
      });
    });
  }

  async performSearch(query) {
    // Check cache first
    const cacheKey = this.buildCacheKey(query, this.state.filters);
    if (this.state.searchCache.has(cacheKey)) {
      const cached = this.state.searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        this.renderResults(cached.data);
        return;
      }
    }

    // Show loading state
    this.showLoadingState();

    try {
      const params = new URLSearchParams({
        search_query: query,
        ...this.state.filters
      });

      const response = await fetch(`/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      // Cache the results
      this.state.searchCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      this.renderResults(data);

      // Update URL without page reload
      this.updateURL(params);

    } catch (error) {
      console.error('Search failed:', error);
      this.showErrorState();
    }
  }

  showSearchInsights(query) {
    // Parse the query using similar logic to backend
    const insights = this.parseQuery(query);

    if (!insights.tokens.length) return;

    const container = document.getElementById('search-insights');
    if (!container) return;

    container.innerHTML = `
      <div class="insights-panel">
        ${insights.priceMax ? `<span class="insight">Under $${insights.priceMax.toLocaleString()}</span>` : ''}
        ${insights.rangeMin ? `<span class="insight">${insights.rangeMin}+ km range</span>` : ''}
        ${insights.seats ? `<span class="insight">${insights.seats}+ seats</span>` : ''}
        ${insights.isSuv ? `<span class="insight">SUV</span>` : ''}
        ${insights.driveType ? `<span class="insight">${insights.driveType}</span>` : ''}
      </div>
    `;

    container.hidden = false;
  }

  parseQuery(query) {
    // Client-side query parsing that mirrors backend logic
    const insights = {
      tokens: [],
      priceMax: null,
      priceMin: null,
      rangeMin: null,
      seats: null,
      isSuv: false,
      driveType: null
    };

    // Price detection
    const priceMatch = query.match(/\b(under|over)\s*\$?\s*([\d,]+k?|\d+)\b/i);
    if (priceMatch) {
      const value = this.parsePrice(priceMatch[2]);
      if (priceMatch[1].toLowerCase() === 'under') {
        insights.priceMax = value;
      } else {
        insights.priceMin = value;
      }
    }

    // Range detection
    const rangeMatch = query.match(/\b(over|under)?\s*(\d+)\s*(km|mi)\b/i);
    if (rangeMatch) {
      const value = parseInt(rangeMatch[2]);
      const unit = rangeMatch[3].toLowerCase();
      insights.rangeMin = unit === 'mi' ? Math.round(value * 1.60934) : value;
    }

    // Seats detection
    const seatsMatch = query.match(/\b(\d+)\s*seats?\b/i);
    if (seatsMatch) {
      insights.seats = parseInt(seatsMatch[1]);
    }

    // SUV detection
    if (/\b(suv|crossover|cuv)\b/i.test(query)) {
      insights.isSuv = true;
    }

    // Drivetrain detection
    const driveMatch = query.match(/\b(awd|4wd|fwd|rwd)\b/i);
    if (driveMatch) {
      insights.driveType = driveMatch[1].toUpperCase();
    }

    // Extract remaining tokens
    let cleanQuery = query
      .replace(/\b(under|over)\s*\$?\s*([\d,]+k?|\d+)\b/gi, '')
      .replace(/\b\d+\s*(km|mi)\b/gi, '')
      .replace(/\b\d+\s*seats?\b/gi, '')
      .replace(/\b(suv|crossover|cuv|awd|4wd|fwd|rwd)\b/gi, '');

    insights.tokens = cleanQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2);

    return insights;
  }

  parsePrice(str) {
    str = str.replace(/,/g, '');
    if (str.endsWith('k')) {
      return parseFloat(str.slice(0, -1)) * 1000;
    }
    return parseFloat(str);
  }

  // ========== Filters ==========

  setupFilters() {
    // Smart filter panel
    const filterTriggers = document.querySelectorAll('[data-filter-trigger]');

    filterTriggers.forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const filterType = trigger.dataset.filterTrigger;
        this.showFilterPanel(filterType);
      });
    });

    // Apply filters without page reload
    const filterInputs = document.querySelectorAll('[data-filter]');
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.applyFilters();
      });
    });
  }

  showFilterPanel(filterType) {
    // Create a floating panel with the filter
    const panel = document.createElement('div');
    panel.className = 'filter-panel-floating';
    panel.innerHTML = this.getFilterPanelContent(filterType);

    document.body.appendChild(panel);

    // Position near the trigger
    const trigger = document.querySelector(`[data-filter-trigger="${filterType}"]`);
    const rect = trigger.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 10}px`;
    panel.style.left = `${rect.left}px`;

    // Origin-aware scale-in from the trigger
    const originX = rect.left < window.innerWidth / 2 ? 'left' : 'right';
    panel.style.transformOrigin = `top ${originX}`;
    panel.style.opacity = '0';
    panel.style.transform = 'scale(0.96)';
    panel.style.transition = 'opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)';
    requestAnimationFrame(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'scale(1)';
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!panel.contains(e.target)) {
          panel.remove();
        }
      }, { once: true });
    }, 100);
  }

  getFilterPanelContent(filterType) {
    switch (filterType) {
      case 'price':
        return `
          <div class="filter-content">
            <h3>Maximum Price</h3>
            <div class="price-slider-wrapper">
              <input type="range" 
                     id="price-slider" 
                     min="20000" 
                     max="150000" 
                     step="5000" 
                     value="${this.state.filters.max_price || 150000}">
              <output>$${(this.state.filters.max_price || 150000).toLocaleString()}</output>
            </div>
            <div class="quick-select">
              <button data-price="30000">$30k</button>
              <button data-price="40000">$40k</button>
              <button data-price="50000">$50k</button>
              <button data-price="70000">$70k</button>
            </div>
          </div>
        `;

      case 'range':
        return `
          <div class="filter-content">
            <h3>Minimum Range</h3>
            <input type="number" 
                   placeholder="300" 
                   value="${this.state.filters.min_range || ''}"
                   data-filter="min_range"> km
            <div class="quick-select">
              <button data-range="200">200+ km</button>
              <button data-range="300">300+ km</button>
              <button data-range="400">400+ km</button>
              <button data-range="500">500+ km</button>
            </div>
          </div>
        `;

      default:
        return '<div>Filter options</div>';
    }
  }

  async applyFilters() {
    // Collect all filter values
    const filters = {};
    document.querySelectorAll('[data-filter]').forEach(input => {
      const key = input.dataset.filter;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      if (value) {
        filters[key] = value;
      }
    });

    this.state.filters = filters;

    // Re-run search with filters
    const searchInput = document.querySelector('.search-input');
    if (searchInput && searchInput.value) {
      await this.performSearch(searchInput.value);
    }
  }

  // ========== Rendering ==========

  renderResults(data) {
    const container = document.getElementById('results-grid');
    if (!container) return;

    // Clear loading state
    this.hideLoadingState();

    if (!data.items || data.items.length === 0) {
      container.innerHTML = this.getEmptyState();
      return;
    }

    // Render cards
    container.innerHTML = data.items.map(item => this.renderCard(item)).join('');

    // Update pagination
    this.renderPagination(data.page_meta);

    // Initialize save buttons
    this.updateAllSaveButtons();

    // Animate cards in
    this.animateCards();
  }

  renderCard(vehicle) {
    const isSaved = this.state.saved.has(String(vehicle.permanentId));
    const priceDisplay = vehicle.price_cad
      ? `$${vehicle.price_cad.toLocaleString()}`
      : 'Contact Dealer';

    return `
      <article class="vehicle-card" data-vehicle-id="${vehicle.permanentId}">
        <div class="card-image-wrapper">
          <img src="${vehicle.image_url || '/static/images/placeholder.svg'}" 
               alt="${vehicle.brand} ${vehicle.model}"
               loading="lazy">
          
          <button class="save-btn ${isSaved ? 'is-saved' : ''}" 
                  data-vehicle-id="${vehicle.permanentId}"
                  aria-label="Save ${vehicle.brand} ${vehicle.model}"
                  aria-pressed="${isSaved}">
            <svg class="heart-icon" viewBox="0 0 24 24">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>
            </svg>
          </button>
          
          ${vehicle.taxCreditAmount ? `
            <span class="incentive-badge">
              $${vehicle.taxCreditAmount.toLocaleString()} incentive
            </span>
          ` : ''}
        </div>
        
        <div class="card-content">
          <h3 class="card-title">${vehicle.model}</h3>
          <p class="card-brand">${vehicle.brand}</p>
          <p class="card-price">${priceDisplay}</p>
          
          <div class="card-specs">
            <span class="spec">
              <i class="icon-range"></i>
              ${vehicle.range_km || '—'} km
            </span>
            <span class="spec">
              <i class="icon-seats"></i>
              ${vehicle.seats || '—'} seats
            </span>
            <span class="spec">
              <i class="icon-drive"></i>
              ${vehicle.driveType || 'FWD'}
            </span>
            <span class="spec">
              <i class="icon-charge"></i>
              ${vehicle.fastChargingSpeed || '—'} kW
            </span>
          </div>
          
          ${vehicle.score ? `
            <div class="match-score">
              <div class="score-bar">
                <div class="score-fill" style="width: ${vehicle.score}%"></div>
              </div>
              <span class="score-label">${vehicle.score}% match</span>
            </div>
          ` : ''}
          
          <a href="${vehicle.build_link || '#'}" 
             class="card-cta" 
             target="_blank" 
             rel="noopener">
            Configure →
          </a>
        </div>
      </article>
    `;
  }

  renderPagination(meta) {
    if (!meta || meta.total_pages <= 1) return;

    const container = document.getElementById('pagination');
    if (!container) return;

    let html = '';

    // Previous button
    if (meta.has_prev) {
      html += `<button data-page="${meta.page - 1}" class="page-btn">← Previous</button>`;
    }

    // Page numbers
    const windowSize = 2;
    for (let i = 1; i <= meta.total_pages; i++) {
      if (
        i === 1 ||
        i === meta.total_pages ||
        (i >= meta.page - windowSize && i <= meta.page + windowSize)
      ) {
        html += `
          <button data-page="${i}" 
                  class="page-btn ${i === meta.page ? 'active' : ''}">
            ${i}
          </button>
        `;
      } else if (
        i === meta.page - windowSize - 1 ||
        i === meta.page + windowSize + 1
      ) {
        html += '<span class="page-ellipsis">...</span>';
      }
    }

    // Next button
    if (meta.has_next) {
      html += `<button data-page="${meta.page + 1}" class="page-btn">Next →</button>`;
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.goToPage(parseInt(btn.dataset.page));
      });
    });
  }

  async goToPage(page) {
    this.state.filters.page = page;
    const searchInput = document.querySelector('.search-input');
    await this.performSearch(searchInput?.value || '');
  }

  // ========== UI Updates ==========

  updateSaveButton(vehicleId, isSaved) {
    const button = document.querySelector(`.save-btn[data-vehicle-id="${vehicleId}"]`);
    if (!button) return;

    button.classList.toggle('is-saved', isSaved);
    button.setAttribute('aria-pressed', isSaved);

    // Animate
    button.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.08)' },
      { transform: 'scale(1)' }
    ], {
      duration: 200,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
    });
  }

  updateAllSaveButtons() {
    document.querySelectorAll('.save-btn').forEach(button => {
      const vehicleId = button.dataset.vehicleId;
      const isSaved = this.state.saved.has(vehicleId);
      button.classList.toggle('is-saved', isSaved);
      button.setAttribute('aria-pressed', isSaved);
    });
  }

  updateSavedCount(count) {
    const badge = document.getElementById('saved-count');
    if (!badge) return;

    badge.textContent = count;
    badge.hidden = count === 0;

    if (count > 0) {
      badge.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.1)' },
        { transform: 'scale(1)' }
      ], {
        duration: 200
      });
    }
  }

  updateSavedUI() {
    this.updateSavedCount(this.state.saved.size);
    this.updateAllSaveButtons();
  }

  // ========== Save Button Handling ==========

  setupSaveButtons() {
    document.addEventListener('click', async (e) => {
      const button = e.target.closest('.save-btn');
      if (!button) return;

      e.preventDefault();
      const vehicleId = button.dataset.vehicleId;

      if (!vehicleId || vehicleId === 'undefined') {
        console.error('Invalid vehicle ID');
        this.showNotification('Cannot save this vehicle', 'error');
        return;
      }

      await this.toggleSaved(vehicleId);
    });
  }

  // ========== Cross-tab Sync ==========

  setupCrossTabSync() {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('evision_state');

      this.channel.onmessage = (event) => {
        if (event.data.type === 'saved_update') {
          this.state.saved = new Set(event.data.saved);
          this.updateSavedUI();
        }
      };
    }

    window.addEventListener('storage', (e) => {
      if (e.key === 'evision_saved_sync') {
        const data = JSON.parse(e.newValue || '[]');
        this.state.saved = new Set(data);
        this.updateSavedUI();
      }
    });
  }

  broadcastStateChange() {
    const savedArray = Array.from(this.state.saved);

    if (this.channel) {
      this.channel.postMessage({
        type: 'saved_update',
        saved: savedArray
      });
    }

    localStorage.setItem('evision_saved_sync', JSON.stringify(savedArray));
  }

  // ========== Loading States ==========

  showLoadingState() {
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="loading-state">
        <div class="skeleton-grid">
          ${Array(6).fill(0).map(() => `
            <div class="skeleton-card">
              <div class="skeleton-image"></div>
              <div class="skeleton-content">
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  hideLoadingState() {
    // Loading state is replaced by actual content
  }

  showErrorState() {
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Unable to load results</h3>
        <p>Please try again or adjust your search.</p>
        <button onclick="location.reload()" class="btn btn-primary">
          Retry
        </button>
      </div>
    `;
  }

  getEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>No vehicles found</h3>
        <p>Try adjusting your filters or search terms.</p>
        <button onclick="window.evisionApp.clearFilters()" class="btn btn-secondary">
          Clear filters
        </button>
      </div>
    `;
  }

  // ========== Utilities ==========

  buildCacheKey(query, filters) {
    return JSON.stringify({ query, ...filters });
  }

  updateURL(params) {
    const url = new URL(window.location);
    url.search = params.toString();
    window.history.pushState({}, '', url);
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    notification.animate([
      { transform: 'translateY(-100%)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 }
    ], {
      duration: 200,
      fill: 'forwards'
    });

    // Remove after 3 seconds
    setTimeout(() => {
      notification.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(-100%)', opacity: 0 }
      ], {
        duration: 200,
        fill: 'forwards'
      }).onfinish = () => notification.remove();
    }, 3000);
  }

  animateCards() {
    const cards = document.querySelectorAll('.vehicle-card');
    cards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';

      setTimeout(() => {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 30);
    });
  }

  clearFilters() {
    this.state.filters = {};
    document.querySelectorAll('[data-filter]').forEach(input => {
      if (input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = '';
      }
    });
    this.applyFilters();
  }

  // ========== Real-time Search ==========

  setupRealtimeSearch() {
    const searchInput = document.querySelector('.search-input-main');
    if (!searchInput) return;

    let controller = null;

    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.trim();

      // Cancel previous request
      if (controller) {
        controller.abort();
      }

      if (query.length < 2) {
        this.hideSearchSuggestions();
        return;
      }

      // Debounce
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(async () => {
        controller = new AbortController();

        try {
          const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
            signal: controller.signal
          });

          if (!response.ok) return;

          const suggestions = await response.json();
          this.showSearchSuggestions(suggestions);

        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('Suggestion fetch failed:', error);
          }
        }
      }, 200);
    });
  }

  showSearchSuggestions(suggestions) {
    const container = document.getElementById('search-suggestions');
    if (!container) return;

    if (!suggestions || suggestions.length === 0) {
      container.hidden = true;
      return;
    }

    container.innerHTML = suggestions.map(s => `
      <button class="suggestion-item" data-query="${s.query}">
        <span class="suggestion-text">${s.display}</span>
        ${s.count ? `<span class="suggestion-count">${s.count} results</span>` : ''}
      </button>
    `).join('');

    container.hidden = false;

    // Origin-aware scale-in from the search input
    container.style.transformOrigin = 'top left';
    container.style.opacity = '0';
    container.style.transform = 'scale(0.96)';
    container.style.transition = 'opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)';
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'scale(1)';
    });

    // Add click handlers
    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const searchInput = document.querySelector('.search-input-main');
        searchInput.value = item.dataset.query;
        this.performSearch(item.dataset.query);
        container.hidden = true;
      });
    });
  }

  hideSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    if (container) {
      container.hidden = true;
    }
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.evisionApp = new EVisionApp();
  });
} else {
  window.evisionApp = new EVisionApp();
}