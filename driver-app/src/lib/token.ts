// The login token lives in localStorage. Every read and write is wrapped,
// because storage can be blocked (private window, cleared site data).
const KEY = 'driverToken';

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
    // Without storage the driver logs in again after a refresh. Nothing else breaks.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
