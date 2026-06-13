const SIDE_LABELS = { heads: 'Takes', tails: 'Krown' };
const SIDE_SHORT = { heads: 'Tk', tails: 'K' };

const PAYOUT_MULT = 2;
const FLIP_MS = 900;
const POPUP_MS = 2200;
const AUTO_GAP_MS = 400;
const HISTORY_MAX = 20;

const state = {
  panel: 'manual',
  side: 'heads',
  flipping: false,
  history: [],
  auto: {
    running: false,
    baseBet: 0,
    totalBets: 10,
    completed: 0,
    sessionProfit: 0,
  },
};

const els = {};
let popupTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initCommon();
  cacheElements();
  bindEvents();

  toggleStrategyPct('win');
  toggleStrategyPct('loss');
  updateBetLabel();
  updateStats();
  updateAutoProgress();
  updateUI();
  renderHistory();
});

function sideLabel(side) {
  return SIDE_LABELS[side] || side;
}

function cacheElements() {
  els.panel = document.querySelector('.cf-panel');
  els.tabManual = document.getElementById('cfTabManual');
  els.tabAuto = document.getElementById('cfTabAuto');
  els.manualActions = document.getElementById('cfManualActions');
  els.autoPanel = document.getElementById('cfAutoPanel');
  els.bet = document.getElementById('cfBet');
  els.betCurrency = document.getElementById('cfBetCurrency');
  els.half = document.getElementById('cfHalf');
  els.doubleBet = document.getElementById('cfDouble');
  els.heads = document.getElementById('cfHeads');
  els.tails = document.getElementById('cfTails');
  els.multiplier = document.getElementById('cfMultiplier');
  els.winChance = document.getElementById('cfWinChance');
  els.profit = document.getElementById('cfProfit');
  els.flipBtn = document.getElementById('cfFlipBtn');
  els.message = document.getElementById('cfMessage');
  els.coin = document.getElementById('cfCoin');
  els.flipStage = document.getElementById('cfFlipStage');
  els.resultLabel = document.getElementById('cfResultLabel');
  els.historyList = document.getElementById('cfHistoryList');
  els.autoBets = document.getElementById('cfAutoBets');
  els.onWinMode = document.getElementById('cfOnWinMode');
  els.onWinPct = document.getElementById('cfOnWinPct');
  els.onWinPctWrap = document.getElementById('cfOnWinPctWrap');
  els.onLossMode = document.getElementById('cfOnLossMode');
  els.onLossPct = document.getElementById('cfOnLossPct');
  els.onLossPctWrap = document.getElementById('cfOnLossPctWrap');
  els.stopProfit = document.getElementById('cfStopProfit');
  els.stopLoss = document.getElementById('cfStopLoss');
  els.autoBetCount = document.getElementById('cfAutoBetCount');
  els.autoProfit = document.getElementById('cfAutoProfit');
  els.autoStart = document.getElementById('cfAutoStart');
  els.autoStop = document.getElementById('cfAutoStop');
  els.resultPopup = document.getElementById('cfResultPopup');
  els.resultCard = document.getElementById('cfResultCard');
  els.popupLabel = document.getElementById('cfPopupLabel');
  els.popupMult = document.getElementById('cfPopupMult');
  els.popupText = document.getElementById('cfPopupText');
}

