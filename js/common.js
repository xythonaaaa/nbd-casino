const CHAT_STORAGE_KEY = 'nbd-chat-v1';
const CHAT_MAX_MESSAGES = 200;
const CHAT_MAX_LENGTH = 240;
const CHAT_POLL_MS = 3000;
const TIP_CMD_RE = /^\/tip\s+@?(\S+)\s+\$?([\d,.]+)\s*$/i;
const MIN_TIP_USD = 0.01;
const SEVEN_TV_EMOTES_CACHE_KEY = 'nbd-7tv-emotes-v2';
const SEVEN_TV_EMOTES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEVEN_TV_GLOBAL_SET_URL = 'https://7tv.io/v3/emote-sets/global';
const SEVEN_TV_USER_ID = '01K6MVTSE5YJYFY6KBMHYJ5QM5';
const SEVEN_TV_USER_URL = `https://7tv.io/v3/users/${SEVEN_TV_USER_ID}`;

const PANEL_STORAGE_KEY = 'xython-panel-open';
const WALLET_STORAGE_KEY = 'xython-wallet';
const VAULT_STORAGE_KEY = 'xython-vault';
const ADMIN_USERNAMES = ['ceo'];

let serverAuthProfile = { username: null, isAdmin: false };
let sessionVerifyTimer = null;
const SESSION_VERIFY_MS = 30000;

function isAdmin(username) {
  if (getAuthApiUrl()) {
    if (!isLoggedIn()) return false;
    const name = (username || getLoggedInUsername() || '').trim().toLowerCase();
    if (!name) return false;
    return serverAuthProfile.isAdmin
      && String(serverAuthProfile.username || '').trim().toLowerCase() === name;
  }
  const name = (username || getLoggedInUsername() || '').trim().toLowerCase();
  if (!name) return false;
  return ADMIN_USERNAMES.some(u => u.toLowerCase() === name);
}

function canDeposit() {
  return isLoggedIn() && isAdmin();
}

const GRANTS_SYNC_KEY = 'xython-grants-synced';
const WALLET_RESET_ACK_KEY = 'xython-wallet-reset-ack';
const PROFILE_SYNC_ACK_KEY = 'xython-profile-sync';
const WALLET_GRANTS_POLL_MS = 3000;
const WALLET_CURRENCIES = ['USD', 'BTC', 'ETH', 'LTC'];

let walletGrantsPollTimer = null;
let cachedAccountStatus = null;
let walletMutationAllowed = false;
let serverRakebackPending = 0;
let serverLastDailyClaimAt = 0;
const SERVER_WALLET_DEFAULT = { USD: 0, BTC: 0, ETH: 0, LTC: 0 };
let serverWalletBalances = { ...SERVER_WALLET_DEFAULT };

function usesServerWallet() {
  return !!getWalletApiUrl();
}

function resetServerWalletCache() {
  serverWalletBalances = { ...SERVER_WALLET_DEFAULT };
}

function refreshServerWalletDisplay() {
  if (!usesServerWallet()) return;
  walletMutationAllowed = true;
  WALLET_CURRENCIES.forEach(currency => {
    setWalletBalance(currency, serverWalletBalances[currency] ?? 0, false);
  });
  walletMutationAllowed = false;
}

function applyServerWalletFromResponse(data) {
  if (!data) return;
  walletMutationAllowed = true;
  const grants = data.grants || {};
  const balances = data.balances || {};
  WALLET_CURRENCIES.forEach(currency => {
    const total = data.combined?.[currency] ?? getCombinedServerTotal(grants, balances, currency);
    serverWalletBalances[currency] = total;
    setWalletBalance(currency, total, false);
  });
  if (!usesServerWallet()) saveWalletState();
  const username = getLoggedInUsername();
  if (username) markServerWalletSynced(username, grants, balances);
  if (data.rakebackPending != null) {
    serverRakebackPending = Math.max(0, parseFloat(data.rakebackPending) || 0);
  }
  if (data.lastDailyClaimAt != null) {
    serverLastDailyClaimAt = Math.max(0, parseInt(data.lastDailyClaimAt, 10) || 0);
  }
  walletMutationAllowed = false;
}

