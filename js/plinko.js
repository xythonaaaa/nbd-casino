const MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  10: {
    low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 1.5, 0.3, 0.2, 0.3, 1.5, 3, 10, 76],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8, 24, 170],
  },
  14: {
    low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high: [420, 56, 18, 5, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 5, 18, 56, 420],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

const SEGMENT_MS = 180;
const HISTORY_MAX = 20;

const state = {
  rows: 16,
  risk: 'high',
  balls: [],
  multipliers: [],
  layout: null,
  ballId: 0,
  animating: false,
  history: [],
  historySelected: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.bet = document.getElementById('plBet');
  els.betCurrency = document.getElementById('plBetCurrency');
  els.half = document.getElementById('plHalf');
  els.doubleBet = document.getElementById('plDouble');
  els.rows = document.getElementById('plRows');
  els.rowsValue = document.getElementById('plRowsValue');
  els.risk = document.getElementById('plRisk');
  els.placeBet = document.getElementById('plPlaceBet');
  els.message = document.getElementById('plMessage');
  els.canvas = document.getElementById('plCanvas');
  els.buckets = document.getElementById('plBuckets');
  els.historyList = document.getElementById('plHistoryList');
  els.historyDetail = document.getElementById('plHistoryDetail');

  els.historyList.addEventListener('click', e => {
    const item = e.target.closest('[data-history-index]');
    if (!item) return;
    const index = Number(item.dataset.historyIndex);
    state.historySelected = state.historySelected === index ? null : index;
    renderHistory();
  });

  els.half.addEventListener('click', () => {
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
  });
  els.doubleBet.addEventListener('click', () => {
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
  });
  els.bet.addEventListener('input', updateBetLabel);
  els.rows.addEventListener('input', () => {
    state.rows = parseInt(els.rows.value, 10);
    els.rowsValue.textContent = state.rows;
    rebuildBoard();
  });
  els.risk.addEventListener('change', () => {
    state.risk = els.risk.value;
    rebuildBoard();
  });
  els.placeBet.addEventListener('click', () => placeBet());

  document.addEventListener('xython:auth-change', updateUI);

  state.rows = parseInt(els.rows.value, 10);
  state.risk = els.risk.value;
  initCanvas();
  requestAnimationFrame(() => rebuildBoard());
  updateBetLabel();
  updateUI();
});

function initCanvas() {
  els.ctx = els.canvas.getContext('2d');
  const container = els.canvas.parentElement;
  const onResize = () => {
    if (state.balls.length === 0) rebuildBoard();
  };
  window.addEventListener('resize', onResize);
  if (typeof ResizeObserver !== 'undefined' && container) {
    new ResizeObserver(onResize).observe(container);
  }
}

function getMultipliers(rows, risk) {
  return MULTIPLIERS[rows]?.[risk] || MULTIPLIERS[16].medium;
}

function bucketTone(index, total) {
  const center = (total - 1) / 2;
  const dist = Math.abs(index - center) / center;
  if (dist > 0.85) return 'edge';
  if (dist > 0.55) return 'mid-high';
  if (dist > 0.25) return 'mid';
  return 'center';
}

function bucketClass(index, total) {
  return `pl-bucket--${bucketTone(index, total)}`;
}

function formatMultiplier(val) {
  if (val >= 1000) return `${Math.round(val / 1000)}K`;
  if (val >= 100) return String(Math.round(val));
  if (val >= 10) return val % 1 ? val.toFixed(1) : String(val);
  return String(val);
}

function rebuildBoard() {
  state.multipliers = getMultipliers(state.rows, state.risk);
  renderBuckets();
  computeLayout();
  alignBuckets();
  drawBoard();
}

function alignBuckets() {
  if (!state.layout || !els.buckets) return;
  const { width, rows } = state.layout;
  const lastRowPegCount = rows + 2;
  const lastRowWidth = (lastRowPegCount - 1) * (width * 0.72) / (rows + 2);
  const inset = (width - lastRowWidth) / 2;
  els.buckets.style.width = `${lastRowWidth}px`;
  els.buckets.style.marginLeft = `${inset}px`;
  els.buckets.style.marginRight = 'auto';
}

function renderBuckets() {
  els.buckets.innerHTML = state.multipliers.map((mult, i) =>
    `<div class="pl-bucket ${bucketClass(i, state.multipliers.length)}" data-index="${i}">${formatMultiplier(mult)}</div>`
  ).join('');
}

