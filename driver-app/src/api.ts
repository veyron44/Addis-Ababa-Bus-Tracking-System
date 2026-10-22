// All calls to the backend go through this one function.
import { clearToken, getToken } from './lib/token';
import type { ShiftStatus } from './lib/shift';

const BASE: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const apiBase = BASE;

// An error that remembers the HTTP status, so screens can tell 404 from 409.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('No connection to the server', 0);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A wrong or expired token: forget it, so the next screen sends the driver to Login.
    if (res.status === 401 && token) clearToken();
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

// ---- Health (Day 0 check page) ----
export type Health = { status: string; database: string };
export const getHealth = () => api<Health>('/health');

// ---- Login ----
export type LoginResult = { token: string; expiresAt: string; driver: { id: number; name: string } };

export const login = (username: string, password: string) =>
  api<LoginResult>('/auth/driver/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const getMe = () => api<{ driver: { id: number; name: string } }>('/auth/me');

// ---- Shift ----
export type Assignment = {
  id: number;
  status: ShiftStatus;
  plate: string;
  routeNumber: string;
  directionName: string;
  routeDirectionId: number;
  startedAt: string | null;
};

export type Direction = {
  id: number;
  routeNumber: string;
  routeName: string | null;
  routeNameAm: string | null;
  directionName: string;
};

export const getCurrentShift = () => api<{ assignment: Assignment }>('/assignments/current');
export const getDirections = () => api<{ directions: Direction[] }>('/routes/directions');

export const selectDirection = (routeDirectionId: number) =>
  api<{ changed: boolean; assignment: Assignment }>('/assignments/select', {
    method: 'POST',
    body: JSON.stringify({ routeDirectionId }),
  });

export const startShift = () => api<{ assignment: Assignment }>('/assignments/start', { method: 'POST' });
export const endShift = () => api<{ ended: boolean }>('/assignments/end', { method: 'POST' });