async function serverPlayRound({ game, bet, currency, params, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const block = getBetBlockReason();
  if (block) return { ok: false, error: block };

  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { ok: false, error: 'Invalid bet amount' };

  const cur = currency || window.XythonWallet?.getActiveCurrency?.() || 'USD';
  const result = await postWalletAction({
    action: 'play',
    username,
    game,
    bet: amt,
    currency: cur,
    params: params || {},
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not place bet' };
  }

  applyServerWalletFromResponse(result.data);

  if (tx) {
    const payout = parseFloat(result.data.payout) || 0;
    recordTransaction({
      type: 'bet',
      amount: -amt,
      currency: cur,
      label: tx.label || game,
      detail: tx.detail || `Bet $${amt.toFixed(2)}`,
      game: tx.game || game,
    });
    if (payout > 0) {
      recordTransaction({
        type: 'win',
        amount: payout,
        currency: cur,
        label: tx.label || game,
        detail: tx.winDetail || `Won $${payout.toFixed(2)}`,
        game: tx.game || game,
      });
    }
  }

  return {
    ok: true,
    outcome: result.data.outcome,
    payout: result.data.payout,
    bet: amt,
  };
}

async function serverStartSession({ game, bet, currency, params, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const block = getBetBlockReason();
  if (block) return { ok: false, error: block };

  const amt = parseFloat(bet);
  if (!amt || amt <= 0) return { ok: false, error: 'Invalid bet amount' };

  const cur = currency || window.XythonWallet?.getActiveCurrency?.() || 'USD';
  const result = await postWalletAction({
    action: 'session-start',
    username,
    game,
    bet: amt,
    currency: cur,
    params: params || {},
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not start round' };
  }

  applyServerWalletFromResponse(result.data);

  if (tx) {
    recordTransaction({
      type: 'bet',
      amount: -amt,
      currency: cur,
      label: tx.label || game,
      detail: tx.detail || `Bet $${amt.toFixed(2)}`,
      game: tx.game || game,
    });
  }

  return {
    ok: true,
    sessionId: result.data.sessionId,
    bet: amt,
    clientState: result.data.clientState || null,
  };
}

async function serverActSession({ sessionId, act, params, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const result = await postWalletAction({
    action: 'session-act',
    username,
    sessionId,
    act,
    params: params || {},
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not update round' };
  }

  applyServerWalletFromResponse(result.data);

  const payout = parseFloat(result.data.payout) || 0;
  if (payout > 0 && tx) {
    recordTransaction({
      type: 'win',
      amount: payout,
      currency: window.XythonWallet?.getActiveCurrency?.() || 'USD',
      label: tx.label || 'Game',
      detail: tx.detail || `Won $${payout.toFixed(2)}`,
      game: tx.game,
    });
  }

  return {
    ok: true,
    done: !!result.data.done,
    payout,
    outcome: result.data.outcome,
  };
}

async function serverSessionDebit({ sessionId, amount, currency, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { ok: false, error: 'Invalid amount' };

  const result = await postWalletAction({
    action: 'session-debit',
    username,
    sessionId,
    amount: amt,
    currency: currency || window.XythonWallet?.getActiveCurrency?.() || 'USD',
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not debit session' };
  }

  applyServerWalletFromResponse(result.data);
  if (tx) {
    recordTransaction({
      type: 'bet',
      amount: -amt,
      currency: currency || 'USD',
      label: tx.label || 'Game',
      detail: tx.detail || `Bet $${amt.toFixed(2)}`,
      game: tx.game,
    });
  }
  return { ok: true };
}

async function serverSessionCredit({ sessionId, amount, currency, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { ok: false, error: 'Invalid amount' };

  const result = await postWalletAction({
    action: 'session-credit',
    username,
    sessionId,
    amount: amt,
    currency: currency || window.XythonWallet?.getActiveCurrency?.() || 'USD',
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not credit session' };
  }

  applyServerWalletFromResponse(result.data);
  if (tx) {
    recordTransaction({
      type: 'win',
      amount: amt,
      currency: currency || 'USD',
      label: tx.label || 'Game',
      detail: tx.detail || `Won $${amt.toFixed(2)}`,
      game: tx.game,
    });
  }
  return { ok: true };
}

async function serverSessionSettle({ sessionId, payout, currency, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const amt = Math.max(0, parseFloat(payout) || 0);
  const result = await postWalletAction({
    action: 'session-settle',
    username,
    sessionId,
    payout: amt,
    currency: currency || window.XythonWallet?.getActiveCurrency?.() || 'USD',
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not settle session' };
  }

  applyServerWalletFromResponse(result.data);
  if (amt > 0 && tx) {
    recordTransaction({
      type: 'win',
      amount: amt,
      currency: currency || 'USD',
      label: tx.label || 'Game',
      detail: tx.detail || `Won $${amt.toFixed(2)}`,
      game: tx.game,
    });
  }
  return { ok: true, payout: amt };
}

async function serverClaimReward({ kind, amount, tx }) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!getWalletApiUrl()) return { ok: false, error: 'Server wallet unavailable' };

  const result = await postWalletAction({
    action: 'claim-reward',
    username,
    kind,
    amount: amount != null ? parseFloat(amount) : undefined,
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not claim reward' };
  }

  applyServerWalletFromResponse(result.data);
  const credited = parseFloat(result.data.amount) || 0;
  if (credited > 0 && tx) {
    recordTransaction({
      type: 'reward',
      amount: credited,
      currency: 'USD',
      label: tx.label || 'Reward',
      detail: tx.detail || `+$${credited.toFixed(2)}`,
    });
  }
  return { ok: true, amount: credited };
}

function applyInternalWalletDelta(currency, delta, tx) {
  if (usesServerWallet()) return;
  if (!delta) return;
  walletMutationAllowed = true;
  const cur = currency || window.XythonWallet?.getActiveCurrency?.() || 'USD';
  setWalletBalance(cur, getWalletBalance(cur) + delta);
  if (tx) {
    recordTransaction({
      type: tx.type || (delta > 0 ? 'reward' : 'bet'),
      amount: delta,
      currency: cur,
      label: tx.label || 'Wallet',
      detail: tx.detail || '',
      game: tx.game || null,
    });
  }
  walletMutationAllowed = false;
}

function getWalletApiUrl() {
  if (window.NBD_WALLET_API) return window.NBD_WALLET_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/wallet`;
  }
  return null;
}

async function postWalletAction(payload) {
  const url = getWalletApiUrl();
  if (!url) return null;
  const token = getSessionToken();
  if (token) payload.sessionToken = token;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

async function postLeaderboardAction(payload) {
  const url = getLeaderboardApiUrl();
  if (!url) return null;
  const token = getSessionToken();
  if (token) payload.sessionToken = token;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

function getAdminPlayersApiUrl() {
  if (window.NBD_ADMIN_PLAYERS_API) return window.NBD_ADMIN_PLAYERS_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/admin-players`;
  }
  return null;
}

async function fetchAdminPlayers() {
  const url = getAdminPlayersApiUrl();
  if (!url) return { ok: false, data: { error: 'Player list API is unavailable on this page.' } };
  if (!isAdmin()) return { ok: false, data: { error: 'Admin access required.' } };
  try {
    const token = getSessionToken();
    if (!token) return { ok: false, data: { error: 'Log in to continue' } };
    const res = await fetch(`${url}?sessionToken=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, data };
    return { ok: true, data };
  } catch {
    return { ok: false, data: { error: 'Network error while loading players.' } };
  }
}

async function postAdminPlayersAction(payload) {
  const url = getAdminPlayersApiUrl();
  if (!url) return null;
  const token = getSessionToken();
  if (token) payload.sessionToken = token;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

function formatAdminUsd(value) {
  const n = parseFloat(value) || 0;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAdminDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function registerUserOnWalletServer(username) {
  const result = await postWalletAction({ action: 'register', username });
  return !!result?.ok;
}

function loadGrantsSynced() {
  try {
    const raw = localStorage.getItem(GRANTS_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveGrantsSynced(data) {
  localStorage.setItem(GRANTS_SYNC_KEY, JSON.stringify(data));
}

async function fetchServerGrants(username) {
  const url = getWalletApiUrl();
  if (!url || !username) return null;
  try {
    const token = getSessionToken();
    const qs = new URLSearchParams({ user: username });
    if (token) qs.set('sessionToken', token);
    const res = await fetch(`${url}?${qs.toString()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.resetAt) await applyServerWalletReset(data.resetAt);
    if (!data.grants || typeof data.grants !== 'object') return null;
    if (data.account) applyAccountStatus(data.account);
    if (data.profile) applyServerProfile(data.profile, username);
    return {
      grants: data.grants,
      balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
      account: data.account || null,
      profile: data.profile || null,
    };
  } catch {
    return null;
  }
}

function applyAccountStatus(status) {
  cachedAccountStatus = status && typeof status === 'object' ? { ...status } : null;
  document.body?.classList.toggle('is-self-excluded', !!cachedAccountStatus?.active);
  renderSelfExclusionBanner();
  document.dispatchEvent(new CustomEvent('xython:account-status', { detail: cachedAccountStatus }));
}

function getAccountStatus() {
  return cachedAccountStatus ? { ...cachedAccountStatus } : null;
}

function isSelfExcluded() {
  const status = cachedAccountStatus;
  if (!status?.active) return false;
  if (status.permanent || status.selfExcludedUntil === -1) return true;
  return (parseInt(status.selfExcludedUntil, 10) || 0) > Date.now();
}

function getBetBlockReason() {
  if (!isLoggedIn()) return 'Log in to place bets';
  if (isSelfExcluded()) {
    const end = formatSelfExclusionEnd();
    return end
      ? `You are self-excluded until ${end} and cannot place bets.`
      : 'You are permanently self-excluded and cannot place bets.';
  }
  return null;
}

function formatSelfExclusionEnd() {
  const status = cachedAccountStatus;
  if (!status?.active) return '';
  if (status.permanent || status.selfExcludedUntil === -1) return '';
  const until = parseInt(status.selfExcludedUntil, 10) || 0;
  if (!until || until <= Date.now()) return '';
  return new Date(until).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function requestSelfExclusion(duration) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  const result = await postWalletAction({
    action: 'self-exclude',
    username,
    duration,
  });
  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not apply self-exclusion' };
  }
  applyAccountStatus(result.data);
  return { ok: true, status: getAccountStatus() };
}

async function changeAccountPassword(currentPassword, newPassword) {
  const username = getLoggedInUsername();
  if (!username) return { ok: false, error: 'Log in to continue' };
  if (!canUsePasswordCrypto()) {
    return { ok: false, error: 'Password changes require a secure connection (HTTPS)' };
  }
  if (!hasAccount(username)) {
    return { ok: false, error: 'No password is set for this account on this device' };
  }

  const valid = await verifyAccountPassword(username, currentPassword);
  if (!valid) return { ok: false, error: 'Current password is incorrect' };

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { ok: false, error: passwordError };

  const creds = await createPasswordCredentials(newPassword);
  const accounts = loadAccounts();
  const key = username.toLowerCase();
  accounts[key] = {
    ...accounts[key],
    hash: creds.hash,
    salt: creds.salt,
  };
  saveAccounts(accounts);
  return { ok: true };
}

function renderSelfExclusionBanner() {
  let banner = document.getElementById('selfExclusionBanner');
  if (!isSelfExcluded()) {
    banner?.remove();
    return;
  }

  const end = formatSelfExclusionEnd();
  const message = end
    ? `Self-exclusion active — betting is disabled until ${end}.`
    : 'Permanent self-exclusion active — betting is disabled on this account.';

  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'selfExclusionBanner';
    banner.className = 'self-exclusion-banner';
    const header = document.querySelector('.top-header');
    if (header) header.insertAdjacentElement('afterend', banner);
    else document.body.prepend(banner);
  }
  banner.textContent = message;
}

function accountNavIcon(name) {
  const icons = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  };
  const path = icons[name] || icons.shield;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>`;
}

function createAccountNavLink(href, page, label, icon) {
  const link = document.createElement('a');
  link.href = sitePath(href);
  link.className = 'account-nav-item';
  if (document.body.dataset.page === page) link.classList.add('active');
  link.innerHTML = `${accountNavIcon(icon)} ${label}`;
  return link;
}

function enhanceAccountNav() {
  const nav = document.querySelector('.account-nav-list');
  if (!nav || nav.dataset.enhanced) return;
  nav.dataset.enhanced = '1';

  nav.querySelectorAll('a.account-nav-item[href="#"]').forEach(link => {
    const text = link.textContent.trim();
    if (text === 'Security') link.href = sitePath('security.html');
    if (text === 'Self Exclusion') link.href = sitePath('self-exclusion.html');
  });

  if (!nav.querySelector('a[href*="security.html"]')) {
    nav.appendChild(createAccountNavLink('security.html', 'security', 'Security', 'shield'));
  }
  if (!nav.querySelector('a[href*="self-exclusion.html"]')) {
    nav.appendChild(createAccountNavLink('self-exclusion.html', 'self-exclusion', 'Self Exclusion', 'lock'));
  }
}

function getCombinedServerTotal(grants, balances, currency) {
  return (parseFloat(grants?.[currency]) || 0) + (parseFloat(balances?.[currency]) || 0);
}

function markServerWalletSynced(username, grants, balances) {
  if (!username) return;
  const synced = loadGrantsSynced();
  const userKey = username.toLowerCase();
  if (!synced[userKey]) synced[userKey] = { USD: 0, BTC: 0, ETH: 0, LTC: 0 };
  WALLET_CURRENCIES.forEach(currency => {
    synced[userKey][currency] = getCombinedServerTotal(grants, balances, currency);
  });
  saveGrantsSynced(synced);
}

function loadWalletResetAck() {
  return Math.max(0, parseInt(localStorage.getItem(WALLET_RESET_ACK_KEY), 10) || 0);
}

function saveWalletResetAck(resetAt) {
  localStorage.setItem(WALLET_RESET_ACK_KEY, String(resetAt));
}

async function fetchWalletResetAt() {
  const url = getWalletApiUrl();
  if (!url) return 0;
  try {
    const res = await fetch(`${url}?meta=resetAt`, { cache: 'no-store' });
    if (!res.ok) return 0;
    const data = await res.json();
    return Math.max(0, parseInt(data.resetAt, 10) || 0);
  } catch {
    return 0;
  }
}

async function applyServerWalletReset(resetAt) {
  const ts = Math.max(0, parseInt(resetAt, 10) || 0);
  if (!ts || ts <= loadWalletResetAck()) return false;

  WALLET_CURRENCIES.forEach(currency => {
    setWalletBalance(currency, 0, false);
  });
  saveWalletState();
  localStorage.removeItem(GRANTS_SYNC_KEY);
  localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify({ ...DEFAULT_PROFILE_STATS }));
  localStorage.removeItem(RAKEBACK_KEY);
  localStorage.removeItem(RANK_REWARDS_KEY);
  localStorage.removeItem(LEADERBOARD_KEY);
  localStorage.removeItem('nbd-gi-bets');

  const activeCurrency = document.querySelector('.wallet-option.active')?.dataset.currency || 'USD';
  applyWalletHeaderDisplay(activeCurrency, 0);
  saveWalletResetAck(ts);
  leaderboardCache = { wins: [], bets: {}, recentBets: [] };
  document.dispatchEvent(new CustomEvent('xython:stats-change', { detail: loadProfileStats() }));
  document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: leaderboardCache }));
  document.dispatchEvent(new CustomEvent('xython:wallet-reset', { detail: { resetAt: ts } }));
  renderAuthUI();
  updateRewardsDot();
  return true;
}

async function ensureWalletResetSynced() {
  const resetAt = await fetchWalletResetAt();
  if (!resetAt) return;
  await applyServerWalletReset(resetAt);
}

function loadProfileSyncAck(username) {
  if (!username) return 0;
  try {
    const raw = localStorage.getItem(PROFILE_SYNC_ACK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Math.max(0, parseInt(parsed[username.toLowerCase()], 10) || 0);
  } catch {
    return 0;
  }
}

function saveProfileSyncAck(username, updatedAt) {
  if (!username) return;
  try {
    const raw = localStorage.getItem(PROFILE_SYNC_ACK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[username.toLowerCase()] = Math.max(0, parseInt(updatedAt, 10) || 0);
    localStorage.setItem(PROFILE_SYNC_ACK_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function applyServerProfile(profile, username) {
  if (!profile || !username) return false;
  const updatedAt = Math.max(0, parseInt(profile.updatedAt, 10) || 0);
  if (!updatedAt || updatedAt <= loadProfileSyncAck(username)) return false;

  let changed = false;

  if (profile.wagered != null) {
    const wagered = Math.max(0, parseFloat(profile.wagered) || 0);
    const stats = loadProfileStats();
    if (stats.wagered !== wagered) {
      stats.wagered = wagered;
      localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify(stats));
      changed = true;
    }
  }

  if (profile.rakebackResetAt) {
    const rakeData = loadRakeback();
    rakeData.pending = 0;
    rakeData.syncedWagered = loadProfileStats().wagered;
    saveRakeback(rakeData);
    changed = true;
  }

  saveProfileSyncAck(username, updatedAt);
  if (changed) {
    document.dispatchEvent(new CustomEvent('xython:stats-change', { detail: loadProfileStats() }));
    renderAuthUI();
    updateRewardsDot();
    if (typeof refreshRewardsPopout === 'function') refreshRewardsPopout();
  }
  return changed;
}

async function syncWalletGrantsFromServer() {
  const username = getLoggedInUsername();
  if (!username) return;

  const serverWallet = await fetchServerGrants(username);
  if (!serverWallet) return;

  if (serverWallet.account) applyAccountStatus(serverWallet.account);
  if (serverWallet.profile) applyServerProfile(serverWallet.profile, username);

  const { grants: serverGrants, balances: serverBalances } = serverWallet;
  walletMutationAllowed = true;
  WALLET_CURRENCIES.forEach(currency => {
    const serverTotal = getCombinedServerTotal(serverGrants, serverBalances, currency);
    setWalletBalance(currency, serverTotal, false);
  });
  saveWalletState();
  markServerWalletSynced(username, serverGrants, serverBalances);
  walletMutationAllowed = false;
}

function startWalletGrantsPolling() {
  ensureWalletResetSynced();
  syncWalletGrantsFromServer();
  if (walletGrantsPollTimer) clearInterval(walletGrantsPollTimer);
  walletGrantsPollTimer = setInterval(() => {
    ensureWalletResetSynced();
    syncWalletGrantsFromServer();
  }, WALLET_GRANTS_POLL_MS);
}

function ensureAdminWalletButtons() {
  const depositBtn = document.getElementById('walletDeposit');
  if (!depositBtn || document.getElementById('walletSend')) return;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'wallet-send';
  sendBtn.id = 'walletSend';
  sendBtn.type = 'button';
  sendBtn.textContent = 'Send Money';
  sendBtn.hidden = true;
  depositBtn.insertAdjacentElement('beforebegin', sendBtn);
}

function updateAdminWalletButtons() {
  ensureAdminWalletButtons();
  const depositBtn = document.getElementById('walletDeposit');
  const sendBtn = document.getElementById('walletSend');
  const show = canDeposit();
  if (depositBtn) depositBtn.hidden = !show;
  if (sendBtn) sendBtn.hidden = !show;
  document.querySelector('.header-wallet')?.classList.toggle('has-admin-actions', show);
}

function sitePath(path) {
  const clean = String(path || '').replace(/^\//, '');
  if (location.protocol === 'file:') return clean;
  return `/${clean}`;
}

function updateDepositButtonVisibility() {
  updateAdminWalletButtons();
}

const DEFAULT_WALLET = {
  balances: { USD: 0, BTC: 0, ETH: 0, LTC: 0 },
  activeCurrency: 'USD',
};

const DEFAULT_VAULT_BALANCES = { USD: 0, BTC: 0, ETH: 0, LTC: 0 };

function isWideScreen() {
  return window.matchMedia('(min-width: 1201px)').matches;
}

function setRightPanelOpen(open) {
  const panel = document.getElementById('rightPanel');
  const reopen = document.getElementById('panelReopen');
  if (!panel || !reopen) return;

  panel.classList.toggle('is-collapsed', !open);
  reopen.classList.toggle('is-visible', !open && isWideScreen());

  if (isWideScreen()) {
    localStorage.setItem(PANEL_STORAGE_KEY, open ? '1' : '0');
  }
}

function initRightPanelToggle() {
  const panel = document.getElementById('rightPanel');
  const collapse = document.getElementById('panelCollapse');
  const reopen = document.getElementById('panelReopen');
  if (!panel || !collapse || !reopen) return;

  if (isWideScreen() && localStorage.getItem(PANEL_STORAGE_KEY) === '0') {
    setRightPanelOpen(false);
  }

  collapse.addEventListener('click', () => setRightPanelOpen(false));
  reopen.addEventListener('click', () => setRightPanelOpen(true));

  document.addEventListener('keydown', e => {
    if (!isWideScreen()) return;
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      setRightPanelOpen(panel.classList.contains('is-collapsed'));
    }
  });

  window.addEventListener('resize', () => {
    if (!isWideScreen()) {
      panel.classList.remove('is-collapsed');
      reopen.classList.remove('is-visible');
    } else {
      setRightPanelOpen(localStorage.getItem(PANEL_STORAGE_KEY) !== '0');
    }
  });
}

function initSidebarNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('.sidebar-nav .nav-item[data-nav]').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === page);
  });
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');
  const close = document.getElementById('sidebarClose');

  hamburger?.addEventListener('click', () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  close?.addEventListener('click', closeMobileSidebar);
  overlay?.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('.sidebar-nav .nav-item[href]').forEach(link => {
    link.addEventListener('click', () => closeMobileSidebar());
  });

  document.querySelectorAll('.sidebar-nav .nav-item[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href');
      if (id === '#chatPanel') {
        e.preventDefault();
        setRightPanelOpen(true);
        const chatTab = document.querySelector('.panel-tab[data-panel="chat"]');
        if (chatTab) chatTab.click();
      }
    });
  });
}

const GAME_ID_NAMES = {
  blackjack: 'Blackjack', 'double-down-blackjack': 'Double Down Blackjack',
  plinko: 'Plinko', roulette: 'Roulette', dice: 'Dice',
  mines: 'Mines', crash: 'Crash', keno: 'Keno', limbo: 'Limbo', war: 'War',
  coinflip: 'Coinflip', hilo: 'Hi-Lo', tower: 'Tower', wheel: 'Wheel',
};

function renderLiveWins(gamePool) {
  const track = document.getElementById('liveWinsTrack');
  if (!track) return;

  const realWins = window.NbdLeaderboard?.getRecentWins?.(20) || [];
  if (!realWins.length) {
    track.innerHTML = '<div class="win-item win-item--empty"><span class="game-name">No live wins yet — be the first!</span></div>';
    return;
  }

  let items = realWins.map(w => {
    const gameName = GAME_ID_NAMES[w.game] || w.game;
    const player = w.hidden ? 'Hidden' : (w.user.length > 8 ? `${w.user.slice(0, 7)}…` : w.user);
    return `<div class="win-item win-item--real">
      <span class="game-name">${gameName}</span>
      <span class="player">${player}</span>
      <span class="amount">$${w.payout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>`;
  });
  while (items.length < 8) {
    items = items.concat(items);
  }

  track.innerHTML = items.join('') + items.join('');
}

function getActiveBetsFilter() {
  const active = document.querySelector('.bets-subtab.active');
  const text = (active?.textContent || '').trim().toLowerCase();
  if (text.includes('high')) return 'high';
  if (text.includes('my')) return 'mine';
  return 'all';
}

function formatBetMoney(n) {
  return `$${(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderBets() {
  const list = document.getElementById('betsList');
  if (!list) return;

  const filter = getActiveBetsFilter();
  const bets = window.NbdLeaderboard?.getRecentBets?.(50, filter) || [];

  if (!bets.length) {
    const emptyMsg = filter === 'mine'
      ? (isLoggedIn() ? 'No bets yet — play a game to see your activity here.' : 'Log in to see your bets.')
      : filter === 'high'
        ? 'No high roller bets yet.'
        : 'No live bets yet — play a game to appear here.';
    list.innerHTML = `<p class="bets-empty">${emptyMsg}</p>`;
    return;
  }

  list.innerHTML = bets.map(b => {
    const gameName = GAME_ID_NAMES[b.game] || b.game;
    const player = b.hidden ? 'Hidden' : b.user;
    const mult = (parseFloat(b.mult) || 0).toFixed(2);
    const multClass = b.won && parseFloat(b.mult) > 1 ? 'bet-multiplier bet-multiplier--win' : 'bet-multiplier';
    return `<div class="bet-item bet-item--real">
      <span class="bet-game">${gameName}</span>
      <span class="bet-amount">${formatBetMoney(b.bet)}</span>
      <span class="bet-player">${player}</span>
      <span class="${multClass}">${mult}x</span>
    </div>`;
  }).join('');
}

function initLiveBets() {
  renderBets();
  document.addEventListener('xython:leaderboard-change', renderBets);
}

let chatCache = [];
let chatUsingServer = false;
let chatPollTimer = null;
let sevenTvEmoteMap = new Map();
let sevenTvEmotePattern = null;
let chatEmotePickerEl = null;
let chatEmotePickerInput = null;
let chatEmotePickerFilter = '';

function buildSevenTvEmoteUrl(emoteId) {
  return `https://cdn.7tv.app/emote/${emoteId}/2x.webp`;
}

function buildSevenTvEmoteImg(emote) {
  const src = escapeHtml(emote.url);
  const alt = escapeHtml(emote.name);
  return `<img class="chat-emote" src="${src}" alt="${alt}" title="${alt}" loading="lazy" decoding="async">`;
}

function rebuildSevenTvEmotePattern() {
  const names = [...sevenTvEmoteMap.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) {
    sevenTvEmotePattern = null;
    return;
  }
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const alternation = escaped.join('|');
  // Bare names: word boundaries (not inside HELLO). Optional legacy :Name: syntax.
  sevenTvEmotePattern = new RegExp(
    `(?::(${alternation}):)|(?<![A-Za-z0-9])(${alternation})(?![A-Za-z0-9])`,
    'g'
  );
}

function formatChatMessageText(text) {
  const escaped = escapeHtml(text);
  if (!sevenTvEmoteMap.size || !sevenTvEmotePattern) return escaped;
  return escaped.replace(sevenTvEmotePattern, (match, colonName, bareName) => {
    const name = colonName || bareName;
    const emote = sevenTvEmoteMap.get(name);
    if (!emote) return match;
    return buildSevenTvEmoteImg(emote);
  });
}

function applySevenTvEmotes(emotes) {
  sevenTvEmoteMap = new Map();
  for (const emote of emotes) {
    if (emote?.name && emote?.url) sevenTvEmoteMap.set(emote.name, emote);
  }
  rebuildSevenTvEmotePattern();
}

function parseSevenTvEmoteEntry(entry) {
  const name = entry?.name || entry?.data?.name;
  const id = entry?.id || entry?.data?.id;
  if (!name || !id) return null;
  return { name, id, url: buildSevenTvEmoteUrl(id) };
}

async function fetchSevenTvEmoteSet(setId) {
  const res = await fetch(`https://7tv.io/v3/emote-sets/${setId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data.emotes) ? data.emotes : [])
    .map(parseSevenTvEmoteEntry)
    .filter(Boolean);
}

async function fetchSevenTvUserEmotes() {
  const res = await fetch(SEVEN_TV_USER_URL);
  if (!res.ok) return [];
  const data = await res.json();
  const sets = Array.isArray(data.emote_sets) ? data.emote_sets : [];
  const batches = await Promise.all(
    sets.map(set => (set?.id ? fetchSevenTvEmoteSet(set.id) : Promise.resolve([])))
  );
  return batches.flat();
}

function mergeSevenTvEmotes(globalEmotes, userEmotes) {
  const merged = new Map();
  for (const emote of globalEmotes) {
    if (emote?.name && emote?.url) merged.set(emote.name, emote);
  }
  for (const emote of userEmotes) {
    if (emote?.name && emote?.url) merged.set(emote.name, emote);
  }
  return [...merged.values()];
}

async function loadSevenTvEmotes() {
  try {
    const raw = localStorage.getItem(SEVEN_TV_EMOTES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (
        cached?.ts
        && Date.now() - cached.ts < SEVEN_TV_EMOTES_CACHE_TTL_MS
        && Array.isArray(cached.emotes)
        && cached.emotes.length
      ) {
        applySevenTvEmotes(cached.emotes);
        return sevenTvEmoteMap.size;
      }
    }
  } catch { /* ignore */ }

  try {
    const [globalRes, userEmotes] = await Promise.all([
      fetch(SEVEN_TV_GLOBAL_SET_URL),
      fetchSevenTvUserEmotes(),
    ]);

    let globalEmotes = [];
    if (globalRes.ok) {
      const data = await globalRes.json();
      globalEmotes = (Array.isArray(data.emotes) ? data.emotes : [])
        .map(parseSevenTvEmoteEntry)
        .filter(Boolean);
    }

    const emotes = mergeSevenTvEmotes(globalEmotes, userEmotes);
    applySevenTvEmotes(emotes);
    if (emotes.length) {
      localStorage.setItem(SEVEN_TV_EMOTES_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        emotes,
      }));
    }
  } catch { /* ignore */ }
  return sevenTvEmoteMap.size;
}

function ensureChatEmotePicker() {
  if (chatEmotePickerEl) return chatEmotePickerEl;

  const picker = document.createElement('div');
  picker.className = 'chat-emote-picker';
  picker.hidden = true;
  picker.innerHTML = `
    <div class="chat-emote-picker-header">
      <span>7TV Emotes</span>
      <button type="button" class="chat-emote-picker-close" aria-label="Close emote picker">&times;</button>
    </div>
    <div class="chat-emote-picker-search-wrap">
      <input type="search" class="chat-emote-picker-search" placeholder="Search emotes..." autocomplete="off" spellcheck="false" aria-label="Search emotes">
    </div>
    <div class="chat-emote-picker-grid"></div>
  `;
  document.body.appendChild(picker);

  const searchInput = picker.querySelector('.chat-emote-picker-search');
  searchInput?.addEventListener('input', () => {
    chatEmotePickerFilter = searchInput.value.trim().toLowerCase();
    renderChatEmotePickerGrid();
  });
  searchInput?.addEventListener('click', e => e.stopPropagation());

  picker.querySelector('.chat-emote-picker-close')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closeChatEmotePicker();
  });
  document.addEventListener('click', e => {
    if (!chatEmotePickerEl || chatEmotePickerEl.hidden) return;
    if (!e.target.closest('.chat-emote-picker, .chat-emote-btn')) {
      closeChatEmotePicker();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chatEmotePickerEl && !chatEmotePickerEl.hidden) {
      closeChatEmotePicker();
    }
  });

  chatEmotePickerEl = picker;
  return picker;
}

function renderChatEmotePickerGrid() {
  const picker = ensureChatEmotePicker();
  const grid = picker.querySelector('.chat-emote-picker-grid');
  if (!grid) return;

  const emotes = [...sevenTvEmoteMap.values()]
    .filter(emote => !chatEmotePickerFilter || emote.name.toLowerCase().includes(chatEmotePickerFilter))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!emotes.length) {
    grid.innerHTML = `<p class="chat-emote-picker-empty">${chatEmotePickerFilter ? 'No emotes match your search' : 'Emotes unavailable'}</p>`;
    return;
  }

  grid.innerHTML = emotes.map(emote => `
    <button type="button" class="chat-emote-picker-item" data-emote-name="${escapeHtml(emote.name)}" title="${escapeHtml(emote.name)}">
      <img src="${escapeHtml(emote.url)}" alt="${escapeHtml(emote.name)}" loading="lazy" decoding="async">
    </button>
  `).join('');

  grid.querySelectorAll('.chat-emote-picker-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.emoteName || '';
      if (!name || !chatEmotePickerInput) return;
      insertChatEmoteName(chatEmotePickerInput, name);
      closeChatEmotePicker();
      chatEmotePickerInput.focus();
    });
  });
}

function insertChatEmoteName(input, name) {
  if (!input || !name) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const needsSpaceBefore = before.length > 0 && !/[\s.,!?;:]$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^[\s.,!?;:]/.test(after);
  const token = `${needsSpaceBefore ? ' ' : ''}${name}${needsSpaceAfter ? ' ' : ''}`;
  const next = `${before}${token}${after}`;
  input.value = next.slice(0, CHAT_MAX_LENGTH);
  const caret = Math.min(start + token.length, input.value.length);
  input.setSelectionRange(caret, caret);
}

function openChatEmotePicker(anchorBtn, input) {
  if (!isLoggedIn() || !sevenTvEmoteMap.size) return;
  const picker = ensureChatEmotePicker();
  chatEmotePickerInput = input;
  chatEmotePickerFilter = '';
  const searchInput = picker.querySelector('.chat-emote-picker-search');
  if (searchInput) searchInput.value = '';
  renderChatEmotePickerGrid();
  picker.hidden = false;

  const rect = anchorBtn.getBoundingClientRect();
  const pickerWidth = 280;
  const left = Math.min(
    Math.max(12, rect.right - pickerWidth),
    window.innerWidth - pickerWidth - 12
  );
  const top = Math.max(12, rect.top - picker.offsetHeight - 8);
  const bottomFallback = rect.bottom + 8;
  picker.style.left = `${left}px`;
  picker.style.top = top > 12
    ? `${top}px`
    : `${Math.min(bottomFallback, window.innerHeight - picker.offsetHeight - 12)}px`;
}

function closeChatEmotePicker() {
  if (!chatEmotePickerEl) return;
  chatEmotePickerEl.hidden = true;
  chatEmotePickerInput = null;
  chatEmotePickerFilter = '';
}

function injectChatEmoteButtons() {
  document.querySelectorAll('.chat-input-wrap').forEach(wrap => {
    if (wrap.querySelector('.chat-emote-btn')) return;
    const input = wrap.querySelector('input[type="text"]');
    const sendBtn = wrap.querySelector('.chat-send');
    if (!input) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-emote-btn';
    btn.setAttribute('aria-label', 'Insert 7TV emote');
    btn.setAttribute('title', '7TV emotes');
    btn.disabled = !isLoggedIn();
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    `;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (chatEmotePickerEl && !chatEmotePickerEl.hidden && chatEmotePickerInput === input) {
        closeChatEmotePicker();
        return;
      }
      openChatEmotePicker(btn, input);
    });

    if (sendBtn) wrap.insertBefore(btn, sendBtn);
    else wrap.appendChild(btn);
  });
}

function getChatApiUrl() {
  if (window.NBD_CHAT_API) return window.NBD_CHAT_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/chat`;
  }
  return null;
}

function normalizeChatUsername(username) {
  return String(username || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, 16);
}

function isReservedChatUser(username) {
  const name = normalizeChatUsername(username).toLowerCase();
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

function loadChatMessagesLocal() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChatMessagesLocal(messages) {
  const trimmed = messages.slice(-CHAT_MAX_MESSAGES);
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
  document.dispatchEvent(new CustomEvent('xython:chat-change'));
  try {
    getChatChannel()?.postMessage({ type: 'update' });
  } catch { /* ignore */ }
}

async function fetchChatFromServer() {
  const url = getChatApiUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const messages = Array.isArray(data.messages) ? data.messages : null;
    return messages ? sanitizeChatMessages(messages) : null;
  } catch {
    return null;
  }
}

async function postChatToServer(text) {
  const url = getChatApiUrl();
  if (!url) return false;

  const payload = { text };
  const token = getSessionToken();
  if (token) payload.sessionToken = token;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteChatMessageFromServer(messageId, admin) {
  const url = getChatApiUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete-message',
        messageId,
        sessionToken: getSessionToken(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return null;
  }
}

async function deleteChatMessage(messageId) {
  if (!messageId || !isAdmin()) return false;

  if (getChatApiUrl()) {
    const result = await deleteChatMessageFromServer(messageId, getLoggedInUsername());
    if (result?.ok) {
      await refreshChatMessages();
      return true;
    }
    if (result !== null) return false;
  }

  const messages = loadChatMessagesLocal().filter(m => m.id !== messageId);
  saveChatMessages(messages);
  renderChat();
  return true;
}

function loadChatMessages() {
  if (chatUsingServer) return chatCache;
  return chatCache.length ? chatCache : loadChatMessagesLocal();
}

async function refreshChatMessages() {
  const remote = await fetchChatFromServer();
  if (remote !== null) {
    chatUsingServer = true;
    chatCache = remote;
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
    renderChat();
    return chatCache;
  }

  chatUsingServer = false;
  chatCache = loadChatMessagesLocal();
  renderChat();
  return chatCache;
}

function saveChatMessages(messages) {
  saveChatMessagesLocal(messages);
  chatCache = messages.slice(-CHAT_MAX_MESSAGES);
}

let chatChannelInstance = null;
function getChatChannel() {
  if (chatChannelInstance !== null) return chatChannelInstance;
  try {
    chatChannelInstance = new BroadcastChannel('nbd-chat');
  } catch {
    chatChannelInstance = false;
  }
  return chatChannelInstance || null;
}

async function addChatMessage(username, text) {
  const user = normalizeChatUsername(username);
  const clean = text.trim().slice(0, CHAT_MAX_LENGTH);
  if (!clean || !user) return { ok: false, error: 'Invalid message' };
  if (isReservedChatUser(user)) return { ok: false, error: 'Invalid username' };
  if (looksLikeFakeTipAnnouncement(clean)) return { ok: false, error: 'Message not allowed' };

  if (getChatApiUrl()) {
    const posted = await postChatToServer(clean);
    if (posted) {
      await refreshChatMessages();
      return { ok: true };
    }
    return { ok: false, error: 'Could not send message' };
  }

  const messages = loadChatMessagesLocal();
  messages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user,
    text: clean,
    ts: Date.now(),
  });
  saveChatMessages(messages);
  return { ok: true };
}

function getChatEmptyMessage() {
  if (chatUsingServer) {
    return 'No messages yet. Be the first to say hello!';
  }
  if (location.protocol === 'file:') {
    return 'Chat is saved on this device only when opened as a file. Run <code>npm start</code> and open http://localhost:8080 to share chat with everyone.';
  }
  return 'No messages yet. Be the first to say hello! Chat is shared when this site runs on a server.';
}

function parseTipCommand(text) {
  const match = String(text || '').trim().match(TIP_CMD_RE);
  if (!match) return null;
  const recipient = match[1].replace(/^@/, '');
  const amount = parseFloat(match[2].replace(/,/g, ''));
  if (!recipient || !amount || amount <= 0) return null;
  return { recipient, amount };
}

function showToast(message, type = 'info') {
  let container = document.getElementById('xythonToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'xythonToastContainer';
    container.className = 'xython-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `xython-toast xython-toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function executeTip(recipient, amount) {
  const sender = getLoggedInUsername();
  if (!sender) return { ok: false, error: 'Log in to tip' };

  const resolved = resolveUsername(recipient) || recipient.trim();
  const userError = validateUsername(resolved);
  if (userError) return { ok: false, error: userError };

  if (resolved.toLowerCase() === sender.toLowerCase()) {
    return { ok: false, error: 'Cannot tip yourself' };
  }

  if (amount < MIN_TIP_USD) {
    return { ok: false, error: `Minimum tip is $${MIN_TIP_USD.toFixed(2)}` };
  }

  const localBalance = getWalletBalance('USD');
  if (amount > localBalance) return { ok: false, error: 'Insufficient balance' };

  const result = await postWalletAction({
    action: 'tip',
    from: sender,
    to: resolved,
    amount,
    currency: 'USD',
  });

  if (!result?.ok) {
    return { ok: false, error: result?.data?.error || 'Could not send tip' };
  }

  const data = result.data;
  applyServerWalletFromResponse({
    grants: data.fromGrants,
    balances: data.fromBalances,
  });
  markServerWalletSynced(sender, data.fromGrants, data.fromBalances);
  recordTransaction({
    type: 'tip',
    amount: -amount,
    currency: 'USD',
    label: 'Tip',
    detail: `Tipped ${data.to} $${amount.toFixed(2)}`,
  });

  const displaySender = getPublicUsername();
  const tipMsg = `${displaySender} tipped ${data.to} $${amount.toFixed(2)}`;
  if (getChatApiUrl()) {
    await refreshChatMessages();
  }

  return { ok: true, message: tipMsg };
}

function renderChatMessages(container) {
  if (!container) return;
  const messages = loadChatMessages();
  if (!messages.length) {
    container.innerHTML = `<p class="chat-empty">${getChatEmptyMessage()}</p>`;
    return;
  }
  const showDelete = isAdmin();
  container.innerHTML = messages.map(msg => {
    const isSystem = msg.system === true;
    const deleteBtn = showDelete && msg.id && !isSystem
      ? `<button type="button" class="chat-delete-btn" data-message-id="${escapeHtml(msg.id)}" aria-label="Delete message" title="Delete message">&times;</button>`
      : '';
    if (isSystem) {
      return `<div class="chat-msg chat-msg--system"><div class="chat-msg-body"><span class="chat-text">${formatChatMessageText(msg.text)}</span></div>${deleteBtn}</div>`;
    }
    return `<div class="chat-msg"><div class="chat-msg-body"><span class="chat-user">${escapeHtml(msg.user)}:</span><span class="chat-text">${formatChatMessageText(msg.text)}</span></div>${deleteBtn}</div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function renderChat() {
  renderChatMessages(document.getElementById('chatMessages'));
  renderChatMessages(document.getElementById('chatWidgetMessages'));
}

function updateChatInputState() {
  const placeholder = isLoggedIn() ? 'Type a message...' : 'Log in to chat...';
  document.querySelectorAll('#chatInput, #chatWidgetInput').forEach(input => {
    input.placeholder = placeholder;
    input.disabled = !isLoggedIn();
  });
  document.querySelectorAll('#chatSend, #chatWidgetSend').forEach(btn => {
    btn.disabled = !isLoggedIn();
  });
  document.querySelectorAll('.chat-emote-btn').forEach(btn => {
    btn.disabled = !isLoggedIn() || !sevenTvEmoteMap.size;
  });
}

function initChatSync() {
  window.addEventListener('storage', e => {
    if (e.key === CHAT_STORAGE_KEY && !chatUsingServer) refreshChatMessages();
  });
  document.addEventListener('xython:chat-change', renderChat);
  document.addEventListener('xython:auth-change', () => {
    updateChatInputState();
    renderChat();
  });
  getChatChannel()?.addEventListener('message', () => {
    if (!chatUsingServer) refreshChatMessages();
  });

  document.addEventListener('click', async e => {
    const btn = e.target.closest('.chat-delete-btn');
    if (!btn || !isAdmin()) return;

    const messageId = btn.dataset.messageId || '';
    if (!messageId) return;

    const confirmed = window.confirm('Delete this chat message?');
    if (!confirmed) return;

    btn.disabled = true;
    await deleteChatMessage(messageId);
    btn.disabled = false;
  });
}

function startChatPolling() {
  refreshChatMessages();
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(refreshChatMessages, CHAT_POLL_MS);
}

function openLiveChat() {
  const panel = document.getElementById('chatPanel');
  if (panel && isWideScreen()) {
    setRightPanelOpen(true);
    document.querySelector('.panel-tab[data-panel="chat"]')?.click();
  } else {
    const widget = document.getElementById('chatWidget');
    widget?.classList.add('is-open');
    document.getElementById('chatWidgetPanel')?.removeAttribute('hidden');
    renderChat();
    document.getElementById('chatWidgetInput')?.focus();
  }
  closeMobileSidebar();
}

function injectChatWidget() {
  if (document.getElementById('chatWidget')) return;

  const widget = document.createElement('div');
  widget.className = 'chat-widget';
  widget.id = 'chatWidget';
  widget.innerHTML = `
    <button type="button" class="chat-widget-toggle" id="chatWidgetToggle" aria-label="Open live chat">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span>Live Chat</span>
    </button>
    <div class="chat-widget-panel" id="chatWidgetPanel" hidden>
      <div class="chat-widget-header">
        <span class="chat-widget-title">Live Chat</span>
        <button type="button" class="chat-widget-close" id="chatWidgetClose" aria-label="Close chat">&times;</button>
      </div>
      <div class="chat-messages" id="chatWidgetMessages"></div>
      <div class="chat-input-wrap">
        <input type="text" id="chatWidgetInput" maxlength="${CHAT_MAX_LENGTH}" autocomplete="off" placeholder="Log in to chat...">
        <button type="button" class="chat-send" id="chatWidgetSend" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);
  injectChatEmoteButtons();

  document.getElementById('chatWidgetToggle')?.addEventListener('click', () => {
    widget.classList.toggle('is-open');
    if (widget.classList.contains('is-open')) {
      document.getElementById('chatWidgetPanel')?.removeAttribute('hidden');
      renderChat();
      document.getElementById('chatWidgetInput')?.focus();
    }
  });

  document.getElementById('chatWidgetClose')?.addEventListener('click', () => {
    widget.classList.remove('is-open');
  });
}

function wireChatInput(input, sendBtn) {
  if (!input) return;

  function sendMessage() {
    if (!requireAuth('login')) return;
    const text = input.value.trim();
    if (!text) return;

    const tip = parseTipCommand(text);
    if (tip) {
      input.disabled = true;
      executeTip(tip.recipient, tip.amount).then(result => {
        input.disabled = !isLoggedIn();
        input.value = '';
        if (result.ok) {
          showToast(result.message, 'success');
        } else {
          showToast(result.error, 'error');
        }
      });
      return;
    }

    input.disabled = true;
    addChatMessage(getPublicUsername(), text).then(result => {
      input.disabled = !isLoggedIn();
      input.value = '';
      if (result?.ok === false) {
        showToast(result.error || 'Could not send message', 'error');
      }
    });
  }

  sendBtn?.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

function ensureLiveChatNav() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[data-nav="support"]')) return;

  const item = document.createElement('a');
  item.href = '#';
  item.className = 'nav-item';
  item.dataset.nav = 'support';
  item.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    Live Chat
  `;
  nav.appendChild(item);
}

function initChat() {
  initChatSync();
  injectChatWidget();
  injectChatEmoteButtons();
  ensureLiveChatNav();
  startChatPolling();

  wireChatInput(
    document.getElementById('chatInput'),
    document.getElementById('chatSend')
  );
  wireChatInput(
    document.getElementById('chatWidgetInput'),
    document.getElementById('chatWidgetSend')
  );

  document.querySelectorAll('.sidebar-nav .nav-item[data-nav="support"]').forEach(link => {
    link.setAttribute('href', '#');
    link.addEventListener('click', e => {
      e.preventDefault();
      openLiveChat();
    });
  });

  loadSevenTvEmotes().then(() => {
    renderChat();
    updateChatInputState();
  });
  updateChatInputState();
}

window.openLiveChat = openLiveChat;
window.NbdChat = {
  getMessages: loadChatMessages,
  refresh: refreshChatMessages,
  send: async (text) => {
    if (!requireAuth('login')) return false;
    const tip = parseTipCommand(text);
    if (tip) {
      const result = await executeTip(tip.recipient, tip.amount);
      if (result.ok) showToast(result.message, 'success');
      else showToast(result.error, 'error');
      return result.ok;
    }
    await addChatMessage(getPublicUsername(), text);
    return true;
  },
  tip: executeTip,
  open: openLiveChat,
  isShared: () => chatUsingServer,
};

function initPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  const panels = {
    bets: document.getElementById('betsPanel'),
    chat: document.getElementById('chatPanel'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p?.classList.remove('active'));
      panels[tab.dataset.panel]?.classList.add('active');
    });
  });

  document.querySelectorAll('.bets-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.bets-subtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderBets();
    });
  });
}

const USER_STORAGE_KEY = 'xython-user';
const SESSION_STORAGE_KEY = 'xython-session';
const WELCOME_AUTH_SEEN_KEY = 'xython-welcome-auth-seen';
const SETTINGS_STORAGE_KEY = 'xython-settings';

const DEFAULT_USER_SETTINGS = {
  emailMarketing: true,
  privateMode: false,
  hideStatistics: false,
  hideRaceStatistics: false,
  streamerMode: false,
  fiatView: 'USD',
  fiatFormat: '123,456.78',
};

function loadUserSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

function saveUserSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  document.dispatchEvent(new CustomEvent('xython:settings-change', {
    detail: settings,
  }));
}

function formatFiatNumber(value) {
  const num = parseFloat(value) || 0;
  const [intPart, decPart] = num.toFixed(2).split('.');
  const format = loadUserSettings().fiatFormat;

  if (format === '123.456,78') {
    return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decPart}`;
  }
  if (format === '123 456,78') {
    return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decPart}`;
  }
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decPart}`;
}

function getPublicUsername() {
  if (loadUserSettings().privateMode && isLoggedIn()) return 'Hidden';
  return getLoggedInUsername() || 'You';
}

function applyWalletHeaderDisplay(currency, balance) {
  const amountEl = document.getElementById('walletAmount');
  const iconEl = document.querySelector('.wallet-currency-icon');
  if (!amountEl) return;

  if (loadUserSettings().streamerMode && isLoggedIn()) {
    amountEl.textContent = '••••••';
  } else {
    amountEl.textContent = formatWalletDisplay(currency, balance);
  }
  if (iconEl) iconEl.textContent = CURRENCY_ICONS[currency] || '$';
}

window.XythonSettings = {
  get: loadUserSettings,
  save: saveUserSettings,
  defaults: DEFAULT_USER_SETTINGS,
};

const PROFILE_STATS_KEY = 'xython-profile-stats';

const DEFAULT_PROFILE_STATS = {
  totalBets: 0,
  wins: 0,
  losses: 0,
  wagered: 0,
};

function loadProfileStats() {
  try {
    const raw = localStorage.getItem(PROFILE_STATS_KEY);
    if (!raw) return { ...DEFAULT_PROFILE_STATS };
    return { ...DEFAULT_PROFILE_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE_STATS };
  }
}

function recordProfileRound(wagered, won, extra) {
  const stats = loadProfileStats();
  stats.totalBets += 1;
  stats.wagered += parseFloat(wagered) || 0;
  if (won === true) stats.wins += 1;
  else if (won === false) stats.losses += 1;
  localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify(stats));
  accrueRakeback(parseFloat(wagered) || 0);
  accrueAffiliateCommission(parseFloat(wagered) || 0);

  const opts = extra && typeof extra === 'object' ? extra : {};
  recordLeaderboardRound({
    game: opts.game || getPageGameId(),
    bet: parseFloat(wagered) || 0,
    payout: opts.payout,
    mult: opts.mult,
    won,
  });

  document.dispatchEvent(new CustomEvent('xython:stats-change', { detail: stats }));
  updateRewardsDot();
}

const LEADERBOARD_KEY = 'nbd-leaderboard-v2';
const LEADERBOARD_MAX = 500;
const RECENT_BETS_MAX = 100;
const HIGH_ROLLER_MIN = 100;
const LEADERBOARD_POLL_MS = 5000;

let leaderboardCache = { wins: [], bets: {}, recentBets: [] };
let leaderboardUsingServer = false;
let leaderboardPollTimer = null;

function getLeaderboardApiUrl() {
  if (window.NBD_LEADERBOARD_API) return window.NBD_LEADERBOARD_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/leaderboard`;
  }
  return null;
}

function getPageGameId() {
  return (location.pathname.split('/').pop() || '').replace(/\.html$/i, '') || null;
}

function normalizeLeaderboardData(data) {
  return {
    wins: Array.isArray(data?.wins) ? data.wins : [],
    bets: data?.bets && typeof data.bets === 'object' ? data.bets : {},
    recentBets: Array.isArray(data?.recentBets) ? data.recentBets : [],
  };
}

function loadLeaderboardLocal() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return { wins: [], bets: {}, recentBets: [] };
    return normalizeLeaderboardData(JSON.parse(raw));
  } catch {
    return { wins: [], bets: {}, recentBets: [] };
  }
}

function saveLeaderboardLocal(data) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
  document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: data }));
}

function loadLeaderboard() {
  return leaderboardUsingServer ? leaderboardCache : loadLeaderboardLocal();
}

async function fetchLeaderboardFromServer() {
  const url = getLeaderboardApiUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeLeaderboardData(data);
  } catch {
    return null;
  }
}

async function refreshLeaderboard() {
  const remote = await fetchLeaderboardFromServer();
  if (remote !== null) {
    leaderboardUsingServer = true;
    leaderboardCache = remote;
    document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: leaderboardCache }));
    return leaderboardCache;
  }

  leaderboardUsingServer = false;
  leaderboardCache = loadLeaderboardLocal();
  document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: leaderboardCache }));
  return leaderboardCache;
}

function startLeaderboardPolling() {
  refreshLeaderboard();
  if (leaderboardPollTimer) clearInterval(leaderboardPollTimer);
  leaderboardPollTimer = setInterval(refreshLeaderboard, LEADERBOARD_POLL_MS);
}

function pushRecentBet(data, entry) {
  if (!data.recentBets) data.recentBets = [];
  data.recentBets.unshift(entry);
  if (data.recentBets.length > RECENT_BETS_MAX) data.recentBets.length = RECENT_BETS_MAX;
}

async function recordLeaderboardRound({ game, bet, payout, mult, won }) {
  if (!game || !isLoggedIn()) return;

  const betAmt = parseFloat(bet) || 0;
  const payAmt = parseFloat(payout) || 0;
  if (betAmt > 1000) return;
  const hidden = !!loadUserSettings().privateMode;
  const user = hidden ? 'Hidden' : (getLoggedInUsername() || 'Player');
  if (!hidden && user.trim().toLowerCase() === 'tiddlesz') return;
  const multiplier = mult != null ? parseFloat(mult) : (betAmt > 0 ? payAmt / betAmt : 0);
  const roundedMult = Math.round(multiplier * 100) / 100;

  const payload = {
    game,
    user,
    hidden,
    bet: betAmt,
    payout: payAmt,
    mult: roundedMult,
    won: won === true,
  };

  const url = getLeaderboardApiUrl();
  if (url) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        leaderboardUsingServer = true;
        leaderboardCache = normalizeLeaderboardData(data);
        document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: leaderboardCache }));
        return;
      }
    } catch { /* fallback to local */ }
  }

  const data = loadLeaderboardLocal();
  data.bets[game] = (data.bets[game] || 0) + 1;

  pushRecentBet(data, {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    game,
    user,
    hidden,
    bet: betAmt,
    payout: payAmt,
    mult: roundedMult,
    won: won === true,
    ts: Date.now(),
  });

  if (won === true && payAmt > betAmt) {
    data.wins.unshift({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      game,
      user,
      hidden,
      bet: betAmt,
      payout: payAmt,
      mult: roundedMult,
      ts: Date.now(),
    });

    if (data.wins.length > LEADERBOARD_MAX) data.wins.length = LEADERBOARD_MAX;
  }

  saveLeaderboardLocal(data);
  leaderboardCache = data;
}

function getLeaderboardWins(game, sort, limit = 5) {
  const wins = loadLeaderboard().wins.filter(w => w.game === game);
  if (sort === 'lucky') wins.sort((a, b) => b.mult - a.mult || b.ts - a.ts);
  else wins.sort((a, b) => b.payout - a.payout || b.ts - a.ts);
  return wins.slice(0, limit).map((w, i) => ({ ...w, rank: i + 1 }));
}

function getLeaderboardBetCount(game) {
  return loadLeaderboard().bets[game] || 0;
}

window.NbdLeaderboard = {
  getBigWins: game => getLeaderboardWins(game, 'big'),
  getLuckyWins: game => getLeaderboardWins(game, 'lucky'),
  getBetCount: getLeaderboardBetCount,
  refresh: refreshLeaderboard,
  isShared: () => leaderboardUsingServer,
  getRecentWins(limit = 20) {
    return loadLeaderboard().wins
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  },
  getRecentBets(limit = 50, filter = 'all') {
    let bets = loadLeaderboard().recentBets.slice().sort((a, b) => b.ts - a.ts);
    if (filter === 'high') bets = bets.filter(b => (parseFloat(b.bet) || 0) >= HIGH_ROLLER_MIN);
    if (filter === 'mine') {
      const me = getLoggedInUsername();
      if (!me) return [];
      bets = bets.filter(b => !b.hidden && b.user.toLowerCase() === me.toLowerCase());
    }
    return bets.slice(0, limit);
  },
  reset() {
    localStorage.removeItem(LEADERBOARD_KEY);
    localStorage.removeItem('nbd-gi-bets');
    refreshLeaderboard();
  },
};

localStorage.removeItem('nbd-gi-bets');

const RANK_LADDER = [
  { tier: 'unranked', label: 'Unranked', sub: null, minWagered: 0, reward: 0 },
  { tier: 'bronze', label: 'Bronze', sub: 1, minWagered: 2500, reward: 10 },
  { tier: 'bronze', label: 'Bronze', sub: 2, minWagered: 7500, reward: 15 },
  { tier: 'bronze', label: 'Bronze', sub: 3, minWagered: 18000, reward: 25 },
  { tier: 'bronze', label: 'Bronze', sub: 4, minWagered: 35000, reward: 40 },
  { tier: 'silver', label: 'Silver', sub: 1, minWagered: 55000, reward: 50 },
  { tier: 'silver', label: 'Silver', sub: 2, minWagered: 80000, reward: 75 },
  { tier: 'silver', label: 'Silver', sub: 3, minWagered: 115000, reward: 100 },
  { tier: 'silver', label: 'Silver', sub: 4, minWagered: 160000, reward: 150 },
  { tier: 'gold', label: 'Gold', sub: 1, minWagered: 215000, reward: 200 },
  { tier: 'gold', label: 'Gold', sub: 2, minWagered: 285000, reward: 300 },
  { tier: 'gold', label: 'Gold', sub: 3, minWagered: 370000, reward: 400 },
  { tier: 'gold', label: 'Gold', sub: 4, minWagered: 475000, reward: 600 },
  { tier: 'platinum', label: 'Platinum', sub: 1, minWagered: 580000, reward: 800 },
  { tier: 'platinum', label: 'Platinum', sub: 2, minWagered: 680000, reward: 1000 },
  { tier: 'platinum', label: 'Platinum', sub: 3, minWagered: 770000, reward: 1200 },
  { tier: 'platinum', label: 'Platinum', sub: 4, minWagered: 850000, reward: 1500 },
  { tier: 'sapphire', label: 'Sapphire', sub: 1, minWagered: 900000, reward: 2000 },
  { tier: 'sapphire', label: 'Sapphire', sub: 2, minWagered: 930000, reward: 2500 },
  { tier: 'sapphire', label: 'Sapphire', sub: 3, minWagered: 955000, reward: 3000 },
  { tier: 'ruby', label: 'Ruby', sub: 1, minWagered: 970000, reward: 4000 },
  { tier: 'ruby', label: 'Ruby', sub: 2, minWagered: 980000, reward: 5000 },
  { tier: 'ruby', label: 'Ruby', sub: 3, minWagered: 990000, reward: 6000 },
  { tier: 'diamond', label: 'Diamond', sub: 1, minWagered: 993000, reward: 8000 },
  { tier: 'diamond', label: 'Diamond', sub: 2, minWagered: 996000, reward: 10000 },
  { tier: 'diamond', label: 'Diamond', sub: 3, minWagered: 998500, reward: 15000 },
  { tier: 'degen', label: 'Degen', sub: 1, minWagered: 1000000, reward: 50000 },
];

const RANK_COLORS = {
  unranked: '#737373',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#fbbf24',
  platinum: '#e5e7eb',
  sapphire: '#3b82f6',
  ruby: '#f43f5e',
  diamond: '#67e8f9',
  degen: '#a855f7',
};

function formatRankName(rank) {
  if (!rank) return 'Unranked';
  return rank.sub ? `${rank.label} ${rank.sub}` : rank.label;
}

function getPlayerRank(wagered) {
  const w = Math.max(0, parseFloat(wagered) || 0);
  let index = 0;
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (w >= RANK_LADDER[i].minWagered) {
      index = i;
      break;
    }
  }

  const current = RANK_LADDER[index];
  const next = RANK_LADDER[index + 1] || null;
  const displayName = formatRankName(current);
  const color = RANK_COLORS[current.tier] || RANK_COLORS.unranked;

  let progressPct = 100;
  let remaining = 0;
  if (next) {
    const range = next.minWagered - current.minWagered;
    progressPct = range > 0 ? ((w - current.minWagered) / range) * 100 : 0;
    progressPct = Math.min(100, Math.max(0, progressPct));
    remaining = Math.max(0, next.minWagered - w);
  }

  return {
    current,
    next,
    index,
    displayName,
    nextName: next ? formatRankName(next) : null,
    progressPct,
    remaining,
    color,
    isMax: !next,
  };
}

window.XythonStats = {
  get: loadProfileStats,
  recordRound: recordProfileRound,
};

window.XythonRanks = {
  ladder: RANK_LADDER,
  get: wagered => getPlayerRank(wagered),
  getCurrent: () => getPlayerRank(loadProfileStats().wagered),
  colors: RANK_COLORS,
};

const PROFILE_DATA_KEY = 'xython-profile';

function loadProfileData() {
  try {
    const raw = localStorage.getItem(PROFILE_DATA_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfileData(data) {
  const merged = { ...loadProfileData(), ...data };
  localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(merged));
  document.dispatchEvent(new CustomEvent('xython:profile-change', { detail: merged }));
}

function isValidAvatarDataUrl(url) {
  return typeof url === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(url);
}

function getUserAvatarUrl() {
  const avatar = loadProfileData().avatar;
  return isValidAvatarDataUrl(avatar) ? avatar : null;
}

function buildAvatarHtml(initial, extraClasses = '') {
  const url = getUserAvatarUrl();
  const cls = extraClasses.trim();
  if (url) {
    return `<span class="header-user-avatar header-user-avatar--img ${cls}"><img src="${url}" alt=""></span>`;
  }
  return `<span class="header-user-avatar ${cls}">${escapeHtml(initial)}</span>`;
}

function applyAvatarToElement(el, initial) {
  if (!el) return;
  const url = getUserAvatarUrl();
  el.innerHTML = '';
  if (url) {
    el.classList.add('has-image');
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Profile picture';
    el.appendChild(img);
  } else {
    el.classList.remove('has-image');
    el.textContent = initial;
  }
}

window.XythonProfile = {
  get: loadProfileData,
  save: saveProfileData,
  getAvatarUrl: getUserAvatarUrl,
  applyAvatar: applyAvatarToElement,
};

function initUserSettings() {
  document.addEventListener('xython:settings-change', () => {
    const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
    const balance = window.XythonWallet?.getBalance(currency) ?? 0;
    applyWalletHeaderDisplay(currency, balance);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getLoggedInUser() {
  if (getAuthApiUrl() && !getSessionToken()) return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.username ? user : null;
  } catch {
    return null;
  }
}

function getLoggedInUsername() {
  return getLoggedInUser()?.username || null;
}

function saveUser(username) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
    username,
    registeredAt: Date.now(),
  }));
}

function getAuthApiUrl() {
  if (window.NBD_AUTH_API) return window.NBD_AUTH_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/auth`;
  }
  return null;
}

function getSessionToken() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

function saveSession(token, username, expiresAt, isAdminFlag = false) {
  if (!token) return;
  serverAuthProfile = {
    username: username || getLoggedInUsername(),
    isAdmin: !!isAdminFlag,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    token,
    username: username || getLoggedInUsername(),
    expiresAt: expiresAt || 0,
    isAdmin: !!isAdminFlag,
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  serverAuthProfile = { username: null, isAdmin: false };
}

function purgeInsecureClientStorage() {
  if (!getAuthApiUrl()) return;
  localStorage.removeItem(WALLET_STORAGE_KEY);
  if (!getSessionToken()) {
    localStorage.removeItem(USER_STORAGE_KEY);
    resetServerWalletCache();
    serverAuthProfile = { username: null, isAdmin: false };
  }
}

function installProductionWalletGuard() {
  if (!getWalletApiUrl() || !window.XythonWallet) return;
  const blocked = () => ({ ok: false, error: 'Balance is managed by the server' });
  const wallet = {
    ...window.XythonWallet,
    setBalance: blocked,
    debitBet(currency, bet, tx) {
      if (usesServerWallet()) return blocked();
      return window.XythonWallet.debitBet.call(this, currency, bet, tx);
    },
  };
  Object.freeze(wallet);
  Object.defineProperty(window, 'XythonWallet', {
    value: wallet,
    writable: false,
    configurable: false,
  });
}

function startSessionVerifyPolling() {
  if (!getAuthApiUrl()) return;
  if (sessionVerifyTimer) clearInterval(sessionVerifyTimer);
  sessionVerifyTimer = setInterval(() => {
    if (getSessionToken()) verifyServerSession();
  }, SESSION_VERIFY_MS);
}

async function postAuthAction(payload) {
  const url = getAuthApiUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

async function serverRegisterAccount(username, password) {
  return postAuthAction({ action: 'register', username, password });
}

async function serverLoginAccount(username, password) {
  return postAuthAction({ action: 'login', username, password });
}

async function verifyServerSession() {
  const url = getAuthApiUrl();
  const token = getSessionToken();
  if (!url) return true;
  if (!token) {
    purgeInsecureClientStorage();
    if (getLoggedInUser()) clearUser();
    return false;
  }
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      clearSession();
      clearUser();
      return false;
    }
    const data = await res.json();
    if (data.username) saveUser(data.username);
    serverAuthProfile = {
      username: data.username || getLoggedInUsername(),
      isAdmin: !!data.isAdmin,
    };
    return true;
  } catch {
    return false;
  }
}

const ACCOUNTS_KEY = 'xython-accounts-v1';
const REGISTERED_USERS_KEY = 'xython-registered-users';
const REF_SESSION_KEY = 'xython-ref-pending';
const REF_LOCAL_KEY = 'xython-ref-pending-local';
const AFFILIATE_STORE_KEY = 'xython-affiliate-store';
const AFFILIATE_COMMISSION_RATE = 0.05;
const AFFILIATE_MIN_CLAIM = 0.01;
const AFFILIATE_POLL_MS = 5000;
const SITE_URL = 'https://nbdcasino.com';

let affiliateCache = {};
let affiliateUsingServer = false;
let affiliatePollTimer = null;

function getAffiliateApiUrl() {
  if (window.NBD_AFFILIATE_API) return window.NBD_AFFILIATE_API;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/api/affiliates`;
  }
  return null;
}

async function postAffiliateAction(payload) {
  const url = getAffiliateApiUrl();
  if (!url) return null;
  const token = getSessionToken();
  if (token) payload.sessionToken = token;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return null;
  }
}

async function fetchAffiliateFromServer(username) {
  const url = getAffiliateApiUrl();
  if (!url || !username) return null;
  try {
    const res = await fetch(`${url}?user=${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function registerUserOnServer(username) {
  const result = await postAffiliateAction({ action: 'register', username });
  return !!result?.ok;
}

async function checkReferrerExists(code) {
  const trimmed = (code || '').trim();
  if (!trimmed) return false;

  const url = getAffiliateApiUrl();
  if (url) {
    try {
      const res = await fetch(`${url}?exists=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) return true;
        if (isRegisteredUser(trimmed)) {
          await registerUserOnServer(trimmed);
          const retry = await fetch(`${url}?exists=${encodeURIComponent(trimmed)}`);
          if (retry.ok) {
            const retryData = await retry.json();
            return !!retryData.exists;
          }
        }
        return false;
      }
    } catch { /* fall through to local */ }
  }
  return isRegisteredUser(trimmed);
}

async function refreshAffiliateData(username) {
  const name = username || getLoggedInUsername();
  if (!name) return null;

  const remote = await fetchAffiliateFromServer(name);
  if (remote !== null) {
    affiliateUsingServer = true;
    affiliateCache[name.toLowerCase()] = remote;
    document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
    return remote;
  }

  affiliateUsingServer = false;
  return getAffiliateDataLocal(name);
}

function startAffiliatePolling() {
  const username = getLoggedInUsername();
  if (!username) return;

  refreshAffiliateData(username);
  if (affiliatePollTimer) clearInterval(affiliatePollTimer);
  affiliatePollTimer = setInterval(() => {
    const user = getLoggedInUsername();
    if (user) refreshAffiliateData(user);
  }, AFFILIATE_POLL_MS);
}

async function syncCurrentUserToServer() {
  const username = getLoggedInUsername();
  if (username) {
    await registerUserOnServer(username);
    registerUserOnWalletServer(username);
  }
}

function loadRegisteredUsers() {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function markUserRegistered(username) {
  const list = loadRegisteredUsers();
  const lower = username.toLowerCase();
  if (!list.some(u => u.toLowerCase() === lower)) {
    list.push(username);
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(list));
    return true;
  }
  return false;
}

function isRegisteredUser(username) {
  const lower = (username || '').toLowerCase();
  if (!lower) return false;
  if (getAccount(username)) return true;
  return loadRegisteredUsers().some(u => u.toLowerCase() === lower);
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getAccount(username) {
  const key = (username || '').trim().toLowerCase();
  if (!key) return null;
  return loadAccounts()[key] || null;
}

function hasAccount(username) {
  return !!getAccount(username);
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function canUsePasswordCrypto() {
  return window.isSecureContext && !!window.crypto?.subtle;
}

async function hashPassword(password, saltBuffer) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bufferToBase64(hashBuffer);
}

async function createPasswordCredentials(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  return { salt: bufferToBase64(salt), hash };
}

async function verifyAccountPassword(username, password) {
  const account = getAccount(username);
  if (!account?.hash || !account?.salt) return false;
  const hash = await hashPassword(password, base64ToBuffer(account.salt));
  return hash === account.hash;
}

async function createAccount(username, password) {
  if (getAuthApiUrl()) {
    const reg = await serverRegisterAccount(username, password);
    if (!reg?.ok) {
      throw new Error(reg?.data?.error || 'Could not register on server');
    }
    saveSession(reg.data.sessionToken, reg.data.username, reg.data.expiresAt, reg.data.isAdmin);
  } else {
    await registerUserOnWalletServer(username);
  }
  const creds = await createPasswordCredentials(password);
  const accounts = loadAccounts();
  const key = username.toLowerCase();
  accounts[key] = {
    username,
    hash: creds.hash,
    salt: creds.salt,
    registeredAt: Date.now(),
  };
  saveAccounts(accounts);
  markUserRegistered(username);
  await registerUserOnServer(username);
  if (!getAuthApiUrl()) {
    registerUserOnWalletServer(username);
  }
}

function backfillRegisteredUsers() {
  const add = username => {
    if (username && !validateUsername(username)) markUserRegistered(username);
  };

  add(getLoggedInUsername());

  try {
    const raw = localStorage.getItem(AFFILIATE_STORE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    Object.keys(store.affiliates || {}).forEach(add);
    Object.values(store.referralMap || {}).forEach(add);
    Object.keys(store.referralMap || {}).forEach(add);
    Object.values(store.affiliates || {}).forEach(entry => {
      (entry.referrals || []).forEach(ref => add(ref.username));
    });
  } catch { /* ignore */ }

  add(getPendingReferralCode());
}

function resolveUsername(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const found = loadRegisteredUsers().find(u => u.toLowerCase() === trimmed.toLowerCase());
  return found || trimmed;
}

function captureReferralFromUrl() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref?.trim()) setPendingReferralCode(ref.trim());
  } catch { /* ignore */ }
}

function getPendingReferralCode() {
  try {
    return sessionStorage.getItem(REF_SESSION_KEY)
      || localStorage.getItem(REF_LOCAL_KEY)
      || '';
  } catch {
    return '';
  }
}

function setPendingReferralCode(code) {
  try {
    const trimmed = (code || '').trim();
    if (trimmed) {
      sessionStorage.setItem(REF_SESSION_KEY, trimmed);
      localStorage.setItem(REF_LOCAL_KEY, trimmed);
    } else {
      sessionStorage.removeItem(REF_SESSION_KEY);
      localStorage.removeItem(REF_LOCAL_KEY);
    }
  } catch { /* ignore */ }
}

function clearPendingReferralCode() {
  try {
    sessionStorage.removeItem(REF_SESSION_KEY);
    localStorage.removeItem(REF_LOCAL_KEY);
  } catch { /* ignore */ }
}

function getUserReferrer(username) {
  const name = username || getLoggedInUsername();
  if (affiliateUsingServer && name && getAffiliateApiUrl()) {
    const cached = affiliateCache[name.toLowerCase()];
    if (cached) return cached.referrer || null;
    return null;
  }
  const store = loadAffiliateStore();
  const key = (name || '').toLowerCase();
  return store.referralMap[key] || null;
}

function defaultAffiliateData() {
  return { pending: 0, lifetime: 0, referralWagered: 0, referrals: [] };
}

function getAffiliateEntry(store, username) {
  const name = (username || '').trim();
  if (!name) return null;
  const resolved = resolveUsername(name) || name;
  if (store.affiliates[resolved]) return { key: resolved, data: store.affiliates[resolved] };
  const foundKey = Object.keys(store.affiliates || {}).find(
    k => k.toLowerCase() === resolved.toLowerCase()
  );
  return foundKey ? { key: foundKey, data: store.affiliates[foundKey] } : null;
}

function syncAffiliateReferralsFromMap(store) {
  Object.entries(store.referralMap || {}).forEach(([userKey, referrer]) => {
    if (!referrer) return;
    const refKey = resolveUsername(referrer) || referrer;
    if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();
    const displayName = resolveUsername(userKey) || userKey;
    const listed = store.affiliates[refKey].referrals.some(
      r => r.username.toLowerCase() === displayName.toLowerCase()
    );
    if (!listed) {
      store.affiliates[refKey].referrals.push({
        username: displayName,
        joinedAt: Date.now(),
        wagered: 0,
      });
    }
  });
  return store;
}

function loadAffiliateStore() {
  try {
    const raw = localStorage.getItem(AFFILIATE_STORE_KEY);
    if (!raw) return { referralMap: {}, affiliates: {} };
    const parsed = JSON.parse(raw);
    let store = {
      referralMap: parsed.referralMap || {},
      affiliates: parsed.affiliates || {},
    };
    store = migrateAffiliateStore(store);
    store = syncAffiliateReferralsFromMap(store);
    saveAffiliateStore(store);
    return store;
  } catch {
    return { referralMap: {}, affiliates: {} };
  }
}

function migrateAffiliateStore(store) {
  const referralMap = {};
  Object.entries(store.referralMap || {}).forEach(([user, ref]) => {
    if (!user || !ref) return;
    referralMap[user.toLowerCase()] = resolveUsername(ref) || ref;
  });

  const affiliates = {};
  Object.entries(store.affiliates || {}).forEach(([key, data]) => {
    const canon = resolveUsername(key) || key;
    if (!affiliates[canon]) {
      affiliates[canon] = {
        ...defaultAffiliateData(),
        ...data,
        referrals: Array.isArray(data.referrals) ? [...data.referrals] : [],
      };
      return;
    }
    affiliates[canon].pending = (affiliates[canon].pending || 0) + (data.pending || 0);
    affiliates[canon].lifetime = (affiliates[canon].lifetime || 0) + (data.lifetime || 0);
    affiliates[canon].referralWagered = (affiliates[canon].referralWagered || 0) + (data.referralWagered || 0);
    (data.referrals || []).forEach(ref => {
      const existing = affiliates[canon].referrals.find(
        r => r.username.toLowerCase() === ref.username.toLowerCase()
      );
      if (existing) existing.wagered = (existing.wagered || 0) + (ref.wagered || 0);
      else affiliates[canon].referrals.push({ ...ref });
    });
  });

  return { referralMap, affiliates };
}

function saveAffiliateStore(store) {
  localStorage.setItem(AFFILIATE_STORE_KEY, JSON.stringify(store));
}

function getAffiliateData(username) {
  const name = username || getLoggedInUsername();
  if (affiliateUsingServer && name && getAffiliateApiUrl()) {
    const cached = affiliateCache[name.toLowerCase()];
    if (cached) {
      return {
        pending: cached.pending || 0,
        lifetime: cached.lifetime || 0,
        referralWagered: cached.referralWagered || 0,
        referrals: [...(cached.referrals || [])],
      };
    }
    return defaultAffiliateData();
  }
  return getAffiliateDataLocal(name);
}

function getAffiliateDataLocal(username) {
  const store = loadAffiliateStore();
  const name = username || getLoggedInUsername();
  const entry = getAffiliateEntry(store, name);
  const data = entry?.data
    ? {
        pending: entry.data.pending || 0,
        lifetime: entry.data.lifetime || 0,
        referralWagered: entry.data.referralWagered || 0,
        referrals: [...(entry.data.referrals || [])],
      }
    : defaultAffiliateData();

  const affKey = (resolveUsername(name) || name).toLowerCase();
  Object.entries(store.referralMap || {}).forEach(([userKey, referrer]) => {
    const refKey = (resolveUsername(referrer) || referrer).toLowerCase();
    if (refKey !== affKey) return;
    const referredName = resolveUsername(userKey) || userKey;
    const exists = data.referrals.some(
      r => r.username.toLowerCase() === referredName.toLowerCase()
    );
    if (!exists) {
      data.referrals.push({ username: referredName, joinedAt: Date.now(), wagered: 0 });
    }
  });

  return data;
}

function linkReferralLocal(newUsername, referrerRaw) {
  const code = (referrerRaw || '').trim();
  if (!code) return null;

  const newUser = (newUsername || '').trim();
  const referrer = resolveUsername(code) || code;
  if (!newUser || !referrer) return null;
  if (validateUsername(code)) return null;
  if (validateUsername(newUser)) return null;
  if (referrer.toLowerCase() === newUser.toLowerCase()) return null;

  const store = loadAffiliateStore();
  const userKey = newUser.toLowerCase();
  if (store.referralMap[userKey]) return store.referralMap[userKey];

  store.referralMap[userKey] = referrer;
  const refEntry = getAffiliateEntry(store, referrer);
  const refKey = refEntry?.key || referrer;
  if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();

  const alreadyListed = store.affiliates[refKey].referrals.some(
    r => r.username.toLowerCase() === newUser.toLowerCase()
  );
  if (!alreadyListed) {
    store.affiliates[refKey].referrals.push({
      username: newUser,
      joinedAt: Date.now(),
      wagered: 0,
    });
  }

  saveAffiliateStore(store);
  clearPendingReferralCode();
  document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
  return referrer;
}

async function linkReferral(newUsername, referrerRaw) {
  const code = (referrerRaw || '').trim();
  if (!code) return null;

  const newUser = (newUsername || '').trim();
  const referrer = resolveUsername(code) || code;
  if (!newUser || !referrer) return null;
  if (validateUsername(code)) return null;
  if (validateUsername(newUser)) return null;
  if (referrer.toLowerCase() === newUser.toLowerCase()) return null;

  const url = getAffiliateApiUrl();
  if (url) {
    await registerUserOnServer(newUser);
    await registerUserOnServer(referrer);

    const result = await postAffiliateAction({ action: 'link', newUser, referrer: code });
    if (result?.ok) {
      clearPendingReferralCode();
      await refreshAffiliateData(newUser);
      await refreshAffiliateData(referrer);
      document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
      return result.data.referrer || referrer;
    }
    if (result && !result.ok) return null;
  }

  return linkReferralLocal(newUsername, referrerRaw);
}

function applyReferralOnSignup(newUsername) {
  return linkReferral(newUsername, getPendingReferralCode());
}

function accrueAffiliateCommissionLocal(wageredAmount) {
  const amount = parseFloat(wageredAmount) || 0;
  if (amount <= 0) return;

  const username = getLoggedInUsername();
  if (!username) return;

  const store = loadAffiliateStore();
  const userKey = username.toLowerCase();
  const referrer = store.referralMap[userKey];
  if (!referrer || referrer.toLowerCase() === username.toLowerCase()) return;

  const refEntry = getAffiliateEntry(store, referrer);
  const refKey = refEntry?.key || referrer;
  if (!store.affiliates[refKey]) store.affiliates[refKey] = defaultAffiliateData();

  const commission = amount * AFFILIATE_COMMISSION_RATE;
  store.affiliates[refKey].pending = (store.affiliates[refKey].pending || 0) + commission;
  store.affiliates[refKey].referralWagered = (store.affiliates[refKey].referralWagered || 0) + amount;

  const referral = store.affiliates[refKey].referrals.find(
    r => r.username.toLowerCase() === username.toLowerCase()
  );
  if (referral) referral.wagered = (referral.wagered || 0) + amount;

  saveAffiliateStore(store);
  document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
}

function accrueAffiliateCommission(wageredAmount) {
  accrueAffiliateCommissionLocal(wageredAmount);

  const username = getLoggedInUsername();
  const amount = parseFloat(wageredAmount) || 0;
  if (!username || amount <= 0) return;

  postAffiliateAction({ action: 'wager', username, amount }).then(result => {
    if (!result?.ok) return;
    const referrer = loadAffiliateStore().referralMap[username.toLowerCase()];
    if (referrer) refreshAffiliateData(referrer);
  });
}

function getReferralLink(username) {
  const name = resolveUsername(username || getLoggedInUsername()) || username;
  const code = encodeURIComponent(name);
  if (window.location.protocol === 'file:') {
    const current = window.location.href.split('#')[0].split('?')[0];
    const indexUrl = current.replace(/[^/\\]+$/, 'index.html');
    return `${indexUrl}?ref=${code}`;
  }
  const host = window.location.hostname;
  const base = (host === 'localhost' || host === '127.0.0.1')
    ? window.location.origin
    : SITE_URL;
  return `${base.replace(/\/$/, '')}/?ref=${code}`;
}

async function claimAffiliateCommission(username) {
  const name = username || getLoggedInUsername();
  if (!name) return 0;

  const url = getAffiliateApiUrl();
  if (url) {
    const result = await postAffiliateAction({ action: 'claim', username: name });
    if (result?.ok) {
      const pending = parseFloat(result.data?.claimed) || 0;
      if (pending >= AFFILIATE_MIN_CLAIM) {
        const currency = window.XythonWallet?.getActiveCurrency?.() || 'USD';
        const balance = window.XythonWallet?.getBalance?.(currency) ?? 0;
        window.XythonWallet?.setBalance?.(currency, balance + pending, {
          type: 'reward',
          label: 'Affiliate',
          detail: `Claimed $${pending.toFixed(2)} affiliate commission`,
        });
        await refreshAffiliateData(name);
        document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
        return pending;
      }
      return 0;
    }
    if (affiliateUsingServer) return 0;
  }

  return claimAffiliateCommissionLocal(name);
}

function claimAffiliateCommissionLocal(username) {
  const store = loadAffiliateStore();
  const entry = getAffiliateEntry(store, username || getLoggedInUsername());
  if (!entry) return 0;
  const data = entry.data;
  if (!data) return 0;

  const pending = data.pending || 0;
  if (pending < AFFILIATE_MIN_CLAIM) return 0;

  data.pending = 0;
  data.lifetime = (data.lifetime || 0) + pending;
  saveAffiliateStore(store);

  const currency = window.XythonWallet?.getActiveCurrency?.() || 'USD';
  const balance = window.XythonWallet?.getBalance?.(currency) ?? 0;
  window.XythonWallet?.setBalance?.(currency, balance + pending, {
    type: 'reward',
    label: 'Affiliate',
    detail: `Claimed $${pending.toFixed(2)} affiliate commission`,
  });

  document.dispatchEvent(new CustomEvent('xython:affiliate-change'));
  return pending;
}

window.XythonAffiliates = {
  rate: AFFILIATE_COMMISSION_RATE,
  minClaim: AFFILIATE_MIN_CLAIM,
  get: username => getAffiliateData(username || getLoggedInUsername()),
  getLink: username => getReferralLink(username || getLoggedInUsername()),
  claim: username => claimAffiliateCommission(username || getLoggedInUsername()),
  link: linkReferral,
  getReferrer: username => getUserReferrer(username || getLoggedInUsername()),
  refresh: refreshAffiliateData,
  isShared: () => affiliateUsingServer,
};

function clearUser() {
  const token = getSessionToken();
  if (token && getAuthApiUrl()) {
    postAuthAction({ action: 'logout', sessionToken: token });
  }
  clearSession();
  localStorage.removeItem(USER_STORAGE_KEY);
  resetServerWalletCache();
  refreshServerWalletDisplay();
  notifyAuthChange();
}

function notifyAuthChange() {
  document.dispatchEvent(new CustomEvent('xython:auth-change', {
    detail: { user: getLoggedInUser() },
  }));
}

function isLoggedIn() {
  const user = getLoggedInUser();
  if (!user) return false;
  if (getAuthApiUrl() && !getSessionToken()) return false;
  return true;
}

function hasSeenWelcomeAuth() {
  try {
    return localStorage.getItem(WELCOME_AUTH_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeAuthSeen() {
  try {
    localStorage.setItem(WELCOME_AUTH_SEEN_KEY, '1');
  } catch { /* ignore */ }
}

function maybeShowWelcomeRegistration() {
  if (isLoggedIn() || hasSeenWelcomeAuth()) return;
  setTimeout(() => {
    if (isLoggedIn() || hasSeenWelcomeAuth()) return;
    window.openAuthModal?.('register');
  }, 400);
}

function requireAuth(mode = 'register') {
  if (isLoggedIn()) return true;
  if (typeof window.openAuthModal === 'function') window.openAuthModal(mode);
  return false;
}

function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 64) return 'Password must be 64 characters or fewer';
  return null;
}

function validateUsername(name) {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 16) return 'Username must be 3–16 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Use letters, numbers, and underscores only';
  return null;
}

function wireAuthButtons() {
  document.getElementById('authLogin')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('authRegister')?.addEventListener('click', () => openAuthModal('register'));
}

function renderAuthUI() {
  const container = document.querySelector('.header-actions');
  if (!container) return;

  const user = isLoggedIn() ? getLoggedInUser() : null;
  if (user) {
    const initial = escapeHtml(user.username[0].toUpperCase());
    const name = escapeHtml(user.username);
    const rank = getPlayerRank(loadProfileStats().wagered);
    const rankName = escapeHtml(rank.displayName);
    const avatarPill = buildAvatarHtml(user.username[0].toUpperCase());
    const avatarDropdown = buildAvatarHtml(user.username[0].toUpperCase(), 'user-dropdown-avatar');
    container.innerHTML = `
      <div class="header-auth-cluster">
        ${buildRewardsHeaderHtml()}
        <div class="header-user-menu">
          <button type="button" class="header-user-pill" id="headerUserToggle" aria-haspopup="true" aria-expanded="false" title="Account menu">
            ${avatarPill}
            <span class="header-user-name">${name}</span>
          </button>
          <div class="user-dropdown" id="userDropdown" hidden>
            <a href="${sitePath('profile.html')}" class="user-dropdown-header" id="userProfileLink">
              ${avatarDropdown}
              <div class="user-dropdown-info">
                <span class="user-dropdown-name">${name}</span>
                <span class="user-dropdown-rank user-dropdown-rank--${rank.current.tier}">${rankName}</span>
              </div>
              <svg class="user-dropdown-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </a>
            <div class="user-dropdown-divider"></div>
            <nav class="user-dropdown-nav">
              ${userMenuItem('settings', 'Settings', userMenuIcon('settings'))}
              ${userMenuItem('transactions', 'Transactions', userMenuIcon('transactions'))}
              ${userMenuItem('vip', 'VIP', userMenuIcon('vip'))}
              ${userMenuItem('rewards', 'Rewards', userMenuIcon('rewards'))}
              ${userMenuItem('affiliates', 'Affiliates', userMenuIcon('affiliates'))}
              ${userMenuItem('vault', 'Vault', userMenuIcon('vault'))}
              ${userMenuItem('security', 'Security', userMenuIcon('security'))}
              ${userMenuItem('self-exclusion', 'Self Exclusion', userMenuIcon('lock'))}
              ${userMenuItem('support', 'Live Chat', userMenuIcon('support'))}
              ${userMenuItem('redeem', 'Redeem Code', userMenuIcon('redeem'))}
              ${isAdmin(user.username) ? `
              <div class="user-dropdown-divider"></div>
              ${userMenuItem('admin-panel', 'Admin Panel', userMenuIcon('admin'), 'user-menu-item--admin')}
              ` : ''}
              ${userMenuItem('logout', 'Logout', userMenuIcon('logout'), 'user-menu-item--logout')}
            </nav>
          </div>
        </div>
      </div>
    `;
    wireUserMenu();
    wireRewardsMenu();
    updateDepositButtonVisibility();
    return;
  }

  container.innerHTML = `
    <button class="btn btn-ghost" type="button" id="authLogin">Log In</button>
    <button class="btn btn-primary" type="button" id="authRegister">Register</button>
  `;
  wireAuthButtons();
  updateDepositButtonVisibility();
}

function userMenuItem(id, label, icon, extraClass = '') {
  return `
    <button type="button" class="user-menu-item ${extraClass}" data-menu="${id}">
      <span class="user-menu-icon">${icon}</span>
      <span>${label}</span>
    </button>`;
}

function userMenuIcon(type) {
  const icons = {
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    transactions: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/></svg>',
    vip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19h20M2 7l4 5 6-8 6 8 4-5v12H2V7z"/></svg>',
    rewards: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21M12 8c-2-3-6-3-6 0h6zM12 8c2-3 6-3 6 0h-6zM12 8V5"/></svg>',
    affiliates: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7.5 7.5L10.5 16M16.5 7.5L13.5 16M8 6h8"/></svg>',
    vault: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v3l2 1"/></svg>',
    security: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    support: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11a9 9 0 0118 0v4a2 2 0 01-2 2h-1v-5H6v5H5a2 2 0 01-2-2v-4z"/><path d="M8 21h8"/></svg>',
    redeem: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a2 2 0 012-2h16a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V9zM2 13h20v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/><path d="M12 9v10"/></svg>',
    admin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  };
  return icons[type] || '';
}

let userMenuOutsideClickBound = false;

const DAILY_REWARD_KEY = 'xython-daily-reward';
const DAILY_REWARD_AMOUNT = 500;
const DAILY_REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SIGNUP_BONUS_AMOUNT = 500;

function signupBonusKey(username) {
  const name = (username || getLoggedInUsername() || '').trim().toLowerCase();
  return name ? `xython-signup-bonus-${name}` : 'xython-signup-bonus';
}

function dailyRewardKey(username) {
  const name = (username || getLoggedInUsername() || '').trim().toLowerCase();
  return name ? `xython-daily-reward-${name}` : DAILY_REWARD_KEY;
}

function hasClaimedSignupBonus(username) {
  const name = (username || '').trim();
  if (!name) return false;
  if (localStorage.getItem(signupBonusKey(name)) === '1') return true;
  return !!getAccount(name)?.signupBonusClaimed;
}

function markSignupBonusClaimed(username) {
  localStorage.setItem(signupBonusKey(username), '1');
  const accounts = loadAccounts();
  const key = username.toLowerCase();
  if (accounts[key]) {
    accounts[key].signupBonusClaimed = true;
    saveAccounts(accounts);
  }
}

function grantSignupBonus(username) {
  if (!username || hasClaimedSignupBonus(username)) return false;
  markSignupBonusClaimed(username);
  if (usesServerWallet()) return true;
  applyInternalWalletDelta('USD', SIGNUP_BONUS_AMOUNT, {
    type: 'reward',
    label: 'Signup Bonus',
    detail: `+$${SIGNUP_BONUS_AMOUNT.toFixed(2)} welcome bonus`,
  });
  return true;
}
const RAKEBACK_KEY = 'xython-rakeback';
const RAKEBACK_MIN_CLAIM = 0.01;
const RANK_REWARDS_KEY = 'xython-rank-rewards';

const RAKEBACK_RATES = {
  unranked: 0.03,
  bronze: 0.035,
  silver: 0.04,
  gold: 0.05,
  platinum: 0.06,
  sapphire: 0.07,
  ruby: 0.08,
  diamond: 0.09,
  degen: 0.10,
};

window.XythonRanks.rakebackRates = RAKEBACK_RATES;

function loadRakeback() {
  try {
    const raw = localStorage.getItem(RAKEBACK_KEY);
    if (!raw) return { pending: 0, syncedWagered: 0, lifetimeClaimed: 0 };
    return { pending: 0, syncedWagered: 0, lifetimeClaimed: 0, ...JSON.parse(raw) };
  } catch {
    return { pending: 0, syncedWagered: 0, lifetimeClaimed: 0 };
  }
}

function saveRakeback(data) {
  localStorage.setItem(RAKEBACK_KEY, JSON.stringify(data));
}

function getRakebackRate() {
  const tier = getPlayerRank(loadProfileStats().wagered).current.tier;
  return RAKEBACK_RATES[tier] || RAKEBACK_RATES.unranked;
}

function syncRakebackBackfill() {
  const stats = loadProfileStats();
  const data = loadRakeback();
  const synced = data.syncedWagered || 0;
  if (stats.wagered > synced) {
    data.pending = (data.pending || 0) + (stats.wagered - synced) * getRakebackRate();
    data.syncedWagered = stats.wagered;
    saveRakeback(data);
  }
  return data;
}

function accrueRakeback(wageredAmount) {
  const amount = parseFloat(wageredAmount) || 0;
  if (amount <= 0) return;
  const data = loadRakeback();
  data.pending = (data.pending || 0) + amount * getRakebackRate();
  data.syncedWagered = loadProfileStats().wagered;
  saveRakeback(data);
}

function getRakebackPending() {
  if (usesServerWallet()) return serverRakebackPending;
  syncRakebackBackfill();
  return loadRakeback().pending || 0;
}

function loadRankRewards() {
  try {
    const raw = localStorage.getItem(RANK_REWARDS_KEY);
    if (!raw) return { claimedIndices: [], lifetimeClaimed: 0 };
    const parsed = JSON.parse(raw);
    return {
      claimedIndices: Array.isArray(parsed.claimedIndices) ? parsed.claimedIndices : [],
      lifetimeClaimed: parsed.lifetimeClaimed || 0,
    };
  } catch {
    return { claimedIndices: [], lifetimeClaimed: 0 };
  }
}

function saveRankRewards(data) {
  localStorage.setItem(RANK_REWARDS_KEY, JSON.stringify(data));
}

function getUnclaimedRankRewards() {
  const rankIndex = getPlayerRank(loadProfileStats().wagered).index;
  const claimed = new Set(loadRankRewards().claimedIndices);
  const pending = [];

  for (let i = 1; i <= rankIndex; i++) {
    const rank = RANK_LADDER[i];
    if (!rank?.reward || claimed.has(i)) continue;
    pending.push({
      index: i,
      amount: rank.reward,
      name: formatRankName(rank),
    });
  }

  return pending;
}

function getRankRewardPendingTotal() {
  return getUnclaimedRankRewards().reduce((sum, item) => sum + item.amount, 0);
}

function hasRankRewardsToClaim() {
  return getRankRewardPendingTotal() > 0;
}

function hasRewardsToClaim() {
  return isDailyRewardAvailable()
    || getRakebackPending() >= RAKEBACK_MIN_CLAIM
    || hasRankRewardsToClaim();
}

function updateRewardsDot() {
  const btn = document.getElementById('headerRewardsToggle');
  if (!btn) return;
  const dot = btn.querySelector('.header-rewards-dot');
  if (hasRewardsToClaim()) {
    if (!dot) {
      const el = document.createElement('span');
      el.className = 'header-rewards-dot';
      btn.appendChild(el);
    }
  } else {
    dot?.remove();
  }
}

function getDailyRewardLastClaim(username) {
  const user = username || getLoggedInUsername();
  if (!user) return null;
  try {
    const perUser = localStorage.getItem(dailyRewardKey(user));
    if (perUser) return perUser;
    const legacy = localStorage.getItem(DAILY_REWARD_KEY);
    return legacy || null;
  } catch {
    return null;
  }
}

function getDailyRewardCooldownRemaining(username) {
  if (usesServerWallet()) {
    if (!serverLastDailyClaimAt) return 0;
    return Math.max(0, DAILY_REWARD_COOLDOWN_MS - (Date.now() - serverLastDailyClaimAt));
  }
  const last = getDailyRewardLastClaim(username);
  if (!last) return 0;
  const lastTs = new Date(last).getTime();
  if (Number.isNaN(lastTs)) return 0;
  return Math.max(0, DAILY_REWARD_COOLDOWN_MS - (Date.now() - lastTs));
}

function formatDailyRewardCooldown(username) {
  const remaining = getDailyRewardCooldownRemaining(username);
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.ceil((remaining % 3600000) / 60000);
  if (hours > 0) return `Next in ${hours}h ${mins}m`;
  return `Next in ${mins}m`;
}

function isDailyRewardAvailable(username) {
  const user = username || getLoggedInUsername();
  if (!user) return false;
  return getDailyRewardCooldownRemaining(user) <= 0;
}

function markDailyRewardClaimed(username) {
  const user = username || getLoggedInUsername();
  if (!user) return;
  localStorage.setItem(dailyRewardKey(user), new Date().toISOString());
}

function buildRewardsHeaderHtml() {
  const showDot = hasRewardsToClaim();
  return `
    <div class="header-rewards-menu">
      <button type="button" class="header-rewards-btn" id="headerRewardsToggle" aria-haspopup="true" aria-expanded="false" title="Rewards">
        ${userMenuIcon('rewards')}
        <span class="header-rewards-label">Rewards</span>
        ${showDot ? '<span class="header-rewards-dot"></span>' : ''}
      </button>
      <div class="rewards-popout" id="rewardsPopout" hidden>
        ${buildRewardsPopoutContent()}
      </div>
    </div>`;
}

function buildRewardsPopoutContent() {
  const rank = getPlayerRank(loadProfileStats().wagered);
  const dailyAvailable = isDailyRewardAvailable();
  const dailyCooldown = dailyAvailable ? '' : formatDailyRewardCooldown();
  const wagered = loadProfileStats().wagered;
  const rakebackRate = (getRakebackRate() * 100).toFixed(1);
  const rakebackPending = getRakebackPending();
  const canClaimRakeback = rakebackPending >= RAKEBACK_MIN_CLAIM;
  const unclaimedRanks = getUnclaimedRankRewards();
  const rankRewardTotal = unclaimedRanks.reduce((sum, item) => sum + item.amount, 0);
  const canClaimRank = rankRewardTotal > 0;
  const rankRewardDesc = canClaimRank
    ? `$${rankRewardTotal.toFixed(2)} from ${unclaimedRanks.length} rank-up${unclaimedRanks.length === 1 ? '' : 's'}`
    : `Current rank: ${escapeHtml(rank.displayName)}`;

  return `
    <div class="rewards-popout-head">
      <h3 class="rewards-popout-title">Rewards</h3>
      <p class="rewards-popout-sub">Bonuses, milestones, and rank perks</p>
    </div>
    <div class="rewards-list">
      <div class="rewards-card rewards-card--daily">
        <div class="rewards-card-icon">${userMenuIcon('rewards')}</div>
        <div class="rewards-card-body">
          <span class="rewards-card-title">Daily Bonus</span>
          <span class="rewards-card-desc">Free $${DAILY_REWARD_AMOUNT.toFixed(2)} every 24 hours${dailyCooldown ? ` · ${dailyCooldown}` : ''}</span>
        </div>
        <button type="button" class="rewards-claim-btn${dailyAvailable ? '' : ' is-claimed'}" id="rewardsDailyClaim" ${dailyAvailable ? '' : 'disabled'}>
          ${dailyAvailable ? 'Claim' : (dailyCooldown || 'Claimed')}
        </button>
      </div>
      <div class="rewards-card rewards-card--rakeback">
        <div class="rewards-card-icon rewards-card-icon--rakeback">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        </div>
        <div class="rewards-card-body">
          <span class="rewards-card-title">Rakeback</span>
          <span class="rewards-card-desc">${rakebackRate}% back on every bet · $${rakebackPending.toFixed(2)} available</span>
        </div>
        <button type="button" class="rewards-claim-btn${canClaimRakeback ? '' : ' is-claimed'}" id="rewardsRakebackClaim" ${canClaimRakeback ? '' : 'disabled'}>
          ${canClaimRakeback ? 'Claim' : 'Empty'}
        </button>
      </div>
      <div class="rewards-card${canClaimRank ? ' rewards-card--rank-ready' : ''}">
        <div class="rewards-card-icon rewards-card-icon--rank">${userMenuIcon('vip')}</div>
        <div class="rewards-card-body">
          <span class="rewards-card-title">Rank Reward</span>
          <span class="rewards-card-desc">${rankRewardDesc}</span>
        </div>
        ${canClaimRank
    ? `<button type="button" class="rewards-claim-btn" id="rewardsRankClaim">Claim</button>`
    : `<span class="rewards-card-tag">${rank.isMax ? 'Max' : 'Active'}</span>`}
      </div>
      <div class="rewards-card">
        <div class="rewards-card-icon rewards-card-icon--wager">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="rewards-card-body">
          <span class="rewards-card-title">Wager Milestone</span>
          <span class="rewards-card-desc">$${wagered.toFixed(2)} wagered total</span>
          ${rank.next ? `<div class="rewards-progress"><div class="rewards-progress-fill" style="width:${rank.progressPct.toFixed(1)}%"></div></div>` : ''}
        </div>
      </div>
      <div class="rewards-card rewards-card--muted">
        <div class="rewards-card-icon rewards-card-icon--code">${userMenuIcon('redeem')}</div>
        <div class="rewards-card-body">
          <span class="rewards-card-title">Promo Codes</span>
          <span class="rewards-card-desc">Redeem codes from promotions & streamers</span>
        </div>
        <span class="rewards-card-tag">Soon</span>
      </div>
    </div>`;
}

function refreshRewardsPopout() {
  const popout = document.getElementById('rewardsPopout');
  if (!popout) return;
  popout.innerHTML = buildRewardsPopoutContent();
  wireRewardsPopoutActions();
}

function closeRewardsPopout() {
  const popout = document.getElementById('rewardsPopout');
  const btn = document.getElementById('headerRewardsToggle');
  if (popout) popout.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
}

function openRewardsPopout() {
  if (!isLoggedIn()) {
    openAuthModal('register');
    return;
  }
  closeUserPopout();
  const walletDropdown = document.getElementById('walletDropdown');
  if (walletDropdown && !walletDropdown.hidden) {
    walletDropdown.hidden = true;
    document.getElementById('walletBalance')?.setAttribute('aria-expanded', 'false');
  }
  refreshRewardsPopout();
  const popout = document.getElementById('rewardsPopout');
  const btn = document.getElementById('headerRewardsToggle');
  if (!popout || !btn) return;
  popout.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

window.openRewardsPopout = openRewardsPopout;

function closeUserPopout() {
  const dropdown = document.getElementById('userDropdown');
  const toggle = document.getElementById('headerUserToggle');
  if (dropdown) dropdown.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

function wireRewardsPopoutActions() {
  document.getElementById('rewardsDailyClaim')?.addEventListener('click', async () => {
    if (!requireAuth('register')) return;
    if (!isDailyRewardAvailable()) return;
    const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
    if (usesServerWallet()) {
      const claimed = await serverClaimReward({
        kind: 'daily',
        tx: {
          label: 'Daily Bonus',
          detail: `+$${DAILY_REWARD_AMOUNT.toFixed(2)} daily reward`,
        },
      });
      if (!claimed?.ok) {
        showToast(claimed?.error || 'Could not claim daily reward', 'error');
        return;
      }
    } else {
      const balance = window.XythonWallet?.getBalance(currency) ?? 0;
      window.XythonWallet?.setBalance(currency, balance + DAILY_REWARD_AMOUNT, {
        type: 'reward',
        label: 'Daily Bonus',
        detail: `+$${DAILY_REWARD_AMOUNT.toFixed(2)} daily reward`,
      });
      markDailyRewardClaimed();
    }
    refreshRewardsPopout();
    updateRewardsDot();
  });

  document.getElementById('rewardsRakebackClaim')?.addEventListener('click', async () => {
    if (!requireAuth('register')) return;
    const pending = getRakebackPending();
    if (pending < RAKEBACK_MIN_CLAIM) return;
    const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
    if (usesServerWallet()) {
      const claimed = await serverClaimReward({
        kind: 'rakeback',
        amount: pending,
        tx: {
          label: 'Rakeback',
          detail: `Claimed $${pending.toFixed(2)} rakeback`,
        },
      });
      if (!claimed?.ok) {
        showToast(claimed?.error || 'Could not claim rakeback', 'error');
        return;
      }
    } else {
      const balance = window.XythonWallet?.getBalance(currency) ?? 0;
      window.XythonWallet?.setBalance(currency, balance + pending, {
        type: 'reward',
        label: 'Rakeback',
        detail: `Claimed $${pending.toFixed(2)} rakeback`,
      });
      const data = loadRakeback();
      data.pending = 0;
      data.lifetimeClaimed = (data.lifetimeClaimed || 0) + pending;
      saveRakeback(data);
    }
    refreshRewardsPopout();
    updateRewardsDot();
  });

  document.getElementById('rewardsRankClaim')?.addEventListener('click', async () => {
    if (!requireAuth('register')) return;
    const pending = getUnclaimedRankRewards();
    const total = pending.reduce((sum, item) => sum + item.amount, 0);
    if (total <= 0) return;

    const currency = window.XythonWallet?.getActiveCurrency() || 'USD';
    if (usesServerWallet()) {
      const claimed = await serverClaimReward({
        kind: 'rank',
        amount: total,
        tx: {
          label: 'Rank Reward',
          detail: `Claimed $${total.toFixed(2)} from ${pending.length} rank-up${pending.length === 1 ? '' : 's'}`,
        },
      });
      if (!claimed?.ok) {
        showToast(claimed?.error || 'Could not claim rank rewards', 'error');
        return;
      }
    } else {
      const balance = window.XythonWallet?.getBalance(currency) ?? 0;
      window.XythonWallet?.setBalance(currency, balance + total, {
        type: 'reward',
        label: 'Rank Reward',
        detail: `Claimed $${total.toFixed(2)} from ${pending.length} rank-up${pending.length === 1 ? '' : 's'}`,
      });
    }

    const data = loadRankRewards();
    const claimed = new Set(data.claimedIndices);
    pending.forEach(item => claimed.add(item.index));
    data.claimedIndices = [...claimed].sort((a, b) => a - b);
    data.lifetimeClaimed = (data.lifetimeClaimed || 0) + total;
    saveRankRewards(data);

    refreshRewardsPopout();
    updateRewardsDot();
  });
}

let rewardsMenuBound = false;

function wireRewardsMenu() {
  const toggle = document.getElementById('headerRewardsToggle');
  const popout = document.getElementById('rewardsPopout');
  if (!toggle || !popout) return;

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    if (popout.hidden) openRewardsPopout();
    else closeRewardsPopout();
  });

  popout.addEventListener('click', e => e.stopPropagation());
  wireRewardsPopoutActions();

  if (!rewardsMenuBound) {
    document.addEventListener('click', () => closeRewardsPopout());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeRewardsPopout();
    });
    rewardsMenuBound = true;
  }
}

function handleUserMenuAction(menu) {
  switch (menu) {
    case 'logout':
      clearUser();
      renderAuthUI();
      return;
    case 'settings':
      window.location.href = sitePath('settings.html');
      return;
    case 'transactions':
      window.location.href = sitePath('transactions.html');
      return;
    case 'vip':
      window.location.href = sitePath('vip.html');
      return;
    case 'affiliates':
      window.location.href = sitePath('affiliates.html');
      return;
    case 'vault':
      if (!requireAuth('register')) return;
      window.openVaultModal?.();
      return;
    case 'security':
      if (!requireAuth('login')) return;
      window.location.href = sitePath('security.html');
      return;
    case 'rewards':
      openRewardsPopout();
      return;
    case 'support':
      window.openLiveChat?.();
      return;
    case 'self-exclusion':
      if (!requireAuth('login')) return;
      window.location.href = sitePath('self-exclusion.html');
      return;
    case 'redeem':
      window.alert('Redeem codes are not available yet.');
      return;
    case 'admin-panel':
      if (!isAdmin()) return;
      window.openAdminPanelModal?.();
      return;
    default:
      return;
  }
}

function wireUserMenu() {
  const toggle = document.getElementById('headerUserToggle');
  const dropdown = document.getElementById('userDropdown');
  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    closeRewardsPopout();
    const walletDropdown = document.getElementById('walletDropdown');
    if (walletDropdown && !walletDropdown.hidden) {
      walletDropdown.hidden = true;
      document.getElementById('walletBalance')?.setAttribute('aria-expanded', 'false');
    }
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  dropdown.addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.target.closest('[data-menu]');
    if (!btn) return;
    e.preventDefault();
    closeUserPopout();
    handleUserMenuAction(btn.getAttribute('data-menu'));
  });

  if (!userMenuOutsideClickBound) {
    document.addEventListener('click', e => {
      if (e.target.closest('.header-user-menu')) return;
      closeUserPopout();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeUserPopout();
    });
    userMenuOutsideClickBound = true;
  }
}

function initAuthModal() {
  const existing = document.getElementById('authModal');
  if (existing && document.getElementById('authPassword')) return;
  existing?.remove();

  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.id = 'authModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-overlay" id="authOverlay"></div>
    <div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" id="authClose" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <h2 class="auth-title" id="authTitle">Register</h2>
      <p class="auth-subtitle" id="authSubtitle">Create your account to start playing</p>

      <label class="auth-label" for="authUsername">Username</label>
      <input type="text" id="authUsername" class="auth-input" maxlength="16" autocomplete="username" placeholder="e.g. LuckyAce">

      <label class="auth-label" for="authPassword">Password</label>
      <input type="password" id="authPassword" class="auth-input" maxlength="64" autocomplete="new-password" placeholder="At least 8 characters">

      <div id="authConfirmPasswordBlock">
        <label class="auth-label" for="authConfirmPassword">Confirm password</label>
        <input type="password" id="authConfirmPassword" class="auth-input" maxlength="64" autocomplete="new-password" placeholder="Re-enter your password">
      </div>

      <div id="authAffiliateBlock">
        <label class="auth-label" for="authAffiliate">Affiliate code <span class="auth-label-optional">(optional)</span></label>
        <input type="text" id="authAffiliate" class="auth-input auth-input--affiliate" maxlength="16" autocomplete="off" placeholder="Referrer's username">
        <p class="auth-field-hint">Enter a friend's username if you were invited</p>
      </div>

      <p class="auth-error" id="authError" hidden></p>
      <p class="auth-success" id="authSuccess" hidden></p>

      <button type="button" class="auth-submit" id="authSubmit">Create Account</button>
    </div>
  `;
  document.body.appendChild(modal);

  const overlay = document.getElementById('authOverlay');
  const closeBtn = document.getElementById('authClose');
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');
  const confirmPasswordBlock = document.getElementById('authConfirmPasswordBlock');
  const confirmPasswordInput = document.getElementById('authConfirmPassword');
  const affiliateBlock = document.getElementById('authAffiliateBlock');
  const affiliateInput = document.getElementById('authAffiliate');
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  const submitBtn = document.getElementById('authSubmit');
  const titleEl = document.getElementById('authTitle');
  const subtitleEl = document.getElementById('authSubtitle');

  let mode = 'register';

  function closeAuthModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    errorEl.hidden = true;
    successEl.hidden = true;
    usernameInput.value = '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    if (affiliateInput) affiliateInput.value = '';
    markWelcomeAuthSeen();
  }

  function updateAuthModeUI() {
    const isRegister = mode === 'register';
    const pendingRef = getPendingReferralCode().trim();
    titleEl.textContent = isRegister ? 'Register' : 'Log In';
    subtitleEl.textContent = isRegister
      ? 'Create your account to start playing'
      : 'Enter your username and password';
    submitBtn.textContent = isRegister ? 'Create Account' : 'Log In';
    passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
    if (confirmPasswordBlock) confirmPasswordBlock.hidden = !isRegister;
    if (affiliateBlock) affiliateBlock.hidden = !isRegister;
    if (affiliateInput && pendingRef && isRegister) affiliateInput.value = pendingRef;
  }

  async function submitAuth() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const usernameError = validateUsername(username);
    if (usernameError) {
      errorEl.textContent = usernameError;
      errorEl.hidden = false;
      successEl.hidden = true;
      usernameInput.focus();
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      errorEl.textContent = passwordError;
      errorEl.hidden = false;
      successEl.hidden = true;
      passwordInput.focus();
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.hidden = false;
        successEl.hidden = true;
        confirmPasswordInput.focus();
        return;
      }

      if (hasAccount(username)) {
        errorEl.textContent = 'Username is already taken';
        errorEl.hidden = false;
        successEl.hidden = true;
        usernameInput.focus();
        return;
      }

      let linkedReferrer = null;
      const alreadyReferred = !!getUserReferrer(username);
      const affCode = affiliateInput?.value.trim() || getPendingReferralCode().trim();

      if (!alreadyReferred && affCode) {
        const affError = validateUsername(affCode);
        if (affError) {
          errorEl.textContent = `Invalid affiliate code — ${affError.charAt(0).toLowerCase()}${affError.slice(1)}`;
          errorEl.hidden = false;
          successEl.hidden = true;
          affiliateInput?.focus();
          return;
        }
        if (affCode.toLowerCase() === username.toLowerCase()) {
          errorEl.textContent = "You can't use your own affiliate code";
          errorEl.hidden = false;
          successEl.hidden = true;
          affiliateInput?.focus();
          return;
        }
        const referrerExists = await checkReferrerExists(affCode);
        if (!referrerExists) {
          errorEl.textContent = `Affiliate code "${affCode}" not found — check spelling and try again`;
          errorEl.hidden = false;
          successEl.hidden = true;
          affiliateInput?.focus();
          return;
        }
      }

      submitBtn.disabled = true;
      if (!canUsePasswordCrypto()) {
        errorEl.textContent = 'Registration requires HTTPS. Open https://nbdcasino.com (not http).';
        errorEl.hidden = false;
        successEl.hidden = true;
        submitBtn.disabled = false;
        return;
      }
      try {
        await createAccount(username, password);
      } catch {
        errorEl.textContent = canUsePasswordCrypto()
          ? 'Could not create account. Please try again.'
          : 'Registration requires HTTPS. Open https://nbdcasino.com (not http).';
        errorEl.hidden = false;
        successEl.hidden = true;
        submitBtn.disabled = false;
        return;
      }

      if (!alreadyReferred && affCode) {
        linkedReferrer = await linkReferral(username, affCode);
        if (!linkedReferrer) {
          errorEl.textContent = `Could not link affiliate code "${affCode}" — check spelling and try again`;
          errorEl.hidden = false;
          successEl.hidden = true;
          submitBtn.disabled = false;
          return;
        }
      }
      submitBtn.disabled = false;

      saveUser(username);
      const gotSignupBonus = grantSignupBonus(username);
      notifyAuthChange();
      let welcomeMsg = `Welcome, ${username}!`;
      if (gotSignupBonus) welcomeMsg += ` $${SIGNUP_BONUS_AMOUNT.toFixed(0)} signup bonus added.`;
      if (linkedReferrer) welcomeMsg += ` Referred by ${linkedReferrer}.`;
      successEl.textContent = welcomeMsg;
      successEl.hidden = false;
      errorEl.hidden = true;

      setTimeout(() => {
        closeAuthModal();
        renderAuthUI();
      }, 700);
      return;
    }

    if (!hasAccount(username)) {
      errorEl.textContent = 'Account not found. Register to create one.';
      errorEl.hidden = false;
      successEl.hidden = true;
      usernameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    let valid = false;
    try {
      valid = await verifyAccountPassword(username, password);
    } catch {
      valid = false;
    }
    submitBtn.disabled = false;

    if (!valid) {
      errorEl.textContent = 'Incorrect password';
      errorEl.hidden = false;
      successEl.hidden = true;
      passwordInput.focus();
      return;
    }

    if (getAuthApiUrl()) {
      submitBtn.disabled = true;
      const login = await serverLoginAccount(username, password);
      submitBtn.disabled = false;
      if (!login?.ok) {
        errorEl.textContent = login?.data?.error || 'Could not log in';
        errorEl.hidden = false;
        successEl.hidden = true;
        passwordInput.focus();
        return;
      }
      saveSession(login.data.sessionToken, login.data.username, login.data.expiresAt, login.data.isAdmin);
    }

    saveUser(username);
    notifyAuthChange();
    await syncCurrentUserToServer();
    if (!getUserReferrer(username)) {
      const affCode = getPendingReferralCode().trim();
      if (affCode && affCode.toLowerCase() !== username.toLowerCase()) {
        await linkReferral(username, affCode);
      }
    }
    successEl.textContent = `Welcome back, ${username}!`;
    successEl.hidden = false;
    errorEl.hidden = true;

    setTimeout(() => {
      closeAuthModal();
      renderAuthUI();
    }, 700);
  }

  window.openAuthModal = function openAuthModal(nextMode = 'register') {
    mode = nextMode;
    updateAuthModeUI();
    errorEl.hidden = true;
    successEl.hidden = true;
    usernameInput.value = getLoggedInUsername() || '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    if (affiliateInput) {
      affiliateInput.value = getPendingReferralCode();
    }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    usernameInput.focus();
  };

  overlay.addEventListener('click', closeAuthModal);
  closeBtn.addEventListener('click', closeAuthModal);
  submitBtn.addEventListener('click', () => { submitAuth(); });
  usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });
  passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });
  confirmPasswordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });
  affiliateInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeAuthModal();
  });
}

function initAuth() {
  initAuthModal();
  renderAuthUI();
  maybeShowWelcomeRegistration();
  if (!initAuth.profileListenerBound) {
    document.addEventListener('xython:profile-change', renderAuthUI);
    document.addEventListener('xython:stats-change', renderAuthUI);
    initAuth.profileListenerBound = true;
  }
}

window.XythonAuth = {
  getUser: getLoggedInUser,
  getUsername: getLoggedInUsername,
  isLoggedIn,
  isAdmin,
  requireAuth,
  logout() {
    clearUser();
    renderAuthUI();
  },
};

function resetAccountProgress() {
  if (!isLoggedIn()) return false;

  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({
    balances: { ...DEFAULT_WALLET.balances },
    activeCurrency: DEFAULT_WALLET.activeCurrency,
  }));
  localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify({ ...DEFAULT_PROFILE_STATS }));
  localStorage.removeItem(RAKEBACK_KEY);
  const user = getLoggedInUsername();
  if (user) {
    localStorage.removeItem(dailyRewardKey(user));
    localStorage.removeItem(signupBonusKey(user));
  }
  localStorage.removeItem(DAILY_REWARD_KEY);
  localStorage.removeItem(RANK_REWARDS_KEY);
  localStorage.removeItem(TRANSACTIONS_KEY);
  localStorage.removeItem(VAULT_STORAGE_KEY);

  ['USD', 'BTC', 'ETH', 'LTC'].forEach(currency => {
    setWalletBalance(currency, DEFAULT_WALLET.balances[currency], false);
  });

  const option = getWalletOption(DEFAULT_WALLET.activeCurrency);
  if (option) {
    document.querySelectorAll('.wallet-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    applyWalletHeaderDisplay(DEFAULT_WALLET.activeCurrency, 0);
  }
  saveWalletState();

  document.dispatchEvent(new CustomEvent('xython:stats-change', { detail: loadProfileStats() }));
  renderAuthUI();
  updateRewardsDot();
  refreshRewardsPopout();

  return true;
}

window.XythonAccount = {
  reset: resetAccountProgress,
  getStatus: getAccountStatus,
  isSelfExcluded,
  getBetBlockReason,
  formatSelfExclusionEnd,
  requestSelfExclusion,
  changePassword: changeAccountPassword,
};

function loadWalletState() {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) {
      return {
        balances: { ...DEFAULT_WALLET.balances },
        activeCurrency: DEFAULT_WALLET.activeCurrency,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      balances: { ...DEFAULT_WALLET.balances, ...parsed.balances },
      activeCurrency: parsed.activeCurrency || DEFAULT_WALLET.activeCurrency,
    };
  } catch {
    return {
      balances: { ...DEFAULT_WALLET.balances },
      activeCurrency: DEFAULT_WALLET.activeCurrency,
    };
  }
}