function bindEvents() {
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
  els.heads.addEventListener('click', () => setSide('heads'));
  els.tails.addEventListener('click', () => setSide('tails'));
  els.flipBtn.addEventListener('click', () => flipCoin());
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.onWinMode.addEventListener('change', () => toggleStrategyPct('win'));
  els.onLossMode.addEventListener('change', () => toggleStrategyPct('loss'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  document.addEventListener('xython:auth-change', updateUI);
}

function setPanel(panel) {
  if (state.auto.running || state.flipping) return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualActions.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  updateUI();
}

function setSide(side) {
  if (state.flipping || state.auto.running) return;
  state.side = side;
  els.heads.classList.toggle('active', side === 'heads');
  els.tails.classList.toggle('active', side === 'tails');
  if (!state.flipping) {
    els.coin.dataset.show = side;
    els.coin.style.transform = side === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)';
  }
}

function toggleStrategyPct(which) {
  const mode = which === 'win' ? els.onWinMode.value : els.onLossMode.value;
  const wrap = which === 'win' ? els.onWinPctWrap : els.onLossPctWrap;
  wrap.hidden = mode !== 'increase';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const bet = parseFloat(els.bet.value) || 0;
  const profit = bet * PAYOUT_MULT - bet;
  els.multiplier.textContent = `${PAYOUT_MULT}x`;
  els.winChance.textContent = '50.00%';
  els.profit.textContent = `+$${Math.max(0, profit).toFixed(2)}`;
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'cf-message' + (type ? ` ${type}` : '');
}

function updateAutoProgress() {
  const total = state.auto.totalBets;
  const totalLabel = total === Infinity ? '∞' : String(total);
  els.autoBetCount.textContent = `${state.auto.completed} / ${totalLabel}`;
  const profit = state.auto.sessionProfit;
  els.autoProfit.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
  els.autoProfit.className = 'cf-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
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

function flipResult() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

function hidePopup() {
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
  els.resultPopup?.classList.remove('is-visible');
  if (els.resultPopup) els.resultPopup.hidden = true;
}

function showPopup({ won, mult, payout }) {
  hidePopup();
  els.popupLabel.textContent = won ? 'You Win!' : 'You Lose';
  els.popupMult.textContent = `${mult.toFixed(2)}x`;
  els.popupText.textContent = won ? `+$${payout.toFixed(2)}` : 'Better luck next flip';
  els.resultCard.className = `cf-result-popup-card cf-result-popup-card--${won ? 'win' : 'lose'}`;
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

async function animateCoin(result, { fast = false } = {}) {
  const spins = 4 + Math.floor(Math.random() * 3);
  const endDeg = result === 'heads' ? 0 : 180;
  const totalDeg = spins * 360 + endDeg;
  els.coin.style.setProperty('--cf-flip-deg', `${totalDeg}deg`);
  els.coin.classList.remove('is-flipping');
  void els.coin.offsetWidth;
  els.coin.classList.add('is-flipping');
  els.coin.dataset.show = result;
  await delay(fast ? 350 : FLIP_MS);
  els.coin.classList.remove('is-flipping');
  els.coin.style.transform = result === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)';
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_MAX) state.history.pop();
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;
  if (!state.history.length) {
    els.historyList.innerHTML = '<p class="cf-history-empty">No flips yet</p>';
    return;
  }
  els.historyList.innerHTML = state.history.map((item, i) => {
    const cls = item.won ? 'win' : 'lose';
    const label = SIDE_SHORT[item.result] || '?';
    return `<div class="cf-history-item cf-history-item--${cls}${i === 0 ? ' is-new' : ''}">${label}</div>`;
  }).join('');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const busy = state.flipping || state.auto.running;

  els.flipBtn.textContent = loggedIn ? 'Flip Coin' : 'Register to Bet';
  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.flipBtn.disabled = busy;
  els.autoStart.disabled = busy;
  els.autoStop.hidden = !state.auto.running;
  els.autoStart.hidden = state.auto.running;

  els.bet.disabled = busy;
  els.half.disabled = busy;
  els.doubleBet.disabled = busy;
  els.heads.disabled = busy;
  els.tails.disabled = busy;
  els.tabManual.disabled = busy;
  els.tabAuto.disabled = busy;

  [els.autoBets, els.onWinMode, els.onLossMode, els.onWinPct, els.onLossPct, els.stopProfit, els.stopLoss].forEach(el => {
    if (el) el.disabled = state.auto.running;
  });
}

async function flipCoin({ silent = false, fast = false } = {}) {
  if (state.flipping) return { error: 'Flip in progress' };

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) {
    if (!silent) setMessage(error, 'lose');
    return { error };
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const pick = state.side;
  const result = flipResult();
  const won = result === pick;
  const payout = won ? bet * PAYOUT_MULT : 0;
  const netProfit = payout - bet;

  state.flipping = true;
  updateUI();
  hidePopup();

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Coinflip',
    detail: `$${bet.toFixed(2)} on ${sideLabel(pick)}`,
    game: 'coinflip',
  });

  if (!silent) {
    setMessage('');
    els.resultLabel.textContent = 'Flipping…';
  }

  els.flipStage.classList.remove('is-win', 'is-lose');
  await animateCoin(result, { fast });

  if (won) {
    window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
      type: 'win',
      label: 'Coinflip',
      detail: `${sideLabel(result)} — $${payout.toFixed(2)}`,
      game: 'coinflip',
    });
  }

  window.XythonStats?.recordRound?.(bet, won, { game: 'coinflip', payout });
  pushHistory({ result, won, pick });

  els.flipStage.classList.add(won ? 'is-win' : 'is-lose');
  const resultName = sideLabel(result);

  if (!silent) {
    els.resultLabel.textContent = `${resultName} — ${won ? 'You win!' : 'You lose'}`;
    setMessage(won ? `Won $${payout.toFixed(2)}` : `Lost on ${resultName}`, won ? 'win' : 'lose');
    showPopup({ won, mult: won ? PAYOUT_MULT : 0, payout: won ? payout : 0 });
    await delay(POPUP_MS);
  }

  state.flipping = false;
  updateUI();

  return { won, netProfit, result, payout, mult: won ? PAYOUT_MULT : 0 };
}

