import { PLACEHOLDERS } from '../config/placeholders';

export type SpeedPoint = { timeMs: number; progress: number };
export type SpeedResult = { speedKmh: number; spanSec: number; points: number };

// Speed from progress along the road, not the phone's reported speed (GPS speed is noisy).
// Null when there are too few points.
export function rollingSpeed(points: SpeedPoint[], pathLenM: number): SpeedResult | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs);
  const newest = sorted[sorted.length - 1];
  const windowStart = newest.timeMs - PLACEHOLDERS.rollingSpeedWindowSec * 1000;
  const inWindow = sorted.filter((p) => p.timeMs >= windowStart);
  if (inWindow.length < 2) return null;

  const first = inWindow[0];
  const spanSec = (newest.timeMs - first.timeMs) / 1000;
  if (spanSec < PLACEHOLDERS.speedMinSpanSec) return null;

  const movedM = (newest.progress - first.progress) * pathLenM;
  const speedKmh = Math.max(0, (movedM / spanSec) * 3.6); // backwards counts as 0
  return { speedKmh, spanSec, points: inWindow.length };
}

export type StopAhead = { passed: boolean; distanceM: number };

// Distance along the road, never straight-line. A stop the bus is past by more than atStopM is passed.
export function distanceToStop(busProgress: number, stopProgress: number, pathLenM: number): StopAhead {
  const d = (stopProgress - busProgress) * pathLenM;
  if (d < -PLACEHOLDERS.atStopM) return { passed: true, distanceM: 0 };
  return { passed: false, distanceM: Math.max(0, d) };
}

export function isFresh(newestPointMs: number, nowMs: number): boolean {
  return nowMs - newestPointMs <= PLACEHOLDERS.freshPingSec * 1000;
}

// One stretch between two neighbouring stops, in metres along the road. seconds is the measured
// time to drive it at this time of day, or null when there is none.
export type Segment = { startM: number; endM: number; seconds: number | null };

// Segments of a road from its stops. `measured` is keyed "fromStopId-toStopId".
export function buildSegments(
  stops: { stopId: number; progress: number }[],
  pathLenM: number,
  measured: Map<string, number>,
): Segment[] {
  const out: Segment[] = [];
  for (let k = 0; k < stops.length - 1; k++) {
    const startM = stops[k].progress * pathLenM;
    const endM = stops[k + 1].progress * pathLenM;
    if (endM <= startM) continue;
    out.push({ startM, endM, seconds: measured.get(`${stops[k].stopId}-${stops[k + 1].stopId}`) ?? null });
  }
  return out;
}

// Seconds to drive from fromM to toM. A stretch with a measured time uses it (in proportion when
// only part of it is driven). Everything else, including road outside the stretches, uses the
// typical speed. learnedM is how many metres were covered by measured times.
export function farSeconds(
  fromM: number,
  toM: number,
  segments: Segment[],
): { seconds: number; learnedM: number } {
  if (toM <= fromM) return { seconds: 0, learnedM: 0 };
  const typicalMs = PLACEHOLDERS.fallbackSpeedKmh / 3.6;
  let seconds = 0;
  let coveredM = 0;
  let learnedM = 0;
  for (const s of segments) {
    const lo = Math.max(fromM, s.startM);
    const hi = Math.min(toM, s.endM);
    if (hi <= lo) continue;
    coveredM += hi - lo;
    if (s.seconds !== null) {
      seconds += (s.seconds * (hi - lo)) / (s.endM - s.startM);
      learnedM += hi - lo;
    } else {
      seconds += (hi - lo) / typicalMs;
    }
  }
  seconds += Math.max(0, toM - fromM - coveredM) / typicalMs;
  return { seconds, learnedM };
}

export type EtaBasis = 'live' | 'typical';
export type Eta = {
  seconds: number;
  lowSec: number;
  highSec: number;
  basis: EtaBasis; // 'live' = the near stretch used the bus's own speed
  learnedShare: number; // 0 to 1: how much of the far stretch used measured segment times
  arriving: boolean;
};

// The first nearPartKm use the bus's live speed. The rest uses the measured time of each stretch
// where there is one (learned), else the typical speed.
// A standing or unknown speed is ignored (it could be boarding or a jam): the near stretch is
// typical too and the range is wider.
export function estimateEta(
  distanceM: number,
  liveSpeedKmh: number | null,
  learned?: { busM: number; segments: Segment[] },
): Eta {
  const typicalMs = PLACEHOLDERS.fallbackSpeedKmh / 3.6;
  const liveOk = liveSpeedKmh !== null && liveSpeedKmh >= PLACEHOLDERS.minLiveSpeedKmh;
  const nearSpeedMs = liveOk
    ? Math.min(liveSpeedKmh as number, PLACEHOLDERS.maxSpeedKmh) / 3.6
    : typicalMs;

  const nearM = Math.min(distanceM, PLACEHOLDERS.nearPartKm * 1000);
  const farM = distanceM - nearM;
  let farSec = farM / typicalMs;
  let learnedShare = 0;
  if (learned && farM > 0) {
    const f = farSeconds(learned.busM + nearM, learned.busM + distanceM, learned.segments);
    farSec = f.seconds;
    learnedShare = Math.min(1, f.learnedM / farM);
  }
  const seconds = nearM / nearSpeedMs + farSec;

  const pct = liveOk ? PLACEHOLDERS.etaRangePercent : PLACEHOLDERS.etaWideRangePercent;
  return {
    seconds,
    lowSec: seconds * (1 - pct),
    highSec: seconds * (1 + pct),
    basis: liveOk ? 'live' : 'typical',
    learnedShare,
    arriving: seconds <= PLACEHOLDERS.arrivingSec,
  };
}

// How long the bus has stayed within standingStillM of where it is now, in seconds (0 when it is
// moving). Null with fewer than two points. It is capped by how far back the points go.
export function standingSec(points: SpeedPoint[], pathLenM: number): number | null {
  if (points.length < 2) return null;
  const newestFirst = [...points].sort((a, b) => b.timeMs - a.timeMs);
  const newest = newestFirst[0];
  let since = newest.timeMs;
  for (const p of newestFirst.slice(1)) {
    if (Math.abs(p.progress - newest.progress) * pathLenM > PLACEHOLDERS.standingStillM) break;
    since = p.timeMs;
  }
  return Math.round((newest.timeMs - since) / 1000);
}

// Whole minutes for riders, at least 1.
export function toMinutes(lowSec: number, highSec: number): { lowMin: number; highMin: number } {
  const lowMin = Math.max(1, Math.round(lowSec / 60));
  const highMin = Math.max(lowMin, Math.round(highSec / 60));
  return { lowMin, highMin };
}
