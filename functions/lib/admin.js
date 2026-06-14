const ADMIN_USERNAMES = ['ceo'];

export function isAdmin(username) {
  const name = String(username || '').trim().toLowerCase();
  return ADMIN_USERNAMES.some(u => u.toLowerCase() === name);
}
