const GRID_SIZE = 25;
const HOUSE_EDGE = 0.99;
const AUTO_REVEAL_MS = 120;
const AUTO_ROUND_GAP_MS = 400;

const state = {
  panel: 'manual',
  phase: 'idle',
  bet: 0,
  currency: 'USD',
  mines: 3,
  mineSet: new Set(),
  revealed: new Set(),
  gemsFound: 0,
  lastHitIndex: null,
  autoPicks: new Set(),
  autoPickOrder: [],
  auto: {
    running: false,
    baseBet: 0,
    totalBets: Infinity,
    completed: 0,
    sessionProfit: 0,
    unlimited: true,
    advancedOpen: false,
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.panelEl = document.querySelector('.mn-panel');
  els.tabManual = document.getElementById('mnTabManual');
  els.tabAuto = document.getElementById('mnTabAuto');
  els.manualPanel = document.getElementById('mnManualPanel');
  els.manualActions = document.getElementById('mnManualActions');
  els.liveStats = document.getElementById('mnLiveStats');
  els.autoPanel = document.getElementById('mnAutoPanel');
  els.bet = document.getElementById('mnBet');
  els.betCurrency = document.getElementById('mnBetCurrency');
  els.half = document.getElementById('mnHalf');
  els.doubleBet = document.getElementById('mnDouble');
  els.mines = document.getElementById('mnMines');
  els.multiplier = document.getElementById('mnMultiplier');
  els.gemsFound = document.getElementById('mnGemsFound');
  els.cashoutValue = document.getElementById('mnCashoutValue');
  els.cashoutStat = document.getElementById('mnCashoutStat');
  els.betBtn = document.getElementById('mnBetBtn');
  els.cashoutBtn = document.getElementById('mnCashoutBtn');
  els.pickRandom = document.getElementById('mnPickRandom');
  els.message = document.getElementById('mnMessage');
  els.grid = document.getElementById('mnGrid');
  els.gridHint = document.getElementById('mnGridHint');
  els.autoBets = document.getElementById('mnAutoBets');
  els.autoInfinity = document.getElementById('mnAutoInfinity');
  els.autoAdvancedToggle = document.getElementById('mnAutoAdvancedToggle');
  els.autoAdvanced = document.getElementById('mnAutoAdvanced');
  els.autoProgress = document.getElementById('mnAutoProgress');
  els.onWinMode = document.getElementById('mnOnWinMode');
  els.onWinPct = document.getElementById('mnOnWinPct');
  els.onWinPctWrap = document.getElementById('mnOnWinPctWrap');
  els.onLossMode = document.getElementById('mnOnLossMode');
  els.onLossPct = document.getElementById('mnOnLossPct');
  els.onLossPctWrap = document.getElementById('mnOnLossPctWrap');
  els.stopProfit = document.getElementById('mnStopProfit');
  els.stopLoss = document.getElementById('mnStopLoss');
  els.autoBetCount = document.getElementById('mnAutoBetCount');
  els.autoProfit = document.getElementById('mnAutoProfit');
  els.autoStart = document.getElementById('mnAutoStart');
  els.autoStop = document.getElementById('mnAutoStop');

  for (let n = 1; n <= 24; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    if (n === 3) opt.selected = true;
    els.mines.appendChild(opt);
  }

  els.half.addEventListener('click', () => {
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.doubleBet.addEventListener('click', () => {
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.bet.addEventListener('input', () => {
    updateBetLabel();
    updateStats();
  });
  els.mines.addEventListener('change', () => {
    if (state.phase === 'ended') return;
    trimAutoPicksToMax();
    syncGridView();
    updateStats();
  });
  els.betBtn.addEventListener('click', () => startRound());
  els.cashoutBtn.addEventListener('click', () => cashOut(false));
  els.cashoutStat?.addEventListener('click', () => {
    if (state.phase === 'active' && state.gemsFound > 0) cashOut(false);
  });
  els.pickRandom.addEventListener('click', pickRandomTile);
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.onWinMode.addEventListener('change', () => toggleStrategyPct('win'));
  els.onLossMode.addEventListener('change', () => toggleStrategyPct('loss'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  els.autoInfinity.addEventListener('click', toggleAutoInfinity);
  els.autoAdvancedToggle.addEventListener('click', toggleAutoAdvanced);
  els.autoBets.addEventListener('input', () => {
    if (state.auto.unlimited) setAutoUnlimited(false);
  });
  els.grid.addEventListener('click', handleGridClick);

  document.addEventListener('xython:auth-change', () => {
    updateUI();
    if (state.phase === 'ended') renderBoardFromState();
  });

  toggleStrategyPct('win');
  toggleStrategyPct('loss');
  buildGrid();
  updateBetLabel();
  updateStats();
  updateAutoProgress();
  syncAutoInfinityUI();
  updateUI();
});

function handleGridClick(e) {
  const tile = e.target.closest('[data-index]');
  if (!tile || state.auto.running) return;
  const index = Number(tile.dataset.index);

  if (state.panel === 'auto' && state.phase === 'idle') {
    toggleAutoPick(index);
    return;
  }

  if (state.panel !== 'manual' || state.phase !== 'active') {
    if (state.panel === 'manual' && state.phase === 'idle') {
      setMessage('Place a bet first, then pick tiles on the grid', 'lose');
    }
    return;
  }

  const result = revealTile(index);
  if (!result) return;
  if (result.hitMine) {
    handleManualLoss(result.index);
  } else if (state.gemsFound >= GRID_SIZE - state.mines) {
    handleManualCashout(true);
  }
}

function setPanel(panel) {
  if (state.auto.running || state.phase === 'active' || state.phase === 'ended') return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualPanel.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  syncGridView();
  updateGridHint();
  updateStats();
  updateUI();
}

function getMaxAutoPicks() {
  const mines = parseInt(els.mines.value, 10) || 3;
  return GRID_SIZE - mines;
}

function trimAutoPicksToMax() {
  const max = getMaxAutoPicks();
  while (state.autoPickOrder.length > max) {
    const removed = state.autoPickOrder.pop();
    state.autoPicks.delete(removed);
  }
}

function toggleAutoPick(index) {
  if (state.autoPicks.has(index)) {
    state.autoPicks.delete(index);
    state.autoPickOrder = state.autoPickOrder.filter(i => i !== index);
  } else {
    const max = getMaxAutoPicks();
    if (state.autoPicks.size >= max) {
      setMessage(`Max ${max} tiles with ${els.mines.value} mines`, 'lose');
      return;
    }
    state.autoPicks.add(index);
    state.autoPickOrder.push(index);
  }
  renderAutoPickTile(index);
  updateStats();
  updateGridHint();
  updateUI();
}

function renderAutoPickTile(index) {
  const tile = getTileEl(index);
  if (!tile) return;
  tile.disabled = false;
  tile.className = state.autoPicks.has(index) ? 'mn-tile is-picked' : 'mn-tile is-pickable';
  tile.innerHTML = '';
}

function setupAutoPickGrid() {
  els.grid?.classList.remove('mn-grid--active');
  els.grid?.classList.add('mn-grid--pick');
  for (let i = 0; i < GRID_SIZE; i++) renderAutoPickTile(i);
}

function toggleAutoInfinity() {
  if (state.auto.running) return;
  setAutoUnlimited(!state.auto.unlimited);
}

function setAutoUnlimited(unlimited) {
  state.auto.unlimited = unlimited;
  els.autoInfinity.classList.toggle('active', unlimited);
  els.autoInfinity.setAttribute('aria-pressed', String(unlimited));
  els.autoBets.disabled = unlimited || state.auto.running;
  if (unlimited) {
    els.autoBets.value = '0';
  } else if ((parseInt(els.autoBets.value, 10) || 0) <= 0) {
    els.autoBets.value = '10';
  }
  updateAutoProgress();
}

function toggleAutoAdvanced() {
  if (state.auto.running) return;
  state.auto.advancedOpen = !state.auto.advancedOpen;
  els.autoAdvanced.hidden = !state.auto.advancedOpen;
  els.autoAdvancedToggle.classList.toggle('is-on', state.auto.advancedOpen);
  els.autoAdvancedToggle.setAttribute('aria-checked', String(state.auto.advancedOpen));
}

function syncAutoInfinityUI() {
  els.autoInfinity.classList.toggle('active', state.auto.unlimited);
  els.autoInfinity.setAttribute('aria-pressed', String(state.auto.unlimited));
  els.autoBets.disabled = state.auto.unlimited || state.auto.running;
  els.autoAdvanced.hidden = !state.auto.advancedOpen;
  els.autoAdvancedToggle.classList.toggle('is-on', state.auto.advancedOpen);
  els.autoAdvancedToggle.setAttribute('aria-checked', String(state.auto.advancedOpen));
}

function updateGridHint() {
  if (!els.gridHint) return;

  if (state.panel === 'auto' && state.phase === 'idle' && !state.auto.running) {
    els.gridHint.hidden = true;
    return;
  }

  if (state.panel === 'auto' && state.auto.running) {
    els.gridHint.textContent = 'Autobet running…';
    els.gridHint.hidden = false;
    return;
  }

  if (state.panel === 'manual' && state.phase === 'active') {
    els.gridHint.textContent = 'Pick a tile — find gems, avoid mines';
    els.gridHint.hidden = true;
    return;
  }

  if (state.panel === 'manual') {
    els.gridHint.hidden = true;
  }
}

function syncGridView() {
  if (state.phase === 'active' || state.phase === 'ended' || state.auto.running) return;

  if (state.panel === 'auto') {
    setupAutoPickGrid();
    return;
  }

  els.grid?.classList.remove('mn-grid--pick', 'mn-grid--active');
  buildGrid();
}

function toggleStrategyPct(which) {
  const mode = which === 'win' ? els.onWinMode.value : els.onLossMode.value;
  const wrap = which === 'win' ? els.onWinPctWrap : els.onLossPctWrap;
  wrap.hidden = mode !== 'increase';
}

function buildGrid() {
  els.grid.innerHTML = Array.from({ length: GRID_SIZE }, (_, i) =>
    `<button type="button" class="mn-tile is-idle" data-index="${i}" aria-label="Tile ${i + 1}"></button>`
  ).join('');
}

function getMultiplier(mines, gemsFound) {
  if (gemsFound <= 0) return 1;
  let mult = 1;
  for (let i = 0; i < gemsFound; i++) {
    mult *= (GRID_SIZE - i) / (GRID_SIZE - mines - i);
  }
  return mult * HOUSE_EDGE;
}

function shuffleMines(count) {
  const indices = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, count));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const inRound = state.phase === 'active' || state.phase === 'ended';
  const mines = inRound
    ? state.mines
    : (parseInt(els.mines.value, 10) || 3);

  const gemCount = inRound
    ? state.gemsFound
    : (state.panel === 'auto' ? state.autoPicks.size : 0);

  const mult = getMultiplier(mines, gemCount);
  const bet = inRound ? state.bet : (parseFloat(els.bet.value) || 0);
  const payout = bet * mult;

  els.multiplier.textContent = `${mult.toFixed(4)}x`;
  els.gemsFound.textContent = String(inRound ? state.gemsFound : gemCount);
  els.cashoutValue.textContent = `$${payout.toFixed(2)}`;

  const canCashout = state.phase === 'active' && state.gemsFound > 0;
  if (els.cashoutStat) {
    els.cashoutStat.classList.toggle('is-clickable', canCashout);
    els.cashoutStat.disabled = !canCashout;
  }
}

function updateAutoProgress() {
  const total = state.auto.unlimited ? Infinity : getAutoTotalBets();
  const totalLabel = total === Infinity ? '∞' : String(total);
  els.autoBetCount.textContent = `${state.auto.completed} / ${totalLabel}`;

  const profit = state.auto.sessionProfit;
  els.autoProfit.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
  els.autoProfit.className = 'mn-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'mn-message' + (type ? ` ${type}` : '');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const active = state.phase === 'active';
  const manual = state.panel === 'manual';
  const autoRunning = state.auto.running;
  const autoIdle = state.panel === 'auto' && !active && !autoRunning;

  els.betBtn.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.betBtn.hidden = active || autoIdle;
  els.liveStats.hidden = !manual || (!active && state.phase !== 'ended');
  els.manualPanel.hidden = !manual;
  els.autoPanel.hidden = state.panel !== 'auto';
  els.cashoutBtn.hidden = !manual || !active;
  els.pickRandom.hidden = !manual || !active;

  if (active && state.gemsFound > 0) {
    const payout = state.bet * getMultiplier(state.mines, state.gemsFound);
    els.cashoutBtn.textContent = `Cash Out $${payout.toFixed(2)}`;
    els.cashoutBtn.disabled = false;
  } else {
    els.cashoutBtn.textContent = 'Cash Out';
    els.cashoutBtn.disabled = true;
  }

  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.autoStart.hidden = autoRunning;
  els.autoStop.hidden = !autoRunning;
  els.autoStart.disabled = autoRunning || active || state.autoPicks.size === 0;

  els.betBtn.disabled = autoRunning;
  els.bet.disabled = active || autoRunning;
  els.mines.disabled = active || autoRunning || state.phase === 'ended';
  els.half.disabled = active || autoRunning;
  els.doubleBet.disabled = active || autoRunning;
  els.tabManual.disabled = autoRunning || active || state.phase === 'ended';
  els.tabAuto.disabled = autoRunning || active || state.phase === 'ended';

  els.panelEl?.classList.toggle('is-auto-running', autoRunning);
  els.panelEl?.classList.toggle('mn-panel--manual-idle', manual && !active && !autoRunning);
  els.panelEl?.classList.toggle('mn-panel--auto-idle', state.panel === 'auto' && !active && !autoRunning);

  els.autoProgress.hidden = !autoRunning;

  [
    els.autoBets, els.autoInfinity, els.autoAdvancedToggle,
    els.onWinMode, els.onWinPct,
    els.onLossMode, els.onLossPct, els.stopProfit, els.stopLoss,
  ].forEach(el => {
    if (el) el.disabled = autoRunning;
  });

  if (!autoRunning) syncAutoInfinityUI();

  updateGridHint();
}

function renderBoardFromState() {
  if (state.phase !== 'active' && state.phase !== 'ended') return;

  for (let i = 0; i < GRID_SIZE; i++) {
    if (!state.revealed.has(i)) continue;
    if (state.mineSet.has(i)) {
      renderMineTile(i, i === state.lastHitIndex);
    } else {
      renderGemTile(i);
    }
  }

  if (state.phase === 'ended' || state.phase === 'active') {
    for (let i = 0; i < GRID_SIZE; i++) {
      const tile = getTileEl(i);
      if (tile) tile.disabled = true;
    }
  }
}

function getTileEl(index) {
  return els.grid.querySelector(`[data-index="${index}"]`);
}

function renderGemTile(index) {
  const tile = getTileEl(index);
  if (!tile) return;
  tile.className = 'mn-tile is-gem';
  tile.disabled = true;
  tile.innerHTML = '<span class="mn-tile-icon"><span class="mn-gem"></span></span>';
}

function renderMineTile(index, hit = false) {
  const tile = getTileEl(index);
  if (!tile) return;
  tile.className = `mn-tile ${hit ? 'is-mine' : 'is-mine-other'}`;
  tile.disabled = true;
  tile.innerHTML = '<span class="mn-tile-icon"><span class="mn-mine"></span></span>';
}

function enableUnrevealedTiles() {
  els.grid?.classList.remove('mn-grid--pick');
  els.grid?.classList.add('mn-grid--active');
  els.grid.querySelectorAll('.mn-tile').forEach(tile => {
    const index = Number(tile.dataset.index);
    if (!state.revealed.has(index)) {
      tile.disabled = false;
      tile.className = 'mn-tile';
      tile.innerHTML = '';
    }
  });
}

function getHiddenTiles() {
  const hidden = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (!state.revealed.has(i)) hidden.push(i);
  }
  return hidden;
}

function validateBetAmount(bet) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }
  if (!bet || bet <= 0) return 'Enter a valid bet amount';
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) return 'Insufficient balance — deposit first';
  return null;
}

