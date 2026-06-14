const GAMES = {
  originals: [
    { name: 'Blackjack', cover: 'blackjack', gradient: 'linear-gradient(180deg, #9b6dff 0%, #5b21b6 55%, #3b0764 100%)', badge: 'hot', href: 'blackjack.html' },
    { name: 'Plinko', cover: 'plinko', gradient: 'linear-gradient(180deg, #fcd34d 0%, #d97706 55%, #92400e 100%)', badge: 'hot', href: 'plinko.html' },
    { name: 'Roulette', cover: 'roulette', gradient: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 55%, #1e3a8a 100%)', href: 'roulette.html' },
    { name: 'Dice', cover: 'dice', gradient: 'linear-gradient(180deg, #fb923c 0%, #ea580c 55%, #431407 100%)', href: 'dice.html' },
    { name: 'Mines', cover: 'mines', gradient: 'linear-gradient(180deg, #4ade80 0%, #16a34a 55%, #14532d 100%)', href: 'mines.html' },
    { name: 'Crash', cover: 'crash', gradient: 'linear-gradient(180deg, #86efac 0%, #166534 55%, #052e16 100%)', badge: 'hot', href: 'crash.html' },
    { name: 'Keno', cover: 'keno', gradient: 'linear-gradient(180deg, #34d399 0%, #059669 55%, #064e3b 100%)', href: 'keno.html' },
    { name: 'Limbo', cover: 'limbo', gradient: 'linear-gradient(180deg, #c084fc 0%, #9333ea 55%, #581c87 100%)', href: 'limbo.html' },
    { name: 'Surrender or War', cover: 'war', gradient: 'linear-gradient(180deg, #f87171 0%, #dc2626 55%, #7f1d1d 100%)', badge: 'new', href: 'war.html' },
    { name: 'Coinflip', cover: 'coinflip', gradient: 'linear-gradient(180deg, #fde047 0%, #ca8a04 55%, #713f12 100%)', href: 'coinflip.html' },
    { name: 'Hi-Lo', cover: 'hilo', gradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 55%, #0c4a6e 100%)', href: 'hilo.html' },
    { name: 'Tower', cover: 'tower', gradient: 'linear-gradient(180deg, #2dd4bf 0%, #0d9488 55%, #134e4a 100%)', href: 'tower.html' },
    { name: 'Wheel', cover: 'wheel', gradient: 'linear-gradient(180deg, #e879f9 0%, #c026d3 55%, #701a75 100%)', href: 'wheel.html' },
  ],
  live: [
    { name: 'Crazy Time', emoji: '🎡', gradient: 'linear-gradient(180deg, #fb7185 0%, #e11d48 55%, #881337 100%)', badge: 'live' },
    { name: 'Lightning Roulette', emoji: '⚡', gradient: 'linear-gradient(180deg, #fef08a 0%, #eab308 55%, #713f12 100%)', badge: 'live' },
    { name: 'Blackjack VIP', emoji: '🃏', gradient: 'linear-gradient(180deg, #9b6dff 0%, #5b21b6 55%, #3b0764 100%)', badge: 'live' },
    { name: 'Mega Ball', emoji: '🔮', gradient: 'linear-gradient(180deg, #818cf8 0%, #4f46e5 55%, #312e81 100%)', badge: 'live' },
    { name: 'Monopoly Live', emoji: '🎩', gradient: 'linear-gradient(180deg, #6ee7b7 0%, #059669 55%, #064e3b 100%)', badge: 'live' },
    { name: 'Dream Catcher', emoji: '🌙', gradient: 'linear-gradient(180deg, #c4b5fd 0%, #7c3aed 55%, #4c1d95 100%)', badge: 'live' },
  ],
};

const PROVIDERS = [
  'Pragmatic Play', 'Hacksaw Gaming', 'Nolimit City', 'NetEnt',
  'Play\'n Go', 'Push Gaming', 'Red Tiger', 'Relax Gaming',
  'Big Time Gaming', 'Thunderkick', 'Spribe', 'Evolution',
  'AvatarUX', 'Endorphina', 'PGSoft', 'Spinomenal',
];

const PLAYERS = [
  'CryptoKing', 'LuckyAce', 'MoonWalker', 'BitSpinner', 'NeonWolf',
  'ShadowBet', 'GoldRush', 'StarPlayer', 'DarkHorse', 'RainMaker',
  'VaultHunter', 'DiamondHands', 'WhaleWatch', 'NightOwl', 'HighRoller99',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min, max) {
  const val = Math.random() * (max - min) + min;
  return val.toFixed(val > 100 ? 0 : 2);
}

function plinkoCoverPegsHTML() {
  let html = '';
  for (let row = 0; row < 5; row++) {
    const cols = row + 3;
    for (let col = 0; col < cols; col++) {
      html += `<span class="pl-cover-peg" style="--row:${row};--col:${col};--cols:${cols - 1}"></span>`;
    }
  }
  return html;
}

function plinkoCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="pl-cover">
      <div class="pl-cover-scene">
        <div class="pl-cover-glow"></div>
        <div class="pl-cover-board">
          <div class="pl-cover-pegs">${plinkoCoverPegsHTML()}</div>
          <div class="pl-cover-ball"></div>
          <div class="pl-cover-slots">
            <span class="pl-cover-slot pl-cover-slot--edge"></span>
            <span class="pl-cover-slot pl-cover-slot--mid"></span>
            <span class="pl-cover-slot pl-cover-slot--center"></span>
            <span class="pl-cover-slot pl-cover-slot--mid"></span>
            <span class="pl-cover-slot pl-cover-slot--edge"></span>
          </div>
        </div>
      </div>
      <div class="pl-cover-footer">
        <span class="pl-cover-title">${game.name}</span>
        <span class="pl-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function rouletteCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="rl-cover">
      <div class="rl-cover-scene">
        <div class="rl-cover-glow"></div>
        <div class="rl-cover-wheel">
          <div class="rl-cover-wheel-ring"></div>
          <div class="rl-cover-wheel-inner"></div>
          <div class="rl-cover-ball"></div>
        </div>
      </div>
      <div class="rl-cover-footer">
        <span class="rl-cover-title">${game.name}</span>
        <span class="rl-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function blackjackCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="bj-cover">
      <div class="bj-cover-scene">
        <div class="bj-cover-glow"></div>
        <div class="bj-cover-cards">
          <div class="bj-cover-card bj-cover-card--ace">
            <span class="bj-cc-corner red"><span class="bj-cc-rank">A</span><span class="bj-cc-suit">♦</span></span>
            <span class="bj-cc-suit-center red">♦</span>
          </div>
          <div class="bj-cover-card bj-cover-card--king">
            <span class="bj-cc-corner"><span class="bj-cc-rank">K</span><span class="bj-cc-suit">♠</span></span>
            <span class="bj-cc-suit-center">♠</span>
          </div>
          <div class="bj-cover-card bj-cover-card--back">
            <span class="bj-cc-back-ring"></span>
            <span class="bj-cc-back-logo">X</span>
          </div>
        </div>
      </div>
      <div class="bj-cover-footer">
        <span class="bj-cover-title">${game.name}</span>
        <span class="bj-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function diceCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="dc-cover">
      <div class="dc-cover-scene">
        <div class="dc-cover-glow"></div>
        <div class="dc-cover-die-wrap">
          <div class="dc-cover-die">
            <div class="dc-cover-die-body">
              <span class="dc-cover-pip dc-cover-pip--c"></span>
              <span class="dc-cover-pip dc-cover-pip--tl"></span>
              <span class="dc-cover-pip dc-cover-pip--tr"></span>
              <span class="dc-cover-pip dc-cover-pip--bl"></span>
              <span class="dc-cover-pip dc-cover-pip--br"></span>
            </div>
            <div class="dc-cover-die-side"></div>
            <div class="dc-cover-die-top">
              <span class="dc-cover-pip dc-cover-pip--solo"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="dc-cover-footer">
        <span class="dc-cover-title">${game.name}</span>
        <span class="dc-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function minesCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="mn-cover">
      <div class="mn-cover-scene">
        <div class="mn-cover-glow"></div>
        <div class="mn-cover-gem">
          <span class="mn-cover-gem-top"></span>
          <span class="mn-cover-gem-left"></span>
          <span class="mn-cover-gem-right"></span>
          <span class="mn-cover-gem-shine"></span>
        </div>
      </div>
      <div class="mn-cover-footer">
        <span class="mn-cover-title">${game.name}</span>
        <span class="mn-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function crashCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="cr-cover">
      <div class="cr-cover-scene">
        <div class="cr-cover-glow"></div>
        <div class="cr-cover-rocket">
          <span class="cr-cover-rocket-body"></span>
          <span class="cr-cover-rocket-nose"></span>
          <span class="cr-cover-rocket-fin cr-cover-rocket-fin--l"></span>
          <span class="cr-cover-rocket-fin cr-cover-rocket-fin--r"></span>
          <span class="cr-cover-rocket-window"></span>
          <span class="cr-cover-rocket-flame"></span>
        </div>
      </div>
      <div class="cr-cover-footer">
        <span class="cr-cover-title">${game.name}</span>
        <span class="cr-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function kenoCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="kn-cover">
      <div class="kn-cover-scene">
        <div class="kn-cover-glow"></div>
        <div class="kn-cover-tile">
          <span class="kn-cover-num">1</span>
          <span class="kn-cover-num">2</span>
          <span class="kn-cover-num">3</span>
          <span class="kn-cover-num">4</span>
        </div>
      </div>
      <div class="kn-cover-footer">
        <span class="kn-cover-title">${game.name}</span>
        <span class="kn-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function limboCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="lb-cover">
      <div class="lb-cover-scene">
        <div class="lb-cover-glow"></div>
        <div class="lb-cover-slot">
          <span class="lb-cover-slot-top"></span>
          <div class="lb-cover-reels">
            <span class="lb-cover-reel">7</span>
            <span class="lb-cover-reel">7</span>
            <span class="lb-cover-reel">7</span>
          </div>
          <span class="lb-cover-lever">
            <span class="lb-cover-lever-arm"></span>
            <span class="lb-cover-lever-knob"></span>
          </span>
        </div>
      </div>
      <div class="lb-cover-footer">
        <span class="lb-cover-title">${game.name}</span>
        <span class="lb-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function coinflipCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="cf-cover">
      <div class="cf-cover-scene">
        <div class="cf-cover-glow"></div>
        <div class="cf-cover-coin-wrap">
          <div class="cf-cover-coin">
            <div class="cf-cover-coin-face cf-cover-coin-face--front">
              <img class="cf-cover-heads-img" src="assets/coinflip/heads.png" alt="">
            </div>
            <div class="cf-cover-coin-face cf-cover-coin-face--edge"></div>
            <div class="cf-cover-coin-face cf-cover-coin-face--back">
              <img class="cf-cover-tails-img" src="assets/coinflip/tails.png" alt="">
            </div>
          </div>
        </div>
      </div>
      <div class="cf-cover-footer">
        <span class="cf-cover-title">${game.name}</span>
        <span class="cf-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function hiloCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="hl-cover">
      <div class="hl-cover-scene">
        <div class="hl-cover-glow"></div>
        <div class="hl-cover-chart">
          <div class="hl-cover-grid"></div>
          <svg class="hl-cover-line" viewBox="0 0 80 60" aria-hidden="true">
            <polyline points="4,48 18,42 28,44 38,28 52,32 62,18 76,8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="hl-cover-footer">
        <span class="hl-cover-title">${game.name}</span>
        <span class="hl-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function wheelCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="wh-cover">
      <div class="wh-cover-scene">
        <div class="wh-cover-glow"></div>
        <div class="wh-cover-stand"></div>
        <div class="wh-cover-wheel">
          <span class="wh-cover-spoke wh-cover-spoke--1"></span>
          <span class="wh-cover-spoke wh-cover-spoke--2"></span>
          <span class="wh-cover-spoke wh-cover-spoke--3"></span>
          <span class="wh-cover-spoke wh-cover-spoke--4"></span>
          <span class="wh-cover-seg wh-cover-seg--1"></span>
          <span class="wh-cover-seg wh-cover-seg--2"></span>
          <span class="wh-cover-seg wh-cover-seg--3"></span>
          <span class="wh-cover-seg wh-cover-seg--4"></span>
          <span class="wh-cover-seg wh-cover-seg--5"></span>
          <span class="wh-cover-seg wh-cover-seg--6"></span>
          <span class="wh-cover-hub"></span>
        </div>
      </div>
      <div class="wh-cover-footer">
        <span class="wh-cover-title">${game.name}</span>
        <span class="wh-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function towerCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="tw-cover">
      <div class="tw-cover-scene">
        <div class="tw-cover-glow"></div>
        <div class="tw-cover-tower">
          <span class="tw-cover-tip"></span>
          <span class="tw-cover-shaft"></span>
          <span class="tw-cover-crossbar tw-cover-crossbar--1"></span>
          <span class="tw-cover-crossbar tw-cover-crossbar--2"></span>
          <span class="tw-cover-base"></span>
        </div>
      </div>
      <div class="tw-cover-footer">
        <span class="tw-cover-title">${game.name}</span>
        <span class="tw-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function warCoverHTML(game) {
  return `
    ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
    <div class="sw-cover">
      <div class="sw-cover-scene">
        <div class="sw-cover-glow"></div>
        <div class="sw-cover-swords">
          <span class="sw-cover-sword sw-cover-sword--left">
            <span class="sw-cover-blade"></span>
            <span class="sw-cover-guard"></span>
            <span class="sw-cover-hilt"></span>
          </span>
          <span class="sw-cover-sword sw-cover-sword--right">
            <span class="sw-cover-blade"></span>
            <span class="sw-cover-guard"></span>
            <span class="sw-cover-hilt"></span>
          </span>
        </div>
      </div>
      <div class="sw-cover-footer">
        <span class="sw-cover-title">War</span>
        <span class="sw-cover-brand">NBD Originals</span>
      </div>
    </div>
  `;
}

function createGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card' + (game.cover ? ` game-card--cover-${game.cover}` : '');
  card.dataset.name = game.name.toLowerCase();

  if (game.cover === 'blackjack') {
    card.innerHTML = blackjackCoverHTML(game);
  } else if (game.cover === 'plinko') {
    card.innerHTML = plinkoCoverHTML(game);
  } else if (game.cover === 'roulette') {
    card.innerHTML = rouletteCoverHTML(game);
  } else if (game.cover === 'dice') {
    card.innerHTML = diceCoverHTML(game);
  } else if (game.cover === 'mines') {
    card.innerHTML = minesCoverHTML(game);
  } else if (game.cover === 'crash') {
    card.innerHTML = crashCoverHTML(game);
  } else if (game.cover === 'keno') {
    card.innerHTML = kenoCoverHTML(game);
  } else if (game.cover === 'limbo') {
    card.innerHTML = limboCoverHTML(game);
  } else if (game.cover === 'war') {
    card.innerHTML = warCoverHTML(game);
  } else if (game.cover === 'coinflip') {
    card.innerHTML = coinflipCoverHTML(game);
  } else if (game.cover === 'hilo') {
    card.innerHTML = hiloCoverHTML(game);
  } else if (game.cover === 'tower') {
    card.innerHTML = towerCoverHTML(game);
  } else if (game.cover === 'wheel') {
    card.innerHTML = wheelCoverHTML(game);
  } else {
    card.style.background = game.gradient;
    card.innerHTML = `
      ${game.badge ? `<span class="game-card-badge ${game.badge}">${game.badge}</span>` : ''}
      <div class="game-card-art">
        <span class="game-card-icon">${game.emoji}</span>
        <div class="game-card-glow"></div>
      </div>
      <div class="game-card-title">${game.name}</div>
    `;
  }
  card.addEventListener('click', () => {
    if (game.href) {
      window.location.href = game.href;
      return;
    }
    card.classList.add('game-card--pressed');
    setTimeout(() => card.classList.remove('game-card--pressed'), 150);
  });
  return card;
}

function renderGameGrid(gridId, games) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';
  games.forEach(game => grid.appendChild(createGameCard(game)));
}
