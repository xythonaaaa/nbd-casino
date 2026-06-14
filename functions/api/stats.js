import { json, methodNotAllowed, corsOptions } from '../lib/http.js';
import { kvGet } from '../lib/kv.js';

const WALLET_STORE_KEY = 'data';

async function loadWalletUsers(kv) {
  try {
    const raw = await kvGet(kv, WALLET_STORE_KEY, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const users = await loadWalletUsers(env.WALLET_KV);
    return json({ playersOnline: users.length });
  }

  return methodNotAllowed();
}
