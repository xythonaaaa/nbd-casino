const PLINKO_MULTIPLIERS = {
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

const DICE_HOUSE_EDGE = 0.99;
const LIMBO_HOUSE_EDGE = 0.99;
const LIMBO_MIN_TARGET = 1.01;
const COINFLIP_PAYOUT_MULT = 2;
const WHEEL_HOUSE_EDGE = 0.94;

const WHEEL_RISKS = {
  low: [
    { mult: 0, weight: 3 }, { mult: 0, weight: 3 }, { mult: 1.1, weight: 2 },
    { mult: 1.2, weight: 2 }, { mult: 0, weight: 3 }, { mult: 1.3, weight: 1.5 },
    { mult: 1.5, weight: 1.2 }, { mult: 0, weight: 3 }, { mult: 2, weight: 0.6 },
    { mult: 3, weight: 0.25 },
  ],
  medium: [
    { mult: 0, weight: 4 }, { mult: 0, weight: 4 }, { mult: 0, weight: 3 },
    { mult: 1.2, weight: 1.5 }, { mult: 1.5, weight: 1.2 }, { mult: 0, weight: 3 },
    { mult: 2, weight: 0.9 }, { mult: 3, weight: 0.5 }, { mult: 5, weight: 0.2 },
    { mult: 8, weight: 0.08 },
  ],
  hard: [
    { mult: 0, weight: 5 }, { mult: 0, weight: 5 }, { mult: 0, weight: 4 },
    { mult: 0, weight: 4 }, { mult: 0, weight: 4 }, { mult: 0, weight: 3 },
    { mult: 1.5, weight: 1.2 }, { mult: 3, weight: 0.7 }, { mult: 30, weight: 0.08 },
  ],
};

const SESSION_TTL_MS = 15 * 60 * 1000;

function random() {
  return Math.random();
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= items[i].weight || 1;
    if (roll <= 0) return i;
  }
  return items.length - 1;
}

function plinkoSlotIndex(rows) {
  let rights = 0;
  for (let i = 0; i < rows; i++) {
    if (random() < 0.5) rights += 1;
  }
  return rights;
}

function buildPathForSlot(rows, slotIndex) {
  const ones = Math.min(rows, Math.max(0, slotIndex));
  const path = [...Array(ones).fill(1), ...Array(rows - ones).fill(0)];
  for (let i = path.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [path[i], path[j]] = [path[j], path[i]];
  }
  return path;
}

function diceMultiplier(mode, target) {
  const t = parseFloat(target);
  const chance = mode === 'under' ? t : 100 - t;
  if (chance <= 0.01 || chance >= 99.99) return 0;
  return (DICE_HOUSE_EDGE * 100) / chance;
}

function limboResult() {
  const r = random();
  if (r >= 1) return 1;
  const result = LIMBO_HOUSE_EDGE / (1 - r);
  return Math.max(1, Math.floor(result * 100) / 100);
}

