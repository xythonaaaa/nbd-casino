import { getStore } from '@netlify/blobs';

const MAX_MESSAGES = 200;

export default async (req) => {
  const store = getStore('nbd-chat');

  if (req.method === 'GET') {
    const messages = (await store.get('messages', { type: 'json' })) || [];
    return Response.json({
      messages: Array.isArray(messages) ? messages : [],
    });
  }

  if (req.method === 'POST') {
    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Bad request' }, { status: 400 });
    }

    const text = String(payload.text || '').trim().slice(0, 240);
    const user = String(payload.user || '').trim().slice(0, 16);
    if (!text || !user) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
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
