

const BASE: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('No connection to the server', 0);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

//  Stop search

export type StopHit = {
  id: number;
  side: string;
};

export type PlaceHit = {
  placeName: string;
  placeNameAm: string | null;
  stops: StopHit[];
};

export const searchStops = (q: string) =>
  api<{ places: PlaceHit[] }>(`/stops?q=${encodeURIComponent(q)}`);

//  Arrivals 

export type CrowdingView = {
  code: string; // seats_available, standing_only, full, not_reported or not_updated_recently
  lastStatus: string | null; // the last real status when code is not_updated_recently
  ageSec: number | null;
};

export type ArrivalBus = {
  busId: number;
  routeNumber: string;
  directionName: string;
  code: string;          // 'arriving' | 'estimate' | 'no_estimate'
  reason: string | null;
  lowMin: number | null;
  highMin: number | null;
  basis: string | null;
  distanceM: number;
  crowding: CrowdingView | null;
  pointAgeSec: number;
  standingMin: number | null;
  learnedShare: number | null;
};

export type UpcomingBus = {
  busId: number;
  routeNumber: string;
  directionName: string;
  kind: string;
  lowMin: number | null;
  highMin: number | null;
  lessCertain: true;
  crowding: CrowdingView | null;
};

export type DepartureItem = {
  busId: number | null;
  routeNumber: string;
  directionName: string;
  kind: string;          // 'waiting' | 'on_the_road' | 'not_started'
  code: string;          // 'departing_soon' | 'estimate' | 'no_estimate' | 'assigned_not_started'
  reason: string | null; // 'overdue' | 'no_signal'
  lowMin: number | null;
  highMin: number | null;
  boarding: boolean;
  crowding: CrowdingView | null;
};

export type DepartureInfo = {
  startingPoint: boolean;
  items: DepartureItem[];
  waitingCount: number;
  boardingBusId: number | null;
  lastBusLeftMinAgo: number | null;
  typicalGap: { lowMin: number; highMin: number } | null;
};

export type StopInfo = {
  placeName: string;
  placeNameAm: string | null;
  side: string;
};

export type RouteAtStop = {
  routeNumber: string;
  directionName: string;
};

export type ArrivalsResponse = {
  stop: StopInfo;
  routes: RouteAtStop[];
  arrivals: ArrivalBus[];
  upcoming: UpcomingBus[];
  departures: DepartureInfo;
};

export const getArrivals = (stopId: number) =>
  api<ArrivalsResponse>(`/stops/${stopId}/arrivals`);

// Trips (from A to B) 

export type NextBus = {
  busId: number;
  source: 'arrival' | 'departure' | 'upcoming';
  kind: string | null;
  code: string;
  reason: string | null;
  lowMin: number | null;
  highMin: number | null;
  boarding: boolean;
  lessCertain: boolean;
  standingMin: number | null;
  crowding: CrowdingView | null;
};

export type TripOption = {
  routeNumber: string;
  directionName: string;
  routeDirectionId: number;
  toStopId: number;
  stopsAway: number;
  nextBus: NextBus | null;
};

export type TripItem = {
  waitAt: { stopId: number; placeName: string; side: string | null };
  options: TripOption[];
};

export type TripsResponse = {
  trips: TripItem[];
};

export const getTrips = (from: string, to: string) =>
  api<TripsResponse>(`/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

// Live map 

export type LiveBus = {
  busId: number;
  progress: number;
  position: { lat: number; lng: number } | null;
  fresh: boolean;
  pointAgeSec: number;
  nextStop: { stopId: number; placeName: string } | null;
  forStop: { stopId: number; passed: boolean; distanceM: number } | null;
  crowding: CrowdingView | null;
};

export type LiveStop = {
  stopId: number;
  stopOrder: number;
  placeName: string;
  side: string | null;
  progress: number;
  lat: number | null;
  lng: number | null;
};

export type LiveResponse = {
  route: {
    routeDirectionId: number;
    routeNumber: string;
    directionName: string;
    lengthM: number | null;
    line: [number, number][]; // the road as [lat, lng] points
  };
  stops: LiveStop[];
  buses: LiveBus[];
};

export const getRouteLive = (directionId: number, stopId: number | null) => {
  const q = stopId ? `?stop=${stopId}` : '';
  return api<LiveResponse>(`/routes/${directionId}/live${q}`);
};
