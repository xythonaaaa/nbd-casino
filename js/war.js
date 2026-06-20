const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const DEAL_MS = 450;
const AUTO_GAP_MS = 400;
const TIE_PAYOUT = 10;
const POPUP_MS = 2500;

let popupTimer = null;

const state = {
  deck: [],
  playerCard: null,
  dealerCard: null,
  warPlayerCard: null,
  warDealerCard: null,
  bet: 0,
  tieBet: 0,
  panel: 'manual',
  phase: 'idle',
  busy: false,
  atWar: false,
  sessionId: null,
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

  els.panelEl = document.getElementById('swPanel');
  els.tabManual = document.getElementById('swTabManual');
  els.tabAuto = document.getElementById('swTabAuto');
  els.manualPanel = document.getElementById('swManualPanel');
  els.autoPanel = document.getElementById('swAutoPanel');
  els.bet = document.getElementById('swBet');
  els.tieBet = document.getElementById('swTieBet');
  els.betCurrency = document.getElementById('swBetCurrency');
  els.tieBetCurrency = document.getElementById('swTieBetCurrency');
  els.half = document.getElementById('swHalf');
  els.doubleBet = document.getElementById('swDouble');
  els.tieHalf = document.getElementById('swTieHalf');
  els.tieDouble = document.getElementById('swTieDouble');
  els.primaryActions = document.getElementById('swPrimaryActions');
  els.choiceActions = document.getElementById('swChoiceActions');
  els.placeBet = document.getElementById('swPlaceBet');
  els.surrender = document.getElementById('swSurrender');
  els.goToWar = document.getElementById('swGoToWar');
  els.message = document.getElementById('swMessage');
  els.rules = document.getElementById('swRules');
  els.table = document.getElementById('swTable');
  els.dealerSlot = document.getElementById('swDealerSlot');
  els.playerSlot = document.getElementById('swPlayerSlot');
  els.deckSlot = document.getElementById('swDeckSlot');
  els.resultPopup = document.getElementById('swResultPopup');
  els.resultCard = document.getElementById('swResultCard');
  els.resultLabel = document.getElementById('swResultLabel');
  els.resultText = document.getElementById('swResultText');
  els.autoBets = document.getElementById('swAutoBets');
  els.autoInfinity = document.getElementById('swAutoInfinity');
  els.autoProgress = document.getElementById('swAutoProgress');
  els.autoBetCount = document.getElementById('swAutoBetCount');
  els.autoProfit = document.getElementById('swAutoProfit');
  els.autoStart = document.getElementById('swAutoStart');
  els.autoStop = document.getElementById('swAutoStop');

  els.half.addEventListener('click', () => adjustInput(els.bet, 0.5, 0.01));
  els.doubleBet.addEventListener('click', () => adjustInput(els.bet, 2, 0.01));
  els.tieHalf.addEventListener('click', () => adjustInput(els.tieBet, 0.5, 0));
  els.tieDouble.addEventListener('click', () => adjustInput(els.tieBet, 2, 0));
  els.bet.addEventListener('input', updateBetLabels);
  els.tieBet.addEventListener('input', updateBetLabels);
  els.placeBet.addEventListener('click', () => startRound());
  els.surrender.addEventListener('click', () => doSurrender());
  els.goToWar.addEventListener('click', () => doWar());
  els.tabManual.addEventListener('click', () => setPanel('manual'));
  els.tabAuto.addEventListener('click', () => setPanel('auto'));
  els.autoStart.addEventListener('click', () => startAuto());
  els.autoStop.addEventListener('click', () => stopAuto(true));
  els.autoInfinity.addEventListener('click', toggleAutoInfinity);
  els.autoBets.addEventListener('input', () => {
    if (state.auto.unlimited) setAutoUnlimited(false);
    updateAutoProgress();
  });

  document.addEventListener('xython:auth-change', updateUI);

  updateBetLabels();
  syncAutoInfinityUI();
  updateAutoProgress();
  updateUI();
});

function createDeck() {
  const deck = [];
  for (let d = 0; d < 6; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit, red: suit === '♥' || suit === '♦' });
      }
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function ensureDeck() {
  if (state.deck.length < 20) {
    state.deck = shuffle(createDeck());
  }
}