function saveWalletState() {
  if (usesServerWallet()) return;
  const balances = {};
  ['USD', 'BTC', 'ETH', 'LTC'].forEach(currency => {
    balances[currency] = getWalletBalance(currency);
  });
  const activeCurrency = document.querySelector('.wallet-option.active')?.dataset.currency || 'USD';
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ balances, activeCurrency }));
}

function hydrateWalletFromStorage() {
  if (usesServerWallet()) {
    resetServerWalletCache();
    refreshServerWalletDisplay();
    return;
  }
  const state = loadWalletState();
  Object.entries(state.balances).forEach(([currency, value]) => {
    setWalletBalance(currency, value, false);
  });

  const option = getWalletOption(state.activeCurrency);
  if (option) {
    document.querySelectorAll('.wallet-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');
    const amountEl = document.getElementById('walletAmount');
    const iconEl = document.querySelector('.wallet-currency-icon');
    const balance = state.balances[state.activeCurrency] ?? 0;
    if (amountEl) applyWalletHeaderDisplay(state.activeCurrency, balance);
    if (iconEl) iconEl.textContent = CURRENCY_ICONS[state.activeCurrency] || '$';
  }
}

function initWallet() {
  const balanceBtn = document.getElementById('walletBalance');
  const dropdown = document.getElementById('walletDropdown');
  const depositBtn = document.getElementById('walletDeposit');
  const amountEl = document.getElementById('walletAmount');
  const iconEl = balanceBtn?.querySelector('.wallet-currency-icon');
  if (!balanceBtn || !dropdown) return;

  ensureAdminWalletButtons();

  function closeDropdown() {
    dropdown.hidden = true;
    balanceBtn.setAttribute('aria-expanded', 'false');
  }

  balanceBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeRewardsPopout();
    closeUserPopout();
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    balanceBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  dropdown.addEventListener('click', e => e.stopPropagation());

  dropdown.querySelectorAll('.wallet-option').forEach(option => {
    option.addEventListener('click', () => {
      dropdown.querySelectorAll('.wallet-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      const currency = option.dataset.currency;
      const balance = parseFloat(option.dataset.amount || '0') || 0;
      applyWalletHeaderDisplay(currency, balance);
      saveWalletState();
      closeDropdown();
    });
  });

  depositBtn?.addEventListener('click', e => {
    e.stopPropagation();
    closeDropdown();
    if (!canDeposit()) return;
    openDepositModal();
  });

  document.getElementById('walletSend')?.addEventListener('click', e => {
    e.stopPropagation();
    closeDropdown();
    if (!canDeposit()) return;
    openSendMoneyModal();
  });

  document.addEventListener('click', closeDropdown);

  initDepositModal({ getActiveCurrency: () => {
    const active = document.querySelector('.wallet-option.active');
    return active?.dataset.currency || 'USD';
  }});

  initSendMoneyModal({ getActiveCurrency: () => {
    const active = document.querySelector('.wallet-option.active');
    return active?.dataset.currency || 'USD';
  }});

  updateAdminWalletButtons();
  if (!initWallet.depositAuthBound) {
    document.addEventListener('xython:auth-change', () => {
      updateAdminWalletButtons();
      syncWalletGrantsFromServer();
    });
    initWallet.depositAuthBound = true;
  }

  initVaultModal({ getActiveCurrency: () => {
    const active = document.querySelector('.wallet-option.active');
    return active?.dataset.currency || 'USD';
  }});

  hydrateWalletFromStorage();
}

const CURRENCY_ICONS = { USD: '$', BTC: '₿', ETH: 'Ξ', LTC: 'Ł' };

function formatWalletAmount(currency, value) {
  const num = parseFloat(value) || 0;
  return currency === 'USD' ? num.toFixed(2) : num.toFixed(8);
}

function formatWalletDisplay(currency, value) {
  const num = parseFloat(value) || 0;
  return currency === 'USD' ? formatFiatNumber(num) : num.toFixed(8);
}

function getWalletOption(currency) {
  return document.querySelector(`.wallet-option[data-currency="${currency}"]`);
}

function getWalletBalance(currency) {
  if (usesServerWallet()) {
    if (!isLoggedIn()) return 0;
    return parseFloat(serverWalletBalances[currency]) || 0;
  }
  const option = getWalletOption(currency);
  return parseFloat(option?.dataset.amount || '0') || 0;
}

function setWalletBalance(currency, value, persist = true) {
  if (usesServerWallet() && !walletMutationAllowed) return;
  const num = parseFloat(value) || 0;
  if (usesServerWallet()) {
    serverWalletBalances[currency] = num;
  }
  const formatted = formatWalletAmount(currency, num);
  document.querySelectorAll(`.wallet-option[data-currency="${currency}"]`).forEach(option => {
    option.dataset.amount = formatted;
    const display = currency === 'USD'
      ? `$${formatWalletDisplay(currency, num)}`
      : formatWalletDisplay(currency, num);
    option.textContent = `${currency} — ${display}`;
  });

  const active = document.querySelector('.wallet-option.active');
  const amountEl = document.getElementById('walletAmount');
  const iconEl = document.querySelector('.wallet-currency-icon');
  if (active?.dataset.currency === currency) {
    applyWalletHeaderDisplay(currency, num);
  }

  if (persist) saveWalletState();
}

const TRANSACTIONS_KEY = 'xython-transactions';
const TRANSACTIONS_MAX = 500;

function loadTransactions() {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTransactions(list) {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list.slice(0, TRANSACTIONS_MAX)));
}

