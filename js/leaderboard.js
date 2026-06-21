// Rankings page boot lives in common.js (initRankingsPage).
// Kept for backwards compatibility if an old HTML revision still references this file.
if (document.body?.dataset?.page === 'leaderboard' && typeof initRankingsPage === 'function') {
  initRankingsPage();
}
