const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHAT_FILE = path.join(__dirname, 'chat-data.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard-data.json');
const AFFILIATES_FILE = path.join(__dirname, 'affiliates-data.json');
const PORT = Number(process.env.PORT) || 8080;
const MAX_MESSAGES = 200;
const MAX_WINS = 500;
const MAX_RECENT_BETS = 100;
const AFFILIATE_COMMISSION_RATE = 0.05;
const AFFILIATE_MIN_CLAIM = 0.01;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function loadMessages() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages(messages) {
  fs.mkdirSync(path.dirname(CHAT_FILE), { recursive: true });
  fs.writeFileSync(CHAT_FILE, JSON.stringify(messages.slice(-MAX_MESSAGES), null, 2));
}

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    return {
      wins: Array.isArray(parsed.wins) ? parsed.wins : [],
      bets: parsed.bets && typeof parsed.bets === 'object' ? parsed.bets : {},
      recentBets: Array.isArray(parsed.recentBets) ? parsed.recentBets : [],
    };
  } catch {
    return { wins: [], bets: {}, recentBets: [] };
  }
}

function saveLeaderboard(data) {
  fs.mkdirSync(path.dirname(LEADERBOARD_FILE), { recursive: true });
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
}

function defaultAffiliateData() {
  return { pending: 0, lifetime: 0, referralWagered: 0, referrals: [] };
}

function defaultAffiliateStore() {
  return { users: [], referralMap: {}, affiliates: {} };
}

function normalizeAffiliateStore(raw) {
  const data = raw && typeof raw === 'object' ? raw : defaultAffiliateStore();
  return {
    users: Array.isArray(data.users) ? data.users : [],
    referralMap: data.referralMap && typeof data.referralMap === 'object' ? data.referralMap : {},
    affiliates: data.affiliates && typeof data.affiliates === 'object' ? data.affiliates : {},
  };
}

function loadAffiliateStore() {
  try {
    return normalizeAffiliateStore(JSON.parse(fs.readFileSync(AFFILIATES_FILE, 'utf8')));
  } catch {
    return defaultAffiliateStore();
  }
}

function saveAffiliateStore(data) {
  fs.mkdirSync(path.dirname(AFFILIATES_FILE), { recursive: true });
  fs.writeFileSync(AFFILIATES_FILE, JSON.stringify(data, null, 2));
}

function resolveAffiliateUser(users, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  const found = users.find(u => u.toLowerCase() === trimmed.toLowerCase());
  return found || trimmed;
}

function affiliateUserExists(store, username) {
  const lower = String(username || '').trim().toLowerCase();
  return store.users.some(u => u.toLowerCase() === lower);
}

function getAffiliateEntry(store, username) {
  const name = String(username || '').trim();
  if (!name) return null;
  const resolved = resolveAffiliateUser(store.users, name);
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

  const affKey = (resolveAffiliateUser(store.users, name) || name).toLowerCase();
  Object.entries(store.referralMap).forEach(([userKey, referrer]) => {
    const refKey = (resolveAffiliateUser(store.users, referrer) || referrer).toLowerCase();
    if (refKey !== affKey) return;
    const referredName = resolveAffiliateUser(store.users, userKey) || userKey;
    if (!data.referrals.some(r => r.username.toLowerCase() === referredName.toLowerCase())) {
      data.referrals.push({ username: referredName, joinedAt: Date.now(), wagered: 0 });
    }
  });

  return {
    referrer: store.referralMap[String(name).toLowerCase()] || null,
    ...data,
  };
}

function registerAffiliateUser(store, username) {
  const name = String(username || '').trim().slice(0, 16);
  if (!name) return { error: 'Invalid username' };
  if (!affiliateUserExists(store, name)) store.users.push(name);
  return { ok: true };
}

