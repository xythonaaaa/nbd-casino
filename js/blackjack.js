const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const DEAL_DELAY = 550;
const POPUP_MS = 2800;

let popupTimer = null;

const state = {
  deck: [],
  dealer: [],
  hands: [],
  activeHandIndex: 0,
  splitUsed: false,
  sideBets: { perfectPairs: 0, twentyOnePlus3: 0 },
  tab: 'standard',
  phase: 'idle',
  busy: false,
  handPulseIndex: null,
  sessionId: null,
};

const els = {};

function bjUsesServer() {
  return window.XythonWallet?.usesServerWallet?.() ?? false;
}

async function bjOpenSession(totalWager, detail) {
  if (!bjUsesServer()) {
    const currency = window.XythonWallet.getActiveCurrency();
    const balance = window.XythonWallet.getBalance(currency);
    return window.XythonWallet.setBalance(currency, balance - totalWager, {
      type: 'bet',
      label: 'Blackjack',
      detail,
      game: 'blackjack',
    });
  }
  const result = await window.XythonWallet.startSession({
    game: 'blackjack',
    bet: totalWager,
    currency: window.XythonWallet.getActiveCurrency(),
    tx: { label: 'Blackjack', detail, game: 'blackjack' },
  });
  if (result?.ok) state.sessionId = result.sessionId;
  return result;
}

async function bjDebit(amount, detail) {
  if (!bjUsesServer()) {
    const currency = window.XythonWallet.getActiveCurrency();
    const balance = window.XythonWallet.getBalance(currency);
    return window.XythonWallet.setBalance(currency, balance - amount, {
      type: 'bet',
      label: 'Blackjack',
      detail,
      game: 'blackjack',
    });
  }
  return window.XythonWallet.sessionDebit({
    sessionId: state.sessionId,
    amount,
    tx: { label: 'Blackjack', detail, game: 'blackjack' },
  });
}

async function bjCredit(amount, detail) {
  if (!amount) return { ok: true };
  if (!bjUsesServer()) {
    const currency = window.XythonWallet.getActiveCurrency();
    const balance = window.XythonWallet.getBalance(currency);
    return window.XythonWallet.setBalance(currency, balance + amount, {
      type: 'win',
      label: 'Blackjack',
      detail,
      game: 'blackjack',
    });
  }
  return window.XythonWallet.sessionCredit({
    sessionId: state.sessionId,
    amount,
    tx: { label: 'Blackjack', detail, game: 'blackjack' },
  });
}

async function bjSettle(payout, detail) {
  if (!bjUsesServer()) {
    if (payout > 0) await bjCredit(payout, detail);
    state.sessionId = null;
    return { ok: true };
  }
  const result = await window.XythonWallet.sessionSettle({
    sessionId: state.sessionId,
    payout,
    tx: { label: 'Blackjack', detail, game: 'blackjack' },
  });
  state.sessionId = null;
  return result;
}

