import { isAdmin } from '../lib/admin.js';
import { authenticatePayload, authUserKey, verifySession } from '../lib/auth.js';
import {
  appendSystemChatMessage,
  formatTipChatMessage,
} from '../lib/chat-store.js';
import {
  actGameSession,
  ensureSessionStore,
  getClientSessionState,
  getSessionMaxCredit,
  resolveGameRound,
  startGameSession,
} from '../lib/game-play.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const STORE_KEY = 'data';
const VALID_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];
const MIN_TIP_USD = 0.01;
const TIP_COOLDOWN_MS = 2000;
const SIGNUP_BONUS_USD = 500;
const DAILY_REWARD_USD = 500;
const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RAKEBACK_ACCRUAL_RATE = 0.005;
const MAX_RANK_REWARD_CLAIM = 5000;
const MAX_RANK_REWARDS_LIFETIME = 20000;
const SELF_EXCLUDE_DURATIONS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '6mo': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  permanent: -1,
};

function defaultBalances() {
  return { USD: 0, BTC: 0, ETH: 0, LTC: 0 };
}

function defaultStore() {
  return { users: [], grants: {}, balances: {}, userMeta: {}, resetAt: 0 };
}

function normalizeStore(raw) {
  const data = raw && typeof raw === 'object' ? raw : defaultStore();
  return {
    users: Array.isArray(data.users) ? data.users : [],
    grants: data.grants && typeof data.grants === 'object' ? data.grants : {},
    balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
    userMeta: data.userMeta && typeof data.userMeta === 'object' ? data.userMeta : {},
    resetAt: Math.max(0, parseInt(data.resetAt, 10) || 0),
  };
}

async function loadStore(kv) {
  try {
    const raw = await kvGet(kv, STORE_KEY, null);
    return normalizeStore(raw);
  } catch {
    return defaultStore();
  }
}

async function saveStore(kv, data) {
  await kvSet(kv, STORE_KEY, data);
}

async function writeStore(kv, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await loadStore(kv);
    const result = mutator(data);
    if (result?.error) return result;
    await saveStore(kv, data);
    return result;
  }
  return { error: 'Store busy, try again' };
}

function userKey(username) {
  return String(username || '').trim().toLowerCase();
}

function userExists(store, username) {
  const key = userKey(username);
  return store.users.some(u => u.toLowerCase() === key);
}

function ensureUser(store, username) {
  const name = String(username || '').trim().slice(0, 16);
  if (!name) return null;
  const key = userKey(name);
  if (!userExists(store, name)) {
    store.users.push(name);
    if (!store.userMeta) store.userMeta = {};
    if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
    if (!store.balances) store.balances = {};
    if (!store.balances[key]) {
      store.balances[key] = defaultBalances();
      store.balances[key].USD = SIGNUP_BONUS_USD;
    }
  }
  return name;
}

function resolveWalletUser(store, username) {
  const key = userKey(username);
  return store.users.find(u => u.toLowerCase() === key) || null;
}

function getBalancesForUser(store, username) {
  const key = userKey(username);
  const raw = store.balances?.[key] || defaultBalances();
  const balances = defaultBalances();
  VALID_CURRENCIES.forEach(cur => {
    balances[cur] = Math.max(0, parseFloat(raw[cur]) || 0);
  });
  return balances;
}

function getCombinedForUser(store, username) {
  const grants = getGrantsForUser(store, username);
  const balances = getBalancesForUser(store, username);
  const combined = defaultBalances();
  VALID_CURRENCIES.forEach(cur => {
    combined[cur] = grants[cur] + balances[cur];
  });
  return combined;
}

function ensureBalancesEntry(store, key) {
  if (!store.balances) store.balances = {};
  if (!store.balances[key]) store.balances[key] = defaultBalances();
}

function debitCombined(store, username, currency, amount) {
  const key = userKey(username);
  ensureBalancesEntry(store, key);
  if (!store.grants[key]) store.grants[key] = defaultBalances();

  let remaining = amount;
  const bal = parseFloat(store.grants[key][currency]) || 0;
  const fromGrant = Math.min(bal, remaining);
  store.grants[key][currency] = bal - fromGrant;
  remaining -= fromGrant;

  if (remaining > 0) {
    const balance = parseFloat(store.balances[key][currency]) || 0;
    if (balance < remaining) return false;
    store.balances[key][currency] = balance - remaining;
  }
  return true;
}

