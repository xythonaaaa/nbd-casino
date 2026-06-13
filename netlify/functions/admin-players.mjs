import { getStore } from '@netlify/blobs';

const ADMIN_USERNAMES = ['ceo'];
const VALID_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];
const WALLET_STORE_KEY = 'data';
const AFFILIATES_STORE_KEY = 'data';
const LEADERBOARD_STORE_KEY = 'data';

function isAdmin(username) {
  const name = String(username || '').trim().toLowerCase();
  return ADMIN_USERNAMES.some(u => u.toLowerCase() === name);
}

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

async function loadWalletStore() {
  const store = getStore({ name: 'nbd-wallet', consistency: 'strong' });
  try {
    const raw = await store.get(WALLET_STORE_KEY, { type: 'json', consistency: 'strong' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      store,
      data: {
        users: Array.isArray(data.users) ? data.users : [],
        grants: data.grants && typeof data.grants === 'object' ? data.grants : {},
        userMeta: data.userMeta && typeof data.userMeta === 'object' ? data.userMeta : {},
        resetAt: Math.max(0, parseInt(data.resetAt, 10) || 0),
      },
    };
  } catch {
    return { store, data: { users: [], grants: {}, userMeta: {}, resetAt: 0 } };
  }
}

async function loadAffiliateStore() {
  const store = getStore({ name: 'nbd-affiliates', consistency: 'strong' });
  try {
    const raw = await store.get(AFFILIATES_STORE_KEY, { type: 'json', consistency: 'strong' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      store,
      data: {
        users: Array.isArray(data.users) ? data.users : [],
        referralMap: data.referralMap && typeof data.referralMap === 'object' ? data.referralMap : {},
        affiliates: data.affiliates && typeof data.affiliates === 'object' ? data.affiliates : {},
      },
    };
  } catch {
    return { store, data: { users: [], referralMap: {}, affiliates: {} } };
  }
}

async function loadLeaderboard() {
  const store = getStore('nbd-leaderboard');
  try {
    const raw = await store.get(LEADERBOARD_STORE_KEY, { type: 'json' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      store,
      data: {
        wins: Array.isArray(data.wins) ? data.wins : [],
        recentBets: Array.isArray(data.recentBets) ? data.recentBets : [],
        bets: data.bets && typeof data.bets === 'object' ? data.bets : {},
      },
    };
  } catch {
    return { store, data: { wins: [], recentBets: [], bets: {} } };
  }
}

async function loadChat() {
  const store = getStore('nbd-chat');
  try {
    const messages = await store.get('messages', { type: 'json' });
    return {
      store,
      messages: Array.isArray(messages) ? messages : [],
    };
  } catch {
    return { store, messages: [] };
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

async function deletePlayers(payload) {
  const { keys, names } = parseDeleteTargets(payload);
  if (!names.length) {
    return { error: 'No valid usernames to delete' };
  }

  const [walletResult, affiliateResult, leaderboardResult, chatResult] = await Promise.all([
    loadWalletStore(),
    loadAffiliateStore(),
    loadLeaderboard(),
    loadChat(),
  ]);

  const walletRemoved = removePlayersFromWallet(walletResult.data, keys);
  const affiliateRemoved = removePlayersFromAffiliates(affiliateResult.data, keys);
  const leaderboardRemoved = removePlayersFromLeaderboard(leaderboardResult.data, keys);
  const chatRemoved = removePlayersFromChat(chatResult.messages, keys);

  await Promise.all([
    walletResult.store.setJSON(WALLET_STORE_KEY, walletResult.data),
    affiliateResult.store.setJSON(AFFILIATES_STORE_KEY, affiliateResult.data),
    leaderboardResult.store.setJSON(LEADERBOARD_STORE_KEY, leaderboardResult.data),
    chatResult.store.setJSON('messages', chatRemoved.messages),
  ]);

  const players = buildPlayersList(
    walletResult.data,
    affiliateResult.data,
    leaderboardResult.data
  );

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

export default async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const admin = url.searchParams.get('admin') || '';
    if (!isAdmin(admin)) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const [walletResult, affiliatesResult, leaderboardResult] = await Promise.all([
      loadWalletStore(),
      loadAffiliateStore(),
      loadLeaderboard(),
    ]);

    const players = buildPlayersList(
      walletResult.data,
      affiliatesResult.data,
      leaderboardResult.data
    );
    return Response.json({ ok: true, count: players.length, players });
  }

  if (req.method === 'POST') {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Bad request' }, { status: 400 });
    }

    if (!isAdmin(payload.admin)) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    if (payload.action === 'delete-player') {
      const result = await deletePlayers(payload);
      if (result.error) {
        return Response.json(result, { status: 400 });
      }
      return Response.json(result);
    }

    const [walletResult, affiliatesResult, leaderboardResult] = await Promise.all([
      loadWalletStore(),
      loadAffiliateStore(),
      loadLeaderboard(),
    ]);

    const players = buildPlayersList(
      walletResult.data,
      affiliatesResult.data,
      leaderboardResult.data
    );
    return Response.json({ ok: true, count: players.length, players });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config = {
  path: '/api/admin-players',
};
