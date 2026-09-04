const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const USERNAME_EMAIL_DOMAIN = 'ki-transfer.local';

/**
 * Lowercases and validates a username against the allowed pattern (letters,
 * digits, underscore, 3-32 chars — see spec). Returns null when invalid so
 * callers can show a validation message without throwing.
 */
export function normalizeUsername(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  return USERNAME_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Supabase Auth requires an email; the app only ever shows/asks for a
 * Username. This deterministic mapping means login needs no DB lookup to
 * resolve a username to its Supabase Auth identity — the client (and the
 * manage-users Edge Function) both derive the same synthetic email.
 */
export function usernameToEmail(username: string): string {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}
