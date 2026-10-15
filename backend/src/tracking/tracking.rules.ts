import { PLACEHOLDERS } from '../config/placeholders';
import type { PingInput } from './tracking.service';

export type BatchResult = {
  kept: PingInput[];
  droppedFutureTime: number;
  droppedPoorAccuracy: number;
  offsetMs: number;      // server time minus phone time
  timeTrusted: boolean;  // false when the phone clock is far off
};

export function correctBatch(points: PingInput[], sentAt: Date, now: Date): BatchResult {

  // Small differences are treated as zero
  const rawOffsetMs = now.getTime() - sentAt.getTime();
  const offsetMs =
    Math.abs(rawOffsetMs) < PLACEHOLDERS.clockNoiseSec * 1000
      ? 0
      : Math.round(rawOffsetMs / 1000) * 1000;  const timeTrusted = Math.abs(offsetMs) <= PLACEHOLDERS.maxClockOffsetMin * 60_000;
  const latestAllowed = now.getTime() + PLACEHOLDERS.futureToleranceSec * 1000;

  const kept: PingInput[] = [];
  let droppedFutureTime = 0;
  let droppedPoorAccuracy = 0;

  for (const p of points) {
    const recordedAt = new Date(p.recordedAt.getTime() + offsetMs);
    const crowdingSetAt = p.crowdingSetAt
      ? new Date(p.crowdingSetAt.getTime() + offsetMs)
      : null;

    if (recordedAt.getTime() > latestAllowed) {
      droppedFutureTime++;
      continue;
    }
    if (p.accuracyM !== null && p.accuracyM > PLACEHOLDERS.poorAccuracyM) {
      droppedPoorAccuracy++;
      continue;
    }
    kept.push({ ...p, recordedAt, crowdingSetAt });
  }

  return { kept, droppedFutureTime, droppedPoorAccuracy, offsetMs, timeTrusted };
}

// Distance in meters between two points
export function distanceM(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lng - a.lng) * 111320 * Math.cos(midLat);
  const dy = (b.lat - a.lat) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}
export type FlipSample = {
  oppProgress: number; // progress on the opposite road, 0 to 1
  oppDistM: number;    // distance from the opposite road, meters
  oldProgress: number; // progress on the road the bus was on, 0 to 1
};

//flip?
export function flipEvidence(samples: FlipSample[], oppLenM: number, oldLenM: number): boolean {
  if (samples.length < PLACEHOLDERS.flipMinPings) return false;

  // Every point must be on the opposite road.
  if (samples.some((s) => s.oppDistM > PLACEHOLDERS.offPathM)) return false;

  const tol = PLACEHOLDERS.backToleranceM;
  for (let i = 1; i < samples.length; i++) {
    const alongOpposite = (samples[i].oppProgress - samples[i - 1].oppProgress) * oppLenM;
    const backAlongOld = (samples[i - 1].oldProgress - samples[i].oldProgress) * oldLenM;
    if (alongOpposite < -tol || backAlongOld < -tol) return false;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const rise = (last.oppProgress - first.oppProgress) * oppLenM;
  const fall = (first.oldProgress - last.oldProgress) * oldLenM;
  return rise >= PLACEHOLDERS.flipMinRiseM && fall >= PLACEHOLDERS.flipMinRiseM;
}