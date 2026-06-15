const HOUSE_EDGE = 0.99;
const HISTORY_MAX = 20;
const ROLL_MS = 600;
const ROLL_MS_FAST = 180;
const AUTO_GAP_MS = 100;

const state = {
  panel: 'manual',
  mode: 'under',
  target: 50,
  rolling: false,
  history: [],
  auto: {
    running: false,
    baseBet: 0,
    totalBets: 0,
    completed: 0,
    sessionProfit: 0,
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.panel = document.querySelector('.dc-panel');
  els.tabManual = document.getElementById('dcTabManual');
  els.tabAuto = document.getElementById('dcTabAuto');
  els.manualActions = document.getElementById('dcManualActions');
  els.autoPanel = document.getElementById('dcAutoPanel');
  els.bet = document.getElementById('dcBet');
  els.betCurrency = document.getElementById('dcBetCurrency');
  els.half = document.getElementById('dcHalf');
  els.doubleBet = document.getElementById('dcDouble');
  els.modeUnder = document.getElementById('dcModeUnder');
  els.modeOver = document.getElementById('dcModeOver');
  els.target = document.getElementById('dcTarget');
  els.targetValue = document.getElementById('dcTargetValue');
  els.multiplier = document.getElementById('dcMultiplier');
  els.winChance = document.getElementById('dcWinChance');
  els.profit = document.getElementById('dcProfit');
  els.placeBet = document.getElementById('dcPlaceBet');
  els.message = document.getElementById('dcMessage');
  els.die = document.getElementById('dcDie');
  els.rollDisplay = document.getElementById('dcRollDisplay');
  els.rollLabel = document.getElementById('dcRollLabel');
  els.trackWin = document.getElementById('dcTrackWin');
  els.trackMarker = document.getElementById('dcTrackMarker');
  els.trackTarget = document.getElementById('dcTrackTarget');
  els.trackResult = document.getElementById('dcTrackResult');
  els.historyList = document.getElementById('dcHistoryList');
  els.autoBets = document.getElementById('dcAutoBets');
  els.onWinMode = document.getElementById('dcOnWinMode');
  els.onWinPct = document.getElementById('dcOnWinPct');
  els.onWinPctWrap = document.getElementById('dcOnWinPctWrap');
  els.onLossMode = document.getElementById('dcOnLossMode');
  els.onLossPct = document.getElementById('dcOnLossPct');
  els.onLossPctWrap = document.getElementById('dcOnLossPctWrap');
  els.stopProfit = document.getElementById('dcStopProfit');
  els.stopLoss = document.getElementById('dcStopLoss');
  els.autoBetCount = document.getElementById('dcAutoBetCount');
  els.autoProfit = document.getElementById('dcAutoProfit');
  els.autoStart = document.getElementById('dcAutoStart');
  els.autoStop = document.getElementById('dcAutoStop');

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
  els.target.addEventListener('input', () => {
    state.target = parseFloat(els.target.value);
    updateStats();
    updateTrack();
  });
  els.modeUnder.addEventListener('click', () => setMode('under'));
  els.modeOver.addEventListener('click', () => setMode('over'));
  els.placeBet.addEventListener('click', () => placeBet());
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.onWinMode.addEventListener('change', () => toggleStrategyPct('win'));
  els.onLossMode.addEventListener('change', () => toggleStrategyPct('loss'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));

  document.addEventListener('xython:auth-change', updateUI);

  state.target = parseFloat(els.target.value);
  toggleStrategyPct('win');
  toggleStrategyPct('loss');
  updateBetLabel();
  updateStats();
  updateTrack();
  updateAutoProgress();
  updateUI();
});

function setPanel(panel) {
  if (state.auto.running) return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualActions.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  updateUI();
}

function toggleStrategyPct(which) {
  const mode = which === 'win' ? els.onWinMode.value : els.onLossMode.value;
  const wrap = which === 'win' ? els.onWinPctWrap : els.onLossPctWrap;
  wrap.hidden = mode !== 'increase';
}

