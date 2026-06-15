const HOUSE_EDGE = 0.99;
const GROWTH_RATE = 0.08;
const HISTORY_MAX = 24;
const COUNTDOWN_MS = 1200;
const RESET_MS = 1800;
const AUTO_GAP_MS = 600;

const state = {
  panel: 'manual',
  phase: 'idle',
  bet: 0,
  currency: 'USD',
  crashPoint: 1,
  multiplier: 1,
  startTime: 0,
  rafId: 0,
  cashedOut: false,
  history: [],
  auto: {
    running: false,
    unlimited: true,
    baseBet: 0,
    totalBets: Infinity,
    completed: 0,
    sessionProfit: 0,
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.panelEl = document.querySelector('.cr-panel');
  els.tabManual = document.getElementById('crTabManual');
  els.tabAuto = document.getElementById('crTabAuto');
  els.manualActions = document.getElementById('crManualActions');
  els.autoPanel = document.getElementById('crAutoPanel');
  els.bet = document.getElementById('crBet');
  els.betCurrency = document.getElementById('crBetCurrency');
  els.half = document.getElementById('crHalf');
  els.doubleBet = document.getElementById('crDouble');
  els.autoCashout = document.getElementById('crAutoCashout');
  els.betBtn = document.getElementById('crBetBtn');
  els.cashoutBtn = document.getElementById('crCashoutBtn');
  els.message = document.getElementById('crMessage');
  els.mult = document.getElementById('crMult');
  els.status = document.getElementById('crStatus');
  els.graph = document.getElementById('crGraph');
  els.rocketWrap = document.getElementById('crRocketWrap');
  els.rocket = document.getElementById('crRocket');
  els.stage = document.querySelector('.cr-stage');
  els.historyList = document.getElementById('crHistoryList');
  els.autoBets = document.getElementById('crAutoBets');
  els.autoInfinity = document.getElementById('crAutoInfinity');
  els.autoProgress = document.getElementById('crAutoProgress');
  els.autoBetCount = document.getElementById('crAutoBetCount');
  els.autoProfit = document.getElementById('crAutoProfit');
  els.autoStart = document.getElementById('crAutoStart');
  els.autoStop = document.getElementById('crAutoStop');

  els.half.addEventListener('click', () => {
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
  });
  els.doubleBet.addEventListener('click', () => {
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
  });
  els.bet.addEventListener('input', updateBetLabel);
  els.betBtn.addEventListener('click', () => startRound());
  els.cashoutBtn.addEventListener('click', () => cashOut(false));
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  els.autoInfinity.addEventListener('click', toggleAutoInfinity);
  els.autoBets.addEventListener('input', () => {
    if (state.auto.unlimited) setAutoUnlimited(false);
  });

  window.addEventListener('resize', resizeGraph);
  document.addEventListener('xython:auth-change', updateUI);

  resizeGraph();
  updateBetLabel();
  syncAutoInfinityUI();
  updateAutoProgress();
  updateUI();
});

function setPanel(panel) {
  if (state.auto.running || state.phase === 'flying' || state.phase === 'countdown') return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualActions.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  updateUI();
}

function generateCrashPoint() {
  if (Math.random() < 0.01) return 1;
  const r = Math.random();
  const point = HOUSE_EDGE / (1 - r);
  return Math.max(1, Math.floor(point * 100) / 100);
}

function multAtElapsed(seconds) {
  return Math.floor(Math.exp(GROWTH_RATE * seconds) * 100) / 100;
}

