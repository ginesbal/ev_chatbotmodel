/* lazy-loader.js — load heavy libraries when needed */

window.LazyLoader = {
    loaded: {},

    loadScript(src) {
        if (this.loaded[src]) {
            console.log(`already loaded: ${src}`);
            return this.loaded[src];
        }

        this.loaded[src] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;

            script.onload = () => {
                console.log(`✅ loaded: ${src}`);
                // give script time to initialize globals
                setTimeout(resolve, 50);
            };

            script.onerror = () => {
                console.error(`❌ failed to load: ${src}`);
                reject(new Error(`Failed to load ${src}`));
            };

            document.body.appendChild(script);
        });

        return this.loaded[src];
    },

    canAnimate() {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const forceAnimations = document.body.getAttribute('data-force-animations') === 'true';
        const qs = new URLSearchParams(location.search).get('animations');
        const cookie = document.cookie.match(/(?:^|; )anim=(on|off)/)?.[1];

        return forceAnimations || qs === 'on' || cookie === 'on' || !reduce;
    },

    async loadVanta() {
        console.log('🌊 Starting Vanta loading process...');

        if (!this.canAnimate()) {
            console.log('animations disabled - skipping vanta');
            this.addFallbackGradient();
            return false;
        }

        const container = document.getElementById('vanta-bg-global');
        if (!container) {
            console.error('no container found');
            return false;
        }

        try {
            // load three.js
            console.log('loading three.js...');
            await this.loadScript('/static/js/three.r134.min.js');

            // wait for THREE to be available
            let attempts = 0;
            while (!window.THREE && attempts < 20) {
                console.log(`Waiting for THREE... attempt ${attempts + 1}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!window.THREE) {
                throw new Error('THREE.js not available after 2 seconds');
            }

            console.log('✅ three.js ready');

            // load vanta
            console.log('loading vanta...');
            await this.loadScript('/static/js/vanta.waves.min.js');

            // wait for VANTA.WAVES
            attempts = 0;
            while ((!window.VANTA || !window.VANTA.WAVES) && attempts < 20) {
                console.log(`Waiting for VANTA.WAVES... attempt ${attempts + 1}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!window.VANTA || !window.VANTA.WAVES) {
                throw new Error('VANTA.WAVES not available after 2 seconds');
            }

            console.log('✅ vanta.waves ready');

            // initialize vanta
            return this.initVanta();

        } catch (error) {
            console.error('failed to load vanta:', error);
            this.addFallbackGradient();
            return false;
        }
    },

    initVanta() {
        const el = document.getElementById('vanta-bg-global');

        if (!el || !window.THREE || !window.VANTA || !window.VANTA.WAVES) {
            console.error('missing dependencies');
            return false;
        }

        // destroy any existing instance
        if (window.__vanta) {
            try {
                window.__vanta.destroy();
                window.__vanta = null;
            } catch (e) {
                console.warn('could not destroy old vanta instance');
            }
        }

        const dark = document.documentElement.dataset.theme === 'dark';

        try {
            console.log('creating vanta effect...');

            // pass THREE explicitly to vanta
            window.__vanta = window.VANTA.WAVES({
                el: el,
                THREE: window.THREE,  // critical for proper initialization
                mouseControls: false,
                touchControls: false,
                gyroControls: false,
                minHeight: 200,
                minWidth: 200,
                scale: 1.00,
                scaleMobile: 1.00,
                mouseControls: true,

                // enhanced visibility settings
                color: dark ? 0xbababa : 0xb1b1b3, // More visible blue
                shininess: 10.00,  // Increase from 3
                waveHeight: 8.00,  // Increase from 4
                waveSpeed: 0.50,   // Increase from 0.25
                zoom: 1.00,

                backgroundColor: dark ? 0x0f172a : 0xf0f4f8
            });

            console.log('✅ vanta initialized');

            // verify canvas creation
            setTimeout(() => {
                const canvas = el.querySelector('canvas');
                if (canvas) {
                    console.log(`✅ Canvas created: ${canvas.width}x${canvas.height}`);
                } else {
                    console.warn('⚠️ No canvas element found');
                }
            }, 100);

            return true;

        } catch (error) {
            console.error('vanta init error:', error);
            return false;
        }
    },

    addFallbackGradient() {
        console.log('adding fallback gradient');
        const container = document.getElementById('vanta-bg-global');
        if (container) {
            container.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            container.style.opacity = '0.1';
        }
    },

    async loadAnime() {
        if (this.loaded.anime) return;
        await this.loadScript('https://cdn.jsdelivr.net/npm/animejs@3.2.1/lib/anime.min.js');
        this.loaded.anime = true;
    }
};