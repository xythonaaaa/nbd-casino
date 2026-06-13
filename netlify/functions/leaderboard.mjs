import { getStore } from '@netlify/blobs';

const MAX_WINS = 500;
const MAX_RECENT_BETS = 100;
const STORE_KEY = 'data';

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

async function loadData(store) {
  const data = (await store.get(STORE_KEY, { type: 'json' })) || defaultData();
  return normalizeData(data);
}

async function saveData(store, data) {
  await store.setJSON(STORE_KEY, data);
}

function pushRecentBet(data, entry) {
  if (!data.recentBets) data.recentBets = [];
  data.recentBets.unshift(entry);
  if (data.recentBets.length > MAX_RECENT_BETS) data.recentBets.length = MAX_RECENT_BETS;
}

export default async (req) => {
  const store = getStore('nbd-leaderboard');

  if (req.method === 'GET') {
    const data = await loadData(store);
    return Response.json(data);
  }

  if (req.method === 'POST') {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Bad request' }, { status: 400 });
    }

    const game = String(payload.game || '').trim().slice(0, 32);
    if (!game) {
      return Response.json({ error: 'Invalid game' }, { status: 400 });
    }

    const data = await loadData(store);
    data.bets[game] = (data.bets[game] || 0) + 1;

    const betAmt = Math.max(0, parseFloat(payload.bet) || 0);
    const payAmt = Math.max(0, parseFloat(payload.payout) || 0);
    const won = payload.won === true;
    const mult = payload.mult != null
      ? Math.round(parseFloat(payload.mult) * 100) / 100
      : (betAmt > 0 ? Math.round((payAmt / betAmt) * 100) / 100 : 0);

    pushRecentBet(data, {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      game,
      user: String(payload.user || 'Player').trim().slice(0, 16) || 'Player',
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
        user: String(payload.user || 'Player').trim().slice(0, 16) || 'Player',
        hidden: !!payload.hidden,
        bet: betAmt,
        payout: payAmt,
        mult,
        ts: Date.now(),
      });

      if (data.wins.length > MAX_WINS) data.wins.length = MAX_WINS;
    }

    await saveData(store, data);
    return Response.json({ ok: true, ...data });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config = {
  path: '/api/leaderboard',
};
