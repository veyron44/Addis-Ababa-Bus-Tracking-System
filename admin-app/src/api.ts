// All calls to the backend go through this one function.
import { clearToken, getToken } from './lib/token';

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
    if (res.status === 401 && token) clearToken();
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

// ---- Auth ----
export type AdminLoginResult = { token: string; expiresAt: string; admin: { id: number; name: string } };
export const adminLogin = (username: string, password: string) =>
  api<AdminLoginResult>('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const getAdminMe = () => api<{ admin: { id: number; name: string } }>('/auth/admin/me');

// ---- Live ----
export type CrowdingView = {
  code: string;
  lastStatus: string | null;
  ageSec: number | null;
};

export type LiveWarning = { type: string; severity: string; detail: string | null; ageSec: number };

export type LiveBus = {
  busId: number; // the shift id
  plate: string;
  routeNumber: string;
  directionName: string;
  status: string;
  crowding: CrowdingView | null;
  lastPingAt: string | null;
  lastPingAgeSec: number | null;
  warnings: LiveWarning[];
  progress: number | null;
};
export const getLiveAll = () => api<{ buses: LiveBus[] }>('/admin/live-all');

// ---- Vehicles ----
export type Vehicle = { id: number; plate: string };
export const getVehicles = () => api<{ vehicles: Vehicle[] }>('/admin/vehicles');
export const createVehicle = (plate: string) =>
  api<{ vehicle: Vehicle }>('/admin/vehicles', { method: 'POST', body: JSON.stringify({ plate }) });
export const updateVehicle = (id: number, plate: string) =>
  api<{ vehicle: Vehicle }>(`/admin/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify({ plate }) });
export const deleteVehicle = (id: number) => api<{ deleted: boolean }>(`/admin/vehicles/${id}`, { method: 'DELETE' });

// ---- Drivers ----
export type Driver = { id: number; name: string; username: string };
export const getDrivers = () => api<{ drivers: Driver[] }>('/admin/drivers');
export const createDriver = (name: string, username: string, password: string) =>
  api<{ driver: Driver }>('/admin/drivers', { method: 'POST', body: JSON.stringify({ name, username, password }) });
export const updateDriver = (id: number, name: string, username: string) =>
  api<{ driver: Driver }>(`/admin/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ name, username }) });
export const deleteDriver = (id: number) => api<{ deleted: boolean }>(`/admin/drivers/${id}`, { method: 'DELETE' });
export const resetDriverPassword = (id: number, password: string) =>
  api<{ ok: boolean }>(`/admin/drivers/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) });

// ---- Route directions ----
export type RouteDirection = {
  id: number;
  routeNumber: string;
  routeName: string | null;
  directionName: string;
};
export const getRouteDirections = () => api<{ directions: RouteDirection[] }>('/admin/route-directions');

// ---- Assignments / Shifts ----
export type AdminAssignment = {
  id: number;
  status: string;
  plate: string;
  routeNumber: string;
  directionName: string;
  driverName: string;
  startedAt: string | null;
  routeDirectionId: number;
  vehicleId: number;
  driverId: number;
};
type ShiftFromApi = {
  id: number;
  status: string;
  startedAt: string | null;
  vehicle: { id: number; plate: string };
  crew: { id: number; name: string; username: string };
  route: { directionId: number; routeNumber: string; directionName: string };
};
function toAdminAssignment(a: ShiftFromApi): AdminAssignment {
  return {
    id: a.id,
    status: a.status,
    plate: a.vehicle.plate,
    routeNumber: a.route.routeNumber,
    directionName: a.route.directionName,
    driverName: a.crew.name,
    startedAt: a.startedAt,
    routeDirectionId: a.route.directionId,
    vehicleId: a.vehicle.id,
    driverId: a.crew.id,
  };
}
export const getAssignments = () =>
  api<{ assignments: ShiftFromApi[] }>('/admin/assignments?status=all&limit=50').then((r) => ({
    assignments: r.assignments.map(toAdminAssignment),
  }));
export const createAssignment = (driverId: number, vehicleId: number, routeDirectionId: number) =>
  api<{ assignment: AdminAssignment }>('/admin/assignments', {
    method: 'POST',
    body: JSON.stringify({ driverId, vehicleId, routeDirectionId }),
  });
export const endAssignment = (id: number) =>
  api<{ ended: boolean }>(`/admin/assignments/${id}/end`, { method: 'POST' });