function creditCombined(store, username, currency, amount) {
  const key = userKey(username);
  ensureBalancesEntry(store, key);
  store.balances[key][currency] = (parseFloat(store.balances[key][currency]) || 0) + amount;
}

function getGrantsForUser(store, username) {
  const key = userKey(username);
  const raw = store.grants[key] || defaultBalances();
  const grants = defaultBalances();
  VALID_CURRENCIES.forEach(cur => {
    grants[cur] = Math.max(0, parseFloat(raw[cur]) || 0);
  });
  return grants;
}

function ensureUserMeta(store, username) {
  const key = userKey(username);
  if (!store.userMeta) store.userMeta = {};
  if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
  return store.userMeta[key];
}

function getSelfExclusionStatus(store, username) {
  const key = userKey(username);
  const meta = store.userMeta?.[key] || {};
  const until = parseInt(meta.selfExcludedUntil, 10) || 0;
  const now = Date.now();
  if (until === -1) {
    return {
      active: true,
      permanent: true,
      selfExcludedUntil: -1,
      selfExcludedAt: meta.selfExcludedAt || 0,
      duration: meta.selfExcludeDuration || 'permanent',
    };
  }
  if (until > now) {
    return {
      active: true,
      permanent: false,
      selfExcludedUntil: until,
      selfExcludedAt: meta.selfExcludedAt || 0,
      duration: meta.selfExcludeDuration || '',
    };
  }
  return {
    active: false,
    permanent: false,
    selfExcludedUntil: 0,
    selfExcludedAt: 0,
    duration: '',
  };
}

function isSelfExcluded(store, username) {
  return getSelfExclusionStatus(store, username).active;
}

function applySelfExclusion(store, username, duration) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };

  const durationKey = String(duration || '').trim();
  const ms = SELF_EXCLUDE_DURATIONS[durationKey];
  if (ms === undefined) return { error: 'Invalid duration' };

  const key = userKey(player);
  const meta = ensureUserMeta(store, player);
  const now = Date.now();
  const currentUntil = parseInt(meta.selfExcludedUntil, 10) || 0;

  if (currentUntil === -1) return { error: 'Already permanently self-excluded' };
  if (currentUntil > now && ms !== -1) {
    meta.selfExcludedUntil = currentUntil + ms;
  } else if (ms === -1) {
    meta.selfExcludedUntil = -1;
  } else {
    meta.selfExcludedUntil = now + ms;
  }

  meta.selfExcludedAt = now;
  meta.selfExcludeDuration = durationKey;

  const status = getSelfExclusionStatus(store, player);
  return { ok: true, username: player, ...status };
}

function sendMoney(store, admin, to, amount, currency) {
  const adminName = String(admin || '').trim();
  const recipient = String(to || '').trim().slice(0, 16);
  const cur = String(currency || 'USD').toUpperCase();

  if (!isAdmin(adminName)) return { error: 'Admin only' };
  if (!recipient) return { error: 'Invalid recipient' };
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };

  ensureUser(store, recipient);
  const key = userKey(recipient);
  if (!store.grants[key]) store.grants[key] = defaultBalances();
  store.grants[key][cur] = (parseFloat(store.grants[key][cur]) || 0) + amt;

  return { ok: true, to: recipient, amount: amt, currency: cur, grants: getGrantsForUser(store, recipient) };
}

function resetAllWallets(store) {
  store.grants = {};
  store.balances = {};
  store.resetAt = Date.now();
  return { ok: true, resetAt: store.resetAt };
}

