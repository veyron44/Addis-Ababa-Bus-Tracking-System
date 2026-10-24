// Token storage for admin. Mirrors driver-app/src/lib/token.ts but uses 'adminToken'.
const KEY = 'adminToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Without storage the admin logs in again after a refresh.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
