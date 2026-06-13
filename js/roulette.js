const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const CHIP_VALUES = [0.1, 1, 10, 100, 1000, 5000];

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

const state = {
  chipValue: 1,
  bets: {},
  betStack: [],
  lastRound: null,
  spinning: false,
  rotation: 0,
  history: [],
};

const els = {};
let winPopupTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.chips = document.getElementById('rlChips');
  els.chipCurrency = document.getElementById('rlChipCurrency');
  els.totalBet = document.getElementById('rlTotalBet');
  els.totalCurrency = document.getElementById('rlTotalCurrency');
  els.half = document.getElementById('rlHalf');
  els.doubleBet = document.getElementById('rlDouble');
  els.placeBet = document.getElementById('rlPlaceBet');
  els.message = document.getElementById('rlMessage');
  els.canvas = document.getElementById('rlWheel');
  els.result = document.getElementById('rlResult');
  els.table = document.getElementById('rlTable');
  els.history = document.getElementById('rlHistory');
  els.undo = document.getElementById('rlUndo');
  els.repeat = document.getElementById('rlRepeat');
  els.clear = document.getElementById('rlClear');
  els.winPopup = document.getElementById('rlWinPopup');
  els.winNumber = document.getElementById('rlWinNumber');
  els.winAmount = document.getElementById('rlWinAmount');

  els.ctx = els.canvas.getContext('2d');

  renderChips();
  renderTable();
  drawWheel(state.rotation);

  els.chips.addEventListener('click', e => {
    const chip = e.target.closest('.rl-chip');
    if (chip) selectChip(parseFloat(chip.dataset.value));
  });

  els.half.addEventListener('click', () => scaleAllBets(0.5));
  els.doubleBet.addEventListener('click', () => scaleAllBets(2));
  els.placeBet.addEventListener('click', () => spin());
  els.undo.addEventListener('click', () => undoBet());
  els.repeat.addEventListener('click', () => repeatBet());
  els.clear.addEventListener('click', () => clearBets());
  els.table.addEventListener('click', e => {
    const spot = e.target.closest('[data-spot]');
    if (spot) placeChip(spot.dataset.spot);
  });

  document.addEventListener('xython:auth-change', updateUI);
  window.addEventListener('resize', () => drawWheel(state.rotation));

  updateUI();
});

function betKey(spot) {
  return spot;
}

function getNumberColor(num) {
  if (num === 0) return 'green';
  return RED_NUMBERS.has(num) ? 'red' : 'black';
}

function renderChips() {
  els.chips.innerHTML = CHIP_VALUES.map(val => {
    const label = val >= 1 ? val : val.toFixed(2);
    return `
    <button type="button" class="rl-chip${val === state.chipValue ? ' active' : ''}" data-value="${val}">
      <span class="rl-chip-label">${label}</span>
    </button>`;
  }).join('');
  updateChipLabel();
}

function selectChip(value) {
  if (state.spinning) return;
  state.chipValue = value;
  renderChips();
}

function renderTable() {
  const numsHtml = TABLE_ROWS.map((row, ri) => `
    <div class="rl-table-row">
      ${row.map(n => cellBtn(`num-${n}`, n, getNumberColor(n))).join('')}
      ${cellBtn(`col-${ri + 1}`, '2:1', 'outside')}
    </div>
  `).join('');

  els.table.innerHTML = `
    <div class="rl-table-grid">
      ${cellBtn('num-0', '0', 'green', 'rl-cell--zero')}
      <div class="rl-table-numbers">${numsHtml}</div>
    </div>
    <div class="rl-table-row rl-table-row--wide">
      ${cellBtn('dozen-1', '1 to 12', 'outside')}
      ${cellBtn('dozen-2', '13 to 24', 'outside')}
      ${cellBtn('dozen-3', '25 to 36', 'outside')}
    </div>
    <div class="rl-table-row rl-table-row--wide">
      ${cellBtn('low', '1 to 18', 'outside')}
      ${cellBtn('even', 'Even', 'outside')}
      ${cellBtn('red', 'Red', 'red')}
      ${cellBtn('black', 'Black', 'black')}
      ${cellBtn('odd', 'Odd', 'outside')}
      ${cellBtn('high', '19 to 36', 'outside')}
    </div>
  `;
  updateTableChips();
}

function cellBtn(spot, label, colorClass, extra = '') {
  return `<button type="button" class="rl-cell rl-cell--${colorClass} ${extra}" data-spot="${spot}">${label}</button>`;
}

