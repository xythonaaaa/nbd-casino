const GAME_INFO = {
  blackjack: {
    name: 'Blackjack',
    rtp: 99.28,
    gradient: 'linear-gradient(180deg, #9b6dff 0%, #5b21b6 55%, #3b0764 100%)',
    emoji: '🃏',
    tagline: 'Classic 21 with 3:2 blackjack payouts and optional side bets.',
    description: 'Play NBD Blackjack with standard rules — dealer stands on 17, blackjack pays 3:2, and insurance pays 2:1. Optional Perfect Pairs and 21+3 side bets add extra ways to win on every deal.',
  },
  'double-down-blackjack': {
    name: 'Double Down Blackjack',
    rtp: 98.50,
    gradient: 'linear-gradient(180deg, #fcd34d 0%, #d97706 55%, #78350f 100%)',
    emoji: '🃏',
    tagline: 'Multi double, hit after double, dealer 22 pushes.',
    description: 'A high-action blackjack variant — double down as many times as you want (each adds your original bet), keep hitting after doubles, dealer stands on 17, blackjack pays 3:2, and if the dealer totals exactly 22, all non-busted hands push.',
  },
  plinko: {
    name: 'Plinko',
    rtp: 97.00,
    gradient: 'linear-gradient(180deg, #fcd34d 0%, #d97706 55%, #92400e 100%)',
    emoji: '🎯',
    tagline: 'Drop the ball and chase multipliers down the board.',
    description: 'Choose your risk level and rows, then drop balls through the peg board. Land in high multiplier slots at the bottom for massive wins. A fan-favorite NBD Original with instant results.',
  },
  roulette: {
    name: 'Roulette',
    rtp: 97.30,
    gradient: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 55%, #1e3a8a 100%)',
    emoji: '🎰',
    tagline: 'European wheel with straight-up, outside, and column bets.',
    description: 'Place chips on numbers, colors, dozens, or columns and spin the European roulette wheel. Stack multiple bets per round and repeat your last layout with one click.',
  },
  dice: {
    name: 'Dice',
    rtp: 99.00,
    gradient: 'linear-gradient(180deg, #fb923c 0%, #ea580c 55%, #431407 100%)',
    emoji: '🎲',
    tagline: 'Set your target and roll over or under.',
    description: 'Pick a win chance by setting your roll target — roll under or over to win. Adjustable odds mean you control risk vs reward on every bet, with manual and autobet modes.',
  },
  mines: {
    name: 'Mines',
    rtp: 97.00,
    gradient: 'linear-gradient(180deg, #4ade80 0%, #16a34a 55%, #14532d 100%)',
    emoji: '💣',
    tagline: 'Reveal gems, avoid mines, cash out anytime.',
    description: 'Pick your grid size and mine count, then reveal tiles one at a time. Each safe gem increases your multiplier — cash out before you hit a mine to lock in profit.',
  },
  crash: {
    name: 'Crash',
    rtp: 96.00,
    gradient: 'linear-gradient(180deg, #86efac 0%, #166534 55%, #052e16 100%)',
    emoji: '🚀',
    tagline: 'Cash out before the multiplier crashes.',
    description: 'Watch the multiplier climb from 1.00x and cash out before it crashes. Wait too long and you lose — timing is everything in this high-intensity NBD Original.',
  },
  keno: {
    name: 'Keno',
    rtp: 85.00,
    gradient: 'linear-gradient(180deg, #34d399 0%, #059669 55%, #064e3b 100%)',
    emoji: '🔢',
    tagline: 'Pick numbers and match the draw.',
    description: 'Select up to 10 numbers on the 40-spot keno board and watch 10 balls drawn. More matches mean bigger payouts — classic lottery-style action with instant results.',
  },
  limbo: {
    name: 'Limbo',
    rtp: 99.00,
    gradient: 'linear-gradient(180deg, #c084fc 0%, #9333ea 55%, #581c87 100%)',
    emoji: '🎢',
    tagline: 'Set a target multiplier and beat the roll.',
    description: 'Choose your target multiplier — if the rolled result meets or exceeds it, you win. Higher targets mean lower win chance but bigger payouts. Supports autobet.',
  },
  war: {
    name: 'Surrender or War',
    rtp: 96.56,
    gradient: 'linear-gradient(180deg, #f87171 0%, #dc2626 55%, #7f1d1d 100%)',
    emoji: '⚔️',
    tagline: 'Beat the dealer card — surrender or go to war on ties.',
    description: 'Draw against the dealer in this casino war variant. Win with a higher card, surrender on a tie for half back, or go to war for double-or-nothing action.',
  },
  coinflip: {
    name: 'Coinflip',
    rtp: 99.00,
    gradient: 'linear-gradient(180deg, #fde047 0%, #ca8a04 55%, #713f12 100%)',
    emoji: '🪙',
    tagline: 'Pick heads or tails — 50/50 with instant flips.',
    description: 'Choose heads or tails and flip the coin. A pure 50/50 NBD Original with clean 2x payouts and optional autobet for rapid sessions.',
  },
  hilo: {
    name: 'Hi-Lo',
    rtp: 98.00,
    gradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 55%, #0c4a6e 100%)',
    emoji: '🃏',
    tagline: 'Guess higher or lower to build a streak.',
    description: 'Start with a card and guess whether the next card is higher or lower. Build a streak to grow your multiplier, then cash out before you bust.',
  },
  tower: {
    name: 'Tower',
    rtp: 99.00,
    gradient: 'linear-gradient(180deg, #2dd4bf 0%, #0d9488 55%, #134e4a 100%)',
    emoji: '🗼',
    tagline: 'Climb floors, pick safe tiles, cash out anytime.',
    description: 'Climb the tower floor by floor by picking the safe tile on each level. Each floor boosts your multiplier — cash out anytime or keep climbing for bigger rewards.',
  },
  wheel: {
    name: 'Wheel',
    rtp: 97.00,
    gradient: 'linear-gradient(180deg, #e879f9 0%, #c026d3 55%, #701a75 100%)',
    emoji: '🎡',
    tagline: 'Spin the wheel for multiplier segments.',
    description: 'Pick your risk level and spin the prize wheel. Land on multiplier segments from 0x up to 50x on Hard mode. Low, Med, and Hard risk levels change the segment layout.',
  },
};