document.addEventListener('DOMContentLoaded', () => {
  initCommon();

  els.bet = document.getElementById('bjBet');
  els.betCurrency = document.getElementById('bjBetCurrency');
  els.half = document.getElementById('bjHalf');
  els.doubleBet = document.getElementById('bjDouble');
  els.hit = document.getElementById('bjHit');
  els.stand = document.getElementById('bjStand');
  els.split = document.getElementById('bjSplit');
  els.doubleDown = document.getElementById('bjDoubleDown');
  els.placeBet = document.getElementById('bjPlaceBet');
  els.message = document.getElementById('bjMessage');
  els.dealerCards = document.getElementById('bjDealerCards');
  els.playerHands = document.getElementById('bjPlayerHands');
  els.dealerScore = document.getElementById('bjDealerScore');
  els.playerScore = document.getElementById('bjPlayerScore');
  els.rules = document.getElementById('bjRules');
  els.tabStandard = document.getElementById('bjTabStandard');
  els.tabSideBets = document.getElementById('bjTabSideBets');
  els.sideFields = document.getElementById('bjSideFields');
  els.perfectPairs = document.getElementById('bjPerfectPairs');
  els.perfectPairsCurrency = document.getElementById('bjPerfectPairsCurrency');
  els.perfectPairsHalf = document.getElementById('bjPerfectPairsHalf');
  els.perfectPairsDouble = document.getElementById('bjPerfectPairsDouble');
  els.twentyOnePlus3 = document.getElementById('bj21Plus3');
  els.twentyOnePlus3Currency = document.getElementById('bj21Plus3Currency');
  els.twentyOnePlus3Half = document.getElementById('bj21Plus3Half');
  els.twentyOnePlus3Double = document.getElementById('bj21Plus3Double');
  els.resultPopup = document.getElementById('bjResultPopup');
  els.resultCard = document.getElementById('bjResultCard');
  els.popupLabel = document.getElementById('bjPopupLabel');
  els.popupMain = document.getElementById('bjPopupMain');
  els.popupText = document.getElementById('bjPopupText');

  els.half.addEventListener('click', () => adjustBetInput(els.bet));
  els.doubleBet.addEventListener('click', () => doubleBetInput(els.bet));
  els.perfectPairsHalf.addEventListener('click', () => adjustBetInput(els.perfectPairs, true));
  els.perfectPairsDouble.addEventListener('click', () => doubleBetInput(els.perfectPairs, true));
  els.twentyOnePlus3Half.addEventListener('click', () => adjustBetInput(els.twentyOnePlus3, true));
  els.twentyOnePlus3Double.addEventListener('click', () => doubleBetInput(els.twentyOnePlus3, true));

  els.bet.addEventListener('input', updateBetLabels);
  els.perfectPairs.addEventListener('input', updateBetLabels);
  els.twentyOnePlus3.addEventListener('input', updateBetLabels);

  els.tabStandard.addEventListener('click', () => setTab('standard'));
  els.tabSideBets.addEventListener('click', () => setTab('sidebets'));
  els.placeBet.addEventListener('click', () => placeBet());
  els.hit.addEventListener('click', () => hit());
  els.stand.addEventListener('click', () => stand());
  els.split.addEventListener('click', () => splitHand());
  els.doubleDown.addEventListener('click', () => doubleDown());

  document.addEventListener('xython:auth-change', updateUI);

  updateBetLabels();
  updateUI();
});

function adjustBetInput(input, allowZero = false) {
  const min = allowZero ? 0 : 0.01;
  const val = (parseFloat(input.value) || 0) / 2;
  input.value = Math.max(min, val).toFixed(2);
  updateBetLabels();
}

function doubleBetInput(input) {
  input.value = ((parseFloat(input.value) || 0) * 2).toFixed(2);
  updateBetLabels();
}

function setTab(tab) {
  if (state.phase !== 'idle' || state.busy) return;
  state.tab = tab;
  els.tabStandard.classList.toggle('active', tab === 'standard');
  els.tabSideBets.classList.toggle('active', tab === 'sidebets');
  els.sideFields.hidden = tab !== 'sidebets';
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, red: suit === '♥' || suit === '♦' });
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