function drawCard() {
  ensureDeck();
  return state.deck.pop();
}

function rankValue(card) {
  return RANKS.indexOf(card.rank) + 2;
}

function compareCards(a, b) {
  return rankValue(a) - rankValue(b);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function adjustInput(input, mult, min) {
  if (state.busy || (state.phase !== 'idle' && state.phase !== 'done') || state.auto.running) return;
  const current = parseFloat(input.value) || 0;
  const next = mult === 0.5 ? Math.max(min, current / 2) : current * 2;
  input.value = next.toFixed(2);
  updateBetLabels();
}

function getBetAmount() {
  return parseFloat(els.bet.value) || 0;
}

function getTieBetAmount() {
  return parseFloat(els.tieBet.value) || 0;
}

function updateBetLabels() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  els.betCurrency.textContent = `${getBetAmount().toFixed(2)} ${currency}`;
  els.tieBetCurrency.textContent = `${getTieBetAmount().toFixed(2)} ${currency}`;
}

function setPanel(panel) {
  if (state.auto.running || (state.phase !== 'idle' && state.phase !== 'done')) return;
  state.panel = panel;
  els.tabManual.classList.toggle('active', panel === 'manual');
  els.tabAuto.classList.toggle('active', panel === 'auto');
  els.manualPanel.hidden = panel !== 'manual';
  els.autoPanel.hidden = panel !== 'auto';
  updateUI();
}

function setAutoUnlimited(on) {
  state.auto.unlimited = on;
  els.autoInfinity.classList.toggle('active', on);
  els.autoInfinity.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) els.autoBets.value = '';
  updateAutoProgress();
}

function toggleAutoInfinity() {
  if (state.auto.running) return;
  setAutoUnlimited(!state.auto.unlimited);
}

function syncAutoInfinityUI() {
  els.autoInfinity.classList.toggle('active', state.auto.unlimited);
  els.autoInfinity.setAttribute('aria-pressed', state.auto.unlimited ? 'true' : 'false');
}

function updateAutoProgress() {
  const total = state.auto.unlimited ? '∞' : (parseInt(els.autoBets.value, 10) || 0);
  els.autoBetCount.textContent = state.auto.unlimited
    ? `${state.auto.completed} / ∞`
    : `${state.auto.completed} / ${total}`;
  const sign = state.auto.sessionProfit >= 0 ? '+' : '-';
  els.autoProfit.textContent = `${sign}$${Math.abs(state.auto.sessionProfit).toFixed(2)}`;
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'sw-message' + (type ? ` ${type}` : '');
}

function showResultPopup(outcome, panelMessage) {
  if (!els.resultPopup) return;

  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }

  const labels = { win: 'You Win!', lose: 'You Lose', push: 'Result' };
  els.resultLabel.textContent = labels[outcome] || 'Result';
  els.resultText.textContent = panelMessage;
  els.resultCard.className = 'sw-result-popup-card sw-result-popup-card--' + outcome;

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

function hideResultPopup() {
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
  if (!els.resultPopup) return;
  els.resultPopup.classList.remove('is-visible');
  els.resultPopup.hidden = true;
}

function showTable(show) {
  els.table.hidden = !show;
  els.deckSlot.hidden = show;
  if (show) els.rules.classList.add('is-hidden');
  else els.rules.classList.remove('is-hidden');
}

function renderCard(card, war = false) {
  const div = document.createElement('div');
  div.className = 'sw-card' + (card.red ? ' red' : '') + (war ? ' sw-card--war' : '');
  div.innerHTML = `
    <span class="sw-card-rank">${card.rank}</span>
    <span class="sw-card-suit">${card.suit}</span>
  `;
  return div;
}

function setSlotCard(slot, card, war = false) {
  slot.innerHTML = '';
  if (card) {
    slot.appendChild(renderCard(card, war));
    slot.classList.add('has-card');
  } else {
    slot.classList.remove('has-card');
  }
}

