const HOUSE_EDGE = 0.99;
const FLOORS = 9;
const POPUP_MS = 2200;
const REVEAL_MS = 500;
const HISTORY_MAX = 20;
const AUTO_GAP_MS = 550;
const PICK_MS = 180;
const FLOOR_STEP_MS = 320;
const RESET_FADE_MS = 260;

const DIFFICULTIES = {
  easy: { label: 'Easy', cols: 4, traps: 1 },
  medium: { label: 'Medium', cols: 3, traps: 1 },
  hard: { label: 'Hard', cols: 2, traps: 1 },
  expert: { label: 'Expert', cols: 3, traps: 2 },
};

const state = {
  phase: 'idle',
  panel: 'manual',
  bet: 0,
  difficulty: 'medium',
  floor: 0,
  picks: [],
  trapMap: [],
  history: [],
  auto: {
    running: false,
    unlimited: false,
    configEnabled: false,
    completed: 0,
    sessionProfit: 0,
    baseBet: 0,
    totalBets: 0,
  },
  autoPicks: Array(FLOORS).fill(null),
};

const els = {};
let popupTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initCommon();
  cacheElements();
  bindEvents();
  buildTowerPreview();
  updateBetLabel();
  updateStats();
  syncAutoInfinityUI();
  closeAutoConfig();
  updateAutoPathStat();
  updateAutoProgress();
  updateUI();
  renderHistory();
});

function cacheElements() {
  els.tabManual = document.getElementById('twTabManual');
  els.tabAuto = document.getElementById('twTabAuto');
  els.manualPanel = document.getElementById('twManualPanel');
  els.autoPanel = document.getElementById('twAutoPanel');
  els.bet = document.getElementById('twBet');
  els.betCurrency = document.getElementById('twBetCurrency');
  els.half = document.getElementById('twHalf');
  els.doubleBet = document.getElementById('twDouble');
  els.difficulty = document.getElementById('twDifficulty');
  els.multiplier = document.getElementById('twMultiplier');
  els.floorStat = document.getElementById('twFloor');
  els.cashout = document.getElementById('twCashout');
  els.startBtn = document.getElementById('twStartBtn');
  els.cashoutBtn = document.getElementById('twCashoutBtn');
  els.autoPathStat = document.getElementById('twAutoPathStat');
  els.autoClear = document.getElementById('twAutoClear');
  els.autoBets = document.getElementById('twAutoBets');
  els.autoInfinity = document.getElementById('twAutoInfinity');
  els.autoAdvanced = document.getElementById('twAutoAdvanced');
  els.onWinMode = document.getElementById('twOnWinMode');
  els.onWinPct = document.getElementById('twOnWinPct');
  els.onWinPctWrap = document.getElementById('twOnWinPctWrap');
  els.onLossMode = document.getElementById('twOnLossMode');
  els.onLossPct = document.getElementById('twOnLossPct');
  els.onLossPctWrap = document.getElementById('twOnLossPctWrap');
  els.stopProfit = document.getElementById('twStopProfit');
  els.stopLoss = document.getElementById('twStopLoss');
  els.autoProgress = document.getElementById('twAutoProgress');
  els.autoBetCount = document.getElementById('twAutoBetCount');
  els.autoProfit = document.getElementById('twAutoProfit');
  els.autoConfigure = document.getElementById('twAutoConfigure');
  els.autoStart = document.getElementById('twAutoStart');
  els.autoStop = document.getElementById('twAutoStop');
  els.message = document.getElementById('twMessage');
  els.stage = document.getElementById('twStage');
  els.sky = document.querySelector('.tw-sky');
  els.tower = document.getElementById('twTower');
  els.climber = document.getElementById('twClimber');
  els.status = document.getElementById('twStatus');
  els.historyList = document.getElementById('twHistoryList');
  els.resultPopup = document.getElementById('twResultPopup');
  els.resultCard = document.getElementById('twResultCard');
  els.popupLabel = document.getElementById('twPopupLabel');
  els.popupMult = document.getElementById('twPopupMult');
  els.popupText = document.getElementById('twPopupText');
}