function shuffle(values) {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function cleanSessions(meta) {
  if (!meta?.sessions || typeof meta.sessions !== 'object') {
    meta.sessions = {};
    return;
  }
  const now = Date.now();
  Object.keys(meta.sessions).forEach(id => {
    const session = meta.sessions[id];
    if (!session || now - (session.createdAt || 0) > SESSION_TTL_MS) {
      delete meta.sessions[id];
    }
  });
}

export function resolveGameRound(game, bet, params = {}) {
  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { error: 'Invalid bet amount' };

  switch (game) {
    case 'plinko': {
      const rows = Math.min(16, Math.max(8, parseInt(params.rows, 10) || 16));
      const risk = ['low', 'medium', 'high'].includes(params.risk) ? params.risk : 'medium';
      const mults = PLINKO_MULTIPLIERS[rows]?.[risk] || PLINKO_MULTIPLIERS[16].medium;
      const slotIndex = plinkoSlotIndex(rows);
      const multiplier = mults[slotIndex] ?? 0;
      const payout = amt * multiplier;
      return {
        payout,
        data: {
          rows,
          risk,
          slotIndex,
          multiplier,
          path: buildPathForSlot(rows, slotIndex),
          won: multiplier >= 1,
        },
      };
    }
    case 'dice': {
      const mode = params.mode === 'over' ? 'over' : 'under';
      const target = Math.min(99.99, Math.max(0.01, parseFloat(params.target) || 50));
      const roll = Math.floor(random() * 10000) / 100;
      const won = mode === 'under' ? roll < target : roll > target;
      const multiplier = diceMultiplier(mode, target);
      const payout = won ? amt * multiplier : 0;
      return {
        payout,
        data: { mode, target, roll, multiplier, won },
      };
    }
    case 'limbo': {
      const target = Math.max(LIMBO_MIN_TARGET, parseFloat(params.target) || LIMBO_MIN_TARGET);
      const result = limboResult();
      const won = result >= target;
      const payout = won ? amt * target : 0;
      return {
        payout,
        data: { target, result, won },
      };
    }
    case 'coinflip': {
      const side = params.side === 'tails' ? 'tails' : 'heads';
      const outcome = random() < 0.5 ? 'heads' : 'tails';
      const won = outcome === side;
      const payout = won ? amt * COINFLIP_PAYOUT_MULT : 0;
      return {
        payout,
        data: { side, outcome, won, multiplier: COINFLIP_PAYOUT_MULT },
      };
    }
    case 'wheel': {
      const risk = ['low', 'medium', 'hard'].includes(params.risk) ? params.risk : 'medium';
      const slices = WHEEL_RISKS[risk] || WHEEL_RISKS.medium;
      const index = pickWeighted(slices);
      const slice = slices[index];
      const effectiveMult = slice.mult > 0 ? slice.mult * WHEEL_HOUSE_EDGE : 0;
      const payout = amt * effectiveMult;
      return {
        payout,
        data: { risk, index, multiplier: slice.mult, effectiveMult, won: payout > amt },
      };
    }
    case 'keno': {
      const picks = Array.isArray(params.picks)
        ? params.picks.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= KENO_TOTAL_NUMBERS)
        : [];
      const unique = [...new Set(picks)].slice(0, 10);
      if (!unique.length) return { error: 'Pick at least one number' };
      const drawn = drawKenoNumbers();
      const hits = unique.filter(n => drawn.includes(n)).length;
      const multiplier = kenoMultiplier(unique.length, hits);
      const payout = amt * multiplier;
      return {
        payout,
        data: { picks: unique, drawn, hits, multiplier, won: multiplier > 0 },
      };
    }
    default:
      return { error: 'Unsupported game' };
  }
}

export function startGameSession(game, bet, params = {}) {
  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { error: 'Invalid bet amount' };

  const sessionId = createSessionId();
  const now = Date.now();

  if (game === 'mines') {
    const mines = Math.min(24, Math.max(1, parseInt(params.mines, 10) || 3));
    const gridSize = 25;
    const indices = shuffle(Array.from({ length: gridSize }, (_, i) => i));
    return {
      sessionId,
      state: {
        game,
        bet: amt,
        mines,
        mineSet: indices.slice(0, mines),
        revealed: [],
        gemsFound: 0,
        createdAt: now,
      },
    };
  }

  if (game === 'crash') {
    const r = random();
    const crashPoint = Math.max(1, Math.floor((1 / (1 - Math.min(0.999, r))) * 100) / 100);
    return {
      sessionId,
      state: {
        game,
        bet: amt,
        crashPoint: Math.min(crashPoint, 1000),
        cashedOut: false,
        createdAt: now,
      },
    };
  }

  return { error: 'Unsupported session game' };
}

