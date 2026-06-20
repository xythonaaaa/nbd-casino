const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHAT_FILE = path.join(__dirname, 'chat-data.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard-data.json');
const AFFILIATES_FILE = path.join(__dirname, 'affiliates-data.json');
const WALLET_FILE = path.join(__dirname, 'wallet-data.json');
const PORT = Number(process.env.PORT) || 8080;
const MAX_MESSAGES = 200;
const MAX_WINS = 500;
const MAX_RECENT_BETS = 100;
const LEADERBOARD_MAX_BET = 5000;
const BANNED_LEADERBOARD_USERS = new Set(['tiddlesz']);
const AFFILIATE_COMMISSION_RATE = 0.05;
const AFFILIATE_MIN_CLAIM = 0.01;
const WALLET_ADMIN_USERNAMES = ['ceo'];
const WALLET_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];
const MIN_TIP_USD = 0.01;
const TIP_COOLDOWN_MS = 2000;
const SIGNUP_BONUS_USD = 500;
const SELF_EXCLUDE_DURATIONS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '6mo': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  permanent: -1,
};
const ORIGINALS_GAMES = new Set([
  'blackjack', 'double-down-blackjack', 'plinko', 'roulette', 'dice', 'mines', 'crash',
  'keno', 'limbo', 'war', 'coinflip', 'hilo', 'tower', 'wheel',
]);

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

function isReservedChatUser(username) {
  const name = String(username || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase();
  return name === 'system' || name === 'admin' || name === 'moderator' || name === 'mod';
}

function looksLikeFakeTipAnnouncement(text) {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (/tipped\s+(everyone|all|everybody|the\s+chat|chat|room)/i.test(clean)) return true;
  if (/^[\w@.-]+\s+tipped\s+[\w@.-]+\s+\$?[\d,]+(?:\.\d+)?/i.test(clean)) return true;
  return false;
}

function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(msg => {
    if (!msg || typeof msg.text !== 'string' || !msg.user) return false;
    if (isReservedChatUser(msg.user) && msg.system !== true) return false;
    return true;
  });
}

function appendSystemChatMessage(text) {
  const clean = String(text || '').trim().slice(0, 240);
  if (!clean) return;
  const messages = loadMessages();
  messages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user: 'System',
    text: clean,
    system: true,
    ts: Date.now(),
  });
  saveMessages(messages);
}

function isBlockedLeaderboardEntry(entry) {
  if ((parseFloat(entry?.bet) || 0) > LEADERBOARD_MAX_BET) return true;
  const key = String(entry?.user || '').trim().toLowerCase();
  if (BANNED_LEADERBOARD_USERS.has(key)) return true;
  return false;
}

function sanitizeLeaderboard(data) {
  const before = data.wins.length + data.recentBets.length;
  data.wins = data.wins.filter(w => !isBlockedLeaderboardEntry(w));
  data.recentBets = data.recentBets.filter(b => !isBlockedLeaderboardEntry(b));
  return before !== data.wins.length + data.recentBets.length;
}

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    const data = {
      wins: Array.isArray(parsed.wins) ? parsed.wins : [],
      bets: parsed.bets && typeof parsed.bets === 'object' ? parsed.bets : {},
      recentBets: Array.isArray(parsed.recentBets) ? parsed.recentBets : [],
    };
    if (sanitizeLeaderboard(data)) saveLeaderboard(data);
    return data;
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

function defaultWalletBalances() {
  return { USD: 0, BTC: 0, ETH: 0, LTC: 0 };
}

function defaultWalletStore() {
  return { users: [], grants: {}, balances: {}, userMeta: {}, resetAt: 0 };
}

function loadWalletStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      grants: parsed.grants && typeof parsed.grants === 'object' ? parsed.grants : {},
      balances: parsed.balances && typeof parsed.balances === 'object' ? parsed.balances : {},
      userMeta: parsed.userMeta && typeof parsed.userMeta === 'object' ? parsed.userMeta : {},
      resetAt: Math.max(0, parseInt(parsed.resetAt, 10) || 0),
    };
  } catch {
    return defaultWalletStore();
  }
}

function saveWalletStore(data) {
  fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2));
}