function draw() {
  return state.deck.pop();
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function handValue(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function hardHandValue(hand) {
  return hand.reduce((sum, c) => {
    if (c.rank === 'A') return sum + 1;
    if (['K', 'Q', 'J'].includes(c.rank)) return sum + 10;
    return sum + parseInt(c.rank, 10);
  }, 0);
}

function handValueDisplay(hand) {
  if (!hand.length) return '';
  const soft = handValue(hand);
  if (soft > 21) return String(soft);
  const hard = hardHandValue(hand);
  if (hard < soft) return `${hard}/${soft}`;
  return String(soft);
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function createHand(bet) {
  return { cards: [], bet, doubled: false, done: false, splitAce: false };
}

function getActiveHand() {
  return state.hands[state.activeHandIndex] || null;
}

function getMainHand() {
  return state.hands[0] || null;
}

function canSplitPair(cards) {
  if (cards.length !== 2) return false;
  if (cards[0].rank === cards[1].rank) return true;
  return cardValue(cards[0]) === 10 && cardValue(cards[1]) === 10;
}

function canSplit() {
  if (state.phase !== 'playing' || state.busy || state.splitUsed) return false;
  const hand = getActiveHand();
  if (!hand || hand.done || hand.cards.length !== 2 || hand.doubled) return false;
  if (!canSplitPair(hand.cards)) return false;
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  return hand.bet > 0 && hand.bet <= balance;
}

function totalMainWager() {
  return state.hands.reduce((sum, hand) => sum + hand.bet, 0);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderCard(card, hidden = false) {
  const div = document.createElement('div');
  div.className = 'bj-card' + (hidden ? ' hidden' : card.red ? ' red' : '');
  if (!hidden) {
    div.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
  }
  return div;
}

function clearTable() {
  state.hands = [];
  state.activeHandIndex = 0;
  state.splitUsed = false;
  state.dealer = [];
  els.dealerCards.innerHTML = '';
  if (els.playerHands) els.playerHands.innerHTML = '';
  els.dealerScore.textContent = '';
  els.playerScore.textContent = '';
  els.rules.classList.remove('hidden');
}

function renderPlayerHands() {
  if (!els.playerHands) return;
  els.playerHands.innerHTML = '';
  const isSplit = state.hands.length > 1;
  els.playerHands.classList.toggle('is-split', isSplit);

  state.hands.forEach((hand, index) => {
    const slot = document.createElement('div');
    slot.className = 'bj-hand-slot';
    const isActive = index === state.activeHandIndex && state.phase === 'playing' && !hand.done;
    const isWaiting = isSplit && !isActive && !hand.done;
    if (isActive) slot.classList.add('is-active');
    if (hand.done) slot.classList.add('is-done');
    if (isWaiting) slot.classList.add('is-waiting');
    if (index === state.handPulseIndex) slot.classList.add('is-focus-pop');

    if (isSplit) {
      const head = document.createElement('div');
      head.className = 'bj-hand-slot-head';

      const pill = document.createElement('span');
      pill.className = 'bj-hand-slot-pill';
      pill.textContent = `Hand ${index + 1}`;

      const bet = document.createElement('span');
      bet.className = 'bj-hand-slot-bet';
      bet.textContent = `$${hand.bet.toFixed(2)}`;

      head.appendChild(pill);
      head.appendChild(bet);
      slot.appendChild(head);

      if (hand.cards.length) {
        const score = document.createElement('div');
        score.className = 'bj-hand-slot-score';
        score.textContent = handValueDisplay(hand.cards);
        slot.appendChild(score);
      }
    }

    const cardsEl = document.createElement('div');
    cardsEl.className = 'bj-cards';
    hand.cards.forEach(card => cardsEl.appendChild(renderCard(card)));
    slot.appendChild(cardsEl);

    if (isSplit) {
      if (isActive) {
        const status = document.createElement('div');
        status.className = 'bj-hand-slot-status';
        status.textContent = 'Playing';
        slot.appendChild(status);
      } else if (hand.done) {
        const status = document.createElement('div');
        status.className = 'bj-hand-slot-status bj-hand-slot-status--done';
        status.textContent = handValue(hand.cards) > 21 ? 'Bust' : 'Done';
        slot.appendChild(status);
      } else if (isWaiting) {
        const status = document.createElement('div');
        status.className = 'bj-hand-slot-status bj-hand-slot-status--waiting';
        status.textContent = 'Waiting';
        slot.appendChild(status);
      }
    }

    els.playerHands.appendChild(slot);
  });

  const active = getActiveHand();
  if (isSplit && active?.cards.length) {
    els.playerScore.textContent = `Hand ${state.activeHandIndex + 1} · ${handValueDisplay(active.cards)}`;
  } else {
    els.playerScore.textContent = active?.cards.length ? handValueDisplay(active.cards) : '';
  }
}

function appendPlayerCard(card, handIndex = state.activeHandIndex) {
  const hand = state.hands[handIndex];
  if (!hand) return;
  hand.cards.push(card);
  renderPlayerHands();
  els.rules.classList.add('hidden');
}

function appendDealerCard(card, hidden = false) {
  state.dealer.push(card);
  els.dealerCards.appendChild(renderCard(card, hidden));
  updateDealerScore(hidden && state.dealer.length === 2);
}

function updateDealerScore(hideHole = false) {
  if (hideHole && state.dealer.length >= 1) {
    els.dealerScore.textContent = cardValue(state.dealer[0]);
  } else {
    els.dealerScore.textContent = handValueDisplay(state.dealer) || '';
  }
}

async function revealDealerHoleCard() {
  const hole = els.dealerCards.children[1];
  if (!hole || !hole.classList.contains('hidden')) {
    updateDealerScore(false);
    return;
  }
  const card = state.dealer[1];
  hole.classList.add('bj-card--flip');
  await wait(200);
  hole.className = 'bj-card bj-card--flip' + (card.red ? ' red' : '');
  hole.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
  updateDealerScore(false);
  await wait(250);
}

function setMessage(text, type = '') {
  els.message.textContent = text;
  els.message.className = 'bj-message' + (type ? ` ${type}` : '');
}

function hidePopup() {
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
  els.resultPopup?.classList.remove('is-visible');
  if (els.resultPopup) els.resultPopup.hidden = true;
}

function showResultPopup(result, payout, wager) {
  hidePopup();

  const profit = payout - wager;
  if (result === 'blackjack') {
    els.popupLabel.textContent = 'Blackjack!';
    els.popupMain.textContent = '3:2';
    els.popupText.textContent = `+$${profit.toFixed(2)}`;
    els.resultCard.className = 'bj-result-popup-card bj-result-popup-card--win';
  } else if (result === 'win') {
    els.popupLabel.textContent = 'You Win!';
    els.popupMain.textContent = '2:1';
    els.popupText.textContent = `+$${profit.toFixed(2)}`;
    els.resultCard.className = 'bj-result-popup-card bj-result-popup-card--win';
  } else if (result === 'push') {
    els.popupLabel.textContent = 'Push';
    els.popupMain.textContent = 'Tie';
    els.popupText.textContent = `$${payout.toFixed(2)} returned`;
    els.resultCard.className = 'bj-result-popup-card bj-result-popup-card--push';
  } else {
    els.popupLabel.textContent = 'You Lose';
    els.popupMain.textContent = 'Dealer Wins';
    els.popupText.textContent = `-$${wager.toFixed(2)}`;
    els.resultCard.className = 'bj-result-popup-card bj-result-popup-card--lose';
  }

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

function updateBetLabels() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const fmt = val => `${parseFloat(val || 0).toFixed(2)} ${currency}`;
  els.betCurrency.textContent = fmt(els.bet.value);
  els.perfectPairsCurrency.textContent = fmt(els.perfectPairs.value);
  els.twentyOnePlus3Currency.textContent = fmt(els.twentyOnePlus3.value);
}

function getSideBetAmounts() {
  if (state.tab !== 'sidebets') return { perfectPairs: 0, twentyOnePlus3: 0 };
  return {
    perfectPairs: Math.max(0, parseFloat(els.perfectPairs.value) || 0),
    twentyOnePlus3: Math.max(0, parseFloat(els.twentyOnePlus3.value) || 0),
  };
}

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function isStraight(ranks) {
  const sorted = [...ranks].sort((a, b) => a - b);
  if (sorted[2] - sorted[1] === 1 && sorted[1] - sorted[0] === 1) return true;
  return sorted[0] === 0 && sorted[1] === 11 && sorted[2] === 12;
}

function evaluatePerfectPairs(card1, card2) {
  if (card1.rank !== card2.rank) return null;
  if (card1.suit === card2.suit) return { name: 'Perfect Pair', mult: 25 };
  const sameColor = card1.red === card2.red;
  if (sameColor) return { name: 'Colored Pair', mult: 10 };
  return { name: 'Mixed Pair', mult: 6 };
}

function evaluate21Plus3(p1, p2, dealerUp) {
  const cards = [p1, p2, dealerUp];
  const ranks = cards.map(c => rankIndex(c.rank));
  const sameSuit = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const threeKind = cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;
  const straight = isStraight(ranks);

  if (threeKind && sameSuit) return { name: 'Suited Three of a Kind', mult: 100 };
  if (straight && sameSuit) return { name: 'Straight Flush', mult: 40 };
  if (threeKind) return { name: 'Three of a Kind', mult: 30 };
  if (straight) return { name: 'Straight', mult: 10 };
  if (sameSuit) return { name: 'Flush', mult: 5 };
  return null;
}

async function paySideBet(bet, result, currency) {
  if (!bet || !result) return 0;
  const payout = bet * (result.mult + 1);
  await bjCredit(payout, `${result.name} side bet — $${payout.toFixed(2)}`);
  return payout;
}

async function resolveSideBets() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const wins = [];
  let totalSidePayout = 0;

  if (state.sideBets.perfectPairs > 0) {
    const main = getMainHand();
    if (!main || main.cards.length < 2) return { wins, totalSidePayout };
    const result = evaluatePerfectPairs(main.cards[0], main.cards[1]);
    if (result) {
      const payout = await paySideBet(state.sideBets.perfectPairs, result, currency);
      totalSidePayout += payout;
      wins.push(`Perfect Pairs ${result.name} ${result.mult}:1 (+$${payout.toFixed(2)})`);
    }
  }

  if (state.sideBets.twentyOnePlus3 > 0) {
    const main = getMainHand();
    if (!main || main.cards.length < 2) return { wins, totalSidePayout };
    const result = evaluate21Plus3(main.cards[0], main.cards[1], state.dealer[0]);
    if (result) {
      const payout = await paySideBet(state.sideBets.twentyOnePlus3, result, currency);
      totalSidePayout += payout;
      wins.push(`21+3 ${result.name} ${result.mult}:1 (+$${payout.toFixed(2)})`);
    }
  }

  return { wins, totalSidePayout };
}

function updateUI() {
  const playing = state.phase === 'playing' && !state.busy;
  const locked = state.busy || state.phase === 'dealing' || state.phase === 'dealer';
  const loggedIn = window.XythonAuth?.isLoggedIn?.() ?? false;
  const activeHand = getActiveHand();
  els.placeBet.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.hit.disabled = !playing || !activeHand || activeHand.done;
  els.stand.disabled = !playing || !activeHand || activeHand.done;
  els.doubleDown.disabled = !(playing && activeHand && activeHand.cards.length === 2 && !activeHand.doubled && !activeHand.done);
  els.split.disabled = !canSplit();
  els.placeBet.disabled = locked || state.phase === 'playing' || state.phase === 'dealer';
  els.bet.disabled = locked || state.phase === 'playing' || state.phase === 'dealer';
  els.half.disabled = locked || state.phase === 'playing';
  els.doubleBet.disabled = locked || state.phase === 'playing';
  els.tabStandard.disabled = locked || state.phase === 'playing' || state.phase === 'dealer';
  els.tabSideBets.disabled = locked || state.phase === 'playing' || state.phase === 'dealer';
  const sideLocked = locked || state.phase === 'playing' || state.phase === 'dealer';
  els.perfectPairs.disabled = sideLocked;
  els.twentyOnePlus3.disabled = sideLocked;
  els.perfectPairsHalf.disabled = sideLocked;
  els.perfectPairsDouble.disabled = sideLocked;
  els.twentyOnePlus3Half.disabled = sideLocked;
  els.twentyOnePlus3Double.disabled = sideLocked;
  updateBetLabels();
}

async function placeBet() {
  if (state.busy) return;

  if (!window.XythonAuth?.requireAuth?.('register')) {
    setMessage('Register to place bets', 'lose');
    return;
  }

  const bet = parseFloat(els.bet.value);
  if (!bet || bet <= 0) {
    setMessage('Enter a valid bet amount', 'lose');
    return;
  }

  const sideBets = getSideBetAmounts();
  const totalWager = bet + sideBets.perfectPairs + sideBets.twentyOnePlus3;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (totalWager > balance) {
    setMessage('Insufficient balance — deposit first', 'lose');
    return;
  }

  const debitResult = await bjOpenSession(totalWager, `Bet $${totalWager.toFixed(2)}`);
  if (!debitResult?.ok) {
    setMessage(debitResult?.error || 'Could not place bet', 'lose');
    return;
  }

  state.sideBets = sideBets;
  state.deck = shuffle(createDeck());
  state.phase = 'dealing';
  state.busy = true;
  hidePopup();
  setMessage('');
  clearTable();
  state.hands = [createHand(bet)];
  state.activeHandIndex = 0;
  state.splitUsed = false;
  updateUI();

  await wait(250);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);
  appendDealerCard(draw());
  await wait(DEAL_DELAY);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);
  appendDealerCard(draw(), true);

  const sideResult = await resolveSideBets();
  if (sideResult.wins.length) {
    setMessage(sideResult.wins.join(' • '), 'win');
    await wait(900);
  }

  state.phase = 'playing';
  state.busy = false;
  updateUI();

  if (isBlackjack(getMainHand()?.cards || [])) {
    state.busy = true;
    updateUI();
    await wait(500);
    await revealDealerHoleCard();
    if (isBlackjack(state.dealer)) {
      await finishRound('push', 'Both blackjack — push');
    } else {
      await finishRound('blackjack');
    }
    updateUI();
  }
}

async function hit() {
  if (state.phase !== 'playing' || state.busy) return;
  const hand = getActiveHand();
  if (!hand || hand.done) return;
  state.busy = true;
  updateUI();

  await wait(300);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);

  if (handValue(hand.cards) > 21) {
    hand.done = true;
    await advanceToNextHand();
    return;
  }
  state.busy = false;
  updateUI();
}

