import { isAdmin } from '../lib/admin.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const VALID_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];
const WALLET_STORE_KEY = 'data';
const AFFILIATES_STORE_KEY = 'data';
const LEADERBOARD_STORE_KEY = 'data';

function defaultBalances() {
  return { USD: 0, BTC: 0, ETH: 0, LTC: 0 };
}

function userKey(username) {
  return String(username || '').trim().toLowerCase();
}

function resolveUser(users, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  const found = users.find(u => u.toLowerCase() === trimmed.toLowerCase());
  return found || trimmed;
}

function usernameMatches(name, keys) {
  return keys.has(userKey(name));
}

function parseDeleteTargets(payload) {
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

async function loadWalletData(kv) {
  try {
    const raw = await kvGet(kv, WALLET_STORE_KEY, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      users: Array.isArray(data.users) ? data.users : [],
      grants: data.grants && typeof data.grants === 'object' ? data.grants : {},
      userMeta: data.userMeta && typeof data.userMeta === 'object' ? data.userMeta : {},
      resetAt: Math.max(0, parseInt(data.resetAt, 10) || 0),
    };
  } catch {
    return { users: [], grants: {}, userMeta: {}, resetAt: 0 };
  }
}

async function loadAffiliateData(kv) {
  try {
    const raw = await kvGet(kv, AFFILIATES_STORE_KEY, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      users: Array.isArray(data.users) ? data.users : [],
      referralMap: data.referralMap && typeof data.referralMap === 'object' ? data.referralMap : {},
      affiliates: data.affiliates && typeof data.affiliates === 'object' ? data.affiliates : {},
    };
  } catch {
    return { users: [], referralMap: {}, affiliates: {} };
  }
}

async function loadLeaderboardData(kv) {
  try {
    const raw = await kvGet(kv, LEADERBOARD_STORE_KEY, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      wins: Array.isArray(data.wins) ? data.wins : [],
      recentBets: Array.isArray(data.recentBets) ? data.recentBets : [],
      bets: data.bets && typeof data.bets === 'object' ? data.bets : {},
    };
  } catch {
    return { wins: [], recentBets: [], bets: {} };
  }
}

async function loadChatMessages(kv) {
  try {
    const messages = await kvGet(kv, 'messages', []);
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

function getGrantsForUser(wallet, username) {
  const key = userKey(username);
  const raw = wallet.grants[key] || defaultBalances();
  const grants = defaultBalances();
  VALID_CURRENCIES.forEach(cur => {
    grants[cur] = Math.max(0, parseFloat(raw[cur]) || 0);
  });
  return grants;
}

function findJoinedAt(affiliates, username) {
  const key = userKey(username);
  for (const affData of Object.values(affiliates.affiliates)) {
    const referrals = affData?.referrals;
    if (!Array.isArray(referrals)) continue;
    const ref = referrals.find(r => userKey(r.username) === key);
    if (ref?.joinedAt) return ref.joinedAt;
  }
  return null;
}

function aggregateLeaderboardStats(leaderboard) {
  const stats = {};
  const touch = user => {
    const key = userKey(user);
    if (!key || key === 'player') return null;
    if (!stats[key]) {
      stats[key] = { bets: 0, wagered: 0, wins: 0, payout: 0 };
    }
    return stats[key];
  };

  for (const bet of leaderboard.recentBets || []) {
    const entry = touch(bet.user);
    if (!entry) continue;
    const betAmt = Math.max(0, parseFloat(bet.bet) || 0);
    const payAmt = Math.max(0, parseFloat(bet.payout) || 0);
    entry.bets += 1;
    entry.wagered += betAmt;
    entry.payout += payAmt;
    if (bet.won) entry.wins += 1;
  }

  return stats;
}

function buildPlayersList(wallet, affiliates, leaderboard) {
  const players = new Map();
  const lbStats = aggregateLeaderboardStats(leaderboard);
  const allUsers = new Set();

  wallet.users.forEach(u => allUsers.add(resolveUser(wallet.users, u)));
  affiliates.users.forEach(u => allUsers.add(resolveUser(affiliates.users, u)));

  for (const username of allUsers) {
    if (!username) continue;
    const key = userKey(username);
    const stats = lbStats[key] || { bets: 0, wagered: 0, wins: 0, payout: 0 };
    const joinedAt = wallet.userMeta[key]?.registeredAt
      || findJoinedAt(affiliates, username)
      || null;
    const referrerRaw = affiliates.referralMap[key] || null;
    const referrer = referrerRaw ? resolveUser(affiliates.users, referrerRaw) : null;

    players.set(key, {
      username,
      grants: getGrantsForUser(wallet, username),
      referrer,
      joinedAt,
      bets: stats.bets,
      wagered: Math.round(stats.wagered * 100) / 100,
      wins: stats.wins,
      payout: Math.round(stats.payout * 100) / 100,
      profit: Math.round((stats.payout - stats.wagered) * 100) / 100,
    });
  }

  return Array.from(players.values()).sort((a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: 'base' })
  );
}

function removePlayersFromWallet(wallet, keys) {
  const removed = { users: [], grants: [], userMeta: [] };
  wallet.users = wallet.users.filter(u => {
    if (usernameMatches(u, keys)) {
      removed.users.push(u);
      return false;
    }
    return true;
  });
  for (const key of keys) {
    if (wallet.grants[key]) {
      removed.grants.push(key);
      delete wallet.grants[key];
    }
    if (wallet.userMeta[key]) {
      removed.userMeta.push(key);
      delete wallet.userMeta[key];
    }
  }
  return removed;
}

function removePlayersFromAffiliates(affiliates, keys) {
  const removed = { users: [], referralMap: [], affiliates: [], referrals: [] };

  affiliates.users = affiliates.users.filter(u => {
    if (usernameMatches(u, keys)) {
      removed.users.push(u);
      return false;
    }
    return true;
  });

  for (const refUserKey of Object.keys(affiliates.referralMap)) {
    const referrer = affiliates.referralMap[refUserKey];
    if (keys.has(refUserKey) || usernameMatches(referrer, keys)) {
      removed.referralMap.push({ user: refUserKey, referrer });
      delete affiliates.referralMap[refUserKey];
    }
  }

  for (const affKey of Object.keys(affiliates.affiliates)) {
    if (usernameMatches(affKey, keys)) {
      removed.affiliates.push(affKey);
      delete affiliates.affiliates[affKey];
    }
  }

  for (const [affKey, affData] of Object.entries(affiliates.affiliates)) {
    if (!Array.isArray(affData?.referrals)) continue;
    affData.referrals = affData.referrals.filter(r => {
      if (usernameMatches(r.username, keys)) {
        removed.referrals.push({ affiliate: affKey, username: r.username });
        return false;
      }
      return true;
    });
  }

  return removed;
}

function removePlayersFromLeaderboard(leaderboard, keys) {
  const removed = { wins: 0, recentBets: 0 };
  const beforeWins = leaderboard.wins.length;
  leaderboard.wins = leaderboard.wins.filter(w => !usernameMatches(w.user, keys));
  removed.wins = beforeWins - leaderboard.wins.length;

  const beforeBets = leaderboard.recentBets.length;
  leaderboard.recentBets = leaderboard.recentBets.filter(b => !usernameMatches(b.user, keys));
  removed.recentBets = beforeBets - leaderboard.recentBets.length;

  return removed;
}

function removePlayersFromChat(messages, keys) {
  const before = messages.length;
  const filtered = messages.filter(m => !usernameMatches(m.user, keys));
  return { removed: before - filtered.length, messages: filtered };
}

async function deletePlayers(env, payload) {
  const { keys, names } = parseDeleteTargets(payload);
  if (!names.length) {
    return { error: 'No valid usernames to delete' };
  }

  const [walletData, affiliateData, leaderboardData, chatMessages] = await Promise.all([
    loadWalletData(env.WALLET_KV),
    loadAffiliateData(env.AFFILIATES_KV),
    loadLeaderboardData(env.LEADERBOARD_KV),
    loadChatMessages(env.CHAT_KV),
  ]);

  const walletRemoved = removePlayersFromWallet(walletData, keys);
  const affiliateRemoved = removePlayersFromAffiliates(affiliateData, keys);
  const leaderboardRemoved = removePlayersFromLeaderboard(leaderboardData, keys);
  const chatRemoved = removePlayersFromChat(chatMessages, keys);

  await Promise.all([
    kvSet(env.WALLET_KV, WALLET_STORE_KEY, walletData),
    kvSet(env.AFFILIATES_KV, AFFILIATES_STORE_KEY, affiliateData),
    kvSet(env.LEADERBOARD_KV, LEADERBOARD_STORE_KEY, leaderboardData),
    kvSet(env.CHAT_KV, 'messages', chatRemoved.messages),
  ]);

  const players = buildPlayersList(walletData, affiliateData, leaderboardData);

  return {
    ok: true,
    deleted: names,
    removed: {
      wallet: walletRemoved,
      affiliates: affiliateRemoved,
      leaderboard: leaderboardRemoved,
      chat: { messages: chatRemoved.removed },
    },
    count: players.length,
    players,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const admin = url.searchParams.get('admin') || '';
    if (!isAdmin(admin)) {
      return json({ error: 'Admin only' }, 403);
    }

    const [walletData, affiliatesData, leaderboardData] = await Promise.all([
      loadWalletData(env.WALLET_KV),
      loadAffiliateData(env.AFFILIATES_KV),
      loadLeaderboardData(env.LEADERBOARD_KV),
    ]);

    const players = buildPlayersList(walletData, affiliatesData, leaderboardData);
    return json({ ok: true, count: players.length, players });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (!isAdmin(payload.admin)) {
      return json({ error: 'Admin only' }, 403);
    }

    if (payload.action === 'delete-player') {
      const result = await deletePlayers(env, payload);
      if (result.error) {
        return json(result, { status: 400 });
      }
      return json(result);
    }

    const [walletData, affiliatesData, leaderboardData] = await Promise.all([
      loadWalletData(env.WALLET_KV),
      loadAffiliateData(env.AFFILIATES_KV),
      loadLeaderboardData(env.LEADERBOARD_KV),
    ]);

    const players = buildPlayersList(walletData, affiliatesData, leaderboardData);
    return json({ ok: true, count: players.length, players });
  }

  return methodNotAllowed();
}