export function actGameSession(session, action, params = {}) {
  if (!session) return { error: 'Session not found' };
  if (Date.now() - (session.createdAt || 0) > SESSION_TTL_MS) return { error: 'Session expired' };

  if (session.game === 'mines') {
    if (action === 'reveal') {
      const index = parseInt(params.index, 10);
      if (!Number.isInteger(index) || index < 0 || index >= 25) return { error: 'Invalid tile' };
      if (session.revealed.includes(index)) return { error: 'Already revealed' };
      session.revealed.push(index);
      if (session.mineSet.includes(index)) {
        return {
          done: true,
          payout: 0,
          data: { hitMine: true, index, gemsFound: session.gemsFound, mineSet: session.mineSet },
        };
      }
      session.gemsFound += 1;
      return {
        done: false,
        payout: 0,
        data: { hitMine: false, index, gemsFound: session.gemsFound },
      };
    }
    if (action === 'cashout') {
      const mult = getMinesMultiplier(session.mines, session.gemsFound);
      const payout = session.bet * mult;
      return {
        done: true,
        payout,
        data: { hitMine: false, gemsFound: session.gemsFound, multiplier: mult, mineSet: session.mineSet },
      };
    }
    return { error: 'Invalid mines action' };
  }

  if (session.game === 'crash') {
    if (action === 'cashout') {
      if (session.cashedOut) return { error: 'Already cashed out' };
      const mult = Math.max(1, parseFloat(params.multiplier) || 1);
      if (mult >= session.crashPoint) return { error: 'Crashed' };
      session.cashedOut = true;
      const payout = session.bet * mult;
      return {
        done: true,
        payout,
        data: { multiplier: mult, crashPoint: session.crashPoint, won: true },
      };
    }
    if (action === 'crash') {
      return {
        done: true,
        payout: 0,
        data: { crashPoint: session.crashPoint, won: false },
      };
    }
    return { error: 'Invalid crash action' };
  }

  return { error: 'Unsupported session game' };
}

function getMinesMultiplier(mines, gemsFound) {
  if (gemsFound <= 0) return 0;
  const gridSize = 25;
  let mult = 1;
  for (let i = 0; i < gemsFound; i++) {
    const safeRemaining = gridSize - mines - i;
    const tilesRemaining = gridSize - i;
    if (safeRemaining <= 0 || tilesRemaining <= 0) break;
    mult *= tilesRemaining / safeRemaining;
  }
  return Math.floor(mult * 0.99 * 10000) / 10000;
}

const KENO_PAYTABLE = {
  1: [0, 3.95],
  2: [0, 0, 17],
  3: [0, 0, 2.3, 55.5],
  4: [0, 0, 1.25, 9.95, 145],
  5: [0, 0, 0.78, 4.65, 28, 355],
  6: [0, 0, 0.68, 2.7, 9.45, 81, 785],
  7: [0, 0, 0.7, 1.4, 5.6, 28, 210, 1120],
  8: [0, 0, 0.69, 1.4, 2.8, 11, 55.5, 345, 1670],
  9: [0, 0, 0.61, 1.2, 2.45, 4.85, 18.5, 97.5, 485, 2430],
  10: [0, 0, 0, 0, 3.2, 6.3, 26.5, 105, 525, 2100, 5270],
};
const KENO_HOUSE_EDGE = 0.86;
const KENO_DRAW_COUNT = 10;
const KENO_TOTAL_NUMBERS = 40;

function kenoMultiplier(picks, hits) {
  const table = KENO_PAYTABLE[picks];
  if (!table) return 0;
  const raw = table[hits] ?? 0;
  return Math.floor(raw * KENO_HOUSE_EDGE * 100) / 100;
}

function drawKenoNumbers() {
  const pool = shuffle(Array.from({ length: KENO_TOTAL_NUMBERS }, (_, i) => i + 1));
  return pool.slice(0, KENO_DRAW_COUNT);
}

export function playRound(store, username, game, bet, currency, params) {
  return resolveGameRound(game, bet, params);
}

export function ensureSessionStore(meta) {
  if (!meta.sessions || typeof meta.sessions !== 'object') meta.sessions = {};
  cleanSessions(meta);
  return meta.sessions;
}

export { SESSION_TTL_MS, createSessionId, cleanSessions };
