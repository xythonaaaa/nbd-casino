const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const DEAL_DELAY = 550;
const POPUP_MS = 2800;

let popupTimer = null;

const state = {
  deck: [],
  player: [],
  dealer: [],
  bet: 0,
  sideBets: { perfectPairs: 0, twentyOnePlus3: 0 },
  tab: 'standard',
  phase: 'idle',
  doubled: false,
  busy: false,
};

const els = {};

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
  els.playerCards = document.getElementById('bjPlayerCards');
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

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
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
  state.player = [];
  state.dealer = [];
  els.dealerCards.innerHTML = '';
  els.playerCards.innerHTML = '';
  els.dealerScore.textContent = '';
  els.playerScore.textContent = '';
  els.rules.classList.remove('hidden');
}

function appendPlayerCard(card) {
  state.player.push(card);
  els.playerCards.appendChild(renderCard(card));
  els.playerScore.textContent = handValue(state.player);
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
    els.dealerScore.textContent = handValue(state.dealer) || '';
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

function paySideBet(bet, result, currency) {
  if (!bet || !result) return 0;
  const payout = bet * (result.mult + 1);
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  window.XythonWallet?.setBalance(currency, balance + payout, {
    type: 'win',
    label: 'Blackjack',
    detail: `${result.name} side bet — $${payout.toFixed(2)}`,
    game: 'blackjack',
  });
  return payout;
}

function resolveSideBets() {
  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const wins = [];
  let totalSidePayout = 0;

  if (state.sideBets.perfectPairs > 0) {
    const result = evaluatePerfectPairs(state.player[0], state.player[1]);
    if (result) {
      const payout = paySideBet(state.sideBets.perfectPairs, result, currency);
      totalSidePayout += payout;
      wins.push(`Perfect Pairs ${result.name} ${result.mult}:1 (+$${payout.toFixed(2)})`);
    }
  }

  if (state.sideBets.twentyOnePlus3 > 0) {
    const result = evaluate21Plus3(state.player[0], state.player[1], state.dealer[0]);
    if (result) {
      const payout = paySideBet(state.sideBets.twentyOnePlus3, result, currency);
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
  els.placeBet.textContent = loggedIn ? 'Place Bet' : 'Register to Bet';
  els.hit.disabled = !playing;
  els.stand.disabled = !playing;
  els.doubleDown.disabled = !(playing && state.player.length === 2 && !state.doubled);
  els.split.disabled = true;
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

  window.XythonWallet?.setBalance(currency, balance - totalWager, {
    type: 'bet',
    label: 'Blackjack',
    detail: `Bet $${totalWager.toFixed(2)}`,
    game: 'blackjack',
  });

  state.bet = bet;
  state.sideBets = sideBets;
  state.doubled = false;
  state.deck = shuffle(createDeck());
  state.phase = 'dealing';
  state.busy = true;
  hidePopup();
  setMessage('');
  clearTable();
  updateUI();

  await wait(250);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);
  appendDealerCard(draw());
  await wait(DEAL_DELAY);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);
  appendDealerCard(draw(), true);

  const sideResult = resolveSideBets();
  if (sideResult.wins.length) {
    setMessage(sideResult.wins.join(' • '), 'win');
    await wait(900);
  }

  state.phase = 'playing';
  state.busy = false;
  updateUI();

  if (isBlackjack(state.player)) {
    state.busy = true;
    updateUI();
    await wait(500);
    await revealDealerHoleCard();
    if (isBlackjack(state.dealer)) {
      finishRound('push', 'Both blackjack — push');
    } else {
      finishRound('blackjack');
    }
    updateUI();
  }
}

async function hit() {
  if (state.phase !== 'playing' || state.busy) return;
  state.busy = true;
  updateUI();

  await wait(300);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);

  if (handValue(state.player) > 21) {
    await revealDealerHoleCard();
    finishRound('lose', 'Bust — you lose');
    return;
  }
  state.busy = false;
  updateUI();
}

async function stand() {
  if (state.phase !== 'playing' || state.busy) return;
  await dealerTurn();
}

async function doubleDown() {
  if (state.phase !== 'playing' || state.busy || state.player.length !== 2 || state.doubled) return;

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const balance = window.XythonWallet?.getBalance(currency) ?? 0;
  if (state.bet > balance) {
    setMessage('Insufficient balance to double', 'lose');
    return;
  }

  state.busy = true;
  updateUI();
  window.XythonWallet?.setBalance(currency, balance - state.bet, {
    type: 'bet',
    label: 'Blackjack',
    detail: `Double down — $${state.bet.toFixed(2)}`,
    game: 'blackjack',
  });
  state.bet *= 2;
  state.doubled = true;

  await wait(300);
  appendPlayerCard(draw());
  await wait(DEAL_DELAY);

  if (handValue(state.player) > 21) {
    await revealDealerHoleCard();
    finishRound('lose', 'Bust — you lose');
    return;
  }
  await dealerTurn();
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

  const p = handValue(state.player);
  const d = handValue(state.dealer);

  if (d > 21) finishRound('win', 'Dealer bust — you win!');
  else if (p > d) finishRound('win', 'You win!');
  else if (p < d) finishRound('lose', 'Dealer wins');
  else finishRound('push', 'Push');

  updateUI();
}

function finishRound(result, msg) {
  state.phase = 'idle';
  state.busy = false;
  updateDealerScore(false);
  els.playerScore.textContent = handValue(state.player) || '';

  const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
  const wager = state.bet;
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

  if (payout > 0) {
    const balance = window.XythonWallet?.getBalance(currency) ?? 0;
    window.XythonWallet?.setBalance(currency, balance + payout, {
      type: 'win',
      label: 'Blackjack',
      detail: result === 'push'
        ? `Push — $${payout.toFixed(2)} returned`
        : `${result === 'blackjack' ? 'Blackjack' : 'Win'} — $${payout.toFixed(2)}`,
      game: 'blackjack',
    });
  }

  const totalWager = state.bet
    + (state.sideBets?.perfectPairs || 0)
    + (state.sideBets?.twentyOnePlus3 || 0);
  const won = result === 'blackjack' || result === 'win'
    ? true
    : result === 'lose'
      ? false
      : null;
  window.XythonStats?.recordRound?.(totalWager, won, { game: 'blackjack', payout });

  state.bet = 0;
  state.sideBets = { perfectPairs: 0, twentyOnePlus3: 0 };
  updateUI();
}
