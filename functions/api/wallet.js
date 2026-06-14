import { isAdmin } from '../lib/admin.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const STORE_KEY = 'data';
const VALID_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];
const MIN_TIP_USD = 0.01;
const TIP_COOLDOWN_MS = 2000;
const SIGNUP_BONUS_USD = 500;

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
    if (!user.trim()) {
      return json({ error: 'Missing user' }, 400);
    }
    return json({
      grants: getGrantsForUser(data, user),
      balances: getBalancesForUser(data, user),
      resetAt: data.resetAt || 0,
    });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'register') {
      const result = await writeStore(kv, data => {
        const name = ensureUser(data, payload.username);
        if (!name) return { error: 'Invalid username' };
        return { ok: true };
      });
      if (result.error) return json(result, { status: 400 });
      return json({ ok: true });
    }

    if (payload.action === 'reset-all') {
      const result = await writeStore(kv, data => {
        if (!isAdmin(payload.admin)) return { error: 'Admin only' };
        return resetAllWallets(data);
      });
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'reset-player') {
      const target = payload.username || payload.to;
      const result = await writeStore(kv, data =>
        resetPlayerWallet(data, payload.admin, target)
      );
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'send') {
      const result = await writeStore(kv, data =>
        sendMoney(data, payload.admin, payload.to, payload.amount, payload.currency)
      );
      if (result.error) return json(result, { status: result.error === 'Admin only' ? 403 : 400 });
      return json(result);
    }

    if (payload.action === 'tip') {
      const result = await writeStore(kv, data =>
        tipPlayer(data, payload.from, payload.to, payload.amount, payload.currency)
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    return json({ error: 'Unknown action' }, 400);
  }

  return methodNotAllowed();
}