function walletUserKey(username) {
  return String(username || '').trim().toLowerCase();
}

function isWalletAdmin(username) {
  const name = walletUserKey(username);
  return WALLET_ADMIN_USERNAMES.some(u => u.toLowerCase() === name);
}

function ensureWalletUser(store, username) {
  const name = String(username || '').trim().slice(0, 16);
  if (!name) return null;
  const key = walletUserKey(name);
  if (!store.users.some(u => u.toLowerCase() === key)) {
    store.users.push(name);
    if (!store.userMeta) store.userMeta = {};
    if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
    if (!store.balances) store.balances = {};
    if (!store.balances[key]) {
      store.balances[key] = defaultWalletBalances();
      store.balances[key].USD = SIGNUP_BONUS_USD;
    }
  }
  return name;
}

function resolveWalletUser(store, username) {
  const key = walletUserKey(username);
  return store.users.find(u => u.toLowerCase() === key) || null;
}

function getWalletBalances(store, username) {
  const key = walletUserKey(username);
  const raw = store.balances?.[key] || defaultWalletBalances();
  const balances = defaultWalletBalances();
  WALLET_CURRENCIES.forEach(cur => {
    balances[cur] = Math.max(0, parseFloat(raw[cur]) || 0);
  });
  return balances;
}

function getCombinedWalletBalance(store, username) {
  const grants = getWalletGrants(store, username);
  const balances = getWalletBalances(store, username);
  const combined = defaultWalletBalances();
  WALLET_CURRENCIES.forEach(cur => {
    combined[cur] = grants[cur] + balances[cur];
  });
  return combined;
}

function ensureWalletBalancesEntry(store, key) {
  if (!store.balances) store.balances = {};
  if (!store.balances[key]) store.balances[key] = defaultWalletBalances();
}

function debitCombinedWallet(store, username, currency, amount) {
  const key = walletUserKey(username);
  ensureWalletBalancesEntry(store, key);
  if (!store.grants[key]) store.grants[key] = defaultWalletBalances();

  let remaining = amount;
  const grant = parseFloat(store.grants[key][currency]) || 0;
  const fromGrant = Math.min(grant, remaining);
  store.grants[key][currency] = grant - fromGrant;
  remaining -= fromGrant;

  if (remaining > 0) {
    const balance = parseFloat(store.balances[key][currency]) || 0;
    if (balance < remaining) return false;
    store.balances[key][currency] = balance - remaining;
  }
  return true;
}

function creditCombinedWallet(store, username, currency, amount) {
  const key = walletUserKey(username);
  ensureWalletBalancesEntry(store, key);
  store.balances[key][currency] = (parseFloat(store.balances[key][currency]) || 0) + amount;
}

function getWalletGrants(store, username) {
  const key = walletUserKey(username);
  const raw = store.grants[key] || defaultWalletBalances();
  const grants = defaultWalletBalances();
  WALLET_CURRENCIES.forEach(cur => {
    grants[cur] = Math.max(0, parseFloat(raw[cur]) || 0);
  });
  return grants;
}

function ensureWalletUserMeta(store, username) {
  const key = walletUserKey(username);
  if (!store.userMeta) store.userMeta = {};
  if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
  return store.userMeta[key];
}

