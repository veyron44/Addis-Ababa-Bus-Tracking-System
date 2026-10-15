import { PLACEHOLDERS } from '../config/placeholders';

export type OffPathVerdict = 'off' | 'back' | 'unknown';

export function offPathVerdict(distancesNewestFirst: number[]): OffPathVerdict {
  const openN = PLACEHOLDERS.offPathMinPings;
  const clearN = PLACEHOLDERS.warningClearPings;
  const limit = PLACEHOLDERS.offPathM;

  // Open a warning if enough points are too far from the road.
  if (distancesNewestFirst.length >= openN && distancesNewestFirst.slice(0, openN).every((d) => d > limit)) {
    return 'off';
  }

  // Clear it when enough points are back within the limit.
  if (distancesNewestFirst.length >= clearN && distancesNewestFirst.slice(0, clearN).every((d) => d <= limit)) {
    return 'back';
  }

  return 'unknown';
}

export type ProgressPoint = { timeMs: number; progress: number };
export type WrongWayVerdict = 'wrong' | 'ok' | 'unknown';

export function wrongWayVerdict(points: ProgressPoint[], pathLenM: number): WrongWayVerdict {
  const clearN = PLACEHOLDERS.warningClearPings;

  // Check whether the bus has started moving forward again.
  if (points.length >= clearN + 1) {
    const recent = points.slice(-(clearN + 1));
    if (recent[recent.length - 1].progress - recent[0].progress >= 0) return 'ok';
  }

  if (points.length < PLACEHOLDERS.wrongWayMinPings) return 'unknown';

  const first = points[0];
  const last = points[points.length - 1];
  const spanSec = (last.timeMs - first.timeMs) / 1000;
  if (spanSec < PLACEHOLDERS.mismatchWindowSec * PLACEHOLDERS.wrongWayMinSpanShare) return 'unknown';

  // Check how far the bus has moved backward along the route.
  const fallM = (first.progress - last.progress) * pathLenM;
  if (fallM < PLACEHOLDERS.wrongWayMinFallM) return 'unknown';

  let falling = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].progress < points[i - 1].progress) falling++;
  }

  // Warn if most points show backward movement.
  const share = falling / (points.length - 1);
  return share >= PLACEHOLDERS.wrongWayFallShare ? 'wrong' : 'unknown';
}