function computeLayout() {
  const container = els.canvas.parentElement;
  const width = Math.min(Math.max(container.clientWidth, 320), 720);
  const rows = state.rows;
  const pegRadius = Math.max(3, width * 0.006);
  const rowGap = (width * 0.72) / (rows + 2);
  const startX = width / 2;
  const startY = pegRadius * 3;
  const lastRowY = startY + (rows - 1) * rowGap;
  const height = lastRowY + pegRadius * 3;
  const dpr = window.devicePixelRatio || 1;

  els.canvas.width = Math.round(width * dpr);
  els.canvas.height = Math.round(height * dpr);
  els.canvas.style.width = `${width}px`;
  els.canvas.style.height = `${height}px`;
  els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pegs = [];

  for (let row = 0; row < rows; row++) {
    const pegsInRow = row + 3;
    const rowWidth = (pegsInRow - 1) * (width * 0.72) / (rows + 2);
    const rowStartX = startX - rowWidth / 2;
    const y = startY + row * rowGap;
    for (let col = 0; col < pegsInRow; col++) {
      pegs.push({
        x: rowStartX + col * (rowWidth / (pegsInRow - 1)),
        y,
        row,
        col,
      });
    }
  }

  const slotCount = rows + 1;
  const lastRowPegCount = rows + 2;
  const lastRowWidth = (lastRowPegCount - 1) * (width * 0.72) / (rows + 2);
  const lastRowStartX = startX - lastRowWidth / 2;
  const pegSpacing = lastRowWidth / (lastRowPegCount - 1);
  const slotY = lastRowY + pegRadius * 2;
  const slots = [];

  for (let i = 0; i < slotCount; i++) {
    slots.push({
      x: lastRowStartX + (i + 1) * pegSpacing,
      y: slotY,
    });
  }

  state.layout = {
    width,
    height,
    pegRadius,
    rowGap,
    startX,
    startY,
    lastRowY,
    pegs,
    slots,
    pegSpacing,
    rows,
  };
}

function drawBoard() {
  if (!state.layout || !els.ctx) return;

  const { width, height, pegRadius, pegs } = state.layout;
  const ctx = els.ctx;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  for (const peg of pegs) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }

  for (const ball of state.balls) {
    drawBall(ctx, ball, pegRadius);
  }
}

