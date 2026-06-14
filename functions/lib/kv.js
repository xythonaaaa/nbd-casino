export async function kvGet(kv, key, fallback = null) {
  if (!kv) return fallback;
  try {
    const raw = await kv.get(key, 'json');
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

export async function kvSet(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export async function writeStore(kv, key, mutator, { maxAttempts = 5 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await kvGet(kv, key, null);
    const normalized = data ?? {};
    const result = mutator(normalized);
    if (result?.error) return result;
    await kvSet(kv, key, normalized);
    return result;
  }
  return { error: 'Store busy, try again' };
}
