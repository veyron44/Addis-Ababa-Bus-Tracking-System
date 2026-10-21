import { PLACEHOLDERS } from '../config/placeholders';

export type Sortable = { etaSec: number | null; distanceM: number };

// Soonest first. Buses without an estimate (no recent signal) go last, nearest first.
export function sortArrivals<T extends Sortable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.etaSec === null && b.etaSec === null) return a.distanceM - b.distanceM;
    if (a.etaSec === null) return 1;
    if (b.etaSec === null) return -1;
    return a.etaSec - b.etaSec || a.distanceM - b.distanceM;
  });
}

// A bus that has not reached the road yet (waiting at the first stop, or still coming back to it):
// when it can be at this stop = when it leaves + the time to drive from the first stop to here.
// The ranges add up, using the wide range for the drive. Null when there is no time to build on.
export function upcomingAtStop(
  dep: { code: string; lowMin: number | null; highMin: number | null },
  travelSec: number,
): { lowMin: number; highMin: number } | null {
  const pct = PLACEHOLDERS.etaWideRangePercent;
  const driveLow = Math.round((travelSec * (1 - pct)) / 60);
  const driveHigh = Math.round((travelSec * (1 + pct)) / 60);

  if (dep.code === 'estimate' && dep.lowMin !== null && dep.highMin !== null) {
    return { lowMin: dep.lowMin + driveLow, highMin: dep.highMin + driveHigh };
  }
  if (dep.code === 'departing_soon') {
    return { lowMin: Math.max(1, driveLow), highMin: driveHigh + PLACEHOLDERS.departingSoonMaxMin };
  }
  return null;
}

// The ones worth showing: not too far away, soonest first, at most upcomingMax.
export function pickUpcoming<T extends { lowMin: number; highMin: number }>(items: T[]): T[] {
  return items
    .filter((i) => i.lowMin <= PLACEHOLDERS.upcomingMaxMin)
    .sort((a, b) => a.lowMin - b.lowMin || a.highMin - b.highMin)
    .slice(0, PLACEHOLDERS.upcomingMax);
}