function linkAffiliateReferral(store, newUser, referrerRaw) {
  const newName = String(newUser || '').trim().slice(0, 16);
  const code = String(referrerRaw || '').trim().slice(0, 16);
  if (!newName || !code) return { error: 'Invalid referral' };
  if (newName.toLowerCase() === code.toLowerCase()) return { error: 'Cannot refer yourself' };

  const referrer = resolveAffiliateUser(store.users, code);
  if (!affiliateUserExists(store, referrer)) return { error: 'Referrer not found' };

  const userKey = newName.toLowerCase();
  if (store.referralMap[userKey]) {
    return { ok: true, referrer: store.referralMap[userKey], alreadyLinked: true };
  }

  store.referralMap[userKey] = referrer;
  if (!affiliateUserExists(store, newName)) store.users.push(newName);

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

function accrueAffiliateWager(store, username, amount) {
  const wagered = Math.max(0, parseFloat(amount) || 0);
  const name = String(username || '').trim();
  if (!name || wagered <= 0) return { ok: true };

  const userKey = name.toLowerCase();
  const referrer = store.referralMap[userKey];
  if (!referrer || referrer.toLowerCase() === userKey) return { ok: true };

  const refEntry = getAffiliateEntry(store, referrer);
  const refKey = refEntry?.key || referrer;
  if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();

  const commission = wagered * AFFILIATE_COMMISSION_RATE;
  store.affiliates[refKey].pending = (store.affiliates[refKey].pending || 0) + commission;
  store.affiliates[refKey].referralWagered = (store.affiliates[refKey].referralWagered || 0) + wagered;

  const referral = store.affiliates[refKey].referrals.find(
    r => r.username.toLowerCase() === name.toLowerCase()
  );
  if (referral) referral.wagered = (referral.wagered || 0) + wagered;

  return { ok: true };
}

function claimAffiliateCommission(store, username) {
  const entry = getAffiliateEntry(store, username);
  if (!entry?.data) return { claimed: 0 };

  const pending = entry.data.pending || 0;
  if (pending < AFFILIATE_MIN_CLAIM) return { claimed: 0 };

  entry.data.pending = 0;
  entry.data.lifetime = (entry.data.lifetime || 0) + pending;
  return { claimed: pending };
}

function handleAffiliatesRequest(req, res, urlPath) {
  const query = new URL(`http://local${urlPath}`).searchParams;

  if (req.method === 'GET') {
    const store = loadAffiliateStore();
    const exists = query.get('exists') || '';
    if (exists.trim()) {
      sendJson(res, 200, { exists: affiliateUserExists(store, exists.trim()) });
      return;
    }

    const user = query.get('user') || '';
    if (!user.trim()) {
      sendJson(res, 400, { error: 'Missing user' });
      return;
    }
    sendJson(res, 200, getAffiliatePayload(store, user));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const store = loadAffiliateStore();
        const action = payload.action;
        let result;

        if (action === 'register') {
          result = registerAffiliateUser(store, payload.username);
          if (result.error) {
            sendJson(res, 400, result);
            return;
          }
        } else if (action === 'link') {
          result = linkAffiliateReferral(store, payload.newUser, payload.referrer);
          if (result.error) {
            sendJson(res, 400, result);
            return;
          }
        } else if (action === 'wager') {
          accrueAffiliateWager(store, payload.username, payload.amount);
          result = { ok: true };
        } else if (action === 'claim') {
          result = claimAffiliateCommission(store, payload.username);
        } else {
          sendJson(res, 400, { error: 'Unknown action' });
          return;
        }

        saveAffiliateStore(store);
        sendJson(res, 200, result);
      } catch {
        sendJson(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

function appendLeaderboardRound(payload) {
  const game = String(payload.game || '').trim().slice(0, 32);
  if (!game) return null;

  const data = loadLeaderboard();
  data.bets[game] = (data.bets[game] || 0) + 1;

  const betAmt = Math.max(0, parseFloat(payload.bet) || 0);
  const payAmt = Math.max(0, parseFloat(payload.payout) || 0);
  const won = payload.won === true;
  const mult = payload.mult != null
    ? Math.round(parseFloat(payload.mult) * 100) / 100
    : (betAmt > 0 ? Math.round((payAmt / betAmt) * 100) / 100 : 0);

  if (!data.recentBets) data.recentBets = [];
  data.recentBets.unshift({
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
  if (data.recentBets.length > MAX_RECENT_BETS) data.recentBets.length = MAX_RECENT_BETS;

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

  saveLeaderboard(data);
  return data;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.normalize(path.join(ROOT, relative));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function serveStatic(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/chat' && req.method === 'GET') {
    sendJson(res, 200, { messages: loadMessages() });
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const text = String(payload.text || '').trim().slice(0, 240);
        const user = String(payload.user || '').trim().slice(0, 16);
        if (!text || !user) {
          sendJson(res, 400, { error: 'Invalid message' });
          return;
        }

        const messages = loadMessages();
        messages.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          user,
          text,
          ts: Date.now(),
        });
        saveMessages(messages);
        sendJson(res, 200, { ok: true, messages });
      } catch {
        sendJson(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  if (req.url === '/api/leaderboard' && req.method === 'GET') {
    sendJson(res, 200, loadLeaderboard());
    return;
  }

  if (req.url === '/api/leaderboard' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const data = appendLeaderboardRound(payload);
        if (!data) {
          sendJson(res, 400, { error: 'Invalid game' });
          return;
        }
        sendJson(res, 200, { ok: true, ...data });
      } catch {
        sendJson(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  if (req.url.startsWith('/api/affiliates')) {
    handleAffiliatesRequest(req, res, req.url);
    return;
  }

  const filePath = safePath(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  serveStatic(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`NBD Casino running at http://localhost:${PORT}`);
  console.log('Shared live chat, public leaderboard, and affiliates enabled for all visitors.');
});