async function resetAffiliateWagers(kv) {
  if (!kv) return;
  try {
    const raw = await kvGet(kv, STORE_KEY, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    const affiliates = data.affiliates && typeof data.affiliates === 'object' ? data.affiliates : {};
    Object.values(affiliates).forEach(affData => {
      if (!affData || typeof affData !== 'object') return;
      affData.referralWagered = 0;
      if (Array.isArray(affData.referrals)) {
        affData.referrals.forEach(ref => {
          if (ref && typeof ref === 'object') ref.wagered = 0;
        });
      }
    });
    data.affiliates = affiliates;
    await kvSet(kv, STORE_KEY, data);
  } catch {
    /* affiliate reset is best-effort */
  }
}

function resetPlayerWallet(store, admin, username) {
  const adminName = String(admin || '').trim();
  const player = String(username || '').trim().slice(0, 16);

  if (!isAdmin(adminName)) return { error: 'Admin only' };
  if (!player) return { error: 'Invalid username' };

  const key = userKey(player);
  if (store.grants[key]) {
    store.grants[key] = defaultBalances();
  }
  if (store.balances?.[key]) {
    store.balances[key] = defaultBalances();
  }

  return { ok: true, username: player, grants: getGrantsForUser(store, player) };
}

function getPlayerProfile(store, username) {
  const meta = store.userMeta?.[userKey(username)] || {};
  const profile = meta.profile;
  if (!profile || typeof profile !== 'object') return null;
  const updatedAt = Math.max(0, parseInt(profile.updatedAt, 10) || 0);
  if (!updatedAt) return null;
  return {
    updatedAt,
    wagered: profile.wagered != null ? Math.max(0, parseFloat(profile.wagered) || 0) : null,
    rakebackResetAt: Math.max(0, parseInt(profile.rakebackResetAt, 10) || 0),
  };
}

function setPlayerProfile(store, admin, username, options = {}) {
  const adminName = String(admin || '').trim();
  const playerRaw = String(username || '').trim().slice(0, 16);

  if (!isAdmin(adminName)) return { error: 'Admin only' };
  if (!playerRaw) return { error: 'Invalid username' };

  const player = resolveWalletUser(store, playerRaw);
  if (!player) return { error: 'Player not found' };

  const meta = ensureUserMeta(store, player);
  const prev = meta.profile && typeof meta.profile === 'object' ? meta.profile : {};
  const now = Date.now();

  meta.profile = {
    updatedAt: now,
    wagered: options.wagered != null
      ? Math.max(0, parseFloat(options.wagered) || 0)
      : (prev.wagered ?? null),
    rakebackResetAt: options.resetRakeback
      ? now
      : Math.max(0, parseInt(prev.rakebackResetAt, 10) || 0),
  };

  return { ok: true, username: player, profile: getPlayerProfile(store, player) };
}

function walletResponseForUser(store, player) {
  const meta = ensureUserMeta(store, player);
  return {
    grants: getGrantsForUser(store, player),
    balances: getBalancesForUser(store, player),
    combined: getCombinedForUser(store, player),
    rakebackPending: Math.max(0, parseFloat(meta.rakebackPending) || 0),
    lastDailyClaimAt: Math.max(0, parseInt(meta.lastDailyClaimAt, 10) || 0),
  };
}

function accrueServerRakeback(store, player, betAmount) {
  const amt = parseFloat(betAmount) || 0;
  if (amt <= 0) return;
  const meta = ensureUserMeta(store, player);
  meta.rakebackPending = (parseFloat(meta.rakebackPending) || 0) + amt * RAKEBACK_ACCRUAL_RATE;
}

function claimPlayerReward(store, username, kind, amount) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };
  if (isSelfExcluded(store, player)) return { error: 'You are self-excluded' };

  const meta = ensureUserMeta(store, player);
  const cur = 'USD';

  if (kind === 'daily') {
    const last = Math.max(0, parseInt(meta.lastDailyClaimAt, 10) || 0);
    if (Date.now() - last < DAILY_REWARD_COOLDOWN_MS) {
      return { error: 'Daily reward not available yet' };
    }
    meta.lastDailyClaimAt = Date.now();
    creditCombined(store, player, cur, DAILY_REWARD_USD);
    return {
      ok: true,
      kind,
      amount: DAILY_REWARD_USD,
      currency: cur,
      ...walletResponseForUser(store, player),
    };
  }

  if (kind === 'rakeback') {
    const pending = Math.max(0, parseFloat(meta.rakebackPending) || 0);
    const requested = parseFloat(amount) || 0;
    const claim = Math.min(pending, requested);
    if (claim < 0.01) return { error: 'Nothing to claim' };
    meta.rakebackPending = pending - claim;
    creditCombined(store, player, cur, claim);
    return {
      ok: true,
      kind,
      amount: claim,
      currency: cur,
      ...walletResponseForUser(store, player),
    };
  }

  if (kind === 'rank') {
    const requested = parseFloat(amount) || 0;
    if (requested <= 0 || requested > MAX_RANK_REWARD_CLAIM) {
      return { error: 'Invalid rank reward amount' };
    }
    const claimed = parseFloat(meta.rankRewardsClaimed) || 0;
    if (claimed + requested > MAX_RANK_REWARDS_LIFETIME) {
      return { error: 'Rank reward limit reached' };
    }
    meta.rankRewardsClaimed = claimed + requested;
    creditCombined(store, player, cur, requested);
    return {
      ok: true,
      kind,
      amount: requested,
      currency: cur,
      ...walletResponseForUser(store, player),
    };
  }

  return { error: 'Unknown reward type' };
}

