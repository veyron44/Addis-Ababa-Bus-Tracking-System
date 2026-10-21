import {
  buildSegments,
  distanceToStop,
  estimateEta,
  farSeconds,
  isFresh,
  rollingSpeed,
  standingSec,
  toMinutes,
  type EtaBasis,
  type Segment,
} from './eta.rules';
import { getAssignmentBasics, getMeasuredSegments, getRecentPoints, getStopsOnPath } from './eta.repository';
import { localSlot } from '../segments/segments.rules';
import { PLACEHOLDERS } from '../config/placeholders';

type PathInfo = NonNullable<Awaited<ReturnType<typeof getStopsOnPath>>>;

// The stretches of this road with their measured times for the current time of day.
// One slot (now) is used for the whole road, which is close enough for the next half hour or so.
async function loadSegments(path: PathInfo, now: Date): Promise<Segment[]> {
  const { dayType, bucket } = localSlot(now.getTime());
  const measured = await getMeasuredSegments(
    path.stops.map((s) => s.stopId),
    dayType,
    bucket,
  );
  return buildSegments(
    path.stops.map((s) => ({ stopId: s.stopId, progress: s.progress })),
    path.lenM,
    measured,
  );
}

// Seconds from the first stop of a road to one of its stops (measured times where there are
// any, typical speed elsewhere). Null when the stop is not on the road.
export async function travelSecondsToStop(path: PathInfo, stopId: number, now: Date): Promise<number | null> {
  const stop = path.stops.find((s) => s.stopId === stopId);
  if (!stop) return null;
  const segments = await loadSegments(path, now);
  return farSeconds(path.stops[0].progress * path.lenM, stop.progress * path.lenM, segments).seconds;
}

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
  standingMin: number | null; // standing still this long (only when long enough to matter)
  segments: Segment[]; // the road in stretches with their measured times
  stops: StopView[];
};

// Null when the shift is not running or has no points yet.
export async function describeBus(assignmentId: number, now: Date = new Date()): Promise<BusView | null> {
  const a = await getAssignmentBasics(assignmentId);
  if (!a || (a.status !== 'on_trip' && a.status !== 'at_terminal')) return null;

  const path = await getStopsOnPath(a.routeDirectionId);
  if (!path) return null;

  const recent = await getRecentPoints(a.id, a.routeDirectionId, PLACEHOLDERS.standingLookbackPoints);
  if (recent.length === 0) return null;

  const newest = recent[0];
  const points = recent.map((p) => ({ timeMs: p.time.getTime(), progress: p.progress }));
  const speed = rollingSpeed(points, path.lenM);
  const stood = standingSec(points, path.lenM);

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
    standingMin: stood !== null && stood >= PLACEHOLDERS.standingFlagMinSec ? Math.round(stood / 60) : null,
    segments: await loadSegments(path, now),
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

const round2 = (x: number) => Math.round(x * 100) / 100;

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
  learnedShare: number; // 0 to 1: how much of the far stretch used measured segment times
};

// ETA for every stop still ahead. No recent signal means no estimate, never a stale one.
export async function estimateForBus(
  assignmentId: number,
  now: Date = new Date(),
): Promise<{ bus: BusView; arrivals: ArrivalEstimate[] } | null> {
  const bus = await describeBus(assignmentId, now);
  if (!bus) return null;

  const busM = bus.progress * bus.pathLenM;
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
        return { ...base, etaSec: null, code: 'no_estimate' as const, reason: 'no_signal' as const, lowMin: null, highMin: null, basis: null, learnedShare: 0 };
      }
      const eta = estimateEta(s.distanceM, bus.speedKmh, { busM, segments: bus.segments });
      if (eta.arriving) {
        return { ...base, etaSec: eta.seconds, code: 'arriving' as const, reason: null, lowMin: null, highMin: null, basis: eta.basis, learnedShare: round2(eta.learnedShare) };
      }
      const m = toMinutes(eta.lowSec, eta.highSec);
      return { ...base, etaSec: eta.seconds, code: 'estimate' as const, reason: null, lowMin: m.lowMin, highMin: m.highMin, basis: eta.basis, learnedShare: round2(eta.learnedShare) };
    });

  return { bus, arrivals };
}
