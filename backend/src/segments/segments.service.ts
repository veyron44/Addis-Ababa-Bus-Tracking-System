import { PLACEHOLDERS } from '../config/placeholders';
import { getStopsOnPath } from '../eta/eta.repository';
import { buildSamples, groupMedians, type SegmentSample } from './segments.rules';
import {
  findShiftDirections,
  loadPings,
  loadBadWindows,
  loadCurrentRows,
  saveMeasured,
  countSegments,
} from './segments.repository';

export type PreviewRow = {
  fromStopId: number;
  toStopId: number;
  dayType: string;
  bucket: number;
  n: number;
  oldSeconds: number | null;
  newSeconds: number;
  wasMeasured: boolean;
};

// The nightly job. Works out how long each stretch really took and, with apply, replaces the guess
// with the median where there are enough samples. Other rows are never touched.
export async function runSegmentUpdate(opts: { apply: boolean; sinceDays: number }) {
  const shifts = await findShiftDirections(opts.sinceDays);

  const pathCache = new Map<number, Awaited<ReturnType<typeof getStopsOnPath>>>();
  const samples: SegmentSample[] = [];

  for (const s of shifts) {
    let path = pathCache.get(s.routeDirectionId);
    if (path === undefined) {
      path = await getStopsOnPath(s.routeDirectionId);
      pathCache.set(s.routeDirectionId, path);
    }
    if (!path) continue;

    const pings = await loadPings(s.assignmentId, s.routeDirectionId, opts.sinceDays);
    if (pings.length < 2) continue;

    const bad = await loadBadWindows(s.assignmentId, PLACEHOLDERS.segmentWarningPadSec);
    samples.push(
      ...buildSamples(
        pings,
        path.stops.map((x) => ({ stopId: x.stopId, progress: x.progress })),
        path.lenM,
        bad,
      ),
    );
  }

  const groups = groupMedians(samples, PLACEHOLDERS.segmentMinSamples);
  const current = await loadCurrentRows();

  const preview: PreviewRow[] = [...groups]
    .sort((a, b) => b.n - a.n)
    .slice(0, 15)
    .map((g) => {
      const old = current.get(`${g.fromStopId}-${g.toStopId}-${g.dayType}-${g.bucket}`);
      return {
        fromStopId: g.fromStopId,
        toStopId: g.toStopId,
        dayType: g.dayType,
        bucket: g.bucket,
        n: g.n,
        oldSeconds: old ? old.seconds : null,
        newSeconds: g.seconds,
        wasMeasured: old ? old.measured : false,
      };
    });

  let applied = 0;
  if (opts.apply) {
    for (const g of groups) {
      await saveMeasured(g);
      applied++;
    }
  }

  return {
    shiftsLookedAt: shifts.length,
    samplesKept: samples.length,
    slotsWithEnoughSamples: groups.length,
    applied,
    preview,
    totals: await countSegments(),
  };
}