async function stand() {
  if (state.phase !== 'playing' || state.busy) return;
  const hand = getActiveHand();
  if (!hand || hand.done) return;
  state.busy = true;
  hand.done = true;
  updateUI();
  await advanceToNextHand();
}

async function splitHand() {
  if (!canSplit()) return;

  const hand = getActiveHand();
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  const splitBet = hand.bet;

  state.busy = true;
  updateUI();

  const debitResult = await bjDebit(splitBet, `Split — $${splitBet.toFixed(2)}`);
  if (!debitResult?.ok) {
    state.busy = false;
    updateUI();
    setMessage(debitResult?.error || 'Could not place bet', 'lose');
    return;
  }

  const card0 = hand.cards[0];
  const card1 = hand.cards[1];
  const isAces = card0.rank === 'A';

  state.hands = [
    { cards: [card0], bet: splitBet, doubled: false, done: false, splitAce: isAces },
    { cards: [card1], bet: splitBet, doubled: false, done: false, splitAce: isAces },
  ];
  state.activeHandIndex = 0;
  state.splitUsed = true;
  renderPlayerHands();

  await wait(300);
  appendPlayerCard(draw(), 0);
  await wait(DEAL_DELAY);
  appendPlayerCard(draw(), 1);
  await wait(DEAL_DELAY);

  if (isAces) {
    state.hands.forEach(h => { h.done = true; });
    await dealerTurn();
    return;
  }

  if (handValue(state.hands[0].cards) > 21) state.hands[0].done = true;
  if (handValue(state.hands[1].cards) > 21) state.hands[1].done = true;

  if (state.hands.every(h => h.done)) {
    await advanceToNextHand();
    return;
  }

  state.activeHandIndex = state.hands.findIndex(h => !h.done);
  state.busy = false;
  updateUI();
}

