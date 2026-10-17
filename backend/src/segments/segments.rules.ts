import { PLACEHOLDERS } from '../config/placeholders';

export type PingPoint = { timeMs: number; progress: number };
export type StopMark = { stopId: number; progress: number }; // in route order, progress rising
export type BadWindow = { fromMs: number; toMs: number };
export type DayType = 'weekday' | 'weekend';

export type SegmentSample = {
  fromStopId: number;
  toStopId: number;
  startMs: number; // when the bus entered the segment (decides the slot)
  seconds: number;
};

export type SegmentGroup = {
  fromStopId: number;
  toStopId: number;
  dayType: DayType;
  bucket: number;
  n: number;
  seconds: number; // median
};

// Time the bus crossed each stop, or null when the data can't say (already past it at the first
// point, never reached it, or a time hole around it). Pings: oldest first.
export function findCrossings(pings: PingPoint[], stops: StopMark[]): (number | null)[] {
  const maxGapMs = PLACEHOLDERS.segmentMaxPingGapSec * 1000;
  return stops.map((s) => {
    for (let i = 1; i < pings.length; i++) {
      const a = pings[i - 1];
      const b = pings[i];
      if (a.progress < s.progress && b.progress >= s.progress) {
        if (b.timeMs - a.timeMs > maxGapMs) return null;
        const share = (s.progress - a.progress) / (b.progress - a.progress);
        return a.timeMs + share * (b.timeMs - a.timeMs);
      }
    }
    return null;
  });
}

// Real time of each stretch between neighbouring stops, for one shift on one direction.
// Skipped when: a stop has no crossing time (this also drops the first stretch after a terminal
// wait), the average speed is too low (breakdown or jam) or impossible (GPS jump), the points
// inside it have a hole, or it overlaps a wrong-way, off-path, no-signal or bad-clock warning.
export function buildSamples(
  pings: PingPoint[],
  stops: StopMark[],
  pathLenM: number,
  badWindows: BadWindow[],
): SegmentSample[] {
  const sorted = [...pings].sort((a, b) => a.timeMs - b.timeMs);
  const crossings = findCrossings(sorted, stops);
  const maxGapMs = PLACEHOLDERS.segmentMaxPingGapSec * 1000;
  const out: SegmentSample[] = [];

  for (let k = 0; k < stops.length - 1; k++) {
    const tA = crossings[k];
    const tB = crossings[k + 1];
    if (tA === null || tB === null || tB <= tA) continue;

    const seconds = (tB - tA) / 1000;
    const distM = (stops[k + 1].progress - stops[k].progress) * pathLenM;
    const speedKmh = (distM / seconds) * 3.6;
    if (speedKmh < PLACEHOLDERS.segmentMinSpeedKmh || speedKmh > PLACEHOLDERS.maxSpeedKmh) continue;

    let hole = false;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (b.timeMs < tA || a.timeMs > tB) continue;
      if (b.timeMs - a.timeMs > maxGapMs) {
        hole = true;
        break;
      }
    }
    if (hole) continue;

    if (badWindows.some((w) => w.fromMs <= tB && w.toMs >= tA)) continue;

    out.push({ fromStopId: stops[k].stopId, toStopId: stops[k + 1].stopId, startMs: tA, seconds });
  }
  return out;
}

// Day type and half-hour slot (0 to 47) in local time, matching the seeded segment_times.
// No daylight saving in Ethiopia, so a fixed offset works. Weekend = Saturday and Sunday.
export function localSlot(ms: number): { dayType: DayType; bucket: number } {
  const local = new Date(ms + PLACEHOLDERS.localUtcOffsetHours * 3_600_000);
  const dow = local.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { dayType: dow === 0 || dow === 6 ? 'weekend' : 'weekday', bucket: Math.floor(minutes / 30) };
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// One median per stop pair, day type and slot. Slots with fewer than minSamples are left out,
// so their rows stay guesses.
export function groupMedians(
  samples: SegmentSample[],
  minSamples: number = PLACEHOLDERS.segmentMinSamples,
): SegmentGroup[] {
  const groups = new Map<string, { base: Omit<SegmentGroup, 'n' | 'seconds'>; values: number[] }>();
  for (const s of samples) {
    const { dayType, bucket } = localSlot(s.startMs);
    const key = `${s.fromStopId}-${s.toStopId}-${dayType}-${bucket}`;
    let g = groups.get(key);
    if (!g) {
      g = { base: { fromStopId: s.fromStopId, toStopId: s.toStopId, dayType, bucket }, values: [] };
      groups.set(key, g);
    }
    g.values.push(s.seconds);
  }

  const out: SegmentGroup[] = [];
  for (const g of groups.values()) {
    if (g.values.length < minSamples) continue;
    out.push({ ...g.base, n: g.values.length, seconds: Math.max(1, Math.round(median(g.values))) });
  }
  return out.sort(
    (a, b) =>
      a.fromStopId - b.fromStopId ||
      a.toStopId - b.toStopId ||
      a.dayType.localeCompare(b.dayType) ||
      a.bucket - b.bucket,
  );
}