function recordTransaction(entry) {
  if (!isLoggedIn()) return null;
  const amount = parseFloat(entry.amount);
  if (!amount || amount === 0) return null;

  const tx = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    type: entry.type || (amount > 0 ? 'win' : 'bet'),
    amount,
    currency: entry.currency || 'USD',
    label: entry.label || 'Transaction',
    detail: entry.detail || '',
    game: entry.game || null,
  };

  const list = loadTransactions();
  list.unshift(tx);
  saveTransactions(list);
  document.dispatchEvent(new CustomEvent('xython:transactions-change', { detail: tx }));
  return tx;
}

window.XythonTransactions = {
  list: loadTransactions,
  add: recordTransaction,
  clear: () => {
    localStorage.removeItem(TRANSACTIONS_KEY);
    document.dispatchEvent(new CustomEvent('xython:transactions-change'));
  },
};

function loadVaultBalances() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VAULT_BALANCES };
    return { ...DEFAULT_VAULT_BALANCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VAULT_BALANCES };
  }
}

function saveVaultBalances(balances) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(balances));
}

function getVaultBalance(currency) {
  return loadVaultBalances()[currency] || 0;
}

function setVaultBalance(currency, value) {
  const balances = loadVaultBalances();
  balances[currency] = Math.max(0, parseFloat(value) || 0);
  saveVaultBalances(balances);
  document.dispatchEvent(new CustomEvent('xython:vault-change', { detail: balances }));
}