function initRound(bet, mines, currency) {
  const debitResult = window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Mines',
    detail: `Bet $${bet.toFixed(2)} — ${mines} mines`,
    game: 'mines',
  });
  if (debitResult?.ok === false) return { error: debitResult.error };

  state.phase = 'active';
  state.bet = bet;
  state.currency = currency;
  state.mines = mines;
  state.mineSet = shuffleMines(mines);
  state.revealed = new Set();
  state.gemsFound = 0;
  state.lastHitIndex = null;

  enableUnrevealedTiles();
  updateStats();
  updateUI();
}

function revealTile(index) {
  if (state.phase !== 'active') return null;
  if (state.revealed.has(index)) return null;

  state.revealed.add(index);

  if (state.mineSet.has(index)) {
    return { hitMine: true, index };
  }

  state.gemsFound += 1;
  renderGemTile(index);
  updateStats();
  updateUI();
  return { hitMine: false, index };
}

function revealAllMines(hitIndex) {
  state.mineSet.forEach(index => {
    if (index === hitIndex || !state.revealed.has(index)) {
      renderMineTile(index, index === hitIndex);
      state.revealed.add(index);
    }
  });

  for (let i = 0; i < GRID_SIZE; i++) {
    getTileEl(i).disabled = true;
  }
}