function setMode(mode) {
  if (state.auto.running) return;
  state.mode = mode;
  els.modeUnder.classList.toggle('active', mode === 'under');
  els.modeOver.classList.toggle('active', mode === 'over');
  updateStats();
  updateTrack();
}

function getWinChance(mode, target) {
  const t = parseFloat(target);
  if (mode === 'under') return t;
  return 100 - t;
}

function getMultiplier(mode, target) {
  const chance = getWinChance(mode, target);
  if (chance <= 0.01 || chance >= 99.99) return 0;
  return (HOUSE_EDGE * 100) / chance;
}

function rollValue() {
  return Math.floor(Math.random() * 10000) / 100;
}

function isWin(roll, mode, target) {
  if (mode === 'under') return roll < target;
  return roll > target;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const chance = getWinChance(state.mode, state.target);
  const mult = getMultiplier(state.mode, state.target);
  const bet = parseFloat(els.bet.value) || 0;
  const profit = bet * mult - bet;

  els.targetValue.textContent = state.target.toFixed(2);
  els.trackTarget.textContent = state.target.toFixed(2);
  els.multiplier.textContent = `${mult.toFixed(4)}x`;
  els.winChance.textContent = `${chance.toFixed(2)}%`;
  els.profit.textContent = `+$${Math.max(0, profit).toFixed(2)}`;
}

function updateTrack() {
  const targetPct = state.target;
  els.trackMarker.style.left = `${targetPct}%`;

  if (state.mode === 'under') {
    els.trackWin.style.left = '0';
    els.trackWin.style.width = `${targetPct}%`;
  } else {
    els.trackWin.style.left = `${targetPct}%`;
    els.trackWin.style.width = `${100 - targetPct}%`;
  }
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'dc-message' + (type ? ` ${type}` : '');
}

function updateAutoProgress() {
  const total = state.auto.totalBets;
  const totalLabel = total === Infinity ? '∞' : String(total);
  els.autoBetCount.textContent = `${state.auto.completed} / ${totalLabel}`;

  const profit = state.auto.sessionProfit;
  els.autoProfit.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
  els.autoProfit.className = 'dc-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const busy = state.rolling || state.auto.running;
  const inputsLocked = busy;

  els.placeBet.textContent = loggedIn ? 'Roll Dice' : 'Register to Bet';
  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';

  els.placeBet.disabled = inputsLocked;
  els.autoStart.disabled = inputsLocked;
  els.autoStart.hidden = state.auto.running;
  els.autoStop.hidden = !state.auto.running;

  els.target.disabled = inputsLocked;
  els.modeUnder.disabled = inputsLocked;
  els.modeOver.disabled = inputsLocked;
  els.half.disabled = inputsLocked;
  els.doubleBet.disabled = inputsLocked;
  els.bet.disabled = state.auto.running;
  els.tabManual.disabled = state.auto.running;
  els.tabAuto.disabled = state.auto.running;

  els.panel?.classList.toggle('is-auto-running', state.auto.running);

  const autoInputs = [
    els.autoBets, els.onWinMode, els.onWinPct, els.onLossMode,
    els.onLossPct, els.stopProfit, els.stopLoss,
  ];
  autoInputs.forEach(el => {
    if (el) el.disabled = state.auto.running;
  });
}

function addHistory(roll, won) {
  state.history.unshift({ roll, won });
  if (state.history.length > HISTORY_MAX) state.history.pop();

  els.historyList.innerHTML = state.history.map((item, i) =>
    `<div class="dc-history-item dc-history-item--${item.won ? 'win' : 'lose'}${i === 0 ? ' is-new' : ''}">${item.roll.toFixed(2)}</div>`
  ).join('');
}

