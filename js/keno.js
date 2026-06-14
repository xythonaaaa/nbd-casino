const TOTAL_NUMBERS = 40;
const DRAW_COUNT = 10;
const MAX_PICKS = 10;
const HOUSE_EDGE = 0.94;
const DRAW_DELAY_MS = 90;
const DRAW_DELAY_FAST_MS = 25;
const RESET_MS = 2200;
const RESET_FAST_MS = 350;
const AUTO_GAP_MS = 300;
const HISTORY_MAX = 20;

const BASE_PAYTABLE = {
  1: [0, 3.8],
  2: [0, 0, 13],
  3: [0, 0, 2.2, 53],
  4: [0, 0, 1, 8, 115],
  5: [0, 0, 0.5, 3, 18, 230],
  6: [0, 0, 0.5, 2, 7, 60, 580],
  7: [0, 0, 0.5, 1, 4, 20, 150, 800],
  8: [0, 0, 0.5, 1, 2, 8, 40, 250, 1200],
  9: [0, 0, 0.5, 1, 2, 4, 15, 80, 400, 2000],
  10: [0, 0, 1, 2, 3, 6, 25, 100, 500, 2000, 5000],
};

const state = {
  panel: 'manual',
  phase: 'idle',
  picks: new Set(),
  drawn: new Set(),
  hits: 0,
  bet: 0,
  currency: 'USD',
  history: [],
  auto: {
    running: false,
    unlimited: false,
    completed: 0,
    sessionProfit: 0,
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.panelEl = document.querySelector('.kn-panel');
  els.tabManual = document.getElementById('knTabManual');
  els.tabAuto = document.getElementById('knTabAuto');
  els.manualActions = document.getElementById('knManualActions');
  els.autoPanel = document.getElementById('knAutoPanel');
  els.bet = document.getElementById('knBet');
  els.betCurrency = document.getElementById('knBetCurrency');
  els.half = document.getElementById('knHalf');
  els.doubleBet = document.getElementById('knDouble');
  els.spotCount = document.getElementById('knSpotCount');
  els.hitsEl = document.getElementById('knHits');
  els.payout = document.getElementById('knPayout');
  els.paytableRows = document.getElementById('knPaytableRows');
  els.clearBtn = document.getElementById('knClear');
  els.quickPick = document.getElementById('knQuickPick');
  els.betBtn = document.getElementById('knBetBtn');
  els.message = document.getElementById('knMessage');
  els.grid = document.getElementById('knGrid');
  els.hint = document.getElementById('knHint');
  els.autoBets = document.getElementById('knAutoBets');
  els.autoInfinity = document.getElementById('knAutoInfinity');
  els.autoProgress = document.getElementById('knAutoProgress');
  els.autoBetCount = document.getElementById('knAutoBetCount');
  els.autoProfit = document.getElementById('knAutoProfit');
  els.autoStart = document.getElementById('knAutoStart');
  els.autoStop = document.getElementById('knAutoStop');
  els.historyList = document.getElementById('knHistoryList');

  els.half.addEventListener('click', () => {
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
  });
  els.doubleBet.addEventListener('click', () => {
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
  });
  els.bet.addEventListener('input', updateBetLabel);
  els.clearBtn.addEventListener('click', clearPicks);
  els.quickPick.addEventListener('click', quickPick);
  els.betBtn.addEventListener('click', () => placeBet());
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  els.autoInfinity.addEventListener('click', toggleAutoInfinity);
  els.autoBets.addEventListener('input', () => {
    if (state.auto.unlimited) setAutoUnlimited(false);
    updateAutoProgress();
  });
  els.grid.addEventListener('click', handleGridClick);

  document.addEventListener('xython:auth-change', updateUI);

  buildGrid();
  updateBetLabel();
  updateSidebar();
  syncAutoInfinityUI();
  updateAutoProgress();
  updateUI();
});

function setPanel(panel) {
  if (state.auto.running || state.phase !== 'idle') return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualActions.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  updateUI();
}

function getPaytable(picks) {
  const table = BASE_PAYTABLE[picks];
  if (!table) return [];
  return table.map(m => Math.floor(m * HOUSE_EDGE * 100) / 100);
}

function getMultiplier(picks, hits) {
  const table = getPaytable(picks);
  return table[hits] ?? 0;
}

function buildGrid() {
  els.grid.innerHTML = Array.from({ length: TOTAL_NUMBERS }, (_, i) => {
    const num = i + 1;
    return `<button type="button" class="kn-cell" data-num="${num}" aria-label="Number ${num}">${num}</button>`;
  }).join('');
}

function getCell(num) {
  return els.grid.querySelector(`[data-num="${num}"]`);
}

function handleGridClick(e) {
  const cell = e.target.closest('[data-num]');
  if (!cell || state.phase !== 'idle' || state.auto.running) return;

  const num = Number(cell.dataset.num);
  if (state.picks.has(num)) {
    state.picks.delete(num);
  } else {
    if (state.picks.size >= MAX_PICKS) {
      setMessage(`Max ${MAX_PICKS} spots`, 'lose');
      return;
    }
    state.picks.add(num);
  }

  renderGrid();
  updateSidebar();
  updateUI();
  setMessage('');
}