function bindEvents() {
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.half.addEventListener('click', () => {
    if (!canEditBet()) return;
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.doubleBet.addEventListener('click', () => {
    if (!canEditBet()) return;
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.bet.addEventListener('input', () => {
    if (canEditBet()) {
      updateBetLabel();
      updateStats();
    }
  });
  els.difficulty.addEventListener('change', () => {
    if (!canEditBet()) return;
    clearAutoPicks();
    buildTowerPreview();
    updateStats();
  });
  els.autoClear.addEventListener('click', () => clearAutoPicks());
  els.startBtn.addEventListener('click', () => startClimb());
  els.cashoutBtn.addEventListener('click', () => cashOut());
  els.autoConfigure.addEventListener('click', toggleAutoAdvanced);
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  els.autoInfinity.addEventListener('click', toggleAutoInfinity);
  els.autoBets.addEventListener('input', () => {
    if (state.auto.unlimited) setAutoUnlimited(false);
    updateAutoProgress();
  });
  els.onWinMode.addEventListener('change', () => toggleStrategyPct('win'));
  els.onLossMode.addEventListener('change', () => toggleStrategyPct('loss'));
  els.tower.addEventListener('click', onTowerClick);
  document.addEventListener('xython:auth-change', updateUI);
}

function canEditBet() {
  return state.phase === 'idle' && !state.auto.running;
}

function setPanel(panel) {
  if (state.auto.running || state.phase === 'playing') return;
  if (panel !== 'auto') closeAutoConfig();
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualPanel.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  buildTowerPreview();
  updateUI();
}

function isAutoPickMode() {
  return state.panel === 'auto' && !state.auto.running && state.phase === 'idle';
}

function getAutoPickPath() {
  const path = [];
  for (let f = 0; f < FLOORS; f += 1) {
    const col = state.autoPicks[f];
    if (col === null || col === undefined) break;
    path.push(col);
  }
  return path;
}

function getNextAutoPickFloor() {
  return getAutoPickPath().length;
}

function clearAutoPicks() {
  if (state.auto.running) return;
  state.autoPicks = Array(FLOORS).fill(null);
  if (isAutoPickMode()) renderAutoTower();
  updateAutoPathStat();
  updateStats();
  updateUI();
}

function updateAutoPathStat() {
  const len = getAutoPickPath().length;
  if (els.autoPathStat) els.autoPathStat.textContent = `${len} / ${FLOORS} floors`;
}

function toggleAutoPick(floor, col) {
  if (!isAutoPickMode()) return;

  const pathLen = getAutoPickPath().length;

  if (state.autoPicks[floor] === col) {
    for (let i = floor; i < FLOORS; i += 1) state.autoPicks[i] = null;
  } else if (floor < pathLen) {
    state.autoPicks[floor] = col;
    for (let i = floor + 1; i < FLOORS; i += 1) state.autoPicks[i] = null;
  } else if (floor === pathLen) {
    state.autoPicks[floor] = col;
  }

  renderAutoTower();
  updateAutoPathStat();
  updateStats();
  updateUI();
}

function closeAutoConfig() {
  state.auto.configEnabled = false;
  if (els.autoAdvanced) els.autoAdvanced.hidden = true;
  if (els.autoConfigure) {
    els.autoConfigure.classList.remove('active');
    els.autoConfigure.textContent = 'Configure Auto';
  }
}

function toggleAutoAdvanced() {
  if (state.auto.running) return;
  if (els.autoAdvanced.hidden) {
    els.autoAdvanced.hidden = false;
    state.auto.configEnabled = true;
    els.autoConfigure.classList.add('active');
    els.autoConfigure.textContent = 'Hide Config';
    toggleStrategyPct('win');
    toggleStrategyPct('loss');
  } else {
    closeAutoConfig();
  }
}

function setAutoUnlimited(on) {
  state.auto.unlimited = on;
  els.autoInfinity.classList.toggle('active', on);
  els.autoInfinity.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) els.autoBets.value = '';
  updateAutoProgress();
}

function toggleAutoInfinity() {
  if (state.auto.running) return;
  setAutoUnlimited(!state.auto.unlimited);
}

function syncAutoInfinityUI() {
  els.autoInfinity.classList.toggle('active', state.auto.unlimited);
  els.autoInfinity.setAttribute('aria-pressed', state.auto.unlimited ? 'true' : 'false');
}

function toggleStrategyPct(which) {
  const mode = which === 'win' ? els.onWinMode.value : els.onLossMode.value;
  const wrap = which === 'win' ? els.onWinPctWrap : els.onLossPctWrap;
  wrap.hidden = mode !== 'increase';
}

function getAutoTotalBets() {
  if (state.auto.unlimited) return Infinity;
  const n = parseInt(els.autoBets.value, 10);
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return n;
}

function getStop(input) {
  const n = parseFloat(input?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function updateAutoProgress() {
  const total = state.auto.unlimited ? '∞' : (parseInt(els.autoBets.value, 10) || 0);
  els.autoBetCount.textContent = state.auto.unlimited
    ? `${state.auto.completed} / ∞`
    : `${state.auto.completed} / ${total}`;
  const profit = state.auto.sessionProfit;
  const sign = profit >= 0 ? '+' : '-';
  els.autoProfit.textContent = `${sign}$${Math.abs(profit).toFixed(2)}`;
  els.autoProfit.classList.toggle('is-positive', profit > 0);
  els.autoProfit.classList.toggle('is-negative', profit < 0);
  [els.autoBetCount, els.autoProfit].forEach(el => {
    if (!el) return;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  });
}

function applyBetStrategy(won) {
  if (!state.auto.configEnabled) {
    els.bet.value = state.auto.baseBet.toFixed(2);
    updateBetLabel();
    updateStats();
    return;
  }

  const mode = won ? els.onWinMode.value : els.onLossMode.value;
  const pct = parseFloat(won ? els.onWinPct.value : els.onLossPct.value) || 0;
  let bet = parseFloat(els.bet.value) || state.auto.baseBet;
  if (mode === 'reset') {
    bet = state.auto.baseBet;
  } else if (mode === 'increase') {
    bet = bet * (1 + pct / 100);
  }
  els.bet.value = Math.max(0.01, bet).toFixed(2);
  updateBetLabel();
  updateStats();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rAF() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function flashStats() {
  [els.multiplier, els.cashout, els.floorStat].forEach(el => {
    if (!el) return;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  });
}

function getConfig(key) {
  return DIFFICULTIES[key || state.difficulty] || DIFFICULTIES.medium;
}

function getStepMult(config) {
  const safe = config.cols - config.traps;
  if (safe <= 0) return 1;
  return config.cols / safe;
}

function getMultiplier(floorsCleared, difficulty = state.difficulty) {
  if (floorsCleared <= 0) return 1;
  const config = getConfig(difficulty);
  const step = getStepMult(config);
  let mult = 1;
  for (let i = 0; i < floorsCleared; i += 1) mult *= step;
  return mult * HOUSE_EDGE;
}

function formatMult(value) {
  return value >= 100 ? `${value.toFixed(2)}x` : `${value.toFixed(2)}x`;
}

function shuffleTraps(cols, trapCount) {
  const indices = Array.from({ length: cols }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, trapCount));
}

function generateTrapMap(difficulty) {
  const config = getConfig(difficulty);
  return Array.from({ length: FLOORS }, () => shuffleTraps(config.cols, config.traps));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const bet = parseFloat(els.bet.value) || 0;
  const pathLen = getAutoPickPath().length;
  const floors = state.phase === 'playing' ? state.floor : (isAutoPickMode() ? pathLen : 0);
  const mult = getMultiplier(floors);
  els.multiplier.textContent = formatMult(mult);
  els.floorStat.textContent = isAutoPickMode()
    ? `${pathLen} / ${FLOORS}`
    : `${floors} / ${FLOORS}`;
  els.cashout.textContent = `$${(bet * mult).toFixed(2)}`;
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'tw-message' + (type ? ` ${type}` : '');
}

function setStatus(text) {
  const textEl = els.status?.querySelector('.tw-status-text');
  if (textEl) textEl.textContent = text;
  else if (els.status) els.status.textContent = text;
}

function validateBet(bet) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }
  if (!bet || bet <= 0) return 'Enter a valid bet amount';
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  if (bet > (window.XythonWallet?.getBalance(currency) ?? 0)) return 'Insufficient balance — deposit first';
  return null;
}

function hidePopup() {
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
  els.resultPopup?.classList.remove('is-visible');
  if (els.resultPopup) els.resultPopup.hidden = true;
}

function showPopup({ won, mult, payout, text }) {
  hidePopup();
  els.popupLabel.textContent = won ? 'You Win!' : 'Tower Fall';
  els.popupMult.textContent = formatMult(mult);
  els.popupText.textContent = text || (won ? `+$${payout.toFixed(2)}` : 'Wrong tile — you lose');
  els.resultCard.className = `tw-result-popup-card tw-result-popup-card--${won ? 'win' : 'lose'}`;
  els.resultPopup.hidden = false;
  requestAnimationFrame(() => els.resultPopup.classList.add('is-visible'));
  popupTimer = setTimeout(() => {
    els.resultPopup.classList.remove('is-visible');
    popupTimer = setTimeout(() => {
      els.resultPopup.hidden = true;
      popupTimer = null;
    }, 200);
  }, POPUP_MS);
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.pop();
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;
  if (!state.history.length) {
    els.historyList.innerHTML = '<p class="tw-history-empty">No climbs yet</p>';
    return;
  }
  els.historyList.innerHTML = state.history.map((item, i) => {
    const cls = item.won ? 'win' : 'lose';
    const label = item.won ? formatMult(item.mult) : '✕';
    return `<div class="tw-history-item tw-history-item--${cls}${i === 0 ? ' is-new' : ''}">${label}</div>`;
  }).join('');
}

function buildTowerPreview() {
  const difficulty = els.difficulty?.value || 'medium';
  state.trapMap = [];
  state.floor = 0;
  state.picks = [];
  if (isAutoPickMode()) {
    renderAutoTower();
    return;
  }
  renderTower({ preview: true, difficulty });
}

function renderAutoTower() {
  renderTower({ autoPick: true, difficulty: els.difficulty?.value || 'medium' });
  updateAutoPathStat();
}

function renderTower({ preview = false, autoPick = false, difficulty = state.difficulty } = {}) {
  const config = getConfig(difficulty);
  const active = state.phase === 'playing';
  const revealLoss = state.phase === 'lost';
  const nextPickFloor = getNextAutoPickFloor();
  const showPath = state.auto.running && active;

  let html = '';
  for (let f = FLOORS - 1; f >= 0; f -= 1) {
    const floorNum = f + 1;
    const mult = formatMult(getMultiplier(f + 1, difficulty));
    const isCurrent = active && f === state.floor;
    const isDone = active && f < state.floor;
    const isFuture = active && f > state.floor;
    const traps = state.trapMap[f] || new Set();
    const picked = state.picks[f];

    let rowClass = 'tw-row';
    if (isCurrent) rowClass += ' is-current';
    if (isDone) rowClass += ' is-done';
    if (isFuture) rowClass += ' is-future';
    if (revealLoss && f === state.floor) rowClass += ' is-failed';
    if (autoPick && f === nextPickFloor) rowClass += ' is-auto-next';

    let tiles = '';
    for (let c = 0; c < config.cols; c += 1) {
      let tileClass = 'tw-tile';
      const isTrap = traps.has(c);
      const isPick = picked === c;
      const autoSelected = autoPick && state.autoPicks[f] === c;
      const pathLen = autoPick ? getAutoPickPath().length : 0;
      const autoPickable = autoPick && f <= pathLen;

      if (autoPick) {
        tileClass += autoSelected ? ' is-auto-picked' : ' is-auto-pickable';
      } else if (preview) {
        tileClass += ' is-idle';
      } else if (isDone && isPick) {
        tileClass += ' is-safe is-picked';
      } else if (revealLoss && f === state.floor) {
        if (isPick && isTrap) tileClass += ' is-trap is-picked';
        else if (isTrap) tileClass += ' is-trap';
        else if (isPick) tileClass += ' is-safe is-picked';
        else tileClass += ' is-revealed-safe';
      } else if (isCurrent) {
        tileClass += ' is-active';
        if (showPath && state.autoPicks[f] === c) tileClass += ' is-path-next';
      } else if (isFuture) {
        tileClass += ' is-locked';
        if (showPath && state.autoPicks[f] === c) tileClass += ' is-path-hint';
      } else if (isDone) {
        tileClass += isTrap ? ' is-trap is-revealed' : ' is-revealed-safe';
      }

      const icon = autoPick && autoSelected
        ? '✦'
        : (preview ? '' : (tileClass.includes('is-trap') ? '💀' : (tileClass.includes('is-safe') || tileClass.includes('is-picked') ? '✦' : '')));
      const disabled = autoPick ? false : (!isCurrent || preview);
      tiles += `<button type="button" class="${tileClass}" data-floor="${f}" data-col="${c}" ${disabled ? 'disabled' : ''} aria-label="Floor ${floorNum} tile ${c + 1}"><span class="tw-tile-shine"></span><span class="tw-tile-gem"></span><span class="tw-tile-icon">${icon}</span></button>`;
    }

    html += `
      <div class="${rowClass}" data-floor="${f}">
        <span class="tw-row-label">${floorNum}</span>
        <div class="tw-row-tiles" style="--cols:${config.cols}">${tiles}</div>
        <span class="tw-row-mult"><span class="tw-row-mult-val">${mult}</span></span>
      </div>
    `;
  }

  els.tower.innerHTML = html;
  requestAnimationFrame(() => updateClimberPosition());
}

function setTileIcon(tile, text) {
  const icon = tile?.querySelector('.tw-tile-icon');
  if (icon) icon.textContent = text;
}

function updateTowerInPlace(pickedFloor, pickedCol) {
  const pickedRow = els.tower.querySelector(`.tw-row[data-floor="${pickedFloor}"]`);
  if (pickedRow) {
    pickedRow.classList.remove('is-current');
    pickedRow.classList.add('is-done');
    pickedRow.querySelectorAll('.tw-tile').forEach(tile => {
      const col = parseInt(tile.dataset.col, 10);
      tile.disabled = true;
      tile.classList.remove('is-active', 'is-locked', 'is-picking', 'is-path-next', 'is-path-hint');
      if (col === pickedCol) {
        tile.classList.add('is-safe', 'is-picked');
        setTileIcon(tile, '✦');
      } else {
        tile.classList.add('is-revealed-safe');
      }
    });
  }

  const currentRow = els.tower.querySelector(`.tw-row[data-floor="${state.floor}"]`);
  if (currentRow) {
    currentRow.classList.remove('is-future');
    currentRow.classList.add('is-current');
    currentRow.querySelectorAll('.tw-tile').forEach(tile => {
      const col = parseInt(tile.dataset.col, 10);
      tile.disabled = false;
      tile.classList.remove('is-locked', 'is-path-hint');
      tile.classList.add('is-active');
      if (state.auto.running && state.autoPicks[state.floor] === col) {
        tile.classList.add('is-path-next');
      }
    });
  }

  els.tower.querySelectorAll('.tw-row.is-future').forEach(row => {
    const f = parseInt(row.dataset.floor, 10);
    row.querySelectorAll('.tw-tile').forEach(tile => {
      const col = parseInt(tile.dataset.col, 10);
      if (state.auto.running && state.autoPicks[f] === col) {
        tile.classList.add('is-path-hint');
      }
    });
  });

  requestAnimationFrame(() => updateClimberPosition());
}

function updateTowerLoss(floor) {
  const row = els.tower.querySelector(`.tw-row[data-floor="${floor}"]`);
  if (!row) return;

  row.classList.remove('is-current');
  row.classList.add('is-failed');
  const traps = state.trapMap[floor] || new Set();
  const picked = state.picks[floor];

  row.querySelectorAll('.tw-tile').forEach(tile => {
    const col = parseInt(tile.dataset.col, 10);
    tile.disabled = true;
    tile.classList.remove('is-active', 'is-picking', 'is-path-next', 'is-path-hint');
    if (col === picked && traps.has(col)) {
      tile.classList.add('is-trap', 'is-picked');
      setTileIcon(tile, '💀');
    } else if (traps.has(col)) {
      tile.classList.add('is-trap');
      setTileIcon(tile, '💀');
    } else {
      tile.classList.add('is-revealed-safe');
    }
  });
}

function updateClimberPosition() {
  if (state.phase !== 'playing' || state.floor <= 0) {
    els.climber.hidden = true;
    return;
  }

  const row = els.tower.querySelector(`.tw-row[data-floor="${state.floor - 1}"]`);
  const pick = state.picks[state.floor - 1];
  const tile = row?.querySelector(`.tw-tile[data-col="${pick}"]`);
  if (!row || !tile) {
    els.climber.hidden = true;
    return;
  }

  const skyRect = els.sky?.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  if (!skyRect) {
    els.climber.hidden = true;
    return;
  }

  els.climber.hidden = false;
  els.climber.style.left = `${tileRect.left - skyRect.left + tileRect.width / 2}px`;
  els.climber.style.top = `${tileRect.top - skyRect.top - 10}px`;
}

function onTowerClick(e) {
  if (state.auto.running) return;

  if (isAutoPickMode()) {
    const tile = e.target.closest('.tw-tile.is-auto-pickable, .tw-tile.is-auto-picked');
    if (!tile) return;
    toggleAutoPick(parseInt(tile.dataset.floor, 10), parseInt(tile.dataset.col, 10));
    return;
  }

  const tile = e.target.closest('.tw-tile.is-active');
  if (!tile || state.phase !== 'playing') return;
  pickTile(parseInt(tile.dataset.floor, 10), parseInt(tile.dataset.col, 10));
}

async function pickTile(floor, col, { silent = false, fast = false, animated = false } = {}) {
  if (state.phase !== 'playing' || floor !== state.floor) return null;

  const traps = state.trapMap[floor];
  const tileEl = els.tower.querySelector(`.tw-row[data-floor="${floor}"] .tw-tile[data-col="${col}"]`);
  tileEl?.classList.add('is-picking');

  await delay(fast ? 60 : animated ? PICK_MS : 120);

  state.picks[floor] = col;

  if (traps.has(col)) {
    tileEl?.classList.remove('is-picking');
    return loseRound(floor, { silent, fast, animated });
  }

  tileEl?.classList.remove('is-picking');
  state.floor += 1;
  updateTowerInPlace(floor, col);
  flashStats();
  updateStats();

  if (state.floor >= FLOORS) {
    await delay(fast ? 140 : animated ? 420 : 350);
    return cashOut(true, { silent, animated });
  }

  if (!silent) {
    setStatus(`Floor ${state.floor} — pick a safe tile or cash out`);
    setMessage(`Floor ${state.floor} cleared`, 'win');
    updateUI();
  } else if (state.auto.running) {
    setStatus(`Autobet — floor ${state.floor} / ${getAutoPickPath().length}`);
  }

  if (animated) await delay(FLOOR_STEP_MS);
  return { cleared: true, floor: state.floor };
}

async function loseRound(floor, { silent = false, fast = false, animated = false } = {}) {
  state.phase = 'lost';
  updateTowerLoss(floor);
  els.stage.classList.add('is-lose');
  els.climber.hidden = true;
  const netProfit = -state.bet;

  if (!silent) {
    setStatus(`Hit a trap on floor ${floor + 1}!`);
    setMessage(`Lost $${state.bet.toFixed(2)}`, 'lose');
  }

  await delay(fast ? 140 : animated ? 520 : REVEAL_MS);

  window.XythonStats?.recordRound?.(state.bet, false, { game: 'tower', payout: 0 });
  pushHistory({ won: false, mult: getMultiplier(state.floor) });

  if (!silent) {
    showPopup({
      won: false,
      mult: getMultiplier(state.floor),
      payout: 0,
      text: `Trap on floor ${floor + 1}`,
    });
  } else {
    hidePopup();
  }

  await resetRound({ smooth: silent && state.auto.running });
  if (!silent) updateUI();
  return { won: false, netProfit };
}

async function resetRound({ smooth = false } = {}) {
  if (smooth) {
    els.tower?.classList.add('is-fading');
    els.stage?.classList.remove('is-win', 'is-lose');
    await delay(RESET_FADE_MS);
    els.tower?.classList.remove('is-fading');
  }

  state.phase = 'idle';
  state.bet = 0;
  state.floor = 0;
  state.picks = [];
  state.trapMap = [];
  if (state.panel === 'auto') {
    renderAutoTower();
  } else {
    buildTowerPreview();
  }
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const idle = state.phase === 'idle';
  const playing = state.phase === 'playing';
  const autoPanel = state.panel === 'auto';
  const busy = state.auto.running || playing;

  els.tabManual.classList.toggle('active', state.panel === 'manual');
  els.tabAuto.classList.toggle('active', state.panel === 'auto');
  els.manualPanel.hidden = autoPanel;
  els.autoPanel.hidden = !autoPanel;

  els.startBtn.hidden = autoPanel || !idle;
  els.startBtn.textContent = loggedIn ? 'Start Climb' : 'Register to Bet';
  els.startBtn.disabled = !idle;

  els.cashoutBtn.hidden = autoPanel || !playing || state.floor <= 0;
  els.cashoutBtn.disabled = !playing || state.floor <= 0;

  els.autoStart.hidden = state.auto.running;
  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.autoStart.disabled = state.auto.running || getAutoPickPath().length === 0;
  els.autoStop.hidden = !state.auto.running;
  els.autoProgress.hidden = !state.auto.running;
  els.autoClear.disabled = state.auto.running || getAutoPickPath().length === 0;

  els.stage?.classList.toggle('is-auto-running', state.auto.running);
  els.stage?.classList.toggle('is-auto-pick', isAutoPickMode());
  document.querySelector('.tw-game')?.classList.toggle('is-auto-running', state.auto.running);

  els.tabManual.disabled = busy;
  els.tabAuto.disabled = busy;
  els.bet.disabled = !canEditBet();
  els.half.disabled = !canEditBet();
  els.doubleBet.disabled = !canEditBet();
  els.difficulty.disabled = !canEditBet();
  els.autoConfigure.disabled = state.auto.running;

  [
    els.autoBets, els.autoInfinity, els.onWinMode, els.onWinPct,
    els.onLossMode, els.onLossPct, els.stopProfit, els.stopLoss,
  ].forEach(el => {
    if (el) el.disabled = state.auto.running;
  });

  if (idle && !state.auto.running) {
    const pathLen = getAutoPickPath().length;
    setStatus(autoPanel
      ? (pathLen > 0
        ? `Path set — ${pathLen} floor${pathLen === 1 ? '' : 's'}, ready to autobet`
        : 'Click tiles from floor 1 upward to build your path')
      : 'Pick a difficulty and start climbing');
    els.stage.classList.remove('is-win', 'is-lose');
    els.climber.hidden = true;
  }

  updateStats();
}

async function startClimb({ silent = false } = {}) {
  if (state.phase !== 'idle') return { error: 'Round in progress' };

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) {
    if (!silent) setMessage(error, 'lose');
    return { error };
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Tower',
    detail: `$${bet.toFixed(2)} — ${getConfig().label}`,
    game: 'tower',
  });

  state.bet = bet;
  state.difficulty = els.difficulty.value;
  state.floor = 0;
  state.picks = [];
  state.trapMap = generateTrapMap(state.difficulty);
  state.phase = 'playing';

  hidePopup();
  if (!silent) setMessage('');
  els.stage.classList.remove('is-win', 'is-lose');
  if (!silent) setStatus('Floor 1 — pick a safe tile');
  renderTower();
  if (!silent) updateUI();
  return { started: true };
}

async function cashOut(auto = false, { silent = false, fast = false, animated = false } = {}) {
  if (state.phase !== 'playing' || state.floor <= 0) return null;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const mult = getMultiplier(state.floor);
  const payout = state.bet * mult;
  const profit = payout - state.bet;

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
    type: 'win',
    label: 'Tower',
    detail: `Floor ${state.floor} — ${formatMult(mult)} — $${payout.toFixed(2)}`,
    game: 'tower',
  });

  window.XythonStats?.recordRound?.(state.bet, profit > 0, { game: 'tower', payout });

  els.stage.classList.add(profit > 0 ? 'is-win' : 'is-lose');
  if (silent && state.auto.running && profit > 0) {
    els.stage.classList.add('is-win-flash');
    await delay(320);
    els.stage.classList.remove('is-win-flash');
  }

  if (!silent) {
    setStatus(auto
      ? `Summit reached! ${formatMult(mult)}`
      : `Cashed out at floor ${state.floor} — ${formatMult(mult)}`);
    setMessage(profit > 0 ? `Won $${profit.toFixed(2)}` : 'Break even', profit > 0 ? 'win' : '');
    pushHistory({ won: true, mult });
    showPopup({
      won: true,
      mult,
      payout: profit,
      text: auto ? 'You reached the top!' : `+$${profit.toFixed(2)} profit`,
    });
  } else {
    pushHistory({ won: true, mult });
    hidePopup();
  }

  await resetRound({ smooth: silent && state.auto.running });
  if (!silent) updateUI();
  return { won: profit >= 0, netProfit: profit, mult };
}