async function advanceToNextHand() {
  const nextIndex = state.hands.findIndex((hand, index) => !hand.done && index > state.activeHandIndex);
  if (nextIndex >= 0) {
    state.activeHandIndex = nextIndex;
    state.handPulseIndex = nextIndex;
    state.busy = false;
    renderPlayerHands();
    updateUI();
    setTimeout(() => {
      if (state.handPulseIndex === nextIndex) {
        state.handPulseIndex = null;
        renderPlayerHands();
      }
    }, 650);
    return;
  }

  renderPlayerHands();
  await dealerTurn();
}

async function doubleDown() {
  const hand = getActiveHand();
  if (state.phase !== 'playing' || state.busy || !hand || hand.cards.length !== 2 || hand.doubled || hand.done) return;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (hand.bet > balance) {
    setMessage('Insufficient balance to double', 'lose');
    return;
  }

  state.busy = true;
  updateUI();
  const debitResult = await bjDebit(hand.bet, `Double down — $${hand.bet.toFixed(2)}`);
  if (!debitResult?.ok) {
    state.busy = false;
    updateUI();
    setMessage(debitResult?.error || 'Could not place bet', 'lose');
    return;
  }
  hand.bet *= 2;
  hand.doubled = true;

  await wait(300);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);

  hand.done = true;
  if (handValue(hand.cards) > 21) {
    await advanceToNextHand();
    return;
  }
  await advanceToNextHand();
}

