
(function () {
    'use strict';
    const Performance = {
        marks: {},

        mark(name) {
            this.marks[name] = performance.now();
        },

        measure(name, startMark, endMark) {
            const start = this.marks[startMark] || 0;
            const end = endMark ? this.marks[endMark] : performance.now();
            const duration = end - start;

            // In production, send to monitoring service
            console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);

            return duration;
        }
    };

    const Analytics = {
        track(event, properties = {}) {
            const payload = {
                event,
                properties: {
                    ...properties,
                    timestamp: Date.now(),
                    page: 'home',
                    session_id: this.getSessionId()
                }
            };

            console.log('[Analytics]', payload);

            if (typeof gtag !== 'undefined') {
                gtag('event', event, properties);
            }
        },

        getSessionId() {
            let sessionId = sessionStorage.getItem('session_id');
            if (!sessionId) {
                sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                sessionStorage.setItem('session_id', sessionId);
            }
            return sessionId;
        }
    };

    const SearchController = {
        form: null,
        input: null,
        suggestions: null,

        init() {
            Performance.mark('search_init_start');

            this.form = document.getElementById('search-form');
            this.input = document.getElementById('search_query');

            if (!this.form || !this.input) {
                console.warn('[SearchController] Required elements not found');
                return;
            }

            this.attachEventListeners();
            this.initSuggestions();

            Performance.measure('Search initialization', 'search_init_start');
        },

        attachEventListeners() {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));

            // input changes for real-time feedback
            let inputTimer;
            this.input.addEventListener('input', (e) => {
                clearTimeout(inputTimer);
                inputTimer = setTimeout(() => {
                    this.handleInputChange(e.target.value);
                }, 300); // Debounce at 300ms
            });

            this.input.addEventListener('focus', () => {
                Analytics.track('search_focused');
            });
        },

        handleSubmit(e) {
            const query = this.input.value.trim();

            if (!query) {
                e.preventDefault();
                this.showValidationError('Please enter a search term');
                return;
            }

            Analytics.track('search_submitted', {
                query: query,
                query_length: query.length,
                has_filters: query.includes('under') || query.includes('over')
            });

            Performance.mark('search_submitted');
        },

        handleInputChange(value) {
            const trimmed = value.trim();

            if (trimmed.length >= 2) {
                Analytics.track('search_typing', {
                    partial_query: trimmed.substring(0, 10), // limit for privacy
                    length: trimmed.length
                });
            }
        },

        initSuggestions() {
            // suggestion chips
            const chips = document.querySelectorAll('.suggestion-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    const query = chip.dataset.query;

                    // track chip usage
                    Analytics.track('suggestion_clicked', {
                        suggestion: query,
                        position: Array.from(chips).indexOf(chip)
                    });

                    // set and submit
                    this.input.value = query;
                    this.form.submit();
                });
            });
        },

        initMagneticButtons() {
            const magneticElements = document.querySelectorAll('.search-submit, .suggestion-chip');

            magneticElements.forEach(elem => {
                elem.addEventListener('mousemove', (e) => {
                    const rect = elem.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;

                    const distance = Math.sqrt(x * x + y * y);
                    const maxDistance = Math.max(rect.width, rect.height);

                    if (distance < maxDistance) {
                        const strength = (1 - distance / maxDistance) * 0.3;
                        elem.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
                    }
                });

                elem.addEventListener('mouseleave', () => {
                    elem.style.transform = '';
                    elem.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    setTimeout(() => {
                        elem.style.transition = '';
                    }, 300);
                });
            });
        },


        showValidationError(message) {
            this.input.classList.add('error');
            this.input.setAttribute('aria-invalid', 'true');

            setTimeout(() => {
                this.input.classList.remove('error');
                this.input.setAttribute('aria-invalid', 'false');
            }, 2000);

            Analytics.track('search_validation_error');
        }
    };

    const ActivityFeed = {
        feed: null,
        updateInterval: null,

        init() {
            this.feed = document.querySelector('.activity-feed');
            if (!this.feed) return;

            // simulate real-time updates
            this.startSimulation();
        },

        startSimulation() {
            const searches = [
                'Tesla Model 3 under $40k',
                'Longest range SUV',
                'Cheapest EV in California',
                'BMW iX vs Mercedes EQS',
                'Electric truck comparison',
                'Best EV for families',
                'Hyundai Ioniq 5 deals',
                'Used EVs under $25k'
            ];

            // update every 30 seconds
            this.updateInterval = setInterval(() => {
                const randomSearch = searches[Math.floor(Math.random() * searches.length)];
                this.addActivity(randomSearch);
            }, 30000);
        },

        addActivity(query) {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.style.opacity = '0';
            item.innerHTML = `
                <span class="activity-query">${this.escapeHtml(query)}</span>
                <span class="activity-time">just now</span>
            `;

            this.feed.insertBefore(item, this.feed.firstChild);
            requestAnimationFrame(() => {
                item.style.opacity = '1';
            });

            const items = this.feed.querySelectorAll('.activity-item');
            if (items.length > 3) {
                this.feed.removeChild(items[items.length - 1]);
            }
            this.updateTimes();
        },

        updateTimes() {
            const items = this.feed.querySelectorAll('.activity-item');
            const times = ['just now', '2 min ago', '5 min ago'];

            items.forEach((item, index) => {
                const timeEl = item.querySelector('.activity-time');
                if (timeEl && times[index]) {
                    timeEl.textContent = times[index];
                }
            });
        },

        escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        },

        destroy() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }
        }
    };

    const KeyboardShortcuts = {
        init() {
            document.addEventListener('keydown', this.handleKeydown.bind(this));
        },

        handleKeydown(e) {
            // skip if user is typing
            if (this.isTyping()) return;

            switch (e.key) {
                case '/':
                    e.preventDefault();
                    this.focusSearch();
                    break;

                case 'Escape':
                    this.blurSearch();
                    break;
            }
        },

        isTyping() {
            const activeElement = document.activeElement;
            return activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            );
        },

        focusSearch() {
            const input = document.getElementById('search_query');
            if (input) {
                input.focus();
                input.select();
                Analytics.track('keyboard_shortcut_used', { shortcut: 'search' });
            }
        },

        blurSearch() {
            const input = document.getElementById('search_query');
            if (input && document.activeElement === input) {
                input.blur();
            }
        }
    };

    const HomeController = {
        initialized: false,

        init() {
            if (this.initialized) return;
            this.initialized = true;

            Performance.mark('app_init_start');

            // initialize modules
            SearchController.init();
            SearchController.initMagneticButtons();
            ActivityFeed.init();
            KeyboardShortcuts.init();
            StatsAnimator.init();
            ScrollReveal.init();

            console.log('All modules initialized');

            // track page view
            Analytics.track('page_viewed', {
                path: window.location.pathname
            });

            // setup cleanup on page unload
            window.addEventListener('beforeunload', () => {
                this.cleanup();
            });

            Performance.measure('App initialization', 'app_init_start');

            // log performance metrics
            this.logPerformanceMetrics();
        },

        cleanup() {
            ActivityFeed.destroy();

            // Track session end
            Analytics.track('session_ended', {
                duration: performance.now()
            });
        },

        logPerformanceMetrics() {
            if ('PerformanceObserver' in window) {
                try {
                    const lcpObserver = new PerformanceObserver((list) => {
                        const entries = list.getEntries();
                        const lastEntry = entries[entries.length - 1];
                        Analytics.track('performance_lcp', {
                            value: lastEntry.renderTime || lastEntry.loadTime
                        });
                    });
                    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
                } catch (e) {
                }
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            HomeController.init();
        });
    } else {
        HomeController.init();
    }

    if (window.location.hostname === 'localhost') {
        window.EVisionDebug = {
            Performance,
            Analytics,
            SearchController,
            ActivityFeed,
            HomeController
        };
    }
})();