function elapsedAtMult(mult) {
  return Math.log(Math.max(1, mult)) / GROWTH_RATE;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function getAutoCashoutTarget() {
  const v = parseFloat(els.autoCashout.value);
  if (!Number.isFinite(v) || v <= 1) return 0;
  return v;
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

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'cr-message' + (type ? ` ${type}` : '');
}

function resizeGraph() {
  if (!els.graph || !els.stage) return;
  const rect = els.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.graph.width = Math.floor(rect.width * dpr);
  els.graph.height = Math.floor(rect.height * dpr);
  els.graph.style.width = `${rect.width}px`;
  els.graph.style.height = `${rect.height}px`;
  drawGraph(state.multiplier, state.phase === 'flying');
  updateRocketPosition(state.multiplier, state.phase === 'flying');
}

function getGraphLayout(w, h) {
  const pad = { l: 16, r: 16, b: 28, t: 16 };
  return { pad, plotW: w - pad.l - pad.r, plotH: h - pad.t - pad.b };
}

function getGraphMaxMult(currentMult, flying) {
  return flying ? Math.max(2, currentMult * 1.15) : 2;
}

function getGraphPointAtMult(mult, currentMult, flying, w, h) {
  const { pad, plotW, plotH } = getGraphLayout(w, h);
  const maxMult = getGraphMaxMult(currentMult, flying);
  if (!flying || mult <= 1) {
    return { x: pad.l, y: pad.t + plotH };
  }
  const maxT = elapsedAtMult(maxMult);
  const t = elapsedAtMult(Math.min(mult, maxMult));
  const x = pad.l + (t / maxT) * plotW;
  const y = pad.t + plotH - ((Math.min(mult, maxMult) - 1) / (maxMult - 1)) * plotH;
  return { x, y };
}

function drawGraph(currentMult, flying) {
  const ctx = els.graph?.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = els.graph.width / dpr;
  const h = els.graph.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { pad, plotW, plotH } = getGraphLayout(w, h);
  const maxMult = getGraphMaxMult(currentMult, flying);

  ctx.strokeStyle = 'rgba(147, 51, 234, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  if (!flying || currentMult <= 1) return;

  const points = [];
  const steps = 60;
  const maxT = elapsedAtMult(maxMult);
  for (let i = 0; i <= steps; i++) {
    const t = (maxT / steps) * i;
    const m = multAtElapsed(t);
    if (m > currentMult) break;
    const x = pad.l + (t / maxT) * plotW;
    const y = pad.t + plotH - ((m - 1) / (maxMult - 1)) * plotH;
    points.push({ x, y });
  }

  if (points.length < 2) return;

  const grad = ctx.createLinearGradient(pad.l, pad.t, w - pad.r, pad.t + plotH);
  grad.addColorStop(0, 'rgba(74, 222, 128, 0.55)');
  grad.addColorStop(1, 'rgba(147, 51, 234, 0.35)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.t + plotH);
  ctx.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[points.length - 1].x, pad.t + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function updateRocketPosition(mult, flying) {
  if (!els.rocketWrap || !els.stage) return;
  const rect = els.stage.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const tip = getGraphPointAtMult(mult, mult, flying, w, h);

  let angle = -42;
  if (flying && mult > 1.02) {
    const prev = getGraphPointAtMult(Math.max(1.01, mult - 0.12), mult, flying, w, h);
    angle = Math.atan2(tip.y - prev.y, tip.x - prev.x) * (180 / Math.PI);
  }

  els.rocketWrap.style.left = `${tip.x}px`;
  els.rocketWrap.style.top = `${tip.y}px`;
  els.rocketWrap.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
}

function setMultiplierDisplay(mult, type = '') {
  els.mult.textContent = `${mult.toFixed(2)}x`;
  els.mult.className = 'cr-mult' + (type ? ` cr-mult--${type}` : '');
}

function pushHistory(crashPoint, won = false) {
  state.history.unshift({ crashPoint, won });
  if (state.history.length > HISTORY_MAX) state.history.pop();
  renderHistory();
}

function renderHistory() {
  if (!els.historyList) return;
  els.historyList.innerHTML = state.history.map(item => {
    const low = item.crashPoint < 1.5;
    const mid = item.crashPoint >= 1.5 && item.crashPoint < 3;
    const cls = low ? 'is-low' : mid ? 'is-mid' : 'is-high';
    return `<span class="cr-history-item ${cls}">${item.crashPoint.toFixed(2)}x</span>`;
  }).join('');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const flying = state.phase === 'flying';
  const countdown = state.phase === 'countdown';
  const active = flying || countdown;
  const autoRunning = state.auto.running;
  const autoIdle = state.panel === 'auto' && !active && !autoRunning;

  els.betBtn.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.betBtn.hidden = active || autoIdle || autoRunning;
  els.cashoutBtn.hidden = state.panel !== 'manual' || !flying || state.cashedOut;

  if (flying && !state.cashedOut) {
    const payout = state.bet * state.multiplier;
    els.cashoutBtn.textContent = `Cash Out $${payout.toFixed(2)}`;
    els.cashoutBtn.disabled = false;
  }

  els.autoStart.textContent = loggedIn ? 'Start Autobet' : 'Register to Bet';
  els.autoStart.hidden = autoRunning;
  els.autoStop.hidden = !autoRunning;
  els.autoStart.disabled = autoRunning || active || getAutoCashoutTarget() <= 1;

  const lock = active || autoRunning;
  els.bet.disabled = lock;
  els.half.disabled = lock;
  els.doubleBet.disabled = lock;
  els.autoCashout.disabled = lock;
  els.tabManual.disabled = lock;
  els.tabAuto.disabled = lock;
  els.betBtn.disabled = autoRunning;
  els.autoPanel.hidden = state.panel !== 'auto';
  els.manualActions.hidden = state.panel !== 'manual';
  els.autoProgress.hidden = !autoRunning;

  els.panelEl?.classList.toggle('is-auto-running', autoRunning);

  [els.autoBets, els.autoInfinity].forEach(el => {
    if (el) el.disabled = autoRunning;
  });
  if (!autoRunning) syncAutoInfinityUI();
}

function stopAnimation() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
}

async function startRound() {
  if (state.phase !== 'idle' || state.auto.running) return;
  if (state.panel === 'auto') return;

  const bet = parseFloat(els.bet.value);
  const error = validateBetAmount(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const round = await launchRound(bet, currency);
  if (round?.error) setMessage(round.error, 'lose');
}

async function launchRound(bet, currency) {
  const debitResult = window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Crash',
    detail: `Bet $${bet.toFixed(2)}`,
    game: 'crash',
  });
  if (debitResult?.ok === false) return { error: debitResult.error };

  state.phase = 'countdown';
  state.bet = bet;
  state.currency = currency;
  state.crashPoint = generateCrashPoint();
  state.multiplier = 1;
  state.cashedOut = false;
  state.startTime = 0;

  els.stage.classList.remove('is-crashed', 'is-cashed');
  els.stage.classList.add('is-countdown');
  setMultiplierDisplay(1);
  els.status.textContent = 'Launching…';
  setMessage('');
  updateUI();
  drawGraph(1, false);

  await delay(COUNTDOWN_MS);

  if (state.phase !== 'countdown') return;

  state.phase = 'flying';
  state.startTime = performance.now();
  els.stage.classList.remove('is-countdown');
  els.stage.classList.add('is-flying');
  els.status.textContent = 'Flying — cash out before crash!';
  updateUI();

  return new Promise(resolve => {
    const tick = now => {
      if (state.phase !== 'flying') {
        resolve();
        return;
      }

      const elapsed = (now - state.startTime) / 1000;
      state.multiplier = multAtElapsed(elapsed);
      setMultiplierDisplay(state.multiplier);
      updateRocketPosition(state.multiplier, true);
      drawGraph(state.multiplier, true);

      const autoTarget = getAutoCashoutTarget();
      if (!state.cashedOut && autoTarget > 1 && state.multiplier >= autoTarget && autoTarget < state.crashPoint) {
        cashOut(true);
        resolve();
        return;
      }

      if (state.multiplier >= state.crashPoint) {
        handleCrash();
        resolve();
        return;
      }

      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
  });
}

function cashOut(auto = false) {
  if (state.phase !== 'flying' || state.cashedOut) return;

  state.cashedOut = true;
  stopAnimation();

  const mult = state.multiplier;
  const payout = state.bet * mult;
  const currency = state.currency;

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
    type: 'win',
    label: 'Crash',
    detail: `${mult.toFixed(2)}x — $${payout.toFixed(2)}`,
    game: 'crash',
  });

  window.XythonStats?.recordRound?.(state.bet, true, { game: 'crash', payout });

  els.stage.classList.remove('is-flying');
  els.stage.classList.add('is-cashed');
  setMultiplierDisplay(mult, 'win');
  els.status.textContent = auto
    ? `Auto cashed out at ${mult.toFixed(2)}x`
    : `Cashed out at ${mult.toFixed(2)}x — +$${(payout - state.bet).toFixed(2)}`;
  setMessage(`Won $${payout.toFixed(2)} at ${mult.toFixed(2)}x`, 'win');

  pushHistory(state.crashPoint);
  finishRound();
}