async function dealerTurn() {
  state.phase = 'dealer';
  state.busy = true;
  updateUI();

  await wait(400);
  await revealDealerHoleCard();
  await wait(DEAL_DELAY);

  while (handValue(state.dealer) < 17) {
    appendDealerCard(draw());
    await wait(DEAL_DELAY);
  }

  await finishHands();
  updateUI();
}

function resolveHandResult(hand, dealerTotal) {
  const playerTotal = handValue(hand.cards);
  const wager = hand.bet;

  if (playerTotal > 21) return { result: 'lose', payout: 0, wager };
  if (dealerTotal > 21) return { result: 'win', payout: wager * 2, wager };
  if (playerTotal > dealerTotal) return { result: 'win', payout: wager * 2, wager };
  if (playerTotal < dealerTotal) return { result: 'lose', payout: 0, wager };
  return { result: 'push', payout: wager, wager };
}

async function finishHands() {
  state.phase = 'idle';
  state.busy = false;
  updateDealerScore(false);
  renderPlayerHands();

  const dealerTotal = handValue(state.dealer);
  const outcomes = state.hands.map((hand, index) => ({
    index,
    ...resolveHandResult(hand, dealerTotal),
  }));

  const totalWager = outcomes.reduce((sum, item) => sum + item.wager, 0);
  const totalPayout = outcomes.reduce((sum, item) => sum + item.payout, 0);
  const wins = outcomes.filter(item => item.result === 'win').length;
  const losses = outcomes.filter(item => item.result === 'lose').length;
  const pushes = outcomes.filter(item => item.result === 'push').length;

  let result = 'push';
  if (wins && !losses) result = 'win';
  else if (losses && !wins && !pushes) result = 'lose';
  else if (totalPayout > totalWager) result = 'win';
  else if (totalPayout < totalWager) result = 'lose';

  if (state.hands.length > 1) {
    const parts = outcomes.map(item => {
      const label = item.result === 'win' ? 'Win' : item.result === 'lose' ? 'Loss' : 'Push';
      return `Hand ${item.index + 1}: ${label}`;
    });
    const summary = `${wins}W-${losses}L${pushes ? `-${pushes}P` : ''}`;
    if (totalPayout > totalWager) {
      setMessage(`${summary} · ${parts.join(' • ')} · +$${(totalPayout - totalWager).toFixed(2)}`, 'win');
    } else if (totalPayout < totalWager) {
      setMessage(`${summary} · ${parts.join(' • ')} · -$${(totalWager - totalPayout).toFixed(2)}`, 'lose');
    } else {
      setMessage(`${summary} · ${parts.join(' • ')}`, 'push');
    }
  } else {
    const single = outcomes[0];
    if (single.result === 'win') setMessage(`You win $${single.payout.toFixed(2)}`, 'win');
    else if (single.result === 'push') setMessage('Push — bet returned', 'push');
    else setMessage('You lose', 'lose');
  }

  showResultPopup(result, totalPayout, totalWager);

  await bjSettle(totalPayout, result === 'push'
    ? `Push — $${totalPayout.toFixed(2)} returned`
    : `Win — $${totalPayout.toFixed(2)}`);

  const sideWager = (state.sideBets?.perfectPairs || 0) + (state.sideBets?.twentyOnePlus3 || 0);
  const allWager = totalWager + sideWager;
  const won = totalPayout > totalWager ? true : totalPayout < totalWager ? false : null;
  window.XythonStats?.recordRound?.(allWager, won, { game: 'blackjack', payout: totalPayout });

  state.hands = [];
  state.sideBets = { perfectPairs: 0, twentyOnePlus3: 0 };
  updateUI();
}