function clearPicks() {
  if (state.phase !== 'idle' || state.auto.running) return;
  state.picks.clear();
  renderGrid();
  updateSidebar();
  updateUI();
  setMessage('');
}

function quickPick() {
  if (state.phase !== 'idle' || state.auto.running) return;
  state.picks.clear();
  const pool = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.slice(0, MAX_PICKS).forEach(n => state.picks.add(n));
  renderGrid();
  updateSidebar();
  updateUI();
  setMessage('');
}

function renderGrid() {
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    const cell = getCell(n);
    if (!cell) continue;
    cell.className = 'kn-cell';
    cell.disabled = state.phase !== 'idle';

    if (state.picks.has(n)) cell.classList.add('is-picked');
    if (state.drawn.has(n)) {
      cell.classList.add('is-drawn');
      if (state.picks.has(n)) cell.classList.add('is-hit');
    }
  }
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateSidebar() {
  const count = state.picks.size;
  els.spotCount.textContent = `${count} / ${MAX_PICKS}`;

  if (state.phase === 'idle') {
    els.hitsEl.textContent = '—';
    els.payout.textContent = '—';
    renderPaytable(count);
    return;
  }

  els.hitsEl.textContent = String(state.hits);
  const mult = getMultiplier(count, state.hits);
  if (mult > 0) {
    els.payout.textContent = `${mult.toFixed(2)}x ($${(state.bet * mult).toFixed(2)})`;
  } else {
    els.payout.textContent = '0x';
  }
  renderPaytable(count, state.hits);
}

function renderPaytable(picks, highlightHits = -1) {
  if (picks < 1) {
    els.paytableRows.innerHTML = '<p class="kn-paytable-empty">Pick numbers to see payouts</p>';
    return;
  }

  const table = getPaytable(picks);
  els.paytableRows.innerHTML = table.map((mult, hits) => {
    if (mult <= 0) return '';
    const active = hits === highlightHits ? ' is-active' : '';
    return `<div class="kn-paytable-row${active}"><span>${hits} hit${hits !== 1 ? 's' : ''}</span><span>${mult.toFixed(2)}x</span></div>`;
  }).filter(Boolean).join('') || '<p class="kn-paytable-empty">No payout tiers</p>';
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'kn-message' + (type ? ` ${type}` : '');
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.pop();
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;

  if (state.history.length === 0) {
    els.historyList.innerHTML = '<p class="kn-history-empty">No bets yet</p>';
    return;
  }

  els.historyList.innerHTML = state.history.map((item, i) => {
    const cls = item.won ? 'win' : 'lose';
    const main = item.mult > 0
      ? `${item.hits}/${item.spots} · ${item.mult.toFixed(2)}x`
      : `${item.hits}/${item.spots} hits`;
    const sub = `${item.netProfit >= 0 ? '+' : ''}$${item.netProfit.toFixed(2)}`;
    return `<div class="kn-history-item kn-history-item--${cls}${i === 0 ? ' is-new' : ''}">
      <span class="kn-history-main">${main}</span>
      <span class="kn-history-sub">${sub}</span>
    </div>`;
  }).join('');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const idle = state.phase === 'idle';
  const busy = !idle;
  const autoRunning = state.auto.running;
  const autoIdle = state.panel === 'auto' && idle && !autoRunning;

  els.betBtn.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.betBtn.hidden = autoIdle || autoRunning;
  els.betBtn.disabled = !idle || state.picks.size < 1 || autoRunning;

  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.autoStart.hidden = autoRunning;
  els.autoStop.hidden = !autoRunning;
  els.autoStart.disabled = autoRunning || busy || state.picks.size < 1;

  els.manualActions.hidden = state.panel !== 'manual';
  els.autoPanel.hidden = state.panel !== 'auto';
  els.autoProgress.hidden = !autoRunning;

  els.clearBtn.disabled = !idle || state.picks.size === 0 || autoRunning;
  els.quickPick.disabled = !idle || autoRunning;
  els.bet.disabled = !idle || autoRunning;
  els.half.disabled = !idle || autoRunning;
  els.doubleBet.disabled = !idle || autoRunning;
  els.tabManual.disabled = busy || autoRunning;
  els.tabAuto.disabled = busy || autoRunning;

  els.panelEl?.classList.toggle('is-auto-running', autoRunning);
  els.hint.hidden = !idle || autoRunning;

  [els.autoBets, els.autoInfinity].forEach(el => {
    if (el) el.disabled = autoRunning;
  });
  if (!autoRunning) syncAutoInfinityUI();
}

function validateBetAmount(bet) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }
  if (!bet || bet <= 0) return 'Enter a valid bet amount';
  if (state.picks.size < 1) return 'Pick at least 1 number';
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) return 'Insufficient balance — deposit first';
  return null;
}

function drawNumbers() {
  const pool = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DRAW_COUNT);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    els.autoBets.value = '100';
  }
  updateAutoProgress();
}