function placeChip(spot) {
  if (state.spinning) return;
  const key = betKey(spot);
  state.bets[key] = (state.bets[key] || 0) + state.chipValue;
  state.betStack.push({ spot, amount: state.chipValue });
  updateTableChips();
  updateTotalBet();
  updateUI();
}

function undoBet() {
  if (state.spinning || !state.betStack.length) return;
  const last = state.betStack.pop();
  const key = betKey(last.spot);
  state.bets[key] = Math.max(0, (state.bets[key] || 0) - last.amount);
  if (state.bets[key] === 0) delete state.bets[key];
  updateTableChips();
  updateTotalBet();
  updateUI();
}

function clearBets() {
  if (state.spinning) return;
  state.bets = {};
  state.betStack = [];
  updateTableChips();
  updateTotalBet();
  updateUI();
}

function repeatBet() {
  if (state.spinning || !state.lastRound) return;
  state.bets = { ...state.lastRound.bets };
  state.betStack = state.lastRound.betStack.map(b => ({ ...b }));
  updateTableChips();
  updateTotalBet();
  setMessage('');
  updateUI();
}

function scaleAllBets(factor) {
  if (state.spinning || !Object.keys(state.bets).length) return;
  Object.keys(state.bets).forEach(key => {
    state.bets[key] = Math.max(0.1, parseFloat((state.bets[key] * factor).toFixed(2)));
  });
  state.betStack = [];
  updateTableChips();
  updateTotalBet();
  updateUI();
}

function getTotalBet() {
  return Object.values(state.bets).reduce((sum, v) => sum + v, 0);
}

function updateTotalBet() {
  const total = getTotalBet();
  els.totalBet.value = total.toFixed(2);
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.totalCurrency.textContent = `${total.toFixed(2)} ${currency}`;
}

function updateChipLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.chipCurrency.textContent = `${state.chipValue.toFixed(state.chipValue < 1 ? 2 : 0)} ${currency}`;
}

function updateTableChips() {
  els.table.querySelectorAll('[data-spot]').forEach(btn => {
    const amount = state.bets[betKey(btn.dataset.spot)] || 0;
    let chip = btn.querySelector('.rl-cell-chip');
    if (amount > 0) {
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'rl-cell-chip';
        btn.appendChild(chip);
      }
      chip.textContent = amount >= 1 ? amount.toFixed(amount % 1 ? 2 : 0) : amount.toFixed(2);
    } else if (chip) {
      chip.remove();
    }
  });
}

function drawWheel(rotationDeg) {
  const canvas = els.canvas;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.parentElement.clientWidth, 300);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = els.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const inner = outer * 0.52;
  const slotCount = WHEEL_ORDER.length;
  const slotAngle = (Math.PI * 2) / slotCount;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  for (let i = 0; i < slotCount; i++) {
    const num = WHEEL_ORDER[i];
    const start = i * slotAngle - Math.PI / 2;
    const end = start + slotAngle;
    const color = getNumberColor(num);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outer, start, end);
    ctx.closePath();
    ctx.fillStyle = color === 'red' ? '#c41e3a' : color === 'black' ? '#1a1a1a' : '#0d7a38';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + slotAngle / 2);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.max(7, size * 0.024)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), outer * 0.8, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fillStyle = '#151515';
  ctx.fill();
  ctx.strokeStyle = 'rgba(192,192,192,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -inner * 0.35);
  ctx.lineTo(inner * 0.35, 0);
  ctx.lineTo(0, inner * 0.35);
  ctx.lineTo(-inner * 0.35, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(192,192,192,0.25)';
  ctx.fill();

  ctx.restore();
}

function betWins(spot, result) {
  if (spot.startsWith('num-')) return result === parseInt(spot.slice(4), 10);
  if (spot === 'red') return getNumberColor(result) === 'red';
  if (spot === 'black') return getNumberColor(result) === 'black';
  if (spot === 'even') return result !== 0 && result % 2 === 0;
  if (spot === 'odd') return result !== 0 && result % 2 === 1;
  if (spot === 'low') return result >= 1 && result <= 18;
  if (spot === 'high') return result >= 19 && result <= 36;
  if (spot === 'dozen-1') return result >= 1 && result <= 12;
  if (spot === 'dozen-2') return result >= 13 && result <= 24;
  if (spot === 'dozen-3') return result >= 25 && result <= 36;
  if (spot === 'col-1') return result !== 0 && result % 3 === 0;
  if (spot === 'col-2') return result !== 0 && result % 3 === 2;
  if (spot === 'col-3') return result !== 0 && result % 3 === 1;
  return false;
}