function clearTable() {
  state.playerCard = null;
  state.dealerCard = null;
  state.warPlayerCard = null;
  state.warDealerCard = null;
  state.atWar = false;
  setSlotCard(els.dealerSlot, null);
  setSlotCard(els.playerSlot, null);
  els.dealerSlot.classList.remove('is-tie');
  els.playerSlot.classList.remove('is-tie');
  showTable(false);
  hideResultPopup();
}

function resetRound() {
  clearTable();
  state.phase = 'idle';
  state.busy = false;
  setMessage('');
  updateUI();
}

function updateUI() {
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const idle = state.phase === 'idle';
  const done = state.phase === 'done';
  const choice = state.phase === 'choice';
  const canEdit = idle || done;
  const locked = state.busy || !canEdit;
  const autoRunning = state.auto.running;

  els.panelEl.classList.toggle('is-auto-running', autoRunning);
  els.tabManual.disabled = autoRunning || (!idle && !done);
  els.tabAuto.disabled = autoRunning || (!idle && !done);

  els.manualPanel.hidden = state.panel !== 'manual';
  els.autoPanel.hidden = state.panel !== 'auto';

  els.primaryActions.hidden = state.panel !== 'manual' || !(idle || done);
  els.choiceActions.hidden = state.panel !== 'manual' || !choice;

  els.placeBet.textContent = loggedIn ? (done ? 'Bet Again' : 'Place Bet') : 'Register to Bet';
  els.placeBet.disabled = (state.busy && !done) || autoRunning || choice;
  els.bet.disabled = locked || autoRunning;
  els.tieBet.disabled = locked || autoRunning;
  els.half.disabled = locked || autoRunning;
  els.doubleBet.disabled = locked || autoRunning;
  els.tieHalf.disabled = locked || autoRunning;
  els.tieDouble.disabled = locked || autoRunning;

  els.surrender.disabled = state.busy || !choice || autoRunning;
  els.goToWar.disabled = state.busy || !choice || autoRunning;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (choice && state.bet > balance) {
    els.goToWar.disabled = true;
    els.goToWar.title = 'Insufficient balance for war bet';
  } else {
    els.goToWar.title = '';
  }

  els.autoStart.hidden = autoRunning;
  els.autoStop.hidden = !autoRunning;
  els.autoProgress.hidden = !autoRunning;
  els.autoBets.disabled = autoRunning;
  els.autoInfinity.disabled = autoRunning;

  updateBetLabels();
  updateAutoProgress();
}

function validateBet(bet, tieBet) {
  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    return 'Register to place bets';
  }
  if (!bet || bet <= 0) return 'Enter a valid bet amount';
  if (tieBet < 0) return 'Enter a valid tie bet amount';
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  const total = bet + tieBet;
  if (total > balance) return 'Insufficient balance — deposit first';
  return null;
}

async function deductBet(amount, detail) {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  if (window.walletUsesServerWallet?.()) {
    if (!state.sessionId) {
      const started = await window.XythonWallet.startSession({
        game: 'war',
        bet: amount,
        currency,
        tx: { label: 'Surrender or War', detail, game: 'war' },
      });
      if (!started?.ok) return started.error || 'Could not place bet';
      state.sessionId = started.sessionId;
      return null;
    }
    const result = await window.XythonWallet.sessionDebit({
      sessionId: state.sessionId,
      amount,
      tx: { label: 'Surrender or War', detail, game: 'war' },
    });
    return result?.ok ? null : result.error || 'Could not place bet';
  }

  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  const debitResult = window.XythonWallet?.setBalance(currency, balance - amount, {
    type: 'bet',
    label: 'Surrender or War',
    detail,
    game: 'war',
  });
  return !debitResult?.ok ? (debitResult?.error || 'Could not place bet') : null;
}

async function creditWin(amount, detail) {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  if (window.walletUsesServerWallet?.()) {
    if (!state.sessionId) return;
    await window.XythonWallet.sessionCredit({
      sessionId: state.sessionId,
      amount,
      tx: { label: 'Surrender or War', detail, game: 'war' },
    });
    return;
  }

  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  window.XythonWallet?.setBalance(currency, balance + amount, {
    type: 'win',
    label: 'Surrender or War',
    detail,
    game: 'war',
  });
}

