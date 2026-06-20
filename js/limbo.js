const HOUSE_EDGE = 0.99;
const MIN_TARGET = 1.01;
const MAX_TARGET = 1000000;
const ROLL_MS = 700;
const ROLL_MS_FAST = 200;
const AUTO_GAP_MS = 350;
const HISTORY_MAX = 20;
const POPUP_MS = 2500;

let popupTimer = null;

const state = {
  panel: 'manual',
  phase: 'idle',
  target: 2,
  result: 1,
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

  els.panelEl = document.querySelector('.lb-panel');
  els.tabManual = document.getElementById('lbTabManual');
  els.tabAuto = document.getElementById('lbTabAuto');
  els.manualActions = document.getElementById('lbManualActions');
  els.autoPanel = document.getElementById('lbAutoPanel');
  els.bet = document.getElementById('lbBet');
  els.betCurrency = document.getElementById('lbBetCurrency');
  els.half = document.getElementById('lbHalf');
  els.doubleBet = document.getElementById('lbDouble');
  els.target = document.getElementById('lbTarget');
  els.winChance = document.getElementById('lbWinChance');
  els.profit = document.getElementById('lbProfit');
  els.betBtn = document.getElementById('lbBetBtn');
  els.message = document.getElementById('lbMessage');
  els.stage = document.getElementById('lbStage');
  els.result = document.getElementById('lbResult');
  els.status = document.getElementById('lbStatus');
  els.targetDisplay = document.getElementById('lbTargetDisplay');
  els.historyList = document.getElementById('lbHistoryList');
  els.autoBets = document.getElementById('lbAutoBets');
  els.autoInfinity = document.getElementById('lbAutoInfinity');
  els.autoProgress = document.getElementById('lbAutoProgress');
  els.autoBetCount = document.getElementById('lbAutoBetCount');
  els.autoProfit = document.getElementById('lbAutoProfit');
  els.autoStart = document.getElementById('lbAutoStart');
  els.autoStop = document.getElementById('lbAutoStop');
  els.resultPopup = document.getElementById('lbResultPopup');
  els.resultCard = document.getElementById('lbResultCard');
  els.resultLabel = document.getElementById('lbResultLabel');
  els.resultMult = document.getElementById('lbResultMult');
  els.resultText = document.getElementById('lbResultText');

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
    clampTargetInput();
    updateStats();
  });
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

  document.querySelectorAll('.lb-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'idle' || state.auto.running) return;
      els.target.value = parseFloat(btn.dataset.target).toFixed(2);
      updateStats();
    });
  });

  document.addEventListener('xython:auth-change', updateUI);

  clampTargetInput();
  updateBetLabel();
  updateStats();
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

function clampTargetInput() {
  let t = parseFloat(els.target.value);
  if (!Number.isFinite(t) || t < MIN_TARGET) t = MIN_TARGET;
  if (t > MAX_TARGET) t = MAX_TARGET;
  state.target = Math.floor(t * 100) / 100;
  els.target.value = state.target.toFixed(2);
}

function getTarget() {
  clampTargetInput();
  return state.target;
}

function getWinChance(target) {
  return Math.min(99, (HOUSE_EDGE / target) * 100);
}

function generateResult() {
  const r = Math.random();
  if (r >= 1) return 1;
  const result = HOUSE_EDGE / (1 - r);
  return Math.max(1, Math.floor(result * 100) / 100);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const target = getTarget();
  const bet = parseFloat(els.bet.value) || 0;
  const chance = getWinChance(target);
  const profit = bet * target - bet;

  els.targetDisplay.textContent = `${target.toFixed(2)}x`;
  els.winChance.textContent = `${chance.toFixed(2)}%`;
  els.profit.textContent = `+$${Math.max(0, profit).toFixed(2)}`;
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'lb-message' + (type ? ` ${type}` : '');
}

function hideResultPopup() {
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
  if (!els.resultPopup) return;
  els.resultPopup.classList.remove('is-visible');
  els.resultPopup.hidden = true;
}

function showResultPopup({ won, result, target, payout }) {
  if (!els.resultPopup) return;

  hideResultPopup();

  const outcome = won ? 'win' : 'lose';
  els.resultLabel.textContent = won ? 'You Win!' : 'You Lose';
  els.resultMult.textContent = `${result.toFixed(2)}x`;
  els.resultText.textContent = won
    ? `+$${payout.toFixed(2)} · target ${target.toFixed(2)}x`
    : `Below ${target.toFixed(2)}x target`;
  els.resultCard.className = `lb-result-popup-card lb-result-popup-card--${outcome}`;

  els.resultPopup.hidden = false;
  requestAnimationFrame(() => els.resultPopup.classList.add('is-visible'));

  popupTimer = setTimeout(() => {
    els.resultPopup.classList.remove('is-visible');
    popupTimer = setTimeout(() => {
      els.resultPopup.hidden = true;
      popupTimer = null;
    }, 250);
  }, POPUP_MS);
}

