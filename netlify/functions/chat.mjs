import { getStore } from '@netlify/blobs';

const MAX_MESSAGES = 200;
const ADMIN_USERNAMES = ['ceo'];

function isAdmin(username) {
  const name = String(username || '').trim().toLowerCase();
  return ADMIN_USERNAMES.some(u => u.toLowerCase() === name);
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

export default async (req) => {
  const store = getStore('nbd-chat');

  if (req.method === 'GET') {
    const messages = (await store.get('messages', { type: 'json' })) || [];
    return Response.json({
      messages: sanitizeChatMessages(Array.isArray(messages) ? messages : []),
    });
  }

  if (req.method === 'POST') {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Bad request' }, { status: 400 });
    }

    if (payload.action === 'delete-message') {
      if (!isAdmin(payload.admin)) {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }

      const messageId = String(payload.messageId || '').trim();
      if (!messageId) {
        return Response.json({ error: 'Invalid message id' }, { status: 400 });
      }

      const existing = (await store.get('messages', { type: 'json' })) || [];
      const messages = Array.isArray(existing) ? existing : [];
      const filtered = messages.filter(m => m.id !== messageId);
      if (filtered.length === messages.length) {
        return Response.json({ error: 'Message not found' }, { status: 404 });
      }

      await store.setJSON('messages', filtered);
      return Response.json({ ok: true, messages: filtered });
    }

    const text = String(payload.text || '').trim().slice(0, 240);
    const user = String(payload.user || '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .slice(0, 16);
    if (!text || !user) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }
    if (isReservedChatUser(user)) {
      return Response.json({ error: 'Invalid username' }, { status: 400 });
    }
    if (looksLikeFakeTipAnnouncement(text)) {
      return Response.json({ error: 'Message not allowed' }, { status: 400 });
    }

    const existing = (await store.get('messages', { type: 'json' })) || [];
    const messages = Array.isArray(existing) ? existing : [];
    messages.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      user,
      text,
      ts: Date.now(),
    });

    const trimmed = messages.slice(-MAX_MESSAGES);
    await store.setJSON('messages', trimmed);
    return Response.json({ ok: true, messages: trimmed });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

export const config = {
  path: '/api/chat',
};
