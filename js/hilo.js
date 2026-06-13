const HOUSE_EDGE = 0.99;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_COUNT = RANKS.length;
const REVEAL_MS = 650;
const POPUP_MS = 2200;
const HISTORY_MAX = 20;

const state = {
  phase: 'idle',
  bet: 0,
  current: null,
  multiplier: 1,
  streak: 0,
  history: [],
};

const els = {};
let popupTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initCommon();
  cacheElements();
  bindEvents();
  updateBetLabel();
  updateStats();
  updateUI();
  renderHistory();
});

function cacheElements() {
  els.bet = document.getElementById('hlBet');
  els.betCurrency = document.getElementById('hlBetCurrency');
  els.half = document.getElementById('hlHalf');
  els.doubleBet = document.getElementById('hlDouble');
  els.multiplier = document.getElementById('hlMultiplier');
  els.streak = document.getElementById('hlStreak');
  els.cashout = document.getElementById('hlCashout');
  els.startBtn = document.getElementById('hlStartBtn');
  els.cashoutBtn = document.getElementById('hlCashoutBtn');
  els.message = document.getElementById('hlMessage');
  els.stage = document.getElementById('hlStage');
  els.card = document.getElementById('hlCard');
  els.nextPreview = document.getElementById('hlNextPreview');
  els.nextCard = document.getElementById('hlNextCard');
  els.guessRow = document.getElementById('hlGuessRow');
  els.hi = document.getElementById('hlHi');
  els.lo = document.getElementById('hlLo');
  els.hiChance = document.getElementById('hlHiChance');
  els.loChance = document.getElementById('hlLoChance');
  els.hiMult = document.getElementById('hlHiMult');
  els.loMult = document.getElementById('hlLoMult');
  els.status = document.getElementById('hlStatus');
  els.historyList = document.getElementById('hlHistoryList');
  els.resultPopup = document.getElementById('hlResultPopup');
  els.resultCard = document.getElementById('hlResultCard');
  els.popupLabel = document.getElementById('hlPopupLabel');
  els.popupMult = document.getElementById('hlPopupMult');
  els.popupText = document.getElementById('hlPopupText');
}

function bindEvents() {
  els.half.addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    els.bet.value = Math.max(0.01, (parseFloat(els.bet.value) || 0) / 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.doubleBet.addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    els.bet.value = ((parseFloat(els.bet.value) || 0) * 2).toFixed(2);
    updateBetLabel();
    updateStats();
  });
  els.bet.addEventListener('input', () => {
    if (state.phase === 'idle') {
      updateBetLabel();
      updateStats();
    }
  });
  els.startBtn.addEventListener('click', () => startRound());
  els.cashoutBtn.addEventListener('click', () => cashOut());
  els.hi.addEventListener('click', () => guess('hi'));
  els.lo.addEventListener('click', () => guess('lo'));
  document.addEventListener('xython:auth-change', updateUI);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rankValue(card) {
  return RANKS.indexOf(card.rank) + 1;
}

function randomCard() {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank, suit, red: suit === '♥' || suit === '♦' };
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

function renderPlayingCard(el, card, { compact = false, showLabel = false } = {}) {
  if (!el) return;

  if (!card) {
    el.className = 'hl-playing-card hl-playing-card--empty' + (compact ? ' hl-playing-card--next' : '');
    el.innerHTML = `
      <span class="hl-pcard-idle">—</span>
      ${showLabel ? '<span class="hl-card-label">Current</span>' : ''}
    `;
    return;
  }

  el.className = `hl-playing-card${card.red ? ' hl-playing-card--red' : ''}${compact ? ' hl-playing-card--next' : ''}`;
  el.innerHTML = `
    <div class="hl-pcard-corner hl-pcard-corner--tl">
      <span class="hl-pcard-rank">${card.rank}</span>
      <span class="hl-pcard-suit">${card.suit}</span>
    </div>
    <div class="hl-pcard-center">${card.suit}</div>
    <div class="hl-pcard-corner hl-pcard-corner--br">
      <span class="hl-pcard-rank">${card.rank}</span>
      <span class="hl-pcard-suit">${card.suit}</span>
    </div>
    ${showLabel ? '<span class="hl-card-label">Current</span>' : ''}
  `;
}

function getProb(card, direction) {
  const rank = rankValue(card);
  if (direction === 'hi') return (RANK_COUNT - rank) / RANK_COUNT;
  return (rank - 1) / RANK_COUNT;
}

function getStepMult(card, direction) {
  const prob = getProb(card, direction);
  if (prob <= 0) return 0;
  return HOUSE_EDGE / prob;
}

function formatMult(value) {
  return `${value.toFixed(2)}x`;
}