function formatVaultDisplay(currency, value) {
  return formatWalletDisplay(currency, value);
}

function depositToVault(currency, amount) {
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { ok: false, error: 'Enter a valid amount' };

  if (usesServerWallet()) {
    return { ok: false, error: 'Vault is local-only — use your wallet balance on the live site' };
  }

  const wallet = getWalletBalance(currency);
  if (amt > wallet) return { ok: false, error: 'Insufficient wallet balance' };

  window.XythonWallet.setBalance(currency, wallet - amt, {
    type: 'vault',
    label: 'Vault',
    detail: currency === 'USD'
      ? `Stored $${amt.toFixed(2)} in vault`
      : `Stored ${formatVaultDisplay(currency, amt)} ${currency} in vault`,
  });
  setVaultBalance(currency, getVaultBalance(currency) + amt);
  return { ok: true };
}

function withdrawFromVault(currency, amount) {
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return { ok: false, error: 'Enter a valid amount' };

  const vault = getVaultBalance(currency);
  if (amt > vault) return { ok: false, error: 'Insufficient vault balance' };

  setVaultBalance(currency, vault - amt);
  const wallet = getWalletBalance(currency);
  window.XythonWallet.setBalance(currency, wallet + amt, {
    type: 'vault',
    label: 'Vault',
    detail: currency === 'USD'
      ? `Withdrew $${amt.toFixed(2)} from vault`
      : `Withdrew ${formatVaultDisplay(currency, amt)} ${currency} from vault`,
  });
  return { ok: true };
}

