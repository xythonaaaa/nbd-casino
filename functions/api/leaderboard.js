import { isAdmin } from '../lib/admin.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const MAX_WINS = 500;
const MAX_RECENT_BETS = 100;
const STORE_KEY = 'data';
const ORIGINALS_GAMES = new Set([
  'blackjack', 'plinko', 'roulette', 'dice', 'mines', 'crash',
  'keno', 'limbo', 'war', 'coinflip', 'hilo', 'tower', 'wheel',
]);

function defaultData() {
  return { wins: [], bets: {}, recentBets: [] };
}

function normalizeData(data) {
  return {
    wins: Array.isArray(data?.wins) ? data.wins : [],
    bets: data?.bets && typeof data.bets === 'object' ? data.bets : {},
    recentBets: Array.isArray(data?.recentBets) ? data.recentBets : [],
  };
}

function resetOriginalsLeaderboard(data) {
  data.wins = data.wins.filter(w => !ORIGINALS_GAMES.has(w.game));
  ORIGINALS_GAMES.forEach(game => {
    data.bets[game] = 0;
  });
  data.recentBets = data.recentBets.filter(b => !ORIGINALS_GAMES.has(b.game));
  return data;
}

async function loadData(kv) {
  const data = (await kvGet(kv, STORE_KEY, defaultData())) || defaultData();
  return normalizeData(data);
}

async function saveData(kv, data) {
  await kvSet(kv, STORE_KEY, data);
}

function pushRecentBet(data, entry) {
  if (!data.recentBets) data.recentBets = [];
  data.recentBets.unshift(entry);
  if (data.recentBets.length > MAX_RECENT_BETS) data.recentBets.length = MAX_RECENT_BETS;
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.LEADERBOARD_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const data = await loadData(kv);
    return json(data);
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'reset-originals') {
      if (!isAdmin(payload.admin)) {
        return json({ error: 'Admin only' }, 403);
      }
      const data = await loadData(kv);
      resetOriginalsLeaderboard(data);
      await saveData(kv, data);
      return json({ ok: true, reset: 'originals', ...data });
    }

    const game = String(payload.game || '').trim().slice(0, 32);
    if (!game) {
      return json({ error: 'Invalid game' }, 400);
    }

    const data = await loadData(kv);
    data.bets[game] = (data.bets[game] || 0) + 1;

    const betAmt = Math.max(0, parseFloat(payload.bet) || 0);
    const payAmt = Math.max(0, parseFloat(payload.payout) || 0);
    const won = payload.won === true;
    const mult = payload.mult != null
      ? Math.round(parseFloat(payload.mult) * 100) / 100
      : (betAmt > 0 ? Math.round((payAmt / betAmt) * 100) / 100 : 0);

    pushRecentBet(data, {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      game,
      user: String(payload.user || 'Player').trim().slice(0, 16) || 'Player',
      hidden: !!payload.hidden,
      bet: betAmt,
      payout: payAmt,
      mult,
      won,
      ts: Date.now(),
    });

    if (won && payAmt > betAmt) {
      data.wins.unshift({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        game,
        user: String(payload.user || 'Player').trim().slice(0, 16) || 'Player',
        hidden: !!payload.hidden,
        bet: betAmt,
        payout: payAmt,
        mult,
        ts: Date.now(),
      });

      if (data.wins.length > MAX_WINS) data.wins.length = MAX_WINS;
    }

    await saveData(kv, data);
    return json({ ok: true, ...data });
  }

  return methodNotAllowed();
}
