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