window.XythonVault = {
  getBalance: getVaultBalance,
  getAll: loadVaultBalances,
  deposit: depositToVault,
  withdraw: withdrawFromVault,
};

window.XythonWallet = {
  getActiveCurrency() {
    return document.querySelector('.wallet-option.active')?.dataset.currency || 'USD';
  },
  getBalance(currency) {
    return getWalletBalance(currency || this.getActiveCurrency());
  },
  usesServerWallet,
  playRound: serverPlayRound,
  startSession: serverStartSession,
  actSession: serverActSession,
  sessionDebit: serverSessionDebit,
  sessionCredit: serverSessionCredit,
  sessionSettle: serverSessionSettle,
  debitBet(currency, bet, tx) {
    const block = getBetBlockReason();
    if (block) {
      showToast(block, 'error');
      return { ok: false, error: block };
    }
    if (usesServerWallet()) {
      return { ok: false, error: 'This game must use server playRound()' };
    }
    const amt = parseFloat(bet);
    if (!amt || amt <= 0) return { ok: false, error: 'Invalid bet amount' };
    const cur = currency || this.getActiveCurrency();
    const balance = this.getBalance(cur);
    if (balance < amt) return { ok: false, error: 'Insufficient balance' };
    this.setBalance(cur, balance - amt, { ...tx, type: 'bet' });
    return { ok: true };
  },
  setBalance(currency, value, tx) {
    if (usesServerWallet()) {
      return { ok: false, error: 'Balance is managed by the server' };
    }
    const cur = currency || this.getActiveCurrency();
    const previous = getWalletBalance(cur);
    const delta = value - previous;
    if (delta < 0 && tx?.type === 'bet') {
      const block = getBetBlockReason();
      if (block) {
        showToast(block, 'error');
        return { ok: false, error: block };
      }
    }
    setWalletBalance(cur, value);
    if (tx) {
      if (delta !== 0) {
        recordTransaction({
          type: tx.type,
          amount: delta,
          currency: cur,
          label: tx.label,
          detail: tx.detail,
          game: tx.game,
        });
      }
    }
    return { ok: true };
  },
  formatAmount(currency, value) {
    return formatWalletDisplay(currency || this.getActiveCurrency(), value);
  },
};