function handleCrash() {
  if (state.cashedOut) return;
  stopAnimation();

  state.phase = 'ended';
  window.XythonStats?.recordRound?.(state.bet, false, { game: 'crash', payout: 0 });

  els.stage.classList.remove('is-flying');
  els.stage.classList.add('is-crashed');
  setMultiplierDisplay(state.crashPoint, 'lose');
  els.status.textContent = `Crashed at ${state.crashPoint.toFixed(2)}x`;
  setMessage(`Crashed — lost $${state.bet.toFixed(2)}`, 'lose');

  pushHistory(state.crashPoint);
  finishRound();
}

async function finishRound() {
  state.phase = 'ended';
  updateUI();
  await delay(RESET_MS);
  resetRound();
}

function resetRound() {
  stopAnimation();
  state.phase = 'idle';
  state.bet = 0;
  state.multiplier = 1;
  state.cashedOut = false;
  state.crashPoint = 1;

  els.stage.classList.remove('is-countdown', 'is-flying', 'is-crashed', 'is-cashed');
  setMultiplierDisplay(1);
  els.status.textContent = 'Place a bet to launch';
  updateRocketPosition(1, false);
  drawGraph(1, false);
  updateUI();
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
  els.autoProfit.className = 'cr-auto-progress-value'
    + (profit > 0 ? ' is-positive' : profit < 0 ? ' is-negative' : '');
}

