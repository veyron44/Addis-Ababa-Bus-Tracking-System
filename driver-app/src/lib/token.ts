
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
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    
  }
}
