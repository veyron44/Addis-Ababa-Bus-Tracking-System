type NextBusLike = { code: string; lowMin: number | null; highMin: number | null };

export type Sortable = {
  routeNumber: string;
  nextBus: NextBusLike | null;
};

// Minutes until the rider can get on, as one number to sort by. Null when we cannot tell.
// A bus that is arriving or about to leave counts as 0.
function waitMin(bus: NextBusLike): number | null {
  if (bus.code === 'arriving' || bus.code === 'departing_soon') return 0;
  return bus.lowMin;
}

// 0 = a bus with a time, 1 = a bus with no time (no signal, overdue), 2 = no bus at all.
function group(o: Sortable): number {
  if (!o.nextBus) return 2;
  return waitMin(o.nextBus) === null ? 1 : 0;
}

// Soonest bus first. Same time: the narrower range first, then the lower route number.
export function sortOptions<T extends Sortable>(options: T[]): T[] {
  return [...options].sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (a.nextBus && b.nextBus && group(a) === 0) {
      const low = waitMin(a.nextBus)! - waitMin(b.nextBus)!;
      if (low !== 0) return low;
      const high = (a.nextBus.highMin ?? 0) - (b.nextBus.highMin ?? 0);
      if (high !== 0) return high;
    }
    return a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true });
  });
}