function validateBet(bet, target) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }
  if (!bet || bet <= 0) return 'Enter a valid bet amount';
  if (!target || target < MIN_TARGET) return `Target must be at least ${MIN_TARGET}x`;
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) return 'Insufficient balance — deposit first';
  return null;
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.pop();
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;

  if (state.history.length === 0) {
    els.historyList.innerHTML = '<p class="lb-history-empty">No bets yet</p>';
    return;
  }

  els.historyList.innerHTML = state.history.map((item, i) => {
    const cls = item.won ? 'win' : 'lose';
    return `<div class="lb-history-item lb-history-item--${cls}${i === 0 ? ' is-new' : ''}">${item.result.toFixed(2)}x</div>`;
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
  els.betBtn.disabled = busy || autoRunning;

  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.autoStart.hidden = autoRunning;
  els.autoStop.hidden = !autoRunning;
  els.autoStart.disabled = busy || autoRunning;

  els.manualActions.hidden = state.panel !== 'manual';
  els.autoPanel.hidden = state.panel !== 'auto';
  els.autoProgress.hidden = !autoRunning;

  const lock = busy || autoRunning;
  els.bet.disabled = lock;
  els.half.disabled = lock;
  els.doubleBet.disabled = lock;
  els.target.disabled = lock;
  els.tabManual.disabled = lock;
  els.tabAuto.disabled = lock;
  document.querySelectorAll('.lb-preset').forEach(btn => { btn.disabled = lock; });

  els.panelEl?.classList.toggle('is-auto-running', autoRunning);

  [els.autoBets, els.autoInfinity].forEach(el => {
    if (el) el.disabled = autoRunning;
  });
  if (!autoRunning) syncAutoInfinityUI();
}

async function animateResult(finalResult, fast = false) {
  const duration = fast ? ROLL_MS_FAST : ROLL_MS;
  const start = performance.now();
  const startVal = 1;

  return new Promise(resolve => {
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startVal + (finalResult - startVal) * eased;
      const display = Math.floor(current * 100) / 100;
      els.result.textContent = `${display.toFixed(2)}x`;
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        els.result.textContent = `${finalResult.toFixed(2)}x`;
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

async function playRound({ fast = false, silent = false } = {}) {
  if (state.phase !== 'idle') return { error: 'Busy' };

  const bet = parseFloat(els.bet.value);
  const target = getTarget();
  const error = validateBet(bet, target);
  if (error) return { error };

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';

  const play = await window.XythonWallet?.playRound?.({
    game: 'limbo',
    bet,
    currency,
    params: { target },
    tx: {
      label: 'Limbo',
      detail: `Bet $${bet.toFixed(2)} @ ${target.toFixed(2)}x`,
      game: 'limbo',
    },
  });
  if (!play?.ok) return { error: play?.error || 'Could not place bet' };

  state.phase = 'rolling';
  hideResultPopup();
  els.stage.classList.remove('is-win', 'is-lose');
  els.stage.classList.add('is-rolling');
  els.result.className = 'lb-result';
  if (!silent) setMessage('Rolling…', '');
  updateUI();

  const finalResult = play.outcome.result;
  const won = play.outcome.won;
  const payout = play.payout;
  const netProfit = won ? payout - bet : -bet;

  await animateResult(finalResult, fast);

  els.stage.classList.remove('is-rolling');
  els.stage.classList.add(won ? 'is-win' : 'is-lose');
  els.result.classList.add(won ? 'lb-result--win' : 'lb-result--lose');

  if (won) {
    els.status.textContent = `Win — ${finalResult.toFixed(2)}x beat ${target.toFixed(2)}x`;
    if (!silent && !fast) setMessage(`Won $${payout.toFixed(2)} at ${target.toFixed(2)}x`, 'win');
  } else {
    els.status.textContent = `Loss — ${finalResult.toFixed(2)}x below ${target.toFixed(2)}x`;
    if (!silent && !fast) setMessage(`Lost — result ${finalResult.toFixed(2)}x`, 'lose');
  }

  window.XythonStats?.recordRound?.(bet, won, { game: 'limbo', payout });
  pushHistory({ result: finalResult, target, won, netProfit });

  state.phase = 'ended';
  updateUI();

  if (!fast && !silent) {
    showResultPopup({ won, result: finalResult, target, payout });
    await delay(POPUP_MS);
  } else if (!fast) {
    await delay(800);
  }

  state.phase = 'idle';
  els.stage.classList.remove('is-win', 'is-lose');
  els.result.classList.remove('lb-result--win', 'lb-result--lose');
  els.result.textContent = '1.00x';
  els.status.textContent = 'Set target and place your bet';
  updateUI();

  return { won, netProfit, bet, result: finalResult, target };
}

async function placeBet() {
  if (state.auto.running || state.panel !== 'manual') return;
  await playRound();
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
  els.autoProfit.className = 'lb-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
}

async function startAuto() {
  if (state.auto.running || state.phase !== 'idle') return;

  const bet = parseFloat(els.bet.value);
  const target = getTarget();
  const error = validateBet(bet, target);
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
  setMessage(`Autobet @ ${target.toFixed(2)}x — ${totalLabel} rounds`, '');

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
      `Round ${state.auto.completed}${total !== Infinity ? ` / ${total}` : ''} — ${result.result.toFixed(2)}x, ${result.netProfit >= 0 ? '+' : ''}$${result.netProfit.toFixed(2)}`,
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
