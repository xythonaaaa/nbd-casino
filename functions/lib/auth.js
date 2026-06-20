import { kvGet, kvSet } from './kv.js';
import { isAdmin } from './admin.js';

export const AUTH_SESSIONS_KEY = 'auth-sessions';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;

export function authUserKey(username) {
  return String(username || '').trim().toLowerCase();
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hashPasswordToBase64(password, saltBuffer) {
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
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bufferToBase64(hashBuffer);
}

export async function createPasswordCredentials(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasswordToBase64(password, salt);
  return { salt: bufferToBase64(salt), hash };
}

export async function verifyPasswordPlain(password, saltB64, hashB64) {
  const hash = await hashPasswordToBase64(password, base64ToBuffer(saltB64));
  return hash === hashB64;
}

export function validateAuthUsername(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 3 || trimmed.length > 16) return 'Username must be 3–16 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Use letters, numbers, and underscores only';
  return null;
}

export function validateAuthPassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 64) return 'Password must be 64 characters or fewer';
  return null;
}

export function getUserPasswordMeta(store, username) {
  const key = authUserKey(username);
  const meta = store.userMeta?.[key];
  if (!meta?.passwordHash || !meta?.passwordSalt) return null;
  return { hash: meta.passwordHash, salt: meta.passwordSalt };
}

export function setUserPasswordMeta(store, username, hash, salt) {
  const key = authUserKey(username);
  if (!store.userMeta) store.userMeta = {};
  if (!store.userMeta[key]) store.userMeta[key] = { registeredAt: Date.now() };
  store.userMeta[key].passwordHash = hash;
  store.userMeta[key].passwordSalt = salt;
}

export async function verifySession(kv, token) {
  const raw = String(token || '').trim();
  if (!raw || !kv) return null;

  const sessions = await kvGet(kv, AUTH_SESSIONS_KEY, {});
  const session = sessions[raw];
  if (!session) return null;

  if (Date.now() > (parseInt(session.expiresAt, 10) || 0)) {
    delete sessions[raw];
    await kvSet(kv, AUTH_SESSIONS_KEY, sessions);
    return null;
  }

  return {
    username: session.username,
    expiresAt: session.expiresAt,
  };
}

export async function createAuthSession(kv, username) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`;
  const sessions = await kvGet(kv, AUTH_SESSIONS_KEY, {});
  sessions[token] = {
    username: String(username || '').trim().slice(0, 16),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  await kvSet(kv, AUTH_SESSIONS_KEY, sessions);
  return { token, expiresAt: sessions[token].expiresAt };
}

export async function revokeAuthSession(kv, token) {
  const raw = String(token || '').trim();
  if (!raw || !kv) return;
  const sessions = await kvGet(kv, AUTH_SESSIONS_KEY, {});
  if (sessions[raw]) {
    delete sessions[raw];
    await kvSet(kv, AUTH_SESSIONS_KEY, sessions);
  }
}

export async function authenticatePayload(kv, payload) {
  const session = await verifySession(kv, payload?.sessionToken);
  if (!session) return { error: 'Not authenticated. Log in again.' };
  return { username: session.username };
}

export async function authenticateRequest(kv, request, payload) {
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const token = String(payload?.sessionToken || bearer || '').trim();
  const session = await verifySession(kv, token);
  if (!session) return { error: 'Not authenticated. Log in again.' };
  return { username: session.username, token };
}

export async function revokeAllUserSessions(kv, username) {
  const key = authUserKey(username);
  const sessions = await kvGet(kv, AUTH_SESSIONS_KEY, {});
  let changed = false;
  Object.keys(sessions).forEach(token => {
    if (authUserKey(sessions[token]?.username) === key) {
      delete sessions[token];
      changed = true;
    }
  });
  if (changed) await kvSet(kv, AUTH_SESSIONS_KEY, sessions);
}

export async function bootstrapAdminPassword(store, username, password, secret, envSecret) {
  if (!envSecret || String(secret || '') !== String(envSecret)) {
    return { error: 'Unauthorized' };
  }
  const nameErr = validateAuthUsername(username);
  if (nameErr) return { error: nameErr };
  const passErr = validateAuthPassword(password);
  if (passErr) return { error: passErr };

  const key = authUserKey(username);
  const player = store.users.find(u => authUserKey(u) === key);
  if (!player || !isAdmin(player)) return { error: 'Admin account not found' };

  const creds = await createPasswordCredentials(password);
  setUserPasswordMeta(store, player, creds.hash, creds.salt);
  return { ok: true, username: player };
}

export async function loginWithPassword(store, username, password) {
  const nameErr = validateAuthUsername(username);
  if (nameErr) return { error: nameErr };
  const passErr = validateAuthPassword(password);
  if (passErr) return { error: passErr };

  const key = authUserKey(username);
  const player = store.users.find(u => authUserKey(u) === key);
  if (!player) return { error: 'Account not found' };

  const existing = getUserPasswordMeta(store, player);
  if (!existing) {
    return { error: 'Account not activated. Use admin bootstrap or contact support.' };
  }

  const valid = await verifyPasswordPlain(password, existing.salt, existing.hash);
  if (!valid) return { error: 'Incorrect password' };

  return { ok: true, username: player };
}

export async function registerWithPassword(store, username, password, ensureUser) {
  const nameErr = validateAuthUsername(username);
  if (nameErr) return { error: nameErr };
  const passErr = validateAuthPassword(password);
  if (passErr) return { error: passErr };

  const key = authUserKey(username);
  if (store.users.some(u => authUserKey(u) === key)) {
    return { error: 'Username taken. Log in instead.' };
  }

  const player = ensureUser(store, username);
  if (!player) return { error: 'Invalid username' };

  if (getUserPasswordMeta(store, player)) {
    return { error: 'Account already exists. Log in instead.' };
  }

  const creds = await createPasswordCredentials(password);
  setUserPasswordMeta(store, player, creds.hash, creds.salt);
  return { ok: true, username: player };
}