function playWalletRound(store, username, game, bet, currency, params) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };
  if (isSelfExcluded(store, player)) return { error: 'You are self-excluded and cannot bet' };

  const cur = String(currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { error: 'Invalid bet amount' };

  const combined = getCombinedForUser(store, player);
  if (combined[cur] < amt) return { error: 'Insufficient balance' };

  const outcome = resolveGameRound(String(game || ''), amt, params || {});
  if (outcome.error) return outcome;

  if (!debitCombined(store, player, cur, amt)) return { error: 'Insufficient balance' };
  accrueServerRakeback(store, player, amt);
  if (outcome.payout > 0) creditCombined(store, player, cur, outcome.payout);

  return {
    ok: true,
    game,
    bet: amt,
    payout: outcome.payout,
    outcome: outcome.data,
    ...walletResponseForUser(store, player),
  };
}

function startWalletSession(store, username, game, bet, currency, params) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };
  if (isSelfExcluded(store, player)) return { error: 'You are self-excluded and cannot bet' };

  const cur = String(currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { error: 'Invalid bet amount' };

  const combined = getCombinedForUser(store, player);
  if (combined[cur] < amt) return { error: 'Insufficient balance' };

  const started = startGameSession(String(game || ''), amt, params || {});
  if (started.error) return started;

  if (!debitCombined(store, player, cur, amt)) return { error: 'Insufficient balance' };
  accrueServerRakeback(store, player, amt);

  const meta = ensureUserMeta(store, player);
  const sessions = ensureSessionStore(meta);
  sessions[started.sessionId] = {
    ...started.state,
    currency: cur,
    username: player,
    totalDebited: amt,
    totalCredited: 0,
  };

  return {
    ok: true,
    sessionId: started.sessionId,
    game,
    bet: amt,
    clientState: getClientSessionState(started.state),
    ...walletResponseForUser(store, player),
  };
}

function getWalletSession(store, username, sessionId) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };
  const meta = ensureUserMeta(store, player);
  const sessions = ensureSessionStore(meta);
  const session = sessions[String(sessionId || '')];
  if (!session) return { error: 'Session not found' };
  return { player, session, sessions, meta };
}

function sessionDebitWallet(store, username, sessionId, amount, currency) {
  const lookup = getWalletSession(store, username, sessionId);
  if (lookup.error) return lookup;

  const { player, session } = lookup;
  const cur = String(currency || session.currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };

  const combined = getCombinedForUser(store, player);
  if (combined[cur] < amt) return { error: 'Insufficient balance' };

  if (!debitCombined(store, player, cur, amt)) return { error: 'Insufficient balance' };
  accrueServerRakeback(store, player, amt);
  session.totalDebited = (parseFloat(session.totalDebited) || parseFloat(session.bet) || 0) + amt;
  session.currency = cur;

  return {
    ok: true,
    sessionId,
    amount: amt,
    totalDebited: session.totalDebited,
    ...walletResponseForUser(store, player),
  };
}