function initDepositModal({ getActiveCurrency }) {
  if (document.getElementById('depositModal')) return;

  const modal = document.createElement('div');
  modal.className = 'deposit-modal';
  modal.id = 'depositModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="deposit-overlay" id="depositOverlay"></div>
    <div class="deposit-dialog" role="dialog" aria-modal="true" aria-labelledby="depositTitle">
      <button class="deposit-close" id="depositClose" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <h2 class="deposit-title" id="depositTitle">Admin Deposit</h2>
      <p class="deposit-subtitle">Add play money to your wallet (admin only)</p>

      <div class="deposit-currencies" id="depositCurrencies">
        <button type="button" class="deposit-currency active" data-currency="USD">USD</button>
        <button type="button" class="deposit-currency" data-currency="BTC">BTC</button>
        <button type="button" class="deposit-currency" data-currency="ETH">ETH</button>
        <button type="button" class="deposit-currency" data-currency="LTC">LTC</button>
      </div>

      <label class="deposit-label" for="depositAmount">Amount</label>
      <div class="deposit-input-wrap">
        <span class="deposit-input-icon" id="depositInputIcon">$</span>
        <input type="number" id="depositAmount" class="deposit-input" min="0" step="0.01" placeholder="0.00">
      </div>

      <div class="deposit-presets" id="depositPresets"></div>

      <div class="deposit-address" id="depositAddressBlock" hidden>
        <span class="deposit-label">Deposit address</span>
        <div class="deposit-address-row">
          <code id="depositAddress">bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh</code>
          <button type="button" class="deposit-copy" id="depositCopy">Copy</button>
        </div>
      </div>

      <p class="deposit-note" id="depositNote">Instant deposit. No fees on USD.</p>
      <p class="deposit-success" id="depositSuccess" hidden></p>

      <button type="button" class="deposit-submit" id="depositSubmit">Confirm Deposit</button>
    </div>
  `;
  document.body.appendChild(modal);

  const overlay = document.getElementById('depositOverlay');
  const closeBtn = document.getElementById('depositClose');
  const amountInput = document.getElementById('depositAmount');
  const presetsEl = document.getElementById('depositPresets');
  const currencyBtns = modal.querySelectorAll('.deposit-currency');
  const inputIcon = document.getElementById('depositInputIcon');
  const addressBlock = document.getElementById('depositAddressBlock');
  const depositNote = document.getElementById('depositNote');
  const depositSuccess = document.getElementById('depositSuccess');
  const submitBtn = document.getElementById('depositSubmit');
  const copyBtn = document.getElementById('depositCopy');
  const addressEl = document.getElementById('depositAddress');

  const addresses = {
    BTC: 'bc1qqt06duf9dehuvzmjz0xrpndh9wc5mdw9t9k5jg',
    ETH: '0x36E1e9B21d67EA2DA39c8573AbeBC0cf066a636c',
    LTC: 'LWuqNqNZdToFhD7cSScW94JkLQob2XKDsX',
  };

  const presets = {
    USD: ['20', '50', '100', '500'],
    BTC: ['0.001', '0.005', '0.01', '0.05'],
    ETH: ['0.01', '0.05', '0.1', '0.5'],
    LTC: ['0.1', '0.5', '1', '5'],
  };

  let selectedCurrency = 'USD';

  function renderPresets(currency) {
    presetsEl.innerHTML = presets[currency].map(val =>
      `<button type="button" class="deposit-preset" data-value="${val}">${currency === 'USD' ? '$' + val : val}</button>`
    ).join('');
    presetsEl.querySelectorAll('.deposit-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        amountInput.value = btn.dataset.value;
        depositSuccess.hidden = true;
      });
    });
  }

  function selectCurrency(currency) {
    selectedCurrency = currency;
    currencyBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.currency === currency));
    inputIcon.textContent = CURRENCY_ICONS[currency] || '';
    amountInput.value = '';
    amountInput.step = currency === 'USD' ? '0.01' : '0.00000001';
    amountInput.placeholder = currency === 'USD' ? '0.00' : '0.00000000';
    renderPresets(currency);
    depositSuccess.hidden = true;

    const isCrypto = currency !== 'USD';
    addressBlock.hidden = !isCrypto;
    depositNote.textContent = isCrypto
      ? `Send ${currency} to the address above. Credited after 1 confirmation.`
      : 'Instant deposit via card or bank. No fees.';
    if (isCrypto) addressEl.textContent = addresses[currency];
    submitBtn.textContent = isCrypto ? `I've Sent ${currency}` : 'Confirm Deposit';
  }

  function closeDepositModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    depositSuccess.hidden = true;
  }

  window.openDepositModal = function openDepositModal() {
    if (!canDeposit()) return;
    const currency = getActiveCurrency();
    selectCurrency(currency);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    amountInput.focus();
  };

  overlay.addEventListener('click', closeDepositModal);
  closeBtn.addEventListener('click', closeDepositModal);

  currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => selectCurrency(btn.dataset.currency));
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(addressEl.textContent);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch {
      copyBtn.textContent = 'Failed';
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!canDeposit()) return;
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
      amountInput.focus();
      return;
    }

    if (usesServerWallet()) {
      submitBtn.disabled = true;
      const result = await postWalletAction({
        action: 'send',
        admin: getLoggedInUsername(),
        to: getLoggedInUsername(),
        amount,
        currency: selectedCurrency,
      });
      submitBtn.disabled = false;
      if (!result?.ok) {
        depositSuccess.textContent = result?.data?.error || 'Deposit failed';
        depositSuccess.hidden = false;
        return;
      }
      await syncWalletGrantsFromServer();
    } else {
      const newBalance = getWalletBalance(selectedCurrency) + amount;
      setWalletBalance(selectedCurrency, newBalance);
      recordTransaction({
        type: 'deposit',
        amount,
        currency: selectedCurrency,
        label: 'Deposit',
        detail: selectedCurrency === 'USD'
          ? `Deposited $${amount.toFixed(2)}`
          : `Deposited ${formatWalletDisplay(selectedCurrency, amount)} ${selectedCurrency}`,
      });
    }

    const activeOption = getWalletOption(selectedCurrency);
    if (activeOption) {
      document.querySelectorAll('.wallet-option').forEach(o => o.classList.remove('active'));
      activeOption.classList.add('active');
      applyWalletHeaderDisplay(selectedCurrency, newBalance);
    }

    const display = selectedCurrency === 'USD'
      ? `$${formatWalletDisplay(selectedCurrency, amount)}`
      : `${formatWalletDisplay(selectedCurrency, amount)} ${selectedCurrency}`;

    depositSuccess.textContent = `Successfully deposited ${display}!`;
    depositSuccess.hidden = false;
    amountInput.value = '';

    setTimeout(closeDepositModal, 1800);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeDepositModal();
  });
}