async function playAutoRound(pickPath) {
  const start = await startClimb({ silent: true });
  if (start?.error) return { error: start.error };

  for (let i = 0; i < pickPath.length; i += 1) {
    if (!state.auto.running) {
      await resetRound({ smooth: true });
      return { stopped: true };
    }

    const result = await pickTile(state.floor, pickPath[i], { silent: true, animated: true });
    if (result?.won === false) return result;
    if (result?.netProfit !== undefined) return result;
  }

  if (!state.auto.running) {
    await resetRound({ smooth: true });
    return { stopped: true };
  }

  if (state.phase === 'playing' && state.floor >= pickPath.length) {
    return cashOut(state.floor >= FLOORS, { silent: true, animated: true });
  }

  return { won: false, netProfit: 0 };
}

async function startAuto() {
  if (state.auto.running || state.phase === 'playing') return;

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const pickPath = getAutoPickPath();
  if (pickPath.length === 0) {
    setMessage('Pick at least 1 tile on the tower', 'lose');
    return;
  }

  state.auto.running = true;
  state.auto.baseBet = bet;
  state.auto.totalBets = getAutoTotalBets();
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;

  closeAutoConfig();

  updateAutoProgress();
  updateUI();
  setMessage('Autobet started', '');

  await runAutoLoop(pickPath);
}

