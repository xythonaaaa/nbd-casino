import { isAdmin } from '../lib/admin.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const MAX_WINS = 500;
const MAX_RECENT_BETS = 100;
const LEADERBOARD_MAX_BET = 1000;
const STORE_KEY = 'data';
const BANNED_LEADERBOARD_USERS = new Set(['tiddlesz']);
const ORIGINALS_GAMES = new Set([
  'blackjack', 'double-down-blackjack', 'plinko', 'roulette', 'dice', 'mines', 'crash',
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

function resetAllLeaderboard(data) {
  data.wins = [];
  data.bets = {};
  data.recentBets = [];
  return data;
}

function userKey(username) {
  return String(username || '').trim().toLowerCase();
}

function parseUserTargets(payload) {
  const raw = [];
  if (Array.isArray(payload.usernames)) raw.push(...payload.usernames);
  if (payload.username) raw.push(payload.username);
  const keys = new Set();
  const names = [];
  for (const name of raw) {
    const trimmed = String(name || '').trim().slice(0, 16);
    if (!trimmed) continue;
    const key = userKey(trimmed);
    if (isAdmin(trimmed)) continue;
    if (!keys.has(key)) {
      keys.add(key);
      names.push(trimmed);
    }
  }
  return { keys, names };
}

function removePlayersFromLeaderboard(data, keys) {
  const removed = { wins: 0, recentBets: 0 };
  const beforeWins = data.wins.length;
  data.wins = data.wins.filter(w => !keys.has(userKey(w.user)));
  removed.wins = beforeWins - data.wins.length;

  const beforeBets = data.recentBets.length;
  data.recentBets = data.recentBets.filter(b => !keys.has(userKey(b.user)));
  removed.recentBets = beforeBets - data.recentBets.length;

  return removed;
}

function isBlockedLeaderboardEntry(entry) {
  if ((parseFloat(entry?.bet) || 0) > LEADERBOARD_MAX_BET) return true;
  if (BANNED_LEADERBOARD_USERS.has(userKey(entry?.user))) return true;
  return false;
}

function sanitizeLeaderboardData(data) {
  const normalized = normalizeData(data);
  const before = normalized.wins.length + normalized.recentBets.length;
  normalized.wins = normalized.wins.filter(w => !isBlockedLeaderboardEntry(w));
  normalized.recentBets = normalized.recentBets.filter(b => !isBlockedLeaderboardEntry(b));
  return { data: normalized, changed: before !== normalized.wins.length + normalized.recentBets.length };
}

async function loadData(kv) {
  const raw = (await kvGet(kv, STORE_KEY, defaultData())) || defaultData();
  const { data, changed } = sanitizeLeaderboardData(raw);
  if (changed) await saveData(kv, data);
  return data;
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

    if (payload.action === 'reset-all') {
      if (!isAdmin(payload.admin)) {
        return json({ error: 'Admin only' }, 403);
      }
      const data = resetAllLeaderboard(await loadData(kv));
      await saveData(kv, data);
      return json({ ok: true, reset: 'all', ...data });
    }

    if (payload.action === 'remove-player') {
      if (!isAdmin(payload.admin)) {
        return json({ error: 'Admin only' }, 403);
      }
      const { keys, names } = parseUserTargets(payload);
      if (!names.length) {
        return json({ error: 'No valid usernames' }, 400);
      }
      const data = await loadData(kv);
      const removed = removePlayersFromLeaderboard(data, keys);
      await saveData(kv, data);
      return json({ ok: true, usernames: names, removed, ...data });
    }

    const game = String(payload.game || '').trim().slice(0, 32);
    if (!game) {
      return json({ error: 'Invalid game' }, 400);
    }

    const betAmt = Math.max(0, parseFloat(payload.bet) || 0);
    const payAmt = Math.max(0, parseFloat(payload.payout) || 0);
    const user = String(payload.user || 'Player').trim().slice(0, 16) || 'Player';
    if (betAmt > LEADERBOARD_MAX_BET || BANNED_LEADERBOARD_USERS.has(userKey(user))) {
      const data = await loadData(kv);
      return json({ ok: true, ignored: 'blocked', ...data });
    }

    const data = await loadData(kv);
    data.bets[game] = (data.bets[game] || 0) + 1;

    const won = payload.won === true;
    const mult = payload.mult != null
      ? Math.round(parseFloat(payload.mult) * 100) / 100
      : (betAmt > 0 ? Math.round((payAmt / betAmt) * 100) / 100 : 0);

    pushRecentBet(data, {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      game,
      user,
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
        user,
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
