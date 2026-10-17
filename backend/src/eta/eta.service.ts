import { distanceToStop, estimateEta, isFresh, rollingSpeed, toMinutes, type EtaBasis } from './eta.rules';
import { getAssignmentBasics, getRecentPoints, getStopsOnPath } from './eta.repository';

const RECENT_POINTS = 12; // covers the rolling window several times

export type StopView = {
  stopId: number;
  stopOrder: number;
  placeName: string;
  side: string | null;
  passed: boolean;
  distanceM: number;
};

export type BusView = {
  assignmentId: number;
  status: string;
  routeDirectionId: number;
  pathLenM: number;
  progress: number;
  newestPointAt: Date;
  pointAgeSec: number;
  fresh: boolean; // false = no recent signal, so no ETA
  speedKmh: number | null; // null = too few points
  speedSpanSec: number | null;
  stops: StopView[];
};

// Null when the shift is not running or has no points yet.
export async function describeBus(assignmentId: number, now: Date = new Date()): Promise<BusView | null> {
  const a = await getAssignmentBasics(assignmentId);
  if (!a || (a.status !== 'on_trip' && a.status !== 'at_terminal')) return null;

  const path = await getStopsOnPath(a.routeDirectionId);
  if (!path) return null;

  const recent = await getRecentPoints(a.id, a.routeDirectionId, RECENT_POINTS);
  if (recent.length === 0) return null;

  const newest = recent[0];
  const speed = rollingSpeed(
    recent.map((p) => ({ timeMs: p.time.getTime(), progress: p.progress })),
    path.lenM,
  );

  return {
    assignmentId: a.id,
    status: a.status,
    routeDirectionId: a.routeDirectionId,
    pathLenM: path.lenM,
    progress: newest.progress,
    newestPointAt: newest.time,
    pointAgeSec: Math.round((now.getTime() - newest.time.getTime()) / 1000),
    fresh: isFresh(newest.time.getTime(), now.getTime()),
    speedKmh: speed ? speed.speedKmh : null,
    speedSpanSec: speed ? speed.spanSec : null,
    stops: path.stops.map((s) => {
      const d = distanceToStop(newest.progress, s.progress, path.lenM);
      return {
        stopId: s.stopId,
        stopOrder: s.stopOrder,
        placeName: s.placeName,
        side: s.side,
        passed: d.passed,
        distanceM: d.distanceM,
      };
    }),
  };
}

// Codes only; the apps turn them into text.
export type ArrivalEstimate = {
  stopId: number;
  stopOrder: number;
  placeName: string;
  side: string | null;
  distanceM: number;
  etaSec: number | null;
  code: 'arriving' | 'estimate' | 'no_estimate';
  reason: 'no_signal' | null;
  lowMin: number | null;
  highMin: number | null;
  basis: EtaBasis | null;
};

// ETA for every stop still ahead. No recent signal means no estimate, never a stale one.
export async function estimateForBus(
  assignmentId: number,
  now: Date = new Date(),
): Promise<{ bus: BusView; arrivals: ArrivalEstimate[] } | null> {
  const bus = await describeBus(assignmentId, now);
  if (!bus) return null;

  const arrivals: ArrivalEstimate[] = bus.stops
    .filter((s) => !s.passed)
    .map((s) => {
      const base = {
        stopId: s.stopId,
        stopOrder: s.stopOrder,
        placeName: s.placeName,
        side: s.side,
        distanceM: s.distanceM,
      };
      if (!bus.fresh) {
        return { ...base, etaSec: null, code: 'no_estimate' as const, reason: 'no_signal' as const, lowMin: null, highMin: null, basis: null };
      }
      const eta = estimateEta(s.distanceM, bus.speedKmh);
      if (eta.arriving) {
        return { ...base, etaSec: eta.seconds, code: 'arriving' as const, reason: null, lowMin: null, highMin: null, basis: eta.basis };
      }
      const m = toMinutes(eta.lowSec, eta.highSec);
      return { ...base, etaSec: eta.seconds, code: 'estimate' as const, reason: null, lowMin: m.lowMin, highMin: m.highMin, basis: eta.basis };
    });

  return { bus, arrivals };
}