function getGameId() {
  const file = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
  return GAME_INFO[file] ? file : null;
}

function findGameContainer() {
  return document.querySelector('.main-wrapper > [class$="-game"]');
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function formatMoney(n) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWinDate(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function truncateUser(name, hidden) {
  if (hidden) return 'Hidden';
  return name;
}

function getBetCount(gameId) {
  return window.NbdLeaderboard?.getBetCount?.(gameId) ?? 0;
}

function medalHtml(rank) {
  if (rank === 1) return '<span class="gi-medal gi-medal--gold">1</span>';
  if (rank === 2) return '<span class="gi-medal gi-medal--silver">2</span>';
  if (rank === 3) return '<span class="gi-medal gi-medal--bronze">3</span>';
  return `<span class="gi-rank">${rank}</span>`;
}

function renderTable(rows, emptyMessage) {
  if (!rows.length) {
    return `<p class="gi-empty">${emptyMessage}</p>`;
  }

  return `
    <table class="gi-table">
      <thead>
        <tr>
          <th>#</th>
          <th>User</th>
          <th>Bet Amount</th>
          <th>Multiplier</th>
          <th>Payout</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${medalHtml(row.rank)}</td>
            <td>
              <span class="gi-user">
                ${row.hidden
                  ? '<span class="gi-user-icon gi-user-icon--hidden" aria-hidden="true">👁‍🗨</span>'
                  : '<span class="gi-user-icon" aria-hidden="true">◆</span>'}
                <span class="gi-user-name${row.hidden ? ' gi-user-name--hidden' : ''}">${truncateUser(row.user, row.hidden)}</span>
              </span>
            </td>
            <td>${formatMoney(row.bet)}</td>
            <td><span class="gi-mult">${row.mult.toFixed(2)}x</span></td>
            <td><span class="gi-payout">${formatMoney(row.payout)}</span></td>
            <td class="gi-date">${formatWinDate(row.ts)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildPanel(gameId, info) {
  const bigWins = window.NbdLeaderboard?.getBigWins?.(gameId) ?? [];
  const luckyWins = window.NbdLeaderboard?.getLuckyWins?.(gameId) ?? [];
  const bets = getBetCount(gameId);
  const title = `${info.name} Original: Play ${info.name} Online at NBD Casino`;

  return `
    <section class="gi-panel" id="gameInfoPanel" data-game-id="${gameId}">
      <div class="gi-panel-inner">
        <aside class="gi-sidebar">
          <div class="gi-cover" style="background:${info.gradient}">
            <span class="gi-cover-emoji">${info.emoji}</span>
          </div>
          <span class="gi-category">Originals</span>
          <h2 class="gi-game-name">${info.name}</h2>
          <div class="gi-stats">
            <div class="gi-stat">
              <span class="gi-stat-label">Bets</span>
              <span class="gi-stat-value" id="giBetCount">${formatNumber(bets)}</span>
            </div>
            <div class="gi-stat">
              <span class="gi-stat-label">RTP</span>
              <span class="gi-stat-value">${info.rtp.toFixed(2)}%</span>
            </div>
          </div>
        </aside>

        <div class="gi-content">
          <h1 class="gi-title">${title}</h1>
          <div class="gi-tabs" role="tablist">
            <button type="button" class="gi-tab active" data-tab="big" role="tab" aria-selected="true">Big Wins</button>
            <button type="button" class="gi-tab" data-tab="lucky" role="tab" aria-selected="false">Lucky Wins</button>
            <button type="button" class="gi-tab" data-tab="desc" role="tab" aria-selected="false">Description</button>
          </div>

          <div class="gi-panels">
            <div class="gi-tab-panel active" data-panel="big" role="tabpanel">
              ${renderTable(bigWins, 'No big wins yet — play and cash out to claim the top spot!')}
            </div>
            <div class="gi-tab-panel" data-panel="lucky" role="tabpanel" hidden>
              ${renderTable(luckyWins, 'No lucky wins yet — hit a high multiplier to get on the board!')}
            </div>
            <div class="gi-tab-panel" data-panel="desc" role="tabpanel" hidden>
              <div class="gi-desc">
                <p class="gi-desc-lead">${info.tagline}</p>
                <p>${info.description}</p>
                <ul class="gi-desc-list">
                  <li>Provably fair NBD Original</li>
                  <li>RTP ${info.rtp.toFixed(2)}% — house edge built into payouts</li>
                  <li>Leaderboard shows real wins from all NBD Casino players</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function refreshLeaderboardTables(panel, gameId) {
  const bigPanel = panel.querySelector('[data-panel="big"]');
  const luckyPanel = panel.querySelector('[data-panel="lucky"]');
  const betEl = panel.querySelector('#giBetCount');

  if (bigPanel) {
    bigPanel.innerHTML = renderTable(
      window.NbdLeaderboard?.getBigWins?.(gameId) ?? [],
      'No big wins yet — play and cash out to claim the top spot!',
    );
  }
  if (luckyPanel) {
    luckyPanel.innerHTML = renderTable(
      window.NbdLeaderboard?.getLuckyWins?.(gameId) ?? [],
      'No lucky wins yet — hit a high multiplier to get on the board!',
    );
  }
  if (betEl) betEl.textContent = formatNumber(getBetCount(gameId));
}

function bindTabs(panel) {
  const tabs = panel.querySelectorAll('.gi-tab');
  const panels = panel.querySelectorAll('.gi-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      panels.forEach(p => {
        const show = p.dataset.panel === id;
        p.classList.toggle('active', show);
        p.hidden = !show;
      });
    });
  });
}

function initGameInfoPanel() {
  if (document.body.dataset.page !== 'originals') return;
  const gameId = getGameId();
  if (!gameId) return;

  const gameEl = findGameContainer();
  if (!gameEl) return;

  let panel = document.getElementById('gameInfoPanel');
  if (!panel) {
    const info = GAME_INFO[gameId];
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildPanel(gameId, info);
    panel = wrapper.firstElementChild;
    gameEl.insertAdjacentElement('afterend', panel);
    bindTabs(panel);
  }

  refreshLeaderboardTables(panel, gameId);

  if (!panel.dataset.bound) {
    panel.dataset.bound = '1';
    document.addEventListener('xython:leaderboard-change', () => {
      refreshLeaderboardTables(panel, gameId);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGameInfoPanel);
} else {
  initGameInfoPanel();
}

window.NbdGameInfo = { init: initGameInfoPanel, GAME_INFO };
