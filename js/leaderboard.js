const ORIGINALS_GAMES = new Set([
  'blackjack', 'double-down-blackjack', 'plinko', 'roulette', 'dice', 'mines', 'crash',
  'keno', 'limbo', 'war', 'coinflip', 'hilo', 'tower', 'wheel',
]);

const LEADERBOARD_MAX_BET = window.NbdLeaderboard?.maxBet ?? 5000;
const BANNED_LEADERBOARD_USERS = new Set(['tiddlesz']);

let activeFilter = 'originals';

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  const maxBet = window.NbdLeaderboard?.maxBet ?? 5000;
  const noteEl = document.getElementById('leaderboardNote');
  if (noteEl) {
    noteEl.textContent = `Only bets up to $${maxBet.toLocaleString()} per round appear on the leaderboard and live feed.`;
  }

  document.querySelectorAll('.leaderboard-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (!filter || filter === activeFilter) return;
      activeFilter = filter;
      document.querySelectorAll('.leaderboard-filter').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === activeFilter);
      });
      renderLeaderboard();
    });
  });

  document.addEventListener('xython:leaderboard-change', renderLeaderboard);

  void (async () => {
    try {
      await window.NbdLeaderboard?.refresh?.();
    } catch { /* ignore */ }
    renderLeaderboard();
  })();
});

function formatMoney(value) {
  return `$${(parseFloat(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function lbEscape(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function playerKey(win) {
  if (win.hidden) return '__hidden__';
  return (win.user || 'Player').trim().toLowerCase() || '__unknown__';
}

function displayName(win, key) {
  if (key === '__hidden__') return 'Hidden';
  return win.user || 'Player';
}

function isBlockedWin(win) {
  if ((parseFloat(win?.bet) || 0) > LEADERBOARD_MAX_BET) return true;
  if (BANNED_LEADERBOARD_USERS.has(playerKey(win))) return true;
  return false;
}

function aggregateLeaderboard(wins, filter) {
  const filtered = wins.filter(w => {
    if (isBlockedWin(w)) return false;
    if (filter === 'originals') return ORIGINALS_GAMES.has(w.game);
    return true;
  });

  const byPlayer = new Map();

  filtered.forEach(win => {
    const bet = parseFloat(win.bet) || 0;
    const payout = parseFloat(win.payout) || 0;
    const profit = payout - bet;
    const key = playerKey(win);

    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        key,
        hidden: key === '__hidden__',
        name: displayName(win, key),
        totalProfit: 0,
        totalPayout: 0,
        winCount: 0,
        biggestWin: 0,
      });
    }

    const row = byPlayer.get(key);
    row.totalProfit += profit;
    row.totalPayout += payout;
    row.winCount += 1;
    if (payout > row.biggestWin) row.biggestWin = payout;
  });

  return Array.from(byPlayer.values())
    .sort((a, b) => b.totalProfit - a.totalProfit || b.biggestWin - a.biggestWin || b.winCount - a.winCount);
}

function getInitial(name) {
  const text = (name || '?').trim();
  if (!text || text.toLowerCase() === 'hidden') return '?';
  return text.charAt(0).toUpperCase();
}

function renderLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  const meta = document.getElementById('leaderboardMeta');
  if (!tbody) return;

  try {
    const wins = window.NbdLeaderboard?.getRecentWins?.(500) || [];
    const rows = aggregateLeaderboard(wins, activeFilter);
    const me = (window.XythonAuth?.getUsername?.() || '').trim().toLowerCase();
    const scope = activeFilter === 'originals' ? 'Originals' : 'All games';
    const liveLabel = window.NbdLeaderboard?.isShared?.() ? 'Live' : 'Offline';

    if (meta) {
      meta.textContent = `${rows.length} player${rows.length === 1 ? '' : 's'} · ${scope} · ${liveLabel}`;
    }

    if (!rows.length) {
      tbody.innerHTML = '';
      const empty = document.getElementById('leaderboardEmpty');
      if (empty) empty.hidden = false;
      return;
    }

    const empty = document.getElementById('leaderboardEmpty');
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map((row, index) => {
      const rank = index + 1;
      const rankClass = rank <= 3 ? ` leaderboard-rank--${rank}` : '';
      const isMe = !row.hidden && me && row.key === me;
      const playerClass = row.hidden ? ' leaderboard-player--hidden' : '';

      return `<tr class="${isMe ? 'is-me' : ''}">
      <td><span class="leaderboard-rank${rankClass}">${rank}</span></td>
      <td>
        <div class="leaderboard-player${playerClass}">
          <span class="leaderboard-avatar" aria-hidden="true">${lbEscape(getInitial(row.name))}</span>
          <span>${lbEscape(row.name)}</span>
        </div>
      </td>
      <td><span class="leaderboard-amount">${formatMoney(row.totalProfit)}</span></td>
      <td><span class="leaderboard-amount--muted">${formatMoney(row.biggestWin)}</span></td>
      <td><span class="leaderboard-amount--muted">${row.winCount.toLocaleString()}</span></td>
    </tr>`;
    }).join('');
  } catch {
    if (meta) meta.textContent = 'Could not load leaderboard';
    tbody.innerHTML = '';
    const empty = document.getElementById('leaderboardEmpty');
    if (empty) empty.hidden = false;
  }
}
