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

export type EtaBasis = 'live' | 'typical';
export type Eta = {
  seconds: number;
  lowSec: number;
  highSec: number;
  basis: EtaBasis; // 'live' = the near stretch used the bus's own speed
  arriving: boolean;
};

// The first nearPartKm use the bus's live speed, the rest uses the typical speed.
// A standing or unknown speed is ignored (it could be boarding or a jam): everything is typical
// and the range is wider.
export function estimateEta(distanceM: number, liveSpeedKmh: number | null): Eta {
  const typicalMs = PLACEHOLDERS.fallbackSpeedKmh / 3.6;
  const liveOk = liveSpeedKmh !== null && liveSpeedKmh >= PLACEHOLDERS.minLiveSpeedKmh;
  const nearSpeedMs = liveOk
    ? Math.min(liveSpeedKmh as number, PLACEHOLDERS.maxSpeedKmh) / 3.6
    : typicalMs;

  const nearM = Math.min(distanceM, PLACEHOLDERS.nearPartKm * 1000);
  const farM = distanceM - nearM;
  const seconds = nearM / nearSpeedMs + farM / typicalMs;

  const pct = liveOk ? PLACEHOLDERS.etaRangePercent : PLACEHOLDERS.etaWideRangePercent;
  return {
    seconds,
    lowSec: seconds * (1 - pct),
    highSec: seconds * (1 + pct),
    basis: liveOk ? 'live' : 'typical',
    arriving: seconds <= PLACEHOLDERS.arrivingSec,
  };
}

// Whole minutes for riders, at least 1.
export function toMinutes(lowSec: number, highSec: number): { lowMin: number; highMin: number } {
  const lowMin = Math.max(1, Math.round(lowSec / 60));
  const highMin = Math.max(lowMin, Math.round(highSec / 60));
  return { lowMin, highMin };
}