const StatsAnimator = {
    init() {
        console.log('StatsAnimator.init() called');
        
        const statsSection = document.querySelector('.hero-stats');
        if (!statsSection) {
            console.error('Stats section not found');
            return;
        }
        
        console.log('Stats section found, setting up observer');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                console.log('Intersection observed:', entry.isIntersecting);
                if (entry.isIntersecting) {
                    this.animateNumbers();
                    observer.disconnect();
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(statsSection);
        
        setTimeout(() => {
            console.log('Forcing animation for debug');
            this.animateNumbers();
        }, 1000);
    },
    
    animateNumbers() {
        console.log('animateNumbers() called');
        
        const statNumbers = document.querySelectorAll('.stat-number');
        console.log('Found stat numbers:', statNumbers.length);
        
        statNumbers.forEach(el => {
            const target = parseInt(el.dataset.target);
            console.log('Animating to target:', target);

            const countEl = el.querySelector('.js-count') || el;
            
            if (!target || isNaN(target)) {
                console.error('Invalid target:', el.dataset.target);
                return;
            }
            
            const duration = 2000;
            const start = performance.now();
            
            const animate = (now) => {
                const progress = Math.min((now - start) / duration, 1);
                const eased = this.easeOutQuart(progress);
                const currentValue = Math.floor(target * eased);
                
                countEl.textContent = currentValue;
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    el.classList.add('stat-complete');
                    console.log('Animation complete for target:', target);
                }
            };
            
            requestAnimationFrame(animate);
        });
    },
    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }
};

const ScrollReveal = {
    init() {
        const reveals = document.querySelectorAll('.reveal-on-scroll');
        if (!reveals.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    // stagger children if they exist
                    const children = entry.target.querySelectorAll('.reveal-child');
                    children.forEach((child, index) => {
                        child.style.transitionDelay = `${index * 100}ms`;
                        child.classList.add('revealed');
                    });
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -100px 0px'
        });

        reveals.forEach(el => observer.observe(el));
    }
};