function initSendMoneyModal({ getActiveCurrency }) {
  if (document.getElementById('sendMoneyModal')) return;

  const modal = document.createElement('div');
  modal.className = 'deposit-modal send-money-modal';
  modal.id = 'sendMoneyModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="deposit-overlay" id="sendMoneyOverlay"></div>
    <div class="deposit-dialog" role="dialog" aria-modal="true" aria-labelledby="sendMoneyTitle">
      <button class="deposit-close" id="sendMoneyClose" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <h2 class="deposit-title" id="sendMoneyTitle">Send Money</h2>
      <p class="deposit-subtitle">Transfer play money to a player (admin only)</p>

      <label class="deposit-label" for="sendMoneyRecipient">Recipient username</label>
      <input type="text" id="sendMoneyRecipient" class="deposit-input send-money-recipient" maxlength="16" autocomplete="off" placeholder="Player username">

      <div class="deposit-currencies" id="sendMoneyCurrencies">
        <button type="button" class="deposit-currency active" data-currency="USD">USD</button>
        <button type="button" class="deposit-currency" data-currency="BTC">BTC</button>
        <button type="button" class="deposit-currency" data-currency="ETH">ETH</button>
        <button type="button" class="deposit-currency" data-currency="LTC">LTC</button>
      </div>

      <label class="deposit-label" for="sendMoneyAmount">Amount</label>
      <div class="deposit-input-wrap">
        <span class="deposit-input-icon" id="sendMoneyInputIcon">$</span>
        <input type="number" id="sendMoneyAmount" class="deposit-input" min="0" step="0.01" placeholder="0.00">
      </div>

      <p class="deposit-error" id="sendMoneyError" hidden></p>
      <p class="deposit-success" id="sendMoneySuccess" hidden></p>

      <button type="button" class="deposit-submit send-money-submit" id="sendMoneySubmit">Send</button>
    </div>`;
  document.body.appendChild(modal);

  const overlay = document.getElementById('sendMoneyOverlay');
  const closeBtn = document.getElementById('sendMoneyClose');
  const recipientInput = document.getElementById('sendMoneyRecipient');
  const amountInput = document.getElementById('sendMoneyAmount');
  const currencyBtns = modal.querySelectorAll('.deposit-currency');
  const inputIcon = document.getElementById('sendMoneyInputIcon');
  const errorEl = document.getElementById('sendMoneyError');
  const successEl = document.getElementById('sendMoneySuccess');
  const submitBtn = document.getElementById('sendMoneySubmit');

  let selectedCurrency = 'USD';

  function selectCurrency(currency) {
    selectedCurrency = currency;
    currencyBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.currency === currency);
    });
    inputIcon.textContent = CURRENCY_ICONS[currency] || '$';
    amountInput.step = currency === 'USD' ? '0.01' : '0.00000001';
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  function closeSendMoneyModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  window.openSendMoneyModal = function openSendMoneyModal() {
    if (!canDeposit()) return;
    selectCurrency(getActiveCurrency());
    recipientInput.value = '';
    amountInput.value = '';
    errorEl.hidden = true;
    successEl.hidden = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    recipientInput.focus();
  };

  overlay.addEventListener('click', closeSendMoneyModal);
  closeBtn.addEventListener('click', closeSendMoneyModal);

  currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => selectCurrency(btn.dataset.currency));
  });

  submitBtn.addEventListener('click', async () => {
    if (!canDeposit()) return;

    const recipient = recipientInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const userError = validateUsername(recipient);

    errorEl.hidden = true;
    successEl.hidden = true;

    if (userError) {
      errorEl.textContent = userError;
      errorEl.hidden = false;
      recipientInput.focus();
      return;
    }

    if (!amount || amount <= 0) {
      errorEl.textContent = 'Enter a valid amount';
      errorEl.hidden = false;
      amountInput.focus();
      return;
    }

    if (recipient.toLowerCase() === getLoggedInUsername()?.toLowerCase()) {
      errorEl.textContent = "Use Deposit to add money to your own account";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    const result = await postWalletAction({
      action: 'send',
      admin: getLoggedInUsername(),
      to: recipient,
      amount,
      currency: selectedCurrency,
    });
    submitBtn.disabled = false;

    if (!result?.ok) {
      errorEl.textContent = result?.data?.error || 'Could not send money. Try again.';
      errorEl.hidden = false;
      return;
    }

    const display = selectedCurrency === 'USD'
      ? `$${formatWalletDisplay(selectedCurrency, amount)}`
      : `${formatWalletDisplay(selectedCurrency, amount)} ${selectedCurrency}`;

    successEl.textContent = `Sent ${display} to ${recipient}!`;
    successEl.hidden = false;
    recipientInput.value = '';
    amountInput.value = '';

    setTimeout(closeSendMoneyModal, 1800);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeSendMoneyModal();
  });
}

function initAdminPanelModal() {
  if (document.getElementById('adminPanelModal')) return;

  const modal = document.createElement('div');
  modal.className = 'deposit-modal admin-panel-modal';
  modal.id = 'adminPanelModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="deposit-overlay" id="adminPanelOverlay"></div>
    <div class="deposit-dialog admin-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="adminPanelTitle">
      <button class="deposit-close" id="adminPanelClose" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>

      <header class="admin-panel-header">
        <span class="admin-panel-eyebrow">NBD Casino</span>
        <h2 class="admin-panel-title" id="adminPanelTitle">Admin Panel</h2>
        <p class="admin-panel-subtitle">Site management tools for administrators</p>
      </header>

      <div class="admin-panel-main" id="adminPanelMainView">
        <section class="admin-panel-group">
          <h3 class="admin-panel-group-title">Player tools</h3>
          <div class="admin-panel-list">
            <button type="button" class="admin-panel-item admin-panel-item--featured" id="adminPanelRegisteredPlayers">
              <span class="admin-panel-item-body">
                <span class="admin-panel-item-label">Registered players</span>
                <span class="admin-panel-item-desc">Open the full player list with balances and stats</span>
              </span>
              <svg class="admin-panel-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button type="button" class="admin-panel-item" id="adminPanelSendMoney">
              <span class="admin-panel-item-body">
                <span class="admin-panel-item-label">Send Money</span>
                <span class="admin-panel-item-desc">Transfer play money to a player</span>
              </span>
              <svg class="admin-panel-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </section>

        <section class="admin-panel-group admin-panel-group--danger">
          <h3 class="admin-panel-group-title admin-panel-group-title--danger">Danger zone</h3>
          <div class="admin-panel-list">
            <button type="button" class="admin-panel-item admin-panel-item--danger" id="adminPanelResetBalances">
              <span class="admin-panel-item-body">
                <span class="admin-panel-item-label">Reset All Balances</span>
                <span class="admin-panel-item-desc">Set every player wallet to $0</span>
              </span>
              <svg class="admin-panel-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button type="button" class="admin-panel-item admin-panel-item--danger" id="adminPanelResetLeaderboards">
              <span class="admin-panel-item-body">
                <span class="admin-panel-item-label">Reset Originals Leaderboards</span>
                <span class="admin-panel-item-desc">Clear wins, bets, and recent bet history</span>
              </span>
              <svg class="admin-panel-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          <div class="admin-panel-inline">
            <label class="admin-panel-inline-label" for="adminPanelResetPlayerUser">Reset player wallet</label>
            <div class="admin-panel-inline-row">
              <input type="text" id="adminPanelResetPlayerUser" class="deposit-input admin-panel-inline-input" maxlength="16" autocomplete="off" placeholder="Username">
              <button type="button" class="admin-panel-inline-btn" id="adminPanelResetPlayer">Reset</button>
            </div>
          </div>
        </section>
      </div>

      <div class="admin-panel-players" id="adminPanelPlayersView" hidden>
        <div class="admin-panel-players-top">
          <button type="button" class="admin-panel-back-btn" id="adminPanelPlayersBack" aria-label="Back to admin tools">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            Admin tools
          </button>
          <span class="admin-panel-players-count" id="adminPanelPlayersCount"></span>
        </div>
        <div class="admin-panel-players-toolbar">
          <h3 class="admin-panel-players-title">Registered players</h3>
          <input type="search" id="adminPanelPlayersSearch" class="admin-panel-players-search" maxlength="16" autocomplete="off" placeholder="Search username…" aria-label="Search players">
        </div>
        <div class="admin-panel-players-table-wrap">
          <table class="admin-panel-players-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>USD</th>
                <th>Bets</th>
                <th>Wagered</th>
                <th>Wins</th>
                <th>Profit</th>
                <th>Referrer</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="adminPanelPlayersBody"></tbody>
          </table>
        </div>
      </div>

      <p class="deposit-error" id="adminPanelError" hidden></p>
      <p class="deposit-success" id="adminPanelSuccess" hidden></p>
    </div>`;
  document.body.appendChild(modal);

  const overlay = document.getElementById('adminPanelOverlay');
  const closeBtn = document.getElementById('adminPanelClose');
  const registeredPlayersBtn = document.getElementById('adminPanelRegisteredPlayers');
  const sendBtn = document.getElementById('adminPanelSendMoney');
  const resetBalancesBtn = document.getElementById('adminPanelResetBalances');
  const resetLeaderboardsBtn = document.getElementById('adminPanelResetLeaderboards');
  const resetPlayerInput = document.getElementById('adminPanelResetPlayerUser');
  const resetPlayerBtn = document.getElementById('adminPanelResetPlayer');
  const errorEl = document.getElementById('adminPanelError');
  const successEl = document.getElementById('adminPanelSuccess');
  const playersView = document.getElementById('adminPanelPlayersView');
  const playersBackBtn = document.getElementById('adminPanelPlayersBack');
  const playersSearch = document.getElementById('adminPanelPlayersSearch');
  const playersBody = document.getElementById('adminPanelPlayersBody');
  const playersCount = document.getElementById('adminPanelPlayersCount');
  const mainView = document.getElementById('adminPanelMainView');
  const dialog = modal.querySelector('.admin-panel-dialog');
  let adminPlayersCache = [];
  let playersLoadSeq = 0;

  function clearAdminPanelMessages() {
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  function showAdminMainView() {
    playersLoadSeq += 1;
    mainView.hidden = false;
    playersView.hidden = true;
    dialog?.classList.remove('admin-panel-dialog--wide');
    playersSearch.value = '';
    playersBody.innerHTML = '';
    playersCount.textContent = '';
  }

  function renderAdminPlayersTable(filter = '') {
    const q = filter.trim().toLowerCase();
    const rows = adminPlayersCache.filter(p => {
      const name = String(p?.username || '').trim();
      return name && (!q || name.toLowerCase().includes(q));
    });

    playersCount.textContent = rows.length === adminPlayersCache.length
      ? `${adminPlayersCache.length} player${adminPlayersCache.length === 1 ? '' : 's'}`
      : `${rows.length} of ${adminPlayersCache.length}`;

    if (!rows.length) {
      playersBody.innerHTML = `<tr><td colspan="9" class="admin-panel-players-empty">${q ? 'No players match your search.' : 'No registered players yet.'}</td></tr>`;
      return;
    }

    playersBody.innerHTML = rows.map(p => {
      const username = String(p.username || '').trim();
      const usd = formatAdminUsd(p.grants?.USD || 0);
      const profit = p.profit || 0;
      const profitClass = profit > 0 ? 'admin-panel-profit--pos' : profit < 0 ? 'admin-panel-profit--neg' : '';
      const canDelete = username && !isAdmin(username);
      const deleteBtn = canDelete
        ? `<button type="button" class="admin-panel-delete-btn" data-username="${escapeHtml(username)}" title="Delete player">Delete</button>`
        : '';
      return `<tr>
        <td class="admin-panel-player-name">${escapeHtml(username)}</td>
        <td>${usd}</td>
        <td>${p.bets || 0}</td>
        <td>${formatAdminUsd(p.wagered || 0)}</td>
        <td>${p.wins || 0}</td>
        <td class="${profitClass}">${formatAdminUsd(profit)}</td>
        <td>${p.referrer ? escapeHtml(p.referrer) : '—'}</td>
        <td>${formatAdminDate(p.joinedAt)}</td>
        <td class="admin-panel-player-actions">${deleteBtn}</td>
      </tr>`;
    }).join('');
  }

  async function openAdminPlayersView() {
    if (!isAdmin()) return;
    clearAdminPanelMessages();
    mainView.hidden = true;
    playersView.hidden = false;
    dialog?.classList.add('admin-panel-dialog--wide');
    playersBody.innerHTML = '<tr><td colspan="9" class="admin-panel-players-empty">Loading…</td></tr>';
    playersCount.textContent = '';

    const loadSeq = ++playersLoadSeq;
    try {
      const result = await fetchAdminPlayers();
      if (loadSeq !== playersLoadSeq || playersView.hidden) return;

      if (!result?.ok) {
        playersBody.innerHTML = `<tr><td colspan="9" class="admin-panel-players-empty">${escapeHtml(result?.data?.error || 'Could not load players.')}</td></tr>`;
        return;
      }

      adminPlayersCache = Array.isArray(result.data?.players) ? result.data.players : [];
      renderAdminPlayersTable();
      playersSearch.focus();
    } catch {
      if (loadSeq !== playersLoadSeq || playersView.hidden) return;
      playersBody.innerHTML = '<tr><td colspan="9" class="admin-panel-players-empty">Could not load players.</td></tr>';
    }
  }

  function closeAdminPanelModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    clearAdminPanelMessages();
    showAdminMainView();
  }

  window.openAdminPanelModal = function openAdminPanelModal() {
    if (!isAdmin()) return;
    clearAdminPanelMessages();
    showAdminMainView();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  window.openAdminPlayersView = openAdminPlayersView;

  overlay.addEventListener('click', closeAdminPanelModal);
  closeBtn.addEventListener('click', closeAdminPanelModal);

  registeredPlayersBtn?.addEventListener('click', () => {
    if (!isAdmin()) return;
    openAdminPlayersView();
  });

  playersBackBtn.addEventListener('click', showAdminMainView);
  playersSearch.addEventListener('input', () => renderAdminPlayersTable(playersSearch.value));

  playersBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.admin-panel-delete-btn');
    if (!btn || !isAdmin()) return;

    const username = btn.dataset.username || '';
    if (!username || isAdmin(username)) return;

    const confirmed = window.confirm(
      `Permanently delete ${username}?\n\nThis removes their wallet, affiliate records, leaderboard history, and chat messages. This cannot be undone.`
    );
    if (!confirmed) return;

    btn.disabled = true;
    const result = await postAdminPlayersAction({
      action: 'delete-player',
      admin: getLoggedInUsername(),
      username,
    });
    btn.disabled = false;

    if (!result?.ok) {
      errorEl.textContent = result?.data?.error || 'Could not delete player. Try again.';
      errorEl.hidden = false;
      return;
    }

    adminPlayersCache = Array.isArray(result.data?.players) ? result.data.players : [];
    renderAdminPlayersTable(playersSearch.value);
    successEl.textContent = `${username} deleted from all stores.`;
    successEl.hidden = false;
  });

  sendBtn.addEventListener('click', () => {
    if (!isAdmin()) return;
    closeAdminPanelModal();
    window.openSendMoneyModal?.();
  });

  resetBalancesBtn.addEventListener('click', async () => {
    if (!isAdmin()) return;
    clearAdminPanelMessages();

    const confirmed = window.confirm(
      'Reset ALL player balances to $0?\n\nThis also clears affiliate wager totals. Player ranks reset when they next load the site.'
    );
    if (!confirmed) return;

    resetBalancesBtn.disabled = true;
    const result = await postWalletAction({
      action: 'reset-all',
      admin: getLoggedInUsername(),
    });
    resetBalancesBtn.disabled = false;

    if (!result?.ok) {
      errorEl.textContent = result?.data?.error || 'Could not reset balances. Try again.';
      errorEl.hidden = false;
      return;
    }

    if (result.data?.resetAt) {
      await applyServerWalletReset(result.data.resetAt);
    } else {
      await ensureWalletResetSynced();
    }

    successEl.textContent = 'All player balances reset to $0.';
    successEl.hidden = false;
  });

  resetLeaderboardsBtn.addEventListener('click', async () => {
    if (!isAdmin()) return;
    clearAdminPanelMessages();

    const confirmed = window.confirm(
      'Reset ALL leaderboards?\n\nThis clears every win, bet count, wager total, and recent bet on the site.'
    );
    if (!confirmed) return;

    resetLeaderboardsBtn.disabled = true;
    const result = await postLeaderboardAction({
      action: 'reset-all',
      admin: getLoggedInUsername(),
    });
    resetLeaderboardsBtn.disabled = false;

    if (!result?.ok) {
      errorEl.textContent = result?.data?.error || 'Could not reset leaderboards. Try again.';
      errorEl.hidden = false;
      return;
    }

    await refreshLeaderboard();
    localStorage.removeItem(LEADERBOARD_KEY);
    localStorage.removeItem('nbd-gi-bets');
    document.dispatchEvent(new CustomEvent('xython:leaderboard-change', { detail: { wins: [], bets: {}, recentBets: [] } }));
    successEl.textContent = 'All leaderboards, wagers, and bet history cleared.';
    successEl.hidden = false;
  });

  resetPlayerBtn.addEventListener('click', async () => {
    if (!isAdmin()) return;
    clearAdminPanelMessages();

    const player = resetPlayerInput.value.trim();
    const userError = validateUsername(player);

    if (userError) {
      errorEl.textContent = userError;
      errorEl.hidden = false;
      resetPlayerInput.focus();
      return;
    }

    const confirmed = window.confirm(
      `Reset ${player}'s wallet to $0?\n\nThis clears all play-money grants for that player only.`
    );
    if (!confirmed) return;

    resetPlayerBtn.disabled = true;
    const result = await postWalletAction({
      action: 'reset-player',
      admin: getLoggedInUsername(),
      username: player,
    });
    resetPlayerBtn.disabled = false;

    if (!result?.ok) {
      errorEl.textContent = result?.data?.error || 'Could not reset player wallet. Try again.';
      errorEl.hidden = false;
      return;
    }

    resetPlayerInput.value = '';
    successEl.textContent = `${player}'s wallet reset to $0.`;
    successEl.hidden = false;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeAdminPanelModal();
  });
}

function initVaultModal({ getActiveCurrency }) {
  if (document.getElementById('vaultModal')) return;

  const modal = document.createElement('div');
  modal.className = 'deposit-modal vault-modal';
  modal.id = 'vaultModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="deposit-overlay" id="vaultOverlay"></div>
    <div class="deposit-dialog vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vaultTitle">
      <button class="deposit-close" id="vaultClose" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <h2 class="deposit-title" id="vaultTitle">Vault</h2>
      <p class="deposit-subtitle">Secure storage — vaulted funds can't be used for bets</p>

      <div class="deposit-currencies" id="vaultCurrencies">
        <button type="button" class="deposit-currency active" data-currency="USD">USD</button>
        <button type="button" class="deposit-currency" data-currency="BTC">BTC</button>
        <button type="button" class="deposit-currency" data-currency="ETH">ETH</button>
        <button type="button" class="deposit-currency" data-currency="LTC">LTC</button>
      </div>

      <div class="vault-balances">
        <div class="vault-balance-row">
          <span class="vault-balance-label">Wallet</span>
          <span class="vault-balance-value" id="vaultWalletBal">$0.00</span>
        </div>
        <div class="vault-balance-row vault-balance-row--vault">
          <span class="vault-balance-label">Vault</span>
          <span class="vault-balance-value" id="vaultStoredBal">$0.00</span>
        </div>
      </div>

      <div class="vault-mode-tabs" id="vaultModeTabs">
        <button type="button" class="vault-mode-tab active" data-mode="deposit">Deposit to Vault</button>
        <button type="button" class="vault-mode-tab" data-mode="withdraw">Withdraw</button>
      </div>

      <label class="deposit-label" for="vaultAmount" id="vaultAmountLabel">Amount to store</label>
      <div class="deposit-input-wrap">
        <span class="deposit-input-icon" id="vaultInputIcon">$</span>
        <input type="number" id="vaultAmount" class="deposit-input" min="0" step="0.01" placeholder="0.00">
      </div>

      <div class="vault-quick-row">
        <button type="button" class="vault-quick-btn" data-action="half">1/2</button>
        <button type="button" class="vault-quick-btn" data-action="max">Max</button>
      </div>

      <p class="vault-error" id="vaultError" hidden></p>
      <p class="deposit-success" id="vaultSuccess" hidden></p>

      <button type="button" class="deposit-submit" id="vaultSubmit">Deposit to Vault</button>
    </div>
  `;
  document.body.appendChild(modal);

  const overlay = document.getElementById('vaultOverlay');
  const closeBtn = document.getElementById('vaultClose');
  const amountInput = document.getElementById('vaultAmount');
  const currencyBtns = modal.querySelectorAll('.deposit-currency');
  const inputIcon = document.getElementById('vaultInputIcon');
  const walletBalEl = document.getElementById('vaultWalletBal');
  const vaultBalEl = document.getElementById('vaultStoredBal');
  const modeTabs = modal.querySelectorAll('.vault-mode-tab');
  const amountLabel = document.getElementById('vaultAmountLabel');
  const errorEl = document.getElementById('vaultError');
  const successEl = document.getElementById('vaultSuccess');
  const submitBtn = document.getElementById('vaultSubmit');
  const quickBtns = modal.querySelectorAll('.vault-quick-btn');

  let selectedCurrency = 'USD';
  let mode = 'deposit';

  function formatBal(currency, value) {
    if (currency === 'USD') return `$${formatWalletDisplay(currency, value)}`;
    return `${formatWalletDisplay(currency, value)} ${currency}`;
  }

  function refreshBalances() {
    const wallet = getWalletBalance(selectedCurrency);
    const vault = getVaultBalance(selectedCurrency);
    walletBalEl.textContent = formatBal(selectedCurrency, wallet);
    vaultBalEl.textContent = formatBal(selectedCurrency, vault);
  }

  function selectCurrency(currency) {
    selectedCurrency = currency;
    currencyBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.currency === currency));
    inputIcon.textContent = CURRENCY_ICONS[currency] || '';
    amountInput.value = '';
    amountInput.step = currency === 'USD' ? '0.01' : '0.00000001';
    amountInput.placeholder = currency === 'USD' ? '0.00' : '0.00000000';
    errorEl.hidden = true;
    successEl.hidden = true;
    refreshBalances();
  }

  function setMode(nextMode) {
    mode = nextMode;
    modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    amountLabel.textContent = mode === 'deposit' ? 'Amount to store' : 'Amount to withdraw';
    submitBtn.textContent = mode === 'deposit' ? 'Deposit to Vault' : 'Withdraw to Wallet';
    amountInput.value = '';
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  function closeVaultModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  window.openVaultModal = function openVaultModal() {
    if (!isLoggedIn()) {
      requireAuth('register');
      return;
    }
    closeRewardsPopout();
    closeUserPopout();
    const currency = getActiveCurrency();
    selectCurrency(currency);
    setMode('deposit');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    amountInput.focus();
  };

  overlay.addEventListener('click', closeVaultModal);
  closeBtn.addEventListener('click', closeVaultModal);

  currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => selectCurrency(btn.dataset.currency));
  });

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const source = mode === 'deposit'
        ? getWalletBalance(selectedCurrency)
        : getVaultBalance(selectedCurrency);
      const value = btn.dataset.action === 'half' ? source / 2 : source;
      amountInput.value = selectedCurrency === 'USD'
        ? value.toFixed(2)
        : value.toFixed(8).replace(/\.?0+$/, '') || '0';
      errorEl.hidden = true;
    });
  });

  submitBtn.addEventListener('click', () => {
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
      errorEl.textContent = 'Enter a valid amount';
      errorEl.hidden = false;
      successEl.hidden = true;
      amountInput.focus();
      return;
    }

    const result = mode === 'deposit'
      ? depositToVault(selectedCurrency, amount)
      : withdrawFromVault(selectedCurrency, amount);

    if (!result.ok) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      successEl.hidden = true;
      return;
    }

    errorEl.hidden = true;
    const display = formatBal(selectedCurrency, amount);
    successEl.textContent = mode === 'deposit'
      ? `${display} moved to vault`
      : `${display} returned to wallet`;
    successEl.hidden = false;
    amountInput.value = '';
    refreshBalances();
  });

  document.addEventListener('xython:vault-change', refreshBalances);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeVaultModal();
  });
}

function initCasinoThemeLoader() {
  const page = document.body.dataset.page;
  if (page !== 'casino' && page !== 'originals') return;
  if (document.querySelector('link[href*="casino-home.css"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = sitePath('css/casino-home.css');
  link.dataset.casinoCss = '1';
  document.head.appendChild(link);
}

function initCommon() {
  if (location.protocol === 'http:' && /nbdcasino\.com$/i.test(location.hostname)) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
    return;
  }

  const finishInit = () => {
    purgeInsecureClientStorage();
    captureReferralFromUrl();
    backfillRegisteredUsers();
    initSidebarNav();
    initSidebar();
    initRightPanelToggle();
    initWallet();
    initAdminPanelModal();
    initAuth();
    initUserSettings();
    initPanelTabs();
    initChat();
    startLeaderboardPolling();
    startAffiliatePolling();
    ensureWalletResetSynced();
    startWalletGrantsPolling();
    syncCurrentUserToServer();
    if (!initCommon.affiliateAuthBound) {
      document.addEventListener('xython:auth-change', () => {
        syncCurrentUserToServer();
        startAffiliatePolling();
        startWalletGrantsPolling();
      });
      initCommon.affiliateAuthBound = true;
    }
    initLiveBets();
    initCasinoThemeLoader();
    initGameInfoLoader();
    enhanceAccountNav();
    renderSelfExclusionBanner();
  };

  if (getAuthApiUrl()) {
    verifyServerSession().finally(finishInit);
  } else {
    finishInit();
  }
}

function initGameInfoLoader() {
  if (document.body.dataset.page !== 'originals') return;
  const file = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
  if (!file || file === 'originals') return;

  if (!document.querySelector('link[data-gi-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sitePath('css/game-info.css');
    link.dataset.giCss = '1';
    document.head.appendChild(link);
  }

  if (document.querySelector('script[data-gi-js]')) return;
  const script = document.createElement('script');
  script.src = sitePath('js/game-info.js?v=2');
  script.dataset.giJs = '1';
  script.onload = () => window.NbdGameInfo?.init?.();
  document.body.appendChild(script);
}
