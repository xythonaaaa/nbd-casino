import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const STORE_KEY = 'data';
const COMMISSION_RATE = 0.05;
const MIN_CLAIM = 0.01;

function defaultAffiliateData() {
  return { pending: 0, lifetime: 0, referralWagered: 0, referrals: [] };
}

function defaultStore() {
  return { users: [], referralMap: {}, affiliates: {} };
}

function normalizeStore(raw) {
  const data = raw && typeof raw === 'object' ? raw : defaultStore();
  return {
    users: Array.isArray(data.users) ? data.users : [],
    referralMap: data.referralMap && typeof data.referralMap === 'object' ? data.referralMap : {},
    affiliates: data.affiliates && typeof data.affiliates === 'object' ? data.affiliates : {},
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

function resolveUser(users, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  const found = users.find(u => u.toLowerCase() === trimmed.toLowerCase());
  return found || trimmed;
}

function userExists(store, username) {
  const lower = String(username || '').trim().toLowerCase();
  return store.users.some(u => u.toLowerCase() === lower);
}

function getAffiliateEntry(store, username) {
  const name = String(username || '').trim();
  if (!name) return null;
  const resolved = resolveUser(store.users, name);
  if (store.affiliates[resolved]) return { key: resolved, data: store.affiliates[resolved] };
  const foundKey = Object.keys(store.affiliates).find(
    k => k.toLowerCase() === resolved.toLowerCase()
  );
  return foundKey ? { key: foundKey, data: store.affiliates[foundKey] } : null;
}

function getAffiliatePayload(store, username) {
  const name = String(username || '').trim();
  const entry = getAffiliateEntry(store, name);
  const data = entry?.data
    ? {
        pending: entry.data.pending || 0,
        lifetime: entry.data.lifetime || 0,
        referralWagered: entry.data.referralWagered || 0,
        referrals: [...(entry.data.referrals || [])],
      }
    : defaultAffiliateData();

  const affKey = (resolveUser(store.users, name) || name).toLowerCase();
  Object.entries(store.referralMap).forEach(([userKey, referrer]) => {
    const refKey = (resolveUser(store.users, referrer) || referrer).toLowerCase();
    if (refKey !== affKey) return;
    const referredName = resolveUser(store.users, userKey) || userKey;
    if (data.referrals.some(r => r.username.toLowerCase() === referredName.toLowerCase())) return;
    const storedRef = entry?.data?.referrals?.find(
      r => r.username.toLowerCase() === referredName.toLowerCase()
    );
    data.referrals.push({
      username: referredName,
      joinedAt: storedRef?.joinedAt || Date.now(),
      wagered: storedRef?.wagered || 0,
    });
  });

  return {
    referrer: store.referralMap[String(name).toLowerCase()] || null,
    ...data,
  };
}

function registerUser(store, username) {
  const name = String(username || '').trim().slice(0, 16);
  if (!name) return { error: 'Invalid username' };
  if (!userExists(store, name)) store.users.push(name);
  return { ok: true };
}

function linkReferral(store, newUser, referrerRaw) {
  const newName = String(newUser || '').trim().slice(0, 16);
  const code = String(referrerRaw || '').trim().slice(0, 16);
  if (!newName || !code) return { error: 'Invalid referral' };
  if (newName.toLowerCase() === code.toLowerCase()) return { error: 'Cannot refer yourself' };

  const referrer = resolveUser(store.users, code);
  if (!userExists(store, referrer)) return { error: 'Referrer not found' };

  const userKey = newName.toLowerCase();
  if (store.referralMap[userKey]) {
    return { ok: true, referrer: store.referralMap[userKey], alreadyLinked: true };
  }

  store.referralMap[userKey] = referrer;
  if (!userExists(store, newName)) store.users.push(newName);

  const refEntry = getAffiliateEntry(store, referrer);
  const refKey = refEntry?.key || referrer;
  if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();

  if (!store.affiliates[refKey].referrals.some(r => r.username.toLowerCase() === newName.toLowerCase())) {
    store.affiliates[refKey].referrals.push({
      username: newName,
      joinedAt: Date.now(),
      wagered: 0,
    });
  }

  return { ok: true, referrer };
}

function accrueWager(store, username, amount) {
  const wagered = Math.max(0, parseFloat(amount) || 0);
  const name = String(username || '').trim();
  if (!name || wagered <= 0) return { ok: true };

  const userKey = name.toLowerCase();
  const referrer = store.referralMap[userKey];
  if (!referrer || referrer.toLowerCase() === userKey) return { ok: true };

  const refEntry = getAffiliateEntry(store, referrer);
  const refKey = refEntry?.key || referrer;
  if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();

  const commission = wagered * COMMISSION_RATE;
  store.affiliates[refKey].pending = (store.affiliates[refKey].pending || 0) + commission;
  store.affiliates[refKey].referralWagered = (store.affiliates[refKey].referralWagered || 0) + wagered;

  const referral = store.affiliates[refKey].referrals.find(
    r => r.username.toLowerCase() === name.toLowerCase()
  );
  if (referral) referral.wagered = (referral.wagered || 0) + wagered;

  return { ok: true };
}

function claimCommission(store, username) {
  const entry = getAffiliateEntry(store, username);
  if (!entry?.data) return { claimed: 0 };

  const pending = entry.data.pending || 0;
  if (pending < MIN_CLAIM) return { claimed: 0 };

  entry.data.pending = 0;
  entry.data.lifetime = (entry.data.lifetime || 0) + pending;
  return { claimed: pending };
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

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.AFFILIATES_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const user = url.searchParams.get('user') || '';
    const exists = url.searchParams.get('exists') || '';
    const data = await loadStore(kv);

    if (exists.trim()) {
      return json({ exists: userExists(data, exists.trim()) });
    }

    if (!user.trim()) {
      return json({ error: 'Missing user' }, 400);
    }
    return json(getAffiliatePayload(data, user));
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    const action = payload.action;

    if (action === 'register') {
      const result = await writeStore(kv, data => registerUser(data, payload.username));
      if (result.error) return json(result, { status: 400 });
      return json({ ok: true });
    }

    if (action === 'link') {
      const result = await writeStore(kv, data =>
        linkReferral(data, payload.newUser, payload.referrer)
      );
      if (result.error) return json(result, { status: 400 });
      return json(result);
    }

    if (action === 'wager') {
      await writeStore(kv, data => {
        accrueWager(data, payload.username, payload.amount);
        return { ok: true };
      });
      return json({ ok: true });
    }

    if (action === 'claim') {
      const result = await writeStore(kv, data => claimCommission(data, payload.username));
      return json(result);
    }

    return json({ error: 'Unknown action' }, 400);
  }

  return methodNotAllowed();
}
