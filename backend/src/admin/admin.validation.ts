// Pure checks shared by the admin endpoints. No database here.

// Positive whole number from a URL part or JSON value, else null.
export function parseId(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

// Letters, digits, spaces, hyphens; 2 to 20 characters. Stored in capitals.
export function cleanPlate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  if (v.length < 2 || v.length > 20) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(v) ? v : null;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  return v.length >= 2 && v.length <= 60 ? v : null;
}

// Lowercase letters, digits, dot, underscore, hyphen; 3 to 30 characters.
export function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(v) ? v : null;
}

// A message when the password is not acceptable, else null.
// bcrypt only reads the first 72 bytes, so longer passwords are refused.
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'password is required';
  if (raw.length < 8) return 'password must have at least 8 characters';
  if (Buffer.byteLength(raw, 'utf8') > 72) return 'password is too long (72 bytes at most)';
  return null;
}