async function runAutoLoop(pickPath) {
  while (state.auto.running) {
    const total = state.auto.totalBets;
    if (total !== Infinity && state.auto.completed >= total) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const stopProfit = state.auto.configEnabled ? getStop(els.stopProfit) : 0;
    const stopLoss = state.auto.configEnabled ? getStop(els.stopLoss) : 0;
    if (stopProfit > 0 && state.auto.sessionProfit >= stopProfit) {
      stopAuto(false, `Stop profit reached — +$${state.auto.sessionProfit.toFixed(2)}`, 'win');
      return;
    }
    if (stopLoss > 0 && state.auto.sessionProfit <= -stopLoss) {
      stopAuto(false, `Stop loss reached — $${state.auto.sessionProfit.toFixed(2)}`, 'lose');
      return;
    }

    const result = await playAutoRound(pickPath);
    if (result?.stopped) {
      stopAuto(true);
      return;
    }
    if (result?.error) {
      stopAuto(false, result.error, 'lose');
      return;
    }

    state.auto.completed += 1;
    state.auto.sessionProfit += result?.netProfit ?? 0;
    applyBetStrategy(result?.won ?? false);
    updateAutoProgress();

    setMessage(
      `Round ${state.auto.completed} — ${result?.won ? 'Win' : 'Loss'} (${pickPath.length} floors)`,
      result?.won ? 'win' : 'lose'
    );

    if (total !== Infinity && state.auto.completed >= total) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`, state.auto.sessionProfit > 0 ? 'win' : 'lose');
      return;
    }

    await delay(AUTO_GAP_MS);
  }
}

function stopAuto(userStopped, message, messageType) {
  if (!state.auto.running && !userStopped) return;

  state.auto.running = false;
  if (state.phase !== 'idle') {
    resetRound({ smooth: false });
  }
  updateUI();

  if (message) {
    setMessage(message, messageType || '');
    return;
  }

  if (userStopped) {
    const p = state.auto.sessionProfit;
    setMessage(
      `Autobet stopped — ${state.auto.completed} bets, ${p >= 0 ? '+' : ''}$${p.toFixed(2)}`,
      p > 0 ? 'win' : p < 0 ? 'lose' : ''
    );
  }
}

window.addEventListener('resize', () => {
  if (state.phase === 'playing') updateClimberPosition();
});
