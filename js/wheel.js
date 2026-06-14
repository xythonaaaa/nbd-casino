const HOUSE_EDGE = 0.99;
const HISTORY_MAX = 20;
const SPIN_MS = 4200;

const RISKS = {
  low: {
    label: 'Low',
    slices: [
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 1.2, color: '#c084fc', label: '1.2x' },
      { mult: 1.5, color: '#a855f7', label: '1.5x' },
      { mult: 2, color: '#9333ea', label: '2x' },
      { mult: 1.2, color: '#c084fc', label: '1.2x' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 1.5, color: '#a855f7', label: '1.5x' },
      { mult: 3, color: '#7e22ce', label: '3x' },
      { mult: 1.2, color: '#c084fc', label: '1.2x' },
      { mult: 1.5, color: '#a855f7', label: '1.5x' },
    ],
  },
  medium: {
    label: 'Medium',
    slices: [
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 1.5, color: '#e879f9', label: '1.5x' },
      { mult: 2, color: '#d946ef', label: '2x' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 3, color: '#c026d3', label: '3x' },
      { mult: 1.5, color: '#e879f9', label: '1.5x' },
      { mult: 5, color: '#a21caf', label: '5x' },
      { mult: 2, color: '#d946ef', label: '2x' },
    ],
  },
  hard: {
    label: 'Hard',
    slices: [
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 10, color: '#fde047', label: '10x', text: '#1e1b4b' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 50, color: '#fbbf24', label: '50x', text: '#1e1b4b' },
      { mult: 0, color: '#374151', label: '0x' },
      { mult: 5, color: '#c026d3', label: '5x' },
      { mult: 10, color: '#fde047', label: '10x', text: '#1e1b4b' },
    ],
  },
};

const state = {
  risk: 'low',
  spinning: false,
  rotation: 0,
  history: [],
  animFrame: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.bet = document.getElementById('whBet');
  els.betCurrency = document.getElementById('whBetCurrency');
  els.half = document.getElementById('whHalf');
  els.doubleBet = document.getElementById('whDouble');
  els.riskRow = document.getElementById('whRiskRow');
  els.segments = document.getElementById('whSegments');
  els.maxWin = document.getElementById('whMaxWin');
  els.profit = document.getElementById('whProfit');
  els.spinBtn = document.getElementById('whSpinBtn');
  els.message = document.getElementById('whMessage');
  els.canvas = document.getElementById('whCanvas');
  els.ctx = els.canvas.getContext('2d');
  els.result = document.getElementById('whResult');
  els.resultLabel = document.getElementById('whResultLabel');
  els.resultMult = document.getElementById('whResultMult');
  els.resultPayout = document.getElementById('whResultPayout');
  els.legend = document.getElementById('whLegend');
  els.historyList = document.getElementById('whHistoryList');

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
  els.spinBtn.addEventListener('click', () => spin());
  els.riskRow.querySelectorAll('.wh-risk').forEach(btn => {
    btn.addEventListener('click', () => setRisk(btn.dataset.risk));
  });

  document.addEventListener('xython:auth-change', updateUI);
  window.addEventListener('resize', () => drawWheel(state.rotation));

  updateBetLabel();
  setRisk('low');
  updateUI();
});

function getSlices() {
  return RISKS[state.risk].slices.map(slice => ({
    ...slice,
    weight: slice.weight ?? 1,
  }));
}

function getTotalWeight(slices) {
  return slices.reduce((sum, slice) => sum + slice.weight, 0);
}

function getSliceLayout(slices) {
  const total = getTotalWeight(slices);
  let cursor = -Math.PI / 2;
  return slices.map(slice => {
    const span = (slice.weight / total) * Math.PI * 2;
    const start = cursor;
    const end = cursor + span;
    cursor = end;
    return {
      slice,
      start,
      end,
      mid: start + span / 2,
      spanDeg: (span * 180) / Math.PI,
    };
  });
}

function getMaxMultiplier() {
  return Math.max(...getSlices().map(s => s.mult));
}

function setRisk(risk) {
  if (state.spinning || !RISKS[risk]) return;
  state.risk = risk;
  els.riskRow.querySelectorAll('.wh-risk').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.risk === risk);
  });
  updateStats();
  renderLegend();
  drawWheel(state.rotation);
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const slices = getSlices();
  const maxMult = getMaxMultiplier();
  const bet = parseFloat(els.bet.value) || 0;
  const effectiveMax = maxMult > 0 ? maxMult * HOUSE_EDGE : 0;

  els.segments.textContent = String(slices.length);
  els.maxWin.textContent = `${maxMult.toFixed(2)}x`;
  els.profit.textContent = effectiveMax > 0
    ? `+${formatMoney(bet * (effectiveMax - 1))}`
    : '+$0.00';
}

function formatMoney(amount) {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const sym = currency === 'USD' ? '$' : '';
  return `${sym}${Math.abs(amount).toFixed(2)}${currency !== 'USD' ? ` ${currency}` : ''}`;
}

function renderLegend() {
  const seen = new Map();
  getSlices().forEach(slice => {
    if (!seen.has(slice.label)) seen.set(slice.label, slice);
  });

  els.legend.innerHTML = [...seen.values()]
    .sort((a, b) => a.mult - b.mult)
    .map(slice => `
      <span class="wh-legend-chip">
        <span class="wh-legend-dot" style="background:${slice.color}"></span>
        ${slice.label}
      </span>
    `).join('');
}