function syncAutoInfinityUI() {
  els.autoInfinity.classList.toggle('active', state.auto.unlimited);
  els.autoInfinity.setAttribute('aria-pressed', String(state.auto.unlimited));
  els.autoBets.disabled = state.auto.unlimited || state.auto.running;
}

function getAutoTotalBets() {
  if (state.auto.unlimited) return Infinity;
  const n = parseInt(els.autoBets.value, 10);
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return n;
}

function updateAutoProgress() {
  const total = state.auto.unlimited ? Infinity : getAutoTotalBets();
  const totalLabel = total === Infinity ? '∞' : String(total);
  els.autoBetCount.textContent = `${state.auto.completed} / ${totalLabel}`;

  const profit = state.auto.sessionProfit;
  els.autoProfit.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
  els.autoProfit.className = 'kn-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
}

async function playRound({ fast = false, silent = false } = {}) {
  if (state.phase !== 'idle') return { error: 'Busy' };

  const bet = parseFloat(els.bet.value);
  const error = validateBetAmount(bet);
  if (error) return { error };

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const picks = new Set(state.picks);
  const drawDelay = fast ? DRAW_DELAY_FAST_MS : DRAW_DELAY_MS;
  const resetDelay = fast ? RESET_FAST_MS : RESET_MS;

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Keno',
    detail: `Bet $${bet.toFixed(2)} — ${picks.size} spots`,
    game: 'keno',
  });

  state.phase = 'drawing';
  state.bet = bet;
  state.currency = currency;
  state.drawn = new Set();
  state.hits = 0;

  if (!silent) setMessage('Drawing…', '');
  updateUI();
  renderGrid();

  const drawOrder = drawNumbers();

  for (let i = 0; i < drawOrder.length; i++) {
    const num = drawOrder[i];
    state.drawn.add(num);
    if (picks.has(num)) state.hits += 1;
    renderGrid();
    updateSidebar();
    if (i < drawOrder.length - 1) await delay(drawDelay);
  }

  const mult = getMultiplier(picks.size, state.hits);
  const payout = bet * mult;
  const won = mult > 0;
  const netProfit = won ? payout - bet : -bet;
  const hits = state.hits;

  if (won) {
    window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
      type: 'win',
      label: 'Keno',
      detail: `${state.hits} hits — ${mult.toFixed(2)}x ($${payout.toFixed(2)})`,
      game: 'keno',
    });
  }

  window.XythonStats?.recordRound?.(bet, won, { game: 'keno', payout });

  pushHistory({
    bet,
    hits,
    spots: picks.size,
    mult,
    netProfit,
    won,
  });

  if (!silent && !fast) {
    if (won) {
      setMessage(`Won $${payout.toFixed(2)} — ${hits} hits at ${mult.toFixed(2)}x`, 'win');
    } else {
      setMessage(`${hits} hits — no payout`, 'lose');
    }
  }

  state.phase = 'ended';
  updateUI();
  await delay(resetDelay);
  resetRound();

  return { won, netProfit, bet, hits, mult };
}

async function placeBet() {
  if (state.auto.running || state.panel !== 'manual') return;
  await playRound();
}

async function startAuto() {
  if (state.auto.running || state.phase !== 'idle') return;

  const bet = parseFloat(els.bet.value);
  const error = validateBetAmount(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const total = getAutoTotalBets();
  state.auto.running = true;
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;

  updateAutoProgress();
  updateUI();

  const totalLabel = total === Infinity ? '∞' : String(total);
  setMessage(`Autobet started — ${totalLabel} rounds`, '');

  await runAutoLoop();
}

async function runAutoLoop() {
  const total = getAutoTotalBets();

  while (state.auto.running) {
    if (total !== Infinity && state.auto.completed >= total) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const result = await playRound({ fast: true, silent: true });

    if (result?.error) {
      stopAuto(false, result.error, 'lose');
      return;
    }

    state.auto.completed += 1;
    state.auto.sessionProfit += result.netProfit;
    updateAutoProgress();

    setMessage(
      `Round ${state.auto.completed}${total !== Infinity ? ` / ${total}` : ''} — ${result.hits} hits, ${result.netProfit >= 0 ? '+' : ''}$${result.netProfit.toFixed(2)}`,
      result.netProfit > 0 ? 'win' : result.netProfit < 0 ? 'lose' : ''
    );

    if (!state.auto.running) {
      stopAuto(true);
      return;
    }

    if (total !== Infinity && state.auto.completed >= total) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`, state.auto.sessionProfit > 0 ? 'win' : state.auto.sessionProfit < 0 ? 'lose' : '');
      return;
    }

    await delay(AUTO_GAP_MS);
  }
}

function stopAuto(userStopped, message, messageType) {
  if (!state.auto.running && !userStopped) return;

  state.auto.running = false;
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

function resetRound() {
  state.phase = 'idle';
  state.drawn = new Set();
  state.hits = 0;
  state.bet = 0;
  renderGrid();
  updateSidebar();
  updateUI();
  if (!state.auto.running) setMessage('');
}
