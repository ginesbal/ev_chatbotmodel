const HomePage = {
    init() {
        this.loadStats();
        this.setupSuggestions();
    },

    async loadStats() {
        // load stats if elements exist
        const vehicleCount = document.getElementById('vehicleCount');
        const brandCount = document.getElementById('brandCount');

        if (!vehicleCount || !brandCount) return;

        try {
            // set values from data attributes
            const vTarget = vehicleCount.dataset.target;
            const bTarget = brandCount.dataset.target;

            if (vTarget) vehicleCount.textContent = Number(vTarget).toLocaleString();
            if (bTarget) brandCount.textContent = Number(bTarget).toLocaleString();
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    },

    setupSuggestions() {
        // make suggestion chips keyboard accessible
        const chips = document.querySelectorAll('.suggestion-chip');
        chips.forEach(chip => {
            chip.setAttribute('role', 'button');
            chip.setAttribute('tabindex', '0');

            chip.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    chip.click();
                }
            });
        });
    }
};

// initialize on homepage
if (document.querySelector('.homepage')) {
    HomePage.init();
}