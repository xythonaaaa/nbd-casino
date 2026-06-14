export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function methodNotAllowed() {
  return json({ error: 'Method not allowed' }, 405);
}

export function corsOptions() {
  return new Response(null, { status: 204 });
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