function getSelfExclusionStatus(store, username) {
  const key = walletUserKey(username);
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

function isWalletSelfExcluded(store, username) {
  return getSelfExclusionStatus(store, username).active;
}

function applyWalletSelfExclusion(store, username, duration) {
  const player = resolveWalletUser(store, username);
  if (!player) return { error: 'Not registered' };

  const durationKey = String(duration || '').trim();
  const ms = SELF_EXCLUDE_DURATIONS[durationKey];
  if (ms === undefined) return { error: 'Invalid duration' };

  const key = walletUserKey(player);
  const meta = ensureWalletUserMeta(store, player);
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

function sendWalletMoney(store, admin, to, amount, currency) {
  const adminName = String(admin || '').trim();
  const recipient = String(to || '').trim().slice(0, 16);
  const cur = String(currency || 'USD').toUpperCase();
  if (!isWalletAdmin(adminName)) return { error: 'Admin only' };
  if (!recipient) return { error: 'Invalid recipient' };
  if (!WALLET_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };
  ensureWalletUser(store, recipient);
  const key = walletUserKey(recipient);
  if (!store.grants[key]) store.grants[key] = defaultWalletBalances();
  store.grants[key][cur] = (parseFloat(store.grants[key][cur]) || 0) + amt;
  return { ok: true, to: recipient, amount: amt, currency: cur, grants: getWalletGrants(store, recipient) };
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
  if (!isWalletAdmin(adminName)) return { error: 'Admin only' };
  if (!player) return { error: 'Invalid username' };
  const key = walletUserKey(player);
  if (store.grants[key]) {
    store.grants[key] = defaultWalletBalances();
  }
  if (store.balances?.[key]) {
    store.balances[key] = defaultWalletBalances();
  }
  return { ok: true, username: player, grants: getWalletGrants(store, player) };
}

function getPlayerProfile(store, username) {
  const meta = store.userMeta?.[walletUserKey(username)] || {};
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
  if (!isWalletAdmin(adminName)) return { error: 'Admin only' };
  if (!playerRaw) return { error: 'Invalid username' };

  const player = resolveWalletUser(store, playerRaw);
  if (!player) return { error: 'Player not found' };

  const meta = ensureWalletUserMeta(store, player);
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

function tipWalletPlayer(store, from, to, amount, currency) {
  const senderRaw = String(from || '').trim().slice(0, 16);
  const recipientRaw = String(to || '').trim().slice(0, 16);

  if (!senderRaw) return { error: 'Invalid sender' };
  if (!recipientRaw) return { error: 'Invalid recipient' };

  const cur = String(currency || 'USD').toUpperCase();
  if (!WALLET_CURRENCIES.includes(cur)) return { error: 'Invalid currency' };
  if (cur !== 'USD') return { error: 'Tips are USD only' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { error: 'Invalid amount' };
  if (amt < MIN_TIP_USD) return { error: `Minimum tip is $${MIN_TIP_USD.toFixed(2)}` };

  const sender = resolveWalletUser(store, senderRaw);
  if (!sender) return { error: 'Sender not registered' };

  const recipient = resolveWalletUser(store, recipientRaw);
  if (!recipient) return { error: 'Recipient not found' };

  if (walletUserKey(sender) === walletUserKey(recipient)) return { error: 'Cannot tip yourself' };
  if (isWalletSelfExcluded(store, sender)) return { error: 'You are self-excluded and cannot tip' };

  const senderKey = walletUserKey(sender);
  if (!store.userMeta) store.userMeta = {};
  if (!store.userMeta[senderKey]) store.userMeta[senderKey] = { registeredAt: Date.now() };
  const lastTip = parseInt(store.userMeta[senderKey].lastTipAt, 10) || 0;
  if (Date.now() - lastTip < TIP_COOLDOWN_MS) return { error: 'Please wait before tipping again' };

  const combined = getCombinedWalletBalance(store, sender);
  if (combined[cur] < amt) return { error: 'Insufficient balance' };

  if (!debitCombinedWallet(store, sender, cur, amt)) return { error: 'Insufficient balance' };
  creditCombinedWallet(store, recipient, cur, amt);
  store.userMeta[senderKey].lastTipAt = Date.now();

  return {
    ok: true,
    from: sender,
    to: recipient,
    amount: amt,
    currency: cur,
    fromGrants: getWalletGrants(store, sender),
    fromBalances: getWalletBalances(store, sender),
    toGrants: getWalletGrants(store, recipient),
    toBalances: getWalletBalances(store, recipient),
  };
}

function resetOriginalsLeaderboard(data) {
  data.wins = data.wins.filter(w => !ORIGINALS_GAMES.has(w.game));
  ORIGINALS_GAMES.forEach(game => {
    data.bets[game] = 0;
  });
  data.recentBets = data.recentBets.filter(b => !ORIGINALS_GAMES.has(b.game));
  return data;
}

function findAffiliateJoinedAt(store, username) {
  const key = walletUserKey(username);
  for (const affData of Object.values(store.affiliates || {})) {
    const referrals = affData?.referrals;
    if (!Array.isArray(referrals)) continue;
    const ref = referrals.find(r => walletUserKey(r.username) === key);
    if (ref?.joinedAt) return ref.joinedAt;
  }
  return null;
}

function aggregateLeaderboardPlayerStats(leaderboard) {
  const stats = {};
  const touch = user => {
    const key = walletUserKey(user);
    if (!key || key === 'player') return null;
    if (!stats[key]) stats[key] = { bets: 0, wagered: 0, wins: 0, payout: 0 };
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

function usernameMatchesPlayer(name, keys) {
  return keys.has(walletUserKey(name));
}

function parseDeletePlayerTargets(payload) {
  const raw = [];
  if (Array.isArray(payload.usernames)) raw.push(...payload.usernames);
  if (payload.username) raw.push(payload.username);
  const keys = new Set();
  const names = [];
  for (const name of raw) {
    const trimmed = String(name || '').trim().slice(0, 16);
    if (!trimmed) continue;
    const key = walletUserKey(trimmed);
    if (isWalletAdmin(trimmed)) continue;
    if (!keys.has(key)) {
      keys.add(key);
      names.push(trimmed);
    }
  }
  return { keys, names };
}

function removePlayersFromWalletStore(wallet, keys) {
  const removed = { users: [], grants: [], userMeta: [] };
  wallet.users = wallet.users.filter(u => {
    if (usernameMatchesPlayer(u, keys)) {
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

function removePlayersFromAffiliateStore(affiliates, keys) {
  const removed = { users: [], referralMap: [], affiliates: [], referrals: [] };

  affiliates.users = affiliates.users.filter(u => {
    if (usernameMatchesPlayer(u, keys)) {
      removed.users.push(u);
      return false;
    }
    return true;
  });

  for (const refUserKey of Object.keys(affiliates.referralMap)) {
    const referrer = affiliates.referralMap[refUserKey];
    if (keys.has(refUserKey) || usernameMatchesPlayer(referrer, keys)) {
      removed.referralMap.push({ user: refUserKey, referrer });
      delete affiliates.referralMap[refUserKey];
    }
  }

  for (const affKey of Object.keys(affiliates.affiliates)) {
    if (usernameMatchesPlayer(affKey, keys)) {
      removed.affiliates.push(affKey);
      delete affiliates.affiliates[affKey];
    }
  }

  for (const [affKey, affData] of Object.entries(affiliates.affiliates)) {
    if (!Array.isArray(affData?.referrals)) continue;
    affData.referrals = affData.referrals.filter(r => {
      if (usernameMatchesPlayer(r.username, keys)) {
        removed.referrals.push({ affiliate: affKey, username: r.username });
        return false;
      }
      return true;
    });
  }

  return removed;
}

function removePlayersFromLeaderboardStore(leaderboard, keys) {
  const removed = { wins: 0, recentBets: 0 };
  const beforeWins = leaderboard.wins.length;
  leaderboard.wins = leaderboard.wins.filter(w => !usernameMatchesPlayer(w.user, keys));
  removed.wins = beforeWins - leaderboard.wins.length;

  const beforeBets = leaderboard.recentBets.length;
  leaderboard.recentBets = leaderboard.recentBets.filter(b => !usernameMatchesPlayer(b.user, keys));
  removed.recentBets = beforeBets - leaderboard.recentBets.length;

  return removed;
}

function removePlayersFromChatStore(keys) {
  const messages = loadMessages();
  const before = messages.length;
  const filtered = messages.filter(m => !usernameMatchesPlayer(m.user, keys));
  saveMessages(filtered);
  return { messages: before - filtered.length };
}

function deletePlayersFromAllStores(payload) {
  const { keys, names } = parseDeletePlayerTargets(payload);
  if (!names.length) return { error: 'No valid usernames to delete' };

  const wallet = loadWalletStore();
  const affiliates = loadAffiliateStore();
  const leaderboard = loadLeaderboard();

  const removed = {
    wallet: removePlayersFromWalletStore(wallet, keys),
    affiliates: removePlayersFromAffiliateStore(affiliates, keys),
    leaderboard: removePlayersFromLeaderboardStore(leaderboard, keys),
    chat: removePlayersFromChatStore(keys),
  };

  saveWalletStore(wallet);
  saveAffiliateStore(affiliates);
  saveLeaderboard(leaderboard);

  const players = buildAdminPlayersList();
  return { ok: true, deleted: names, removed, count: players.length, players };
}

function buildAdminPlayersList() {
  const wallet = loadWalletStore();
  const affiliates = loadAffiliateStore();
  const leaderboard = loadLeaderboard();
  const lbStats = aggregateLeaderboardPlayerStats(leaderboard);
  const players = new Map();
  const allUsers = new Set();

  wallet.users.forEach(u => allUsers.add(resolveAffiliateUser(wallet.users, u)));
  affiliates.users.forEach(u => allUsers.add(resolveAffiliateUser(affiliates.users, u)));

  for (const username of allUsers) {
    if (!username) continue;
    const key = walletUserKey(username);
    const stats = lbStats[key] || { bets: 0, wagered: 0, wins: 0, payout: 0 };
    const joinedAt = wallet.userMeta[key]?.registeredAt
      || findAffiliateJoinedAt(affiliates, username)
      || null;
    const referrerRaw = affiliates.referralMap[key] || null;
    const referrer = referrerRaw ? resolveAffiliateUser(affiliates.users, referrerRaw) : null;

    players.set(key, {
      username,
      grants: getWalletGrants(wallet, username),
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

function handleAdminPlayersRequest(req, res, urlPath) {
  const query = new URL(`http://local${urlPath}`).searchParams;

  if (req.method === 'GET') {
    const admin = query.get('admin') || '';
    if (!isWalletAdmin(admin)) {
      sendJson(res, 403, { error: 'Admin only' });
      return;
    }
    const players = buildAdminPlayersList();
    sendJson(res, 200, { ok: true, count: players.length, players });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!isWalletAdmin(payload.admin)) {
          sendJson(res, 403, { error: 'Admin only' });
          return;
        }

        if (payload.action === 'delete-player') {
          const result = deletePlayersFromAllStores(payload);
          if (result.error) {
            sendJson(res, 400, result);
            return;
          }
          sendJson(res, 200, result);
          return;
        }

        const players = buildAdminPlayersList();
        sendJson(res, 200, { ok: true, count: players.length, players });
      } catch {
        sendJson(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}

function handleWalletRequest(req, res, urlPath) {
  const query = new URL(`http://local${urlPath}`).searchParams;

  if (req.method === 'GET') {
    const store = loadWalletStore();
    if (query.get('meta') === 'resetAt') {
      sendJson(res, 200, { resetAt: store.resetAt || 0 });
      return;
    }

    const user = query.get('user') || '';
    if (!user.trim()) {
      sendJson(res, 400, { error: 'Missing user' });
      return;
    }
    sendJson(res, 200, {
      grants: getWalletGrants(store, user),
      balances: getWalletBalances(store, user),
      resetAt: store.resetAt || 0,
      account: getSelfExclusionStatus(store, user),
      profile: getPlayerProfile(store, user),
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const store = loadWalletStore();
        const action = payload.action;
        let result;

        if (action === 'register') {
          const name = ensureWalletUser(store, payload.username);
          if (!name) {
            sendJson(res, 400, { error: 'Invalid username' });
            return;
          }
          result = { ok: true };
        } else if (action === 'send') {
          result = sendWalletMoney(store, payload.admin, payload.to, payload.amount, payload.currency);
          if (result.error) {
            sendJson(res, result.error === 'Admin only' ? 403 : 400, result);
            return;
          }
        } else if (action === 'tip') {
          result = tipWalletPlayer(store, payload.from, payload.to, payload.amount, payload.currency);
          if (result.error) {
            sendJson(res, 400, result);
            return;
          }
          appendSystemChatMessage(`${result.from} tipped ${result.to} $${result.amount.toFixed(2)}`);
        } else if (action === 'reset-all') {
          if (!isWalletAdmin(payload.admin)) {
            sendJson(res, 403, { error: 'Admin only' });
            return;
          }
          result = resetAllWallets(store);
        } else if (action === 'reset-player') {
          result = resetPlayerWallet(store, payload.admin, payload.username || payload.to);
          if (result.error) {
            sendJson(res, result.error === 'Admin only' ? 403 : 400, result);
            return;
          }
        } else if (action === 'set-player-profile') {
          result = setPlayerProfile(store, payload.admin, payload.username || payload.to, {
            wagered: payload.wagered,
            resetRakeback: !!payload.resetRakeback,
          });
          if (result.error) {
            sendJson(res, result.error === 'Admin only' ? 403 : 400, result);
            return;
          }
        } else if (action === 'self-exclude') {
          result = applyWalletSelfExclusion(store, payload.username, payload.duration);
          if (result.error) {
            sendJson(res, 400, result);
            return;
          }
        } else {
          sendJson(res, 400, { error: 'Unknown action' });
          return;
        }

        saveWalletStore(store);
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
  const user = String(payload.user || 'Player').trim().slice(0, 16) || 'Player';
  if (betAmt > LEADERBOARD_MAX_BET || BANNED_LEADERBOARD_USERS.has(user.toLowerCase())) {
    return loadLeaderboard();
  }

  const won = payload.won === true;
  const mult = payload.mult != null
    ? Math.round(parseFloat(payload.mult) * 100) / 100
    : (betAmt > 0 ? Math.round((payAmt / betAmt) * 100) / 100 : 0);

  if (!data.recentBets) data.recentBets = [];
  data.recentBets.unshift({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    game,
    user,
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
      user,
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
    sendJson(res, 200, { messages: sanitizeChatMessages(loadMessages()) });
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');

        if (payload.action === 'delete-message') {
          if (!isWalletAdmin(payload.admin)) {
            sendJson(res, 403, { error: 'Admin only' });
            return;
          }

          const messageId = String(payload.messageId || '').trim();
          if (!messageId) {
            sendJson(res, 400, { error: 'Invalid message id' });
            return;
          }

          const messages = loadMessages();
          const filtered = messages.filter(m => m.id !== messageId);
          if (filtered.length === messages.length) {
            sendJson(res, 404, { error: 'Message not found' });
            return;
          }

          saveMessages(filtered);
          sendJson(res, 200, { ok: true, messages: filtered });
          return;
        }

        const text = String(payload.text || '').trim().slice(0, 240);
        const user = String(payload.user || '')
          .normalize('NFKC')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .trim()
          .slice(0, 16);
        if (!text || !user) {
          sendJson(res, 400, { error: 'Invalid message' });
          return;
        }
        if (isReservedChatUser(user)) {
          sendJson(res, 400, { error: 'Invalid username' });
          return;
        }
        if (looksLikeFakeTipAnnouncement(text)) {
          sendJson(res, 400, { error: 'Message not allowed' });
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

        if (payload.action === 'reset-originals') {
          if (!isWalletAdmin(payload.admin)) {
            sendJson(res, 403, { error: 'Admin only' });
            return;
          }
          const data = loadLeaderboard();
          resetOriginalsLeaderboard(data);
          saveLeaderboard(data);
          sendJson(res, 200, { ok: true, reset: 'originals', ...data });
          return;
        }

        if (payload.action === 'remove-player') {
          if (!isWalletAdmin(payload.admin)) {
            sendJson(res, 403, { error: 'Admin only' });
            return;
          }
          const { keys, names } = parseDeletePlayerTargets(payload);
          if (!names.length) {
            sendJson(res, 400, { error: 'No valid usernames' });
            return;
          }
          const data = loadLeaderboard();
          const removed = removePlayersFromLeaderboardStore(data, keys);
          saveLeaderboard(data);
          sendJson(res, 200, { ok: true, usernames: names, removed, ...data });
          return;
        }

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

  if (req.url === '/api/stats' && req.method === 'GET') {
    const wallet = loadWalletStore();
    sendJson(res, 200, { playersOnline: wallet.users.length });
    return;
  }

  if (req.url.startsWith('/api/affiliates')) {
    handleAffiliatesRequest(req, res, req.url);
    return;
  }

  if (req.url.startsWith('/api/admin-players')) {
    handleAdminPlayersRequest(req, res, req.url);
    return;
  }

  if (req.url.startsWith('/api/wallet')) {
    handleWalletRequest(req, res, req.url);
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