function betMultiplier(spot) {
  if (spot.startsWith('num-')) return 36;
  if (spot.startsWith('col-') || spot.startsWith('dozen-')) return 3;
  return 2;
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const locked = state.spinning;
  els.placeBet.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.placeBet.disabled = locked;
  els.half.disabled = locked;
  els.doubleBet.disabled = locked;
  els.undo.disabled = locked || !state.betStack.length;
  els.repeat.disabled = locked || !state.lastRound;
  els.clear.disabled = locked || !Object.keys(state.bets).length;
  els.chips.querySelectorAll('.rl-chip').forEach(c => { c.disabled = locked; });
  updateChipLabel();
  updateTotalBet();
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'rl-message' + (type ? ` ${type}` : '');
}

function showWinPopup(result, amount, currency) {
  if (winPopupTimer) {
    clearTimeout(winPopupTimer);
    winPopupTimer = null;
  }

  const color = getNumberColor(result);
  els.winNumber.textContent = result;
  els.winNumber.className = 'rl-win-popup-number is-' + color;
  els.winAmount.textContent = `+$${amount.toFixed(2)} ${currency}`;

  els.winPopup.hidden = false;
  requestAnimationFrame(() => els.winPopup.classList.add('is-visible'));

  winPopupTimer = setTimeout(() => {
    els.winPopup.classList.remove('is-visible');
    winPopupTimer = setTimeout(() => {
      els.winPopup.hidden = true;
      winPopupTimer = null;
    }, 250);
  }, 3000);
}

function addHistory(num) {
  state.history.unshift(num);
  if (state.history.length > 14) state.history.pop();
  els.history.innerHTML = state.history.map(n =>
    `<span class="rl-history-chip ${getNumberColor(n)}">${n}</span>`
  ).join('');
}

function showResult(num) {
  els.result.textContent = num;
  els.result.className = 'rl-result is-' + getNumberColor(num);
}

function spin() {
  if (state.spinning) return;

  if (!window.XythonAuth?.requireAuth?.('register')) {
    setMessage('Register to place bets', 'lose');
    return;
  }

  const total = getTotalBet();
  if (total <= 0) {
    setMessage('Place chips on the table first', 'lose');
    return;
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (total > balance) {
    setMessage('Insufficient balance — deposit first', 'lose');
    return;
  }

  window.XythonWallet?.setBalance(currency, balance - total, {
    type: 'bet',
    label: 'Roulette',
    detail: `Bet $${total.toFixed(2)}`,
    game: 'roulette',
  });

  state.lastRound = {
    bets: { ...state.bets },
    betStack: state.betStack.map(b => ({ ...b })),
  };

  state.spinning = true;
  setMessage('');
  updateUI();

  const resultIndex = Math.floor(Math.random() * WHEEL_ORDER.length);
  const result = WHEEL_ORDER[resultIndex];
  const slotAngleDeg = 360 / WHEEL_ORDER.length;
  const spins = 5 + Math.floor(Math.random() * 3);
  const targetOffset = 360 - (resultIndex + 0.5) * slotAngleDeg;
  const current = state.rotation % 360;
  const endRotation = state.rotation + spins * 360 + ((targetOffset - current + 360) % 360);
  const startRotation = state.rotation;
  const duration = 4200;
  const startTime = performance.now();
  const betsSnapshot = { ...state.bets };

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    state.rotation = startRotation + (endRotation - startRotation) * ease;
    drawWheel(state.rotation);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      state.rotation = endRotation;
      drawWheel(state.rotation);
      finishSpin(result, betsSnapshot, currency);
    }
  }

  requestAnimationFrame(frame);
}

function finishSpin(result, bets, currency) {
  state.spinning = false;
  showResult(result);
  addHistory(result);

  let totalPayout = 0;
  const wins = [];

  Object.entries(bets).forEach(([spot, amount]) => {
    if (betWins(spot, result)) {
      const payout = amount * betMultiplier(spot);
      totalPayout += payout;
      wins.push(spot);
    }
  });

  if (totalPayout > 0) {
    const balance = window.XythonWallet?.getBalance(currency) ?? 0;
    window.XythonWallet?.setBalance(currency, balance + totalPayout, {
      type: 'win',
      label: 'Roulette',
      detail: `${result} — $${totalPayout.toFixed(2)}`,
      game: 'roulette',
    });
    setMessage('');
    showWinPopup(result, totalPayout, currency);
  } else {
    setMessage(`Landed on ${result} — you lose`, 'lose');
  }

  const totalWagered = Object.values(bets).reduce((sum, v) => sum + v, 0);
  window.XythonStats?.recordRound?.(totalWagered, totalPayout > 0, { game: 'roulette', payout: totalPayout });

  updateUI();
}