function updateBetLabel() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${parseFloat(els.bet.value || 0).toFixed(2)} ${currency}`;
}

function updateStats() {
  const bet = parseFloat(els.bet.value) || 0;
  els.multiplier.textContent = formatMult(state.multiplier);
  els.streak.textContent = String(state.streak);
  const payout = state.phase === 'idle' ? 0 : bet * state.multiplier;
  els.cashout.textContent = `$${payout.toFixed(2)}`;
}

function updateGuessButtons() {
  if (!state.current) return;

  const hiProb = getProb(state.current, 'hi');
  const loProb = getProb(state.current, 'lo');
  const hiStep = getStepMult(state.current, 'hi');
  const loStep = getStepMult(state.current, 'lo');

  els.hiChance.textContent = `${(hiProb * 100).toFixed(2)}%`;
  els.loChance.textContent = `${(loProb * 100).toFixed(2)}%`;
  els.hiMult.textContent = hiProb > 0 ? formatMult(hiStep) : '—';
  els.loMult.textContent = loProb > 0 ? formatMult(loStep) : '—';

  els.hi.disabled = hiProb <= 0 || state.phase !== 'playing';
  els.lo.disabled = loProb <= 0 || state.phase !== 'playing';
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'hl-message' + (type ? ` ${type}` : '');
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
  els.popupLabel.textContent = won ? 'You Win!' : 'Round Over';
  els.popupMult.textContent = formatMult(mult);
  els.popupText.textContent = text || (won ? `+$${payout.toFixed(2)}` : 'Better luck next round');
  els.resultCard.className = `hl-result-popup-card hl-result-popup-card--${won ? 'win' : 'lose'}`;
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
    els.historyList.innerHTML = '<p class="hl-history-empty">No rounds yet</p>';
    return;
  }
  els.historyList.innerHTML = state.history.map((item, i) => {
    const cls = item.won ? 'win' : 'lose';
    return `<div class="hl-history-item hl-history-item--${cls}${i === 0 ? ' is-new' : ''}">${formatMult(item.mult)}</div>`;
  }).join('');
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const idle = state.phase === 'idle';
  const playing = state.phase === 'playing';
  const busy = state.phase === 'revealing';

  els.startBtn.hidden = !idle;
  els.startBtn.textContent = loggedIn ? 'Start Round' : 'Register to Bet';
  els.startBtn.disabled = busy;

  els.cashoutBtn.hidden = !playing;
  els.cashoutBtn.disabled = busy;

  els.bet.disabled = !idle;
  els.half.disabled = !idle;
  els.doubleBet.disabled = !idle;

  els.guessRow.hidden = !playing && !busy;
  els.nextPreview.hidden = state.phase !== 'revealing';

  if (playing || busy) {
    renderPlayingCard(els.card, state.current, { showLabel: true });
    updateGuessButtons();
  } else if (idle) {
    renderPlayingCard(els.card, null, { showLabel: true });
    els.status.textContent = 'Place your bet and start a round';
    els.stage.classList.remove('is-win', 'is-lose');
  }

  updateStats();
}

async function startRound() {
  if (state.phase !== 'idle') return;

  const bet = parseFloat(els.bet.value);
  const error = validateBet(bet);
  if (error) {
    setMessage(error, 'lose');
    return;
  }

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) - bet, {
    type: 'bet',
    label: 'Hi-Lo',
    detail: `$${bet.toFixed(2)}`,
    game: 'hilo',
  });

  state.bet = bet;
  state.current = randomCard();
  state.multiplier = 1;
  state.streak = 0;
  state.phase = 'playing';

  hidePopup();
  setMessage('');
  els.status.textContent = 'Higher or lower?';
  els.card.classList.remove('is-reveal');
  updateUI();
}

async function guess(direction) {
  if (state.phase !== 'playing' || !state.current) return;

  const stepMult = getStepMult(state.current, direction);
  if (stepMult <= 0) return;

  state.phase = 'revealing';
  updateUI();

  const next = randomCard();
  renderPlayingCard(els.nextCard, next, { compact: true });
  els.nextPreview.hidden = false;
  els.card.classList.add('is-reveal');

  await delay(REVEAL_MS);

  const currentVal = rankValue(state.current);
  const nextVal = rankValue(next);
  const won = direction === 'hi' ? nextVal > currentVal : nextVal < currentVal;

  els.card.classList.remove('is-reveal');
  els.nextPreview.hidden = true;

  if (won) {
    state.multiplier *= stepMult;
    state.streak += 1;
    state.current = next;
    state.phase = 'playing';
    els.status.textContent = `${cardLabel(next)} — correct! Streak ${state.streak}`;
    setMessage(`+${formatMult(stepMult)} this step`, 'win');
    updateUI();
    return;
  }

  state.phase = 'idle';
  els.stage.classList.add('is-lose');
  els.status.textContent = `${cardLabel(next)} — wrong guess`;
  setMessage(`Lost $${state.bet.toFixed(2)}`, 'lose');
  window.XythonStats?.recordRound?.(state.bet, false, { game: 'hilo', payout: 0 });
  pushHistory({ won: false, mult: state.multiplier });
  showPopup({
    won: false,
    mult: state.multiplier,
    payout: 0,
    text: `${cardLabel(next)} vs ${cardLabel(state.current)} — you lose`,
  });

  state.current = null;
  state.multiplier = 1;
  state.streak = 0;
  updateUI();
}

async function cashOut() {
  if (state.phase !== 'playing') return;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const payout = state.bet * state.multiplier;
  const profit = payout - state.bet;

  window.XythonWallet?.setBalance(currency, (window.XythonWallet?.getBalance(currency) ?? 0) + payout, {
    type: 'win',
    label: 'Hi-Lo',
    detail: `Cashed ${formatMult(state.multiplier)} — $${payout.toFixed(2)}`,
    game: 'hilo',
  });

  window.XythonStats?.recordRound?.(state.bet, profit > 0, { game: 'hilo', payout });

  els.stage.classList.add(profit > 0 ? 'is-win' : 'is-lose');
  els.status.textContent = `Cashed out at ${formatMult(state.multiplier)}`;
  setMessage(profit >= 0 ? `Won $${profit.toFixed(2)}` : `Break even`, profit > 0 ? 'win' : '');
  pushHistory({ won: true, mult: state.multiplier });
  showPopup({
    won: true,
    mult: state.multiplier,
    payout: profit,
    text: `+$${profit.toFixed(2)} profit`,
  });

  state.phase = 'idle';
  state.current = null;
  state.multiplier = 1;
  state.streak = 0;
  updateUI();
}
