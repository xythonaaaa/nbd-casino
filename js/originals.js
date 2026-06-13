document.addEventListener('DOMContentLoaded', () => {
  initCommon();
  renderGameGrid('originalsGrid', GAMES.originals);

  const countEl = document.getElementById('gameCount');
  if (countEl) countEl.textContent = `${GAMES.originals.length} games`;

  renderLiveWins();
  document.addEventListener('xython:leaderboard-change', () => {
    renderLiveWins();
  });

  const search = document.getElementById('gameSearch');
  if (search) {
    search.addEventListener('input', () => {
      const query = search.value.toLowerCase().trim();
      document.querySelectorAll('#originalsGrid .game-card').forEach(card => {
        const name = card.dataset.name || '';
        card.style.display = !query || name.includes(query) ? '' : 'none';
      });
    });
  }
});