function sessionCreditWallet(store, username, sessionId, amount, currency) {
  const lookup = getWalletSession(store, username, sessionId);
  if (lookup.error) return lookup;

  const { player, session } = lookup;
  const cur = String(currency || session.currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };

  const credited = parseFloat(session.totalCredited) || 0;
  const maxCredit = getSessionMaxCredit(session);
  if (credited + amt > maxCredit) return { error: 'Invalid credit amount' };

  creditCombined(store, player, cur, amt);
  session.totalCredited = credited + amt;

  return {
    ok: true,
    sessionId,
    amount: amt,
    totalCredited: session.totalCredited,
    ...walletResponseForUser(store, player),
  };
}

function sessionSettleWallet(store, username, sessionId, payout, currency) {
  const lookup = getWalletSession(store, username, sessionId);
  if (lookup.error) return lookup;

  const { player, session, sessions } = lookup;
  const cur = String(currency || session.currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };

  const amt = Math.max(0, parseFloat(payout) || 0);
  const credited = parseFloat(session.totalCredited) || 0;
  const maxCredit = getSessionMaxCredit(session);
  if (credited + amt > maxCredit) return { error: 'Invalid payout amount' };

  if (amt > 0) creditCombined(store, player, cur, amt);
  delete sessions[sessionId];

  return {
    ok: true,
    sessionId,
    payout: amt,
    ...walletResponseForUser(store, player),
  };
}

function actWalletSession(store, username, sessionId, action, params) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };
  if (isSelfExcluded(store, player)) return { error: 'You are self-excluded and cannot bet' };

  const meta = ensureUserMeta(store, player);
  const sessions = ensureSessionStore(meta);
  const session = sessions[String(sessionId || '')];
  if (!session) return { error: 'Session not found' };

  const result = actGameSession(session, String(action || ''), params || {});
  if (result.error) return result;

  const cur = session.currency || 'USD';
  if (result.done) {
    if (result.payout > 0) creditCombined(store, player, cur, result.payout);
    delete sessions[sessionId];
  }

  return {
    ok: true,
    sessionId,
    done: !!result.done,
    payout: result.payout || 0,
    outcome: result.data,
    ...walletResponseForUser(store, player),
  };
}

