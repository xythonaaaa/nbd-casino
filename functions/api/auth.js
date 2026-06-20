import {
  authenticateRequest,
  createAuthSession,
  loginWithPassword,
  registerWithPassword,
  revokeAuthSession,
  verifySession,
} from '../lib/auth.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const STORE_KEY = 'data';

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

function ensureUser(store, username) {
  const name = String(username || '').trim().slice(0, 16);
  if (!name) return null;
  const key = name.toLowerCase();
  if (!store.users.some(u => String(u).toLowerCase() === key)) {
    store.users.push(name);
    if (!store.userMeta) store.userMeta = {};
    if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
  }
  return store.users.find(u => String(u).toLowerCase() === key) || name;
}

async function writeStore(kv, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await loadStore(kv);
    const result = await mutator(data);
    if (result?.error) return result;
    await saveStore(kv, data);
    return result;
  }
  return { error: 'Store busy, try again' };
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.WALLET_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const session = await verifySession(kv, token);
    if (!session) return json({ error: 'Invalid or expired session' }, 401);
    return json({
      ok: true,
      username: session.username,
      expiresAt: session.expiresAt,
    });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'logout') {
      await revokeAuthSession(kv, payload.sessionToken);
      return json({ ok: true });
    }

    if (payload.action === 'register') {
      const result = await writeStore(kv, async data => {
        const registered = await registerWithPassword(
          data,
          payload.username,
          payload.password,
          ensureUser
        );
        return registered;
      });
      if (result.error) return json(result, { status: 400 });

      const session = await createAuthSession(kv, result.username);
      return json({
        ok: true,
        username: result.username,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      });
    }

    if (payload.action === 'login') {
      const result = await writeStore(kv, async data =>
        loginWithPassword(data, payload.username, payload.password, payload.migration)
      );
      if (result.error) return json(result, { status: 400 });

      const session = await createAuthSession(kv, result.username);
      return json({
        ok: true,
        username: result.username,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      });
    }

    const auth = await authenticateRequest(kv, request, payload);
    if (auth.error) return json(auth, { status: 401 });
    return json({ ok: true, username: auth.username });
  }

  return methodNotAllowed();
}