async function startAuto() {
  if (state.auto.running || state.phase !== 'idle') return;

  const baseBet = parseFloat(els.bet.value);
  const error = validateBetAmount(baseBet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const autoTarget = getAutoCashoutTarget();
  if (autoTarget <= 1) {
    setMessage('Set Auto Cashout above 1.00x for autobet', 'lose');
    return;
  }

  state.auto.running = true;
  state.auto.baseBet = baseBet;
  state.auto.totalBets = getAutoTotalBets();
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;

  updateAutoProgress();
  updateUI();
  setMessage(`Autobet — cashout at ${autoTarget.toFixed(2)}x`, '');

  await runAutoLoop();
}

async function runAutoLoop() {
  while (state.auto.running) {
    if (state.auto.totalBets !== Infinity && state.auto.completed >= state.auto.totalBets) {
      stopAuto(false, `Autobet finished — ${state.auto.completed} bets`);
      return;
    }

    const bet = parseFloat(els.bet.value);
    const error = validateBetAmount(bet);
    if (error) {
      stopAuto(false, error, 'lose');
      return;
    }

    const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
    const balanceBefore = window.XythonWallet?.getBalance(currency) ?? 0;

    await launchRound(bet, currency);

    while (state.phase !== 'idle') await delay(50);

    const balanceAfter = window.XythonWallet?.getBalance(currency) ?? 0;
    state.auto.completed += 1;
    state.auto.sessionProfit += balanceAfter - balanceBefore;
    updateAutoProgress();

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
