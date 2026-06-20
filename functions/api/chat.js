import { isAdmin } from '../lib/admin.js';
import { authenticatePayload } from '../lib/auth.js';
import {
  CHAT_MESSAGES_KEY,
  CHAT_MAX_MESSAGES,
  isReservedChatUser,
  looksLikeFakeTipAnnouncement,
  normalizeChatUsername,
  sanitizeChatMessages,
} from '../lib/chat-store.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const STORE_KEY = CHAT_MESSAGES_KEY;

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.CHAT_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const messages = (await kvGet(kv, STORE_KEY, [])) || [];
    return json({
      messages: sanitizeChatMessages(Array.isArray(messages) ? messages : []),
    });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'delete-message') {
      const auth = await authenticatePayload(env.WALLET_KV, payload);
      if (auth.error) return json(auth, { status: 401 });
      if (!isAdmin(auth.username)) {
        return json({ error: 'Admin only' }, 403);
      }

      const messageId = String(payload.messageId || '').trim();
      if (!messageId) {
        return json({ error: 'Invalid message id' }, 400);
      }

      const existing = (await kvGet(kv, STORE_KEY, [])) || [];
      const messages = Array.isArray(existing) ? existing : [];
      const filtered = messages.filter(m => m.id !== messageId);
      if (filtered.length === messages.length) {
        return json({ error: 'Message not found' }, 404);
      }

      await kvSet(kv, STORE_KEY, filtered);
      return json({ ok: true, messages: filtered });
    }

    const auth = await authenticatePayload(env.WALLET_KV, payload);
    if (auth.error) return json(auth, { status: 401 });

    const text = String(payload.text || '').trim().slice(0, 240);
    const user = normalizeChatUsername(auth.username);
    if (!text || !user) {
      return json({ error: 'Invalid message' }, 400);
    }
    if (isReservedChatUser(user)) {
      return json({ error: 'Invalid username' }, 400);
    }
    if (looksLikeFakeTipAnnouncement(text)) {
      return json({ error: 'Message not allowed' }, 400);
    }

    const existing = (await kvGet(kv, STORE_KEY, [])) || [];
    const messages = Array.isArray(existing) ? existing : [];
    messages.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      user,
      text,
      ts: Date.now(),
    });

    const trimmed = messages.slice(-CHAT_MAX_MESSAGES);
    await kvSet(kv, STORE_KEY, trimmed);
    return json({ ok: true, messages: trimmed });
  }

  return methodNotAllowed();
}
