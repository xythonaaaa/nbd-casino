import { kvGet, kvSet } from './kv.js';

export const CHAT_MESSAGES_KEY = 'messages';
export const CHAT_MAX_MESSAGES = 200;

const RESERVED_CHAT_USERS = new Set(['system']);

export function isReservedChatUser(username) {
  return RESERVED_CHAT_USERS.has(String(username || '').trim().toLowerCase());
}

export async function appendChatMessage(kv, username, text) {
  if (!kv) return false;

  const user = String(username || '').trim().slice(0, 16);
  const clean = String(text || '').trim().slice(0, 240);
  if (!user || !clean || isReservedChatUser(user)) return false;

  const existing = (await kvGet(kv, CHAT_MESSAGES_KEY, [])) || [];
  const messages = Array.isArray(existing) ? existing : [];
  messages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user,
    text: clean,
    ts: Date.now(),
  });

  await kvSet(kv, CHAT_MESSAGES_KEY, messages.slice(-CHAT_MAX_MESSAGES));
  return true;
}

export async function appendSystemChatMessage(kv, text) {
  if (!kv) return false;

  const clean = String(text || '').trim().slice(0, 240);
  if (!clean) return false;

  const existing = (await kvGet(kv, CHAT_MESSAGES_KEY, [])) || [];
  const messages = Array.isArray(existing) ? existing : [];
  messages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user: 'System',
    text: clean,
    ts: Date.now(),
  });

  await kvSet(kv, CHAT_MESSAGES_KEY, messages.slice(-CHAT_MAX_MESSAGES));
  return true;
}

export function formatTipChatMessage(from, to, amount) {
  const sender = String(from || '').trim();
  const recipient = String(to || '').trim();
  const amt = parseFloat(amount) || 0;
  return `${sender} tipped ${recipient} $${amt.toFixed(2)}`;
}