async function finishRound(result, msg) {
  state.phase = 'idle';
  state.busy = false;
  updateDealerScore(false);
  renderPlayerHands();

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const hand = getMainHand();
  const wager = hand?.bet || 0;
  let payout = 0;

  if (result === 'blackjack') {
    payout = wager * 2.5;
    setMessage(`Blackjack! You win $${payout.toFixed(2)}`, 'win');
  } else if (result === 'win') {
    payout = wager * 2;
    setMessage(msg || `You win $${payout.toFixed(2)}`, 'win');
  } else if (result === 'push') {
    payout = wager;
    setMessage(msg || 'Push — bet returned', 'push');
  } else {
    payout = 0;
    setMessage(msg || 'You lose', 'lose');
  }

  showResultPopup(result, payout, wager);

  await bjSettle(payout, result === 'push'
    ? `Push — $${payout.toFixed(2)} returned`
    : `${result === 'blackjack' ? 'Blackjack' : 'Win'} — $${payout.toFixed(2)}`);

  const sideWager = (state.sideBets?.perfectPairs || 0) + (state.sideBets?.twentyOnePlus3 || 0);
  const totalWager = wager + sideWager;
  const won = result === 'blackjack' || result === 'win'
    ? true
    : result === 'lose'
      ? false
      : null;
  window.XythonStats?.recordRound?.(totalWager, won, { game: 'blackjack', payout });

  state.hands = [];
  state.sideBets = { perfectPairs: 0, twentyOnePlus3: 0 };
  updateUI();
}
