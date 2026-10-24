import { clearToken, getToken } from './lib/token';
import type { ShiftStatus, CrowdingCode } from './lib/shift';
import type { GpsPoint, PingReply } from './lib/sender';

const BASE: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const apiBase = BASE;

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
    if (res.status === 401 && token) clearToken();
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export type Health = { status: string; database: string };
export const getHealth = () => api<Health>('/health');

// Login 
export type LoginResult = { token: string; expiresAt: string; driver: { id: number; name: string } };

export const login = (username: string, password: string) =>
  api<LoginResult>('/auth/driver/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const getMe = () => api<{ driver: { id: number; name: string } }>('/auth/me');

// Shift 
export type Assignment = {
  id: number;
  status: ShiftStatus;
  plate: string;
  routeNumber: string;
  directionName: string;
  routeDirectionId: number;
  startedAt: string | null;
  crowding: CrowdingCode;
  crowdingSetAt: string | null;
  crowdingView: { code: CrowdingCode; label: string; ageSec: number | null } | null;
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

//  GPS pings
export const sendPings = (sentAt: string, points: GpsPoint[]) =>
  api<PingReply>('/pings', {
    method: 'POST',
    body: JSON.stringify({ sentAt, points }),
  });

// Crowding, Departing, Return 
export const setCrowding = (status: CrowdingCode) =>
  api<{ assignment: Assignment }>('/assignments/crowding', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });

export const departingNow = (crowding?: CrowdingCode) =>
  api<{ changed: boolean; assignment: Assignment }>('/assignments/departing', {
    method: 'POST',
    body: JSON.stringify(crowding ? { crowding } : {}),
  });

export const startReturn = () =>
  api<{ changed: boolean; assignment: Assignment }>('/assignments/return', { method: 'POST' });

