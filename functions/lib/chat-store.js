import { kvGet, kvSet } from './kv.js';

export const CHAT_MESSAGES_KEY = 'messages';
export const CHAT_MAX_MESSAGES = 200;

const RESERVED_CHAT_USERS = new Set(['system', 'admin', 'moderator', 'mod']);

export function normalizeChatUsername(username) {
  return String(username || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, 16);
}

export function isReservedChatUser(username) {
  const name = normalizeChatUsername(username).toLowerCase();
  return RESERVED_CHAT_USERS.has(name);
}

export function looksLikeFakeTipAnnouncement(text) {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (/tipped\s+(everyone|all|everybody|the\s+chat|chat|room)/i.test(clean)) return true;
  if (/^[\w@.-]+\s+tipped\s+[\w@.-]+\s+\$?[\d,]+(?:\.\d+)?/i.test(clean)) return true;
  return false;
}

export function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(msg => {
    if (!msg || typeof msg.text !== 'string' || !msg.user) return false;
    if (isReservedChatUser(msg.user) && msg.system !== true) return false;
    return true;
  });
}

export async function appendChatMessage(kv, username, text) {
  if (!kv) return false;

  const user = normalizeChatUsername(username);
  const clean = String(text || '').trim().slice(0, 240);
  if (!user || !clean || isReservedChatUser(user)) return false;
  if (looksLikeFakeTipAnnouncement(clean)) return false;

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
    system: true,
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