function getAutoTotalBets() {
  const n = parseInt(els.autoBets.value, 10);
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return n;
}

function getStop(v) {
  const n = parseFloat(v?.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function applyBetStrategy(won) {
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

async function startAuto() {
  if (state.auto.running || state.flipping) return;

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  state.auto.running = true;
  state.auto.baseBet = bet;
  state.auto.totalBets = getAutoTotalBets();
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;
  updateAutoProgress();
  updateUI();

  await runAutoLoop();
}

async function runAutoLoop() {
  while (state.auto.running) {
    const total = state.auto.totalBets;
    if (total !== Infinity && state.auto.completed >= total) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const stopProfit = getStop(els.stopProfit);
    const stopLoss = getStop(els.stopLoss);
    if (stopProfit > 0 && state.auto.sessionProfit >= stopProfit) {
      stopAuto(false, `Stop profit reached — +$${state.auto.sessionProfit.toFixed(2)}`, 'win');
      return;
    }
    if (stopLoss > 0 && state.auto.sessionProfit <= -stopLoss) {
      stopAuto(false, `Stop loss reached — $${state.auto.sessionProfit.toFixed(2)}`, 'lose');
      return;
    }

    const result = await flipCoin({ silent: true, fast: true });
    if (result?.error) {
      stopAuto(false, result.error, 'lose');
      return;
    }

    state.auto.completed += 1;
    state.auto.sessionProfit += result.netProfit ?? 0;
    applyBetStrategy(result.won);
    updateAutoProgress();

    setMessage(
      `Round ${state.auto.completed} — ${result.won ? 'Win' : 'Loss'} (${sideLabel(result.result)})`,
      result.won ? 'win' : 'lose'
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
  updateUI();

  if (message) {
    setMessage(message, messageType || '');
    return;
  }
  if (userStopped) {
    const p = state.auto.sessionProfit;
    setMessage(`Autobet stopped — ${state.auto.completed} bets, ${p >= 0 ? '+' : ''}$${p.toFixed(2)}`, p > 0 ? 'win' : p < 0 ? 'lose' : '');
  }
}