function finalizeLoss(hitIndex, recordStats = true) {
  renderMineTile(hitIndex, true);
  revealAllMines(hitIndex);
  if (recordStats) window.XythonStats?.recordRound?.(state.bet, false, { game: 'mines', payout: 0 });
  return { won: false, netProfit: -state.bet, bet: state.bet };
}

function finalizeCashout(recordStats = true) {
  const mult = getMultiplier(state.mines, state.gemsFound);
  const payout = state.bet * mult;
  const currency = state.currency;
  const netProfit = payout - state.bet;

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
    type: 'win',
    label: 'Mines',
    detail: `${mult.toFixed(2)}x — $${payout.toFixed(2)} (${state.gemsFound} gems)`,
    game: 'mines',
  });

  state.mineSet.forEach(index => {
    if (!state.revealed.has(index)) renderMineTile(index, false);
  });
  for (let i = 0; i < GRID_SIZE; i++) getTileEl(i).disabled = true;

  if (recordStats) window.XythonStats?.recordRound?.(state.bet, true, { game: 'mines', payout });
  return { won: true, netProfit, bet: state.bet, payout, mult };
}

function resetRound() {
  state.phase = 'idle';
  state.bet = 0;
  state.mineSet = new Set();
  state.revealed = new Set();
  state.gemsFound = 0;
  state.lastHitIndex = null;
  els.grid?.classList.remove('mn-grid--ended');
  syncGridView();
  updateStats();
  updateUI();
}