function drawBall(ctx, ball, pegRadius) {
  const r = pegRadius * 1.6;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
  const hue = 270 + (ball.id * 37) % 50;
  const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, r);
  grad.addColorStop(0, `hsl(${hue}, 90%, 88%)`);
  grad.addColorStop(1, `hsl(${hue}, 70%, 48%)`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function buildPathForSlot(rows, slotIndex) {
  const ones = Math.min(rows, Math.max(0, slotIndex));
  const path = [...Array(ones).fill(1), ...Array(rows - ones).fill(0)];
  for (let i = path.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [path[i], path[j]] = [path[j], path[i]];
  }
  return path;
}

function buildPath(rows, forcedPath) {
  if (Array.isArray(forcedPath) && forcedPath.length === rows) return forcedPath.slice();
  const path = [];
  for (let i = 0; i < rows; i++) {
    path.push(Math.random() < 0.5 ? 0 : 1);
  }
  return path;
}

function getPegAt(row, col) {
  const rowPegs = state.layout.pegs.filter(p => p.row === row);
  const peg = rowPegs[col];
  if (peg) return peg;
  return rowPegs[Math.max(0, Math.min(col, rowPegs.length - 1))];
}

function getBallWaypoints(path) {
  const { startX, startY, rowGap, slots, pegRadius } = state.layout;
  const points = [{ x: startX, y: startY - rowGap * 0.45 }];

  let rights = 0;
  for (let row = 0; row < path.length; row++) {
    rights += path[row];
    const peg = getPegAt(row, rights + 1);
    points.push({
      x: peg.x,
      y: peg.y + pegRadius * 0.5,
    });
  }

  const slotIndex = rights;
  points.push({
    x: slots[slotIndex].x,
    y: slots[slotIndex].y - pegRadius * 0.5,
  });

  return { points, slotIndex };
}

function updateBall(ball, dt) {
  if (ball.finished) return;

  ball.segmentTime += dt;

  while (ball.segmentTime >= SEGMENT_MS && ball.segment < ball.points.length - 1) {
    ball.segmentTime -= SEGMENT_MS;
    ball.segment++;
  }

  if (ball.segment >= ball.points.length - 1) {
    const last = ball.points[ball.points.length - 1];
    ball.x = last.x;
    ball.y = last.y;
    ball.finished = true;
    return;
  }

  const from = ball.points[ball.segment];
  const to = ball.points[ball.segment + 1];
  const t = Math.min(1, ball.segmentTime / SEGMENT_MS);
  const ease = t * (2 - t);
  ball.x = from.x + (to.x - from.x) * ease;
  ball.y = from.y + (to.y - from.y) * ease;
}

function completeBall(ball) {
  ball.paid = true;
  const payout = ball.bet * ball.multiplier;

  flashBucket(ball.slotIndex);
  addHistoryEntry(ball);

  if (ball.multiplier >= 1) {
    setMessage(`${formatMultiplier(ball.multiplier)}x — won $${payout.toFixed(2)}`, 'win');
  } else {
    setMessage(`${formatMultiplier(ball.multiplier)}x — returned $${payout.toFixed(2)}`, ball.multiplier >= 0.5 ? '' : 'lose');
  }

  window.XythonStats?.recordRound?.(ball.bet, ball.multiplier >= 1, { game: 'plinko', payout });
}

function flashBucket(index) {
  const el = els.buckets.children[index];
  if (!el) return;
  el.classList.add('is-active');
  setTimeout(() => el.classList.remove('is-active'), 500);
}

function addHistoryEntry(ball) {
  const total = state.multipliers.length;
  state.historySelected = null;
  state.history.unshift({
    multiplier: ball.multiplier,
    slotIndex: ball.slotIndex,
    tone: bucketTone(ball.slotIndex, total),
    bet: ball.bet,
    payout: ball.bet * ball.multiplier,
  });
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
  renderHistory();
}

function renderHistoryDetail() {
  if (!els.historyDetail) return;
  const item = state.historySelected != null ? state.history[state.historySelected] : null;
  if (!item) {
    els.historyDetail.hidden = true;
    els.historyDetail.innerHTML = '';
    return;
  }

  const label = `${formatMultiplier(item.multiplier)}x`;
  const profit = item.payout - item.bet;
  const profitClass = profit >= 0 ? 'is-profit' : 'is-loss';

  els.historyDetail.hidden = false;
  els.historyDetail.innerHTML = `
    <div class="pl-history-detail-top">
      <span class="pl-history-detail-mult pl-history-item--${item.tone}">${label}</span>
    </div>
    <div class="pl-history-detail-rows">
      <div class="pl-history-detail-row">
        <span class="pl-history-detail-label">Bet</span>
        <span class="pl-history-detail-value">$${item.bet.toFixed(2)}</span>
      </div>
      <div class="pl-history-detail-row">
        <span class="pl-history-detail-label">Won</span>
        <span class="pl-history-detail-value">$${item.payout.toFixed(2)}</span>
      </div>
      <div class="pl-history-detail-row pl-history-detail-row--net ${profitClass}">
        <span class="pl-history-detail-label">Net</span>
        <span class="pl-history-detail-value">${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</span>
      </div>
    </div>`;
}

function renderHistory() {
  if (!els.historyList) return;

  els.historyList.innerHTML = state.history.map((item, i) => {
    const label = `${formatMultiplier(item.multiplier)}x`;
    const selected = state.historySelected === i;
    return `<button type="button" class="pl-history-item pl-history-item--${item.tone}${i === 0 ? ' is-new' : ''}${selected ? ' is-selected' : ''}" data-history-index="${i}" aria-pressed="${selected}">${label}</button>`;
  }).join('');

  renderHistoryDetail();
}

let lastFrameTime = 0;

function animationFrame(now) {
  if (state.balls.length === 0) {
    state.animating = false;
    lastFrameTime = 0;
    drawBoard();
    updateUI();
    return;
  }

  const dt = lastFrameTime ? now - lastFrameTime : 0;
  lastFrameTime = now;

  for (const ball of state.balls) {
    updateBall(ball, dt);
  }

  for (const ball of state.balls) {
    if (ball.finished && !ball.paid) completeBall(ball);
  }

  state.balls = state.balls.filter(b => !b.paid);
  drawBoard();
  requestAnimationFrame(animationFrame);
}

function startAnimationLoop() {
  if (state.animating) return;
  state.animating = true;
  requestAnimationFrame(animationFrame);
}

function dropBall(bet, currency, serverOutcome) {
  const path = serverOutcome?.path
    ? buildPath(state.rows, serverOutcome.path)
    : buildPath(state.rows);
  const { points, slotIndex } = getBallWaypoints(path);
  const multiplier = serverOutcome?.multiplier ?? state.multipliers[slotIndex];

  state.balls.push({
    id: ++state.ballId,
    x: points[0].x,
    y: points[0].y,
    points,
    segment: 0,
    segmentTime: 0,
    slotIndex: serverOutcome?.slotIndex ?? slotIndex,
    multiplier,
    bet,
    currency,
    finished: false,
    paid: false,
  });

  startAnimationLoop();
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'pl-message' + (type ? ` ${type}` : '');
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateUI() {
  const ballsActive = state.balls.length > 0;
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  els.placeBet.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.rows.disabled = ballsActive;
  els.risk.disabled = ballsActive;
}

async function placeBet() {
  if (!window.XythonAuth?.requireAuth?.('register')) {
    setMessage('Register to place bets', 'lose');
    return;
  }

  const bet = parseFloat(els.bet.value);
  if (!bet || bet <= 0) {
    setMessage('Enter a valid bet amount', 'lose');
    return;
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (bet > balance) {
    setMessage('Insufficient balance — deposit first', 'lose');
    return;
  }

  if (!state.layout || state.layout.width <= 0) {
    rebuildBoard();
  }

  const play = await window.XythonWallet?.playRound?.({
    game: 'plinko',
    bet,
    currency,
    params: { rows: state.rows, risk: state.risk },
    tx: {
      label: 'Plinko',
      detail: `Bet $${bet.toFixed(2)}`,
      game: 'plinko',
    },
  });

  if (!play?.ok) {
    setMessage(play?.error || 'Could not place bet', 'lose');
    return;
  }

  dropBall(bet, currency, play.outcome);
  updateUI();
}
