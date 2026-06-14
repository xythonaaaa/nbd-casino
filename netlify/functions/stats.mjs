import { getStore } from '@netlify/blobs';

const WALLET_STORE_KEY = 'data';

async function loadWalletUsers() {
  const store = getStore({ name: 'nbd-wallet', consistency: 'strong' });
  try {
    const raw = await store.get(WALLET_STORE_KEY, { type: 'json', consistency: 'strong' });
    const data = raw && typeof raw === 'object' ? raw : {};
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

export default async (req) => {
  if (req.method === 'GET') {
    const users = await loadWalletUsers();
    return Response.json({ playersOnline: users.length });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config = {
  path: '/api/stats',
};