function animateRoll(finalRoll, won, options = {}) {
  const duration = options.fast ? ROLL_MS_FAST : ROLL_MS;

  return new Promise(resolve => {
    state.rolling = true;
    els.die.classList.add('is-rolling');
    els.rollDisplay.className = 'dc-roll-display';
    els.rollLabel.textContent = options.fast ? 'Auto rolling…' : 'Rolling…';
    els.trackResult.hidden = true;
    updateUI();

    const start = performance.now();
    const tick = now => {
      if (now - start < duration) {
        els.rollDisplay.textContent = rollValue().toFixed(2);
        requestAnimationFrame(tick);
        return;
      }

      els.die.classList.remove('is-rolling');
      els.rollDisplay.textContent = finalRoll.toFixed(2);
      els.rollDisplay.classList.add(won ? 'is-win' : 'is-lose');
      els.rollLabel.textContent = won ? 'You win!' : 'You lose';

      els.trackResult.hidden = false;
      els.trackResult.className = `dc-track-result ${won ? 'is-win' : 'is-lose'}`;
      els.trackResult.style.left = `${finalRoll}%`;

      state.rolling = false;
      updateUI();
      resolve();
    };

    requestAnimationFrame(tick);
  });
}

function validateBet(bet) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }

  if (!bet || bet <= 0) return 'Enter a valid bet amount';

  const mult = getMultiplier(state.mode, state.target);
  if (mult <= 0) return 'Adjust target — win chance too extreme';

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) return 'Insufficient balance — deposit first';

  return null;
}

async function executeRoll(options = {}) {
  if (state.rolling) return { error: 'busy' };

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) return { error };

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const mult = getMultiplier(state.mode, state.target);
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;

  const debitResult = window.XythonWallet?.setBalance(currency, balance - bet, {
    type: 'bet',
    label: 'Dice',
    detail: `Bet $${bet.toFixed(2)}`,
    game: 'dice',
  });
  if (debitResult?.ok === false) return { error: debitResult.error };

  const roll = rollValue();
  const won = isWin(roll, state.mode, state.target);
  const payout = won ? bet * mult : 0;
  const netProfit = payout - bet;

  await animateRoll(roll, won, options);

  if (won) {
    const newBalance = window.XythonWallet?.getBalance(currency) ?? 0;
    window.XythonWallet?.setBalance(currency, newBalance + payout, {
      type: 'win',
      label: 'Dice',
      detail: `${mult.toFixed(2)}x — $${payout.toFixed(2)}`,
      game: 'dice',
    });
  }

  window.XythonStats?.recordRound?.(bet, won, { game: 'dice', payout });
  addHistory(roll, won);

  return { roll, won, bet, payout, netProfit, mult };
}

async function placeBet() {
  if (state.auto.running) return;

  const result = await executeRoll({ fast: false });
  if (result?.error) {
    setMessage(result.error, 'lose');
    return;
  }

  if (result.won) {
    setMessage(`Won $${result.payout.toFixed(2)} at ${result.mult.toFixed(2)}x`, 'win');
  } else {
    setMessage(`Lost $${result.bet.toFixed(2)} — rolled ${result.roll.toFixed(2)}`, 'lose');
  }
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

function getAutoTotalBets() {
  const n = parseInt(els.autoBets.value, 10);
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return n;
}

async function startAuto() {
  if (state.auto.running || state.rolling) return;

  const baseBet = parseFloat(els.bet.value);
  const error = validateBet(baseBet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  state.auto.running = true;
  state.auto.baseBet = baseBet;
  state.auto.totalBets = getAutoTotalBets();
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;

  updateAutoProgress();
  updateUI();
  setMessage('Autobet started', '');

  await runAutoLoop();
}

async function runAutoLoop() {
  while (state.auto.running) {
    if (state.auto.totalBets !== Infinity && state.auto.completed >= state.auto.totalBets) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const result = await executeRoll({ fast: true });
    if (result?.error) {
      stopAuto(false, result.error, 'lose');
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
      return;
    }
    if (stopLoss > 0 && state.auto.sessionProfit <= -stopLoss) {
      stopAuto(false, `Stopped — loss limit $${stopLoss.toFixed(2)} reached`, 'lose');
      return;
    }

    if (!state.auto.running) {
      stopAuto(true);
      return;
    }
    if (state.auto.totalBets !== Infinity && state.auto.completed >= state.auto.totalBets) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
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
