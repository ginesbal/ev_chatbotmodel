// Saved page Clear All button handler
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('clearSavedBtn');
  const grid = document.getElementById('results-grid');
  const count = document.getElementById('savedPageCount');

  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!confirm('Clear all saved vehicles?')) return;

    try {
      // Call the global clear function
      if (typeof window.EVisonClearFavs === 'function') {
        await window.EVisonClearFavs();
      }

      // Update UI
      if (grid) {
        grid.innerHTML = '<p style="text-align: center; color: #64748b; padding: 3rem 1rem;">No saved vehicles yet. Click the heart icon on any vehicle to save it here.</p>';
      }

      if (count) {
        count.textContent = '0';
      }

      // Remove the clear button
      btn.remove();

    } catch (error) {
      console.error('Error clearing saved vehicles:', error);
      alert('Failed to clear saved vehicles. Please try again.');
    }
  });
});