async function closeWarSession() {
  if (!state.sessionId || !window.walletUsesServerWallet?.()) {
    state.sessionId = null;
    return;
  }
  await window.XythonWallet.sessionSettle({ sessionId: state.sessionId, payout: 0 });
  state.sessionId = null;
}

function recordStats(wagered, won, payout = 0) {
  window.XythonStats?.recordRound?.(wagered, won, { game: 'war', payout });
}

async function payTieSideBet() {
  if (state.tieBet <= 0) return 0;
  const payout = state.tieBet * (TIE_PAYOUT + 1);
  await creditWin(payout, `Tie bet won ${TIE_PAYOUT}:1 — $${payout.toFixed(2)}`);
  return payout - state.tieBet;
}

async function startRound({ fast = false, autoSurrender = false } = {}) {
  if (state.busy) return false;
  if (state.phase !== 'idle' && state.phase !== 'done' && !autoSurrender) return false;

  const bet = getBetAmount();
  const tieBet = getTieBetAmount();
  const err = validateBet(bet, tieBet);
  if (err) {
    if (!state.auto.running) setMessage(err, 'lose');
    return false;
  }

  if (state.resetTimer) {
    clearTimeout(state.resetTimer);
    state.resetTimer = null;
  }

  state.busy = true;
  state.bet = bet;
  state.tieBet = tieBet;
  state.phase = 'dealing';
  clearTable();
  setMessage('');
  showTable(true);
  updateUI();

  const betError = await deductBet(bet + tieBet, `Bet $${bet.toFixed(2)}${tieBet > 0 ? ` + tie $${tieBet.toFixed(2)}` : ''}`);
  if (betError) {
    state.busy = false;
    state.phase = 'idle';
    setMessage(betError, 'lose');
    updateUI();
    return;
  }

  await wait(fast ? 180 : DEAL_MS);
  state.playerCard = drawCard();
  state.dealerCard = drawCard();
  setSlotCard(els.playerSlot, state.playerCard);
  setSlotCard(els.dealerSlot, state.dealerCard);

  await wait(fast ? 180 : DEAL_MS);
  return resolveInitial({ autoSurrender, fast });
}

async function resolveInitial({ autoSurrender = false, fast = false } = {}) {
  const cmp = compareCards(state.playerCard, state.dealerCard);

  if (cmp > 0) {
    await finishRound({
      outcome: 'win',
      profit: state.bet,
      panelMessage: `You win! +$${state.bet.toFixed(2)}`,
      wagered: state.bet + state.tieBet,
      fast,
    });
    return true;
  }

  if (cmp < 0) {
    await finishRound({
      outcome: 'lose',
      profit: -(state.bet + state.tieBet),
      panelMessage: `Dealer wins — -$${state.bet.toFixed(2)}`,
      wagered: state.bet + state.tieBet,
      fast,
    });
    return true;
  }

  const tieProfit = await payTieSideBet();
  els.dealerSlot.classList.add('is-tie');
  els.playerSlot.classList.add('is-tie');

  if (autoSurrender || state.auto.running) {
    await wait(fast ? 120 : 250);
    await doSurrender({ fast, tieProfitAlready: tieProfit });
    return true;
  }

  state.phase = 'choice';
  state.busy = false;
  const tieMsg = tieProfit > 0 ? `Tie bet won +$${tieProfit.toFixed(2)}! ` : '';
  setMessage(`${tieMsg}Choose surrender or war`, 'push');
  updateUI();
  return true;
}

async function doSurrender({ fast = false, tieProfitAlready = 0 } = {}) {
  if (state.busy && state.phase !== 'choice' && !state.auto.running) return;

  state.busy = true;
  updateUI();

  const half = state.bet / 2;
  await creditWin(half, `Surrendered — returned $${half.toFixed(2)}`);

  await finishRound({
    outcome: 'lose',
    profit: tieProfitAlready - half,
    panelMessage: `Surrendered — -$${half.toFixed(2)}`,
    wagered: state.bet + state.tieBet,
    skipCredit: true,
    fast,
  });
}