function drawWheel(rotationDeg) {
  const canvas = els.canvas;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(wrap.clientWidth, 340);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = els.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 6;
  const layout = getSliceLayout(getSlices());

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  layout.forEach(({ slice, start, end, spanDeg }) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outer, start, end);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + (end - start) / 2);
    ctx.fillStyle = slice.text || '#fff';
    const fontScale = slice.mult === 0 && spanDeg > 40 ? 0.048 : 0.034;
    ctx.font = `700 ${Math.max(9, size * fontScale)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slice.label, outer * 0.72, 0);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(0, 0, outer * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#151515';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 121, 249, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, outer + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232, 121, 249, 0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function pickSliceIndex() {
  const slices = getSlices();
  const total = getTotalWeight(slices);
  let roll = Math.random() * total;
  for (let i = 0; i < slices.length; i++) {
    roll -= slices[i].weight;
    if (roll <= 0) return i;
  }
  return slices.length - 1;
}

function rotationForSlice(index, extraSpins = 0) {
  const layout = getSliceLayout(getSlices());
  const midDeg = (layout[index].mid * 180) / Math.PI;
  let stopAngle = (-90 - midDeg) % 360;
  if (stopAngle < 0) stopAngle += 360;

  const currentNorm = ((state.rotation % 360) + 360) % 360;
  let delta = stopAngle - currentNorm;
  if (delta <= 0) delta += 360;
  delta += extraSpins * 360;

  return state.rotation + delta;
}

function getSliceIndexAtPointer(rotationDeg) {
  const pointerRad = -Math.PI / 2;
  const layout = getSliceLayout(getSlices());
  const wheelRad = ((rotationDeg * Math.PI) / 180) % (Math.PI * 2);
  const localAngle = pointerRad - wheelRad;
  const normalized = ((localAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  for (let i = 0; i < layout.length; i++) {
    const { start, end } = layout[i];
    const startNorm = ((start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const endNorm = ((end % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (startNorm <= endNorm) {
      if (normalized >= startNorm && normalized < endNorm) return i;
    } else if (normalized >= startNorm || normalized < endNorm) {
      return i;
    }
  }
  return layout.length - 1;
}

function spinToIndex(index) {
  const extraSpins = 5 + Math.floor(Math.random() * 3);
  const endRot = rotationForSlice(index, extraSpins);
  const start = performance.now();

  return new Promise(resolve => {
    function frame(now) {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = state.rotation + (endRot - state.rotation) * eased;
      drawWheel(current);

      if (t < 1) {
        state.animFrame = requestAnimationFrame(frame);
      } else {
        state.rotation = endRot;
        drawWheel(state.rotation);
        resolve();
      }
    }
    if (state.animFrame) cancelAnimationFrame(state.animFrame);
    state.animFrame = requestAnimationFrame(frame);
  });
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'wh-message' + (type ? ` ${type}` : '');
}

function showResult(slice, payout, bet) {
  const win = slice.mult > 0;
  els.result.hidden = false;
  els.result.classList.toggle('loss', !win);
  els.resultLabel.textContent = win ? 'You won' : 'No win';
  els.resultMult.textContent = slice.label;
  els.resultPayout.textContent = win
    ? `+${formatMoney(payout - bet)}`
    : `-${formatMoney(bet)}`;
}

function hideResult() {
  els.result.hidden = true;
}

function pushHistory(slice) {
  state.history.unshift(slice);
  if (state.history.length > HISTORY_MAX) state.history.pop();

  if (!state.history.length) {
    els.historyList.innerHTML = '<p class="wh-history-empty">No spins yet</p>';
    return;
  }

  els.historyList.innerHTML = state.history.map(seg => {
    const cls = seg.mult > 0 ? 'win' : 'loss';
    return `<div class="wh-history-item ${cls}">${seg.label}</div>`;
  }).join('');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const locked = state.spinning;
  els.spinBtn.textContent = loggedIn ? 'Spin Wheel' : 'Register to Spin';
  els.spinBtn.disabled = locked;
  els.half.disabled = locked;
  els.doubleBet.disabled = locked;
  els.bet.disabled = locked;
  els.riskRow.querySelectorAll('.wh-risk').forEach(btn => { btn.disabled = locked; });
}

async function spin() {
  if (state.spinning) return;

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return;
  }

  const bet = parseFloat(els.bet.value);
  if (!Number.isFinite(bet) || bet <= 0) {
    setMessage('Enter a valid bet amount.', 'loss');
    return;
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) {
    setMessage('Insufficient balance.', 'loss');
    return;
  }

  state.spinning = true;
  hideResult();
  setMessage('');
  updateUI();

  window.XythonWallet?.setBalance(currency, balance - bet, {
    type: 'bet',
    game: 'Wheel',
    amount: bet,
  });

  const winIndex = pickSliceIndex();
  const slice = getSlices()[winIndex];

  await spinToIndex(winIndex);

  const effectiveMult = slice.mult > 0 ? slice.mult * HOUSE_EDGE : 0;
  const payout = bet * effectiveMult;
  const profit = payout - bet;

  if (payout > 0) {
    window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
      type: 'win',
      game: 'Wheel',
      amount: payout,
    });
  }

  window.XythonStats?.recordRound?.(bet, profit > 0, { game: 'wheel', payout });

  showResult(slice, payout, bet);
  pushHistory(slice);

  if (profit > 0) {
    setMessage(`Won ${formatMoney(profit)}!`, 'win');
  } else {
    setMessage('Better luck next spin.', 'loss');
  }

  state.spinning = false;
  updateUI();
  updateBetLabel();
  updateStats();
}