function tipPlayer(store, from, to, amount, currency) {
  const senderRaw = String(from || '').trim().slice(0, 16);
  const recipientRaw = String(to || '').trim().slice(0, 16);

  if (!senderRaw) return { error: 'Invalid sender' };
  if (!recipientRaw) return { error: 'Invalid recipient' };

  const cur = String(currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };
  if (cur !== 'USD') return { error: 'Tips are USD only' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };
  if (amt < MIN_TIP_USD) return { error: `Minimum tip is $${MIN_TIP_USD.toFixed(2)}` };

  const sender = resolveWalletUser(store, senderRaw);
  if (!sender) return { error: 'Sender not registered' };

  const recipient = resolveWalletUser(store, recipientRaw);
  if (!recipient) return { error: 'Recipient not found' };

  if (userKey(sender) === userKey(recipient)) return { error: 'Cannot tip yourself' };
  if (isSelfExcluded(store, sender)) return { error: 'You are self-excluded and cannot tip' };

  const senderKey = userKey(sender);
  if (!store.userMeta) store.userMeta = {};
  if (!store.userMeta[senderKey]) store.userMeta[senderKey] = { registeredAt: Date.now() };
  const lastTip = parseInt(store.userMeta[senderKey].lastTipAt, 10) || 0;
  if (Date.now() - lastTip < TIP_COOLDOWN_MS) return { error: 'Please wait before tipping again' };

  const combined = getCombinedForUser(store, sender);
  if (combined[cur] < amt) return { error: 'Insufficient balance' };

  if (!debitCombined(store, sender, cur, amt)) return { error: 'Insufficient balance' };
  creditCombined(store, recipient, cur, amt);
  store.userMeta[senderKey].lastTipAt = Date.now();

  return {
    ok: true,
    from: sender,
    to: recipient,
    amount: amt,
    currency: cur,
    fromGrants: getGrantsForUser(store, sender),
    fromBalances: getBalancesForUser(store, sender),
    toGrants: getGrantsForUser(store, recipient),
    toBalances: getBalancesForUser(store, recipient),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.WALLET_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const meta = url.searchParams.get('meta');
    const data = await loadStore(kv);

    if (meta === 'resetAt') {
      return json({ resetAt: data.resetAt || 0 });
    }

    const user = url.searchParams.get('user') || '';
    const sessionToken = url.searchParams.get('sessionToken') || '';
    if (!user.trim()) {
      return json({ error: 'Missing user' }, 400);
    }
    const session = await verifySession(kv, sessionToken);
    if (!session || authUserKey(session.username) !== authUserKey(user)) {
      return json({ error: 'Not authenticated' }, 401);
    }
    const profile = getPlayerProfile(data, user);
    return json({
      grants: getGrantsForUser(data, user),
      balances: getBalancesForUser(data, user),
      resetAt: data.resetAt || 0,
      account: getSelfExclusionStatus(data, user),
      profile,
    });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'register') {
      return json({ error: 'Use /api/auth to register' }, 400);
    }

    const auth = await authenticatePayload(kv, payload);
    if (auth.error) return json(auth, { status: 401 });
    const sessionUser = auth.username;

    if (payload.action === 'reset-all') {
      const result = await writeStore(kv, data => {
        if (!isAdmin(sessionUser)) return { error: 'Admin only' };
        return resetAllWallets(data);
      });
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      await resetAffiliateWagers(env.AFFILIATES_KV);
      return json(result);
    }

    if (payload.action === 'reset-player') {
      const target = payload.username || payload.to;
      const result = await writeStore(kv, data =>
        resetPlayerWallet(data, sessionUser, target)
      );
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'set-player-profile') {
      const target = payload.username || payload.to;
      const result = await writeStore(kv, data =>
        setPlayerProfile(data, sessionUser, target, {
          wagered: payload.wagered,
          resetRakeback: !!payload.resetRakeback,
        })
      );
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'send') {
      const result = await writeStore(kv, data =>
        sendMoney(data, sessionUser, payload.to, payload.amount, payload.currency)
      );
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'tip') {
      const result = await writeStore(kv, data =>
        tipPlayer(data, sessionUser, payload.to, payload.amount, payload.currency)
      );
      if (result.error) return json(result, { status: 400 });
      if (result.ok && env.CHAT_KV) {
        await appendSystemChatMessage(
          env.CHAT_KV,
          formatTipChatMessage(result.from, result.to, result.amount)
        );
      }
      return json(result);
    }

    if (payload.action === 'self-exclude') {
      const result = await writeStore(kv, data =>
        applySelfExclusion(data, sessionUser, payload.duration)
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'claim-reward') {
      const result = await writeStore(kv, data =>
        claimPlayerReward(data, sessionUser, payload.kind, payload.amount)
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'play') {
      const result = await writeStore(kv, data =>
        playWalletRound(
          data,
          sessionUser,
          payload.game,
          payload.bet,
          payload.currency,
          payload.params
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'session-start') {
      const result = await writeStore(kv, data =>
        startWalletSession(
          data,
          sessionUser,
          payload.game,
          payload.bet,
          payload.currency,
          payload.params
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'session-act') {
      const result = await writeStore(kv, data =>
        actWalletSession(
          data,
          sessionUser,
          payload.sessionId,
          payload.act,
          payload.params
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'session-debit') {
      const result = await writeStore(kv, data =>
        sessionDebitWallet(
          data,
          sessionUser,
          payload.sessionId,
          payload.amount,
          payload.currency
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'session-credit') {
      const result = await writeStore(kv, data =>
        sessionCreditWallet(
          data,
          sessionUser,
          payload.sessionId,
          payload.amount,
          payload.currency
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (payload.action === 'session-settle') {
      const result = await writeStore(kv, data =>
        sessionSettleWallet(
          data,
          sessionUser,
          payload.sessionId,
          payload.payout,
          payload.currency
        )
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    return json({ error: 'Unknown action' }, 400);
  }

  return methodNotAllowed();
}