async function startRound() {
  if (state.auto.running || state.panel !== 'manual') return;

  if (state.phase === 'ended') resetRound();

  const bet = parseFloat(els.bet.value);
  const error = validateBetAmount(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const mines = parseInt(els.mines.value, 10) || 3;
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';

  const round = initRound(bet, mines, currency);
  if (round?.error) {
    setMessage(round.error, 'lose');
    return;
  }
  setMessage('Pick tiles on the grid — cash out anytime after a gem', '');
}

function pickRandomTile() {
  if (state.phase !== 'active' || state.auto.running) return;
  const hidden = getHiddenTiles();
  if (!hidden.length) return;
  const result = revealTile(hidden[Math.floor(Math.random() * hidden.length)]);
  if (result?.hitMine) {
    handleManualLoss(result.index);
  } else if (state.gemsFound >= GRID_SIZE - state.mines) {
    handleManualCashout(true);
  }
}

function cashOut(perfectBoard = false) {
  if (state.phase !== 'active' || state.gemsFound === 0 || state.auto.running) return;
  handleManualCashout(perfectBoard);
}

function handleManualLoss(hitIndex) {
  state.phase = 'ended';
  state.lastHitIndex = hitIndex;
  finalizeLoss(hitIndex);
  els.grid?.classList.remove('mn-grid--pick');
  els.grid?.classList.add('mn-grid--active', 'mn-grid--ended');
  renderBoardFromState();
  setMessage(`Mine hit — lost $${state.bet.toFixed(2)}`, 'lose');
  updateUI();
}

function handleManualCashout(perfectBoard) {
  state.phase = 'ended';
  state.lastHitIndex = null;
  const result = finalizeCashout();
  els.grid?.classList.remove('mn-grid--pick');
  els.grid?.classList.add('mn-grid--active', 'mn-grid--ended');
  renderBoardFromState();
  const msg = perfectBoard
    ? `Perfect board — cashed out $${result.payout.toFixed(2)} at ${result.mult.toFixed(2)}x`
    : `Cashed out $${result.payout.toFixed(2)} at ${result.mult.toFixed(2)}x`;
  setMessage(msg, 'win');
  updateUI();
}

function getAutoTotalBets() {
  if (state.auto.unlimited) return Infinity;
  const n = parseInt(els.autoBets.value, 10);
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return n;
}

function applyAutoBetStrategy(won) {
  const base = state.auto.baseBet;
  const current = parseFloat(els.bet.value) || base;
  const modeEl = won ? els.onWinMode : els.onLossMode;
  const pctEl = won ? els.onWinPct : els.onLossPct;

  if (modeEl.value === 'reset') {
    els.bet.value = base.toFixed(2);
  } else {
    const pct = parseFloat(pctEl.value) || 0;
    els.bet.value = Math.max(0.01, current * (1 + pct / 100)).toFixed(2);
  }

  updateBetLabel();
  updateStats();
}

async function playAutoRound(pickOrder) {
  const bet = parseFloat(els.bet.value);
  const error = validateBetAmount(bet);
  if (error) return { error };

  const mines = parseInt(els.mines.value, 10) || 3;
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';

  const round = initRound(bet, mines, currency);
  if (round?.error) return round;
  els.grid?.classList.remove('mn-grid--pick');
  els.grid?.classList.add('mn-grid--active');

  for (let i = 0; i < pickOrder.length; i++) {
    if (!state.auto.running) return { stopped: true };

    const index = pickOrder[i];
    const result = revealTile(index);

    if (result?.hitMine) {
      const loss = finalizeLoss(index);
      state.phase = 'idle';
      return loss;
    }

    if (i < pickOrder.length - 1) await delay(AUTO_REVEAL_MS);
  }

  if (state.gemsFound === 0) {
    state.phase = 'idle';
    return { error: 'No tiles selected' };
  }

  const win = finalizeCashout();
  state.phase = 'idle';
  return win;
}

async function startAuto() {
  if (state.auto.running || state.phase === 'active') return;

  const baseBet = parseFloat(els.bet.value);
  const error = validateBetAmount(baseBet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  if (state.autoPicks.size === 0) {
    setMessage('Pick at least 1 tile on the grid', 'lose');
    return;
  }

  const pickOrder = [...state.autoPickOrder];

  state.auto.running = true;
  state.auto.baseBet = baseBet;
  state.auto.totalBets = getAutoTotalBets();
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;

  updateAutoProgress();
  updateUI();
  setMessage('Autobet started', '');

  await runAutoLoop(pickOrder);
}

async function runAutoLoop(pickOrder) {
  while (state.auto.running) {
    if (state.auto.totalBets !== Infinity && state.auto.completed >= state.auto.totalBets) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const result = await playAutoRound(pickOrder);

    if (result?.stopped) {
      stopAuto(true);
      resetRound();
      return;
    }
    if (result?.error) {
      stopAuto(false, result.error, 'lose');
      resetRound();
      return;
    }

    state.auto.completed += 1;
    state.auto.sessionProfit += result.netProfit;
    applyAutoBetStrategy(result.won);
    updateAutoProgress();

    const stopProfit = parseFloat(els.stopProfit.value) || 0;
    const stopLoss = parseFloat(els.stopLoss.value) || 0;

    if (stopProfit > 0 && state.auto.sessionProfit >= stopProfit) {
      stopAuto(false, `Stopped — profit target $${stopProfit.toFixed(2)} reached`, 'win');
      resetRound();
      return;
    }
    if (stopLoss > 0 && state.auto.sessionProfit <= -stopLoss) {
      stopAuto(false, `Stopped — loss limit $${stopLoss.toFixed(2)} reached`, 'lose');
      resetRound();
      return;
    }

    resetRound();

    if (!state.auto.running) {
      stopAuto(true);
      return;
    }
    if (state.auto.totalBets !== Infinity && state.auto.completed >= state.auto.totalBets) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    await delay(AUTO_ROUND_GAP_MS);
  }
}

function stopAuto(userStopped, message, messageType) {
  if (!state.auto.running && !userStopped) return;

  state.auto.running = false;
  resetRound();
  updateUI();

  if (message) {
    setMessage(message, messageType || '');
    return;
  }

  if (userStopped) {
    const profit = state.auto.sessionProfit;
    setMessage(
      `Autobet stopped — ${state.auto.completed} bets, ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
      profit > 0 ? 'win' : profit < 0 ? 'lose' : ''
    );
  }
}
