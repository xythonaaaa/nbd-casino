import { isAdmin } from '../lib/admin.js';
import { json, methodNotAllowed, corsOptions, parseJson } from '../lib/http.js';
import { kvGet, kvSet } from '../lib/kv.js';

const MAX_MESSAGES = 200;
const STORE_KEY = 'messages';

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.CHAT_KV;

  if (request.method === 'OPTIONS') return corsOptions();

  if (request.method === 'GET') {
    const messages = (await kvGet(kv, STORE_KEY, [])) || [];
    return json({
      messages: Array.isArray(messages) ? messages : [],
    });
  }

  if (request.method === 'POST') {
    const payload = await parseJson(request);
    if (!payload) return json({ error: 'Bad request' }, 400);

    if (payload.action === 'delete-message') {
      if (!isAdmin(payload.admin)) {
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

    const text = String(payload.text || '').trim().slice(0, 240);
    const user = String(payload.user || '').trim().slice(0, 16);
    if (!text || !user) {
      return json({ error: 'Invalid message' }, 400);
    }

    const existing = (await kvGet(kv, STORE_KEY, [])) || [];
    const messages = Array.isArray(existing) ? existing : [];
    messages.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      user,
      text,
      ts: Date.now(),
    });

    const trimmed = messages.slice(-MAX_MESSAGES);
    await kvSet(kv, STORE_KEY, trimmed);
    return json({ ok: true, messages: trimmed });
  }

  return methodNotAllowed();
}
