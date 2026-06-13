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

async function loadWalletStore() {
  const store = getStore({ name: 'nbd-wallet', consistency: 'strong' });
  try {
    const raw = await store.get(WALLET_STORE_KEY, { type: 'json', consistency: 'strong' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      users: Array.isArray(data.users) ? data.users : [],
      grants: data.grants && typeof data.grants === 'object' ? data.grants : {},
      userMeta: data.userMeta && typeof data.userMeta === 'object' ? data.userMeta : {},
    };
  } catch {
    return { users: [], grants: {}, userMeta: {} };
  }
}

async function loadAffiliateStore() {
  const store = getStore({ name: 'nbd-affiliates', consistency: 'strong' });
  try {
    const raw = await store.get(AFFILIATES_STORE_KEY, { type: 'json', consistency: 'strong' });
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

async function loadLeaderboard() {
  const store = getStore('nbd-leaderboard');
  try {
    const raw = await store.get(LEADERBOARD_STORE_KEY, { type: 'json' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      wins: Array.isArray(data.wins) ? data.wins : [],
      recentBets: Array.isArray(data.recentBets) ? data.recentBets : [],
    };
  } catch {
    return { wins: [], recentBets: [] };
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

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const admin = url.searchParams.get('admin') || '';
    if (!isAdmin(admin)) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const [wallet, affiliates, leaderboard] = await Promise.all([
      loadWalletStore(),
      loadAffiliateStore(),
      loadLeaderboard(),
    ]);

    const players = buildPlayersList(wallet, affiliates, leaderboard);
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

    const [wallet, affiliates, leaderboard] = await Promise.all([
      loadWalletStore(),
      loadAffiliateStore(),
      loadLeaderboard(),
    ]);

    const players = buildPlayersList(wallet, affiliates, leaderboard);
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