async function doWar({ fast = false } = {}) {
  if (state.busy || state.phase !== 'choice') return;

  const err = validateBet(state.bet, 0);
  if (err) {
    setMessage('Insufficient balance for war bet', 'lose');
    return;
  }

  state.busy = true;
  state.atWar = true;
  state.phase = 'war';
  setMessage('');
  updateUI();

  const betError = await deductBet(state.bet, `War bet $${state.bet.toFixed(2)}`);
  if (betError) {
    state.busy = false;
    state.atWar = false;
    state.phase = 'choice';
    setMessage(betError, 'lose');
    updateUI();
    return;
  }

  await wait(fast ? 180 : DEAL_MS);
  for (let i = 0; i < 3; i++) drawCard();
  state.warPlayerCard = drawCard();
  state.warDealerCard = drawCard();
  setSlotCard(els.playerSlot, state.warPlayerCard, true);
  setSlotCard(els.dealerSlot, state.warDealerCard, true);

  await wait(fast ? 180 : DEAL_MS);

  const cmp = compareCards(state.warPlayerCard, state.warDealerCard);
  const totalWager = state.bet * 2 + state.tieBet;

  if (cmp >= 0) {
    const payout = state.bet * 3;
    await creditWin(payout, `Won war — $${payout.toFixed(2)} returned`);
    await finishRound({
      outcome: 'win',
      profit: state.bet + (state.tieBet > 0 ? state.tieBet * TIE_PAYOUT : 0),
      panelMessage: `War won! +$${state.bet.toFixed(2)}`,
      wagered: totalWager,
      skipCredit: true,
      fast,
    });
    return;
  }

  await finishRound({
    outcome: 'lose',
    profit: -(state.bet * 2),
    panelMessage: `Lost the war — -$${(state.bet * 2).toFixed(2)}`,
    wagered: totalWager,
    fast,
  });
}

async function finishRound({
  outcome,
  profit,
  panelMessage,
  wagered,
  skipCredit = false,
  fast = false,
}) {
  if (!skipCredit && outcome === 'win') {
    await creditWin(state.bet * 2, `Won $${(state.bet * 2).toFixed(2)}`);
  }
  await closeWarSession();

  state.phase = 'done';
  state.busy = false;
  els.dealerSlot.classList.remove('is-tie');
  els.playerSlot.classList.remove('is-tie');

  setMessage(panelMessage, outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'push');

  if (!fast && !state.auto.running) {
    showResultPopup(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'push', panelMessage);
  }

  const winPayout = outcome === 'win'
    ? (skipCredit ? state.bet * 3 : state.bet * 2)
    : 0;
  recordStats(wagered, outcome === 'win', winPayout);

  if (state.auto.running) {
    state.auto.completed += 1;
    state.auto.sessionProfit += profit;
    updateAutoProgress();
  }

  updateUI();
}

async function startAuto() {
  if (state.auto.running || state.phase !== 'idle') return;

  if (!window.XythonAuth?.isLoggedIn?.()) {
    window.XythonAuth?.requireAuth?.('register');
    setMessage('Register to place bets', 'lose');
    return;
  }

  const totalBets = state.auto.unlimited ? Infinity : (parseInt(els.autoBets.value, 10) || 0);
  if (!state.auto.unlimited && totalBets < 1) {
    setMessage('Enter number of bets', 'lose');
    return;
  }

  state.auto.running = true;
  state.auto.completed = 0;
  state.auto.sessionProfit = 0;
  updateUI();

  while (state.auto.running) {
    if (!state.auto.unlimited && state.auto.completed >= totalBets) break;

    const ok = await startRound({ fast: true, autoSurrender: true });
    if (!ok) {
      stopAuto(false);
      break;
    }

    if (!state.auto.running) break;
    await wait(AUTO_GAP_MS);
    if (state.phase === 'done') resetRound();
    await wait(80);
  }

  stopAuto(false);
}

function stopAuto(manual) {
  state.auto.running = false;
  if (manual) setMessage('Autobet stopped', 'push');
  updateUI();
}
