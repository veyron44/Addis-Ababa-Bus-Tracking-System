import {
  findStartingDirections,
  findLastStops,
  findWaitingBuses,
  findRoadBuses,
  findNotStarted,
  findLastDeparture,
  findHiddenIds,
} from './departures.repository';
import {
  waitingDeparture,
  upcomingDeparture,
  minutesAgo,
  typicalGap,
  sortDepartures,
  pickBoarding,
} from './departures.rules';
import { estimateForBus } from '../eta/eta.service';
import { crowdingView, type CrowdingView } from '../crowding/crowding.rules';
import { PLACEHOLDERS } from '../config/placeholders';

export type DepartureItem = {
  busId: number;
  kind: 'waiting' | 'on_the_road' | 'not_started';
  routeNumber: string;
  directionName: string; // direction the bus will leave on
  code: 'departing_soon' | 'estimate' | 'no_estimate' | 'assigned_not_started';
  reason: 'overdue' | 'no_signal' | null;
  lowMin: number | null; // leaves in about lowMin-highMin min
  highMin: number | null;
  boarding: boolean;
  crowding: CrowdingView | null;
};

export type Departures = {
  startingPoint: boolean; // false: this stop is not the first stop of any route
  items: DepartureItem[];
  waitingCount: number;
  boardingBusId: number | null;
  lastBusLeftMinAgo: number | null;
  typicalGap: { lowMin: number; highMin: number } | null; // only when no bus is visible
};

const NOT_A_STARTING_POINT: Departures = {
  startingPoint: false,
  items: [],
  waitingCount: 0,
  boardingBusId: null,
  lastBusLeftMinAgo: null,
  typicalGap: null,
};

// What a rider at a starting stop needs: buses waiting here, buses on their way to turn around,
// when the last one left, and what is usual when nothing is visible.
export async function getDepartures(
  stopId: number,
  routeFilter: string | null,
  now: Date = new Date(),
): Promise<Departures> {
  const starting = await findStartingDirections(stopId);
  if (starting.length === 0) return NOT_A_STARTING_POINT;

  const relevant = routeFilter ? starting.filter((d) => d.routeNumber === routeFilter) : starting;
  const yById = new Map(relevant.map((d) => [d.yId, d]));
  const xToY = new Map(relevant.filter((d) => d.xId !== null).map((d) => [d.xId as number, d]));
  const yIds = relevant.map((d) => d.yId);
  const xIds = [...xToY.keys()];

  const [waitingRows, roadRows, notStartedRows, lastLeft, lastStops] = await Promise.all([
    findWaitingBuses(xIds, yIds),
    findRoadBuses(xIds),
    findNotStarted(yIds, PLACEHOLDERS.notStartedMaxHours),
    findLastDeparture(xIds),
    findLastStops(xIds),
  ]);
  const hidden = await findHiddenIds([
    ...waitingRows.map((w) => w.id),
    ...roadRows.map((r) => r.id),
  ]);

  type Built = DepartureItem & { group: 'waiting' | 'road' | 'not_started'; order: number };
  const built: Built[] = [];
  const waitingInfo: { id: number; arrivedMs: number; overdue: boolean }[] = [];

  // Waiting at the terminal
  for (const w of waitingRows) {
    if (hidden.has(w.id)) continue;
    // Not flipped yet: leaves on the opposite direction. Flipped (crew tap) or route changed:
    // leaves on its current direction.
    const nextId =
      w.routeDirectionId === w.fromDirectionId ? xToY.get(w.fromDirectionId)?.yId : w.routeDirectionId;
    const dir = nextId === undefined ? undefined : yById.get(nextId);
    if (!dir) continue;

    const cv = crowdingView(w.crowding, w.crowdingSetAt, now);
    const elapsedSec = (now.getTime() - w.arrivedAt.getTime()) / 1000;
    const v = waitingDeparture(elapsedSec, cv.code === 'full', w.departingNowAt !== null);
    const overdue = v.reason === 'overdue';
    waitingInfo.push({ id: w.id, arrivedMs: w.arrivedAt.getTime(), overdue });
    built.push({
      busId: w.id,
      kind: 'waiting',
      routeNumber: dir.routeNumber,
      directionName: dir.directionName,
      code: v.code,
      reason: v.reason,
      lowMin: v.lowMin,
      highMin: v.highMin,
      boarding: false,
      crowding: cv,
      group: 'waiting',
      order: w.arrivedAt.getTime(),
    });
  }

  // On the road toward the terminal
  for (const r of roadRows) {
    if (hidden.has(r.id)) continue;
    const dir = xToY.get(r.routeDirectionId);
    const terminalStopId = lastStops.get(r.routeDirectionId);
    if (!dir || terminalStopId === undefined) continue;

    const est = await estimateForBus(r.id, now);
    const toTerminal = est?.arrivals.find((a) => a.stopId === terminalStopId);
    if (!est || !toTerminal) continue;

    const cv = crowdingView(r.crowding, r.crowdingSetAt, now);
    if (toTerminal.code === 'no_estimate') {
      built.push({
        busId: r.id, kind: 'on_the_road', routeNumber: dir.routeNumber, directionName: dir.directionName,
        code: 'no_estimate', reason: 'no_signal', lowMin: null, highMin: null, boarding: false, crowding: cv,
        group: 'road', order: Number.MAX_SAFE_INTEGER,
      });
      continue;
    }
    const dep = upcomingDeparture(toTerminal.lowMin, toTerminal.highMin);
    built.push({
      busId: r.id, kind: 'on_the_road', routeNumber: dir.routeNumber, directionName: dir.directionName,
      code: 'estimate', reason: null, lowMin: dep.lowMin, highMin: dep.highMin, boarding: false, crowding: cv,
      group: 'road', order: toTerminal.etaSec ?? Number.MAX_SAFE_INTEGER - 1,
    });
  }

  // Assigned, not started
  for (const n of notStartedRows) {
    const dir = yById.get(n.routeDirectionId);
    if (!dir) continue;
    built.push({
      busId: n.id, kind: 'not_started', routeNumber: dir.routeNumber, directionName: dir.directionName,
      code: 'assigned_not_started', reason: null, lowMin: null, highMin: null, boarding: false, crowding: null,
      group: 'not_started', order: n.createdAt.getTime(),
    });
  }

  const boardingId = pickBoarding(waitingInfo);
  const items = sortDepartures(built).map(({ group, order, ...item }) => ({
    ...item,
    boarding: item.busId === boardingId && item.kind === 'waiting',
  }));

  const visible = items.filter((i) => i.code === 'departing_soon' || i.code === 'estimate').length;

  return {
    startingPoint: true,
    items,
    waitingCount: waitingInfo.filter((w) => !w.overdue).length,
    boardingBusId: boardingId,
    lastBusLeftMinAgo: minutesAgo(lastLeft, now),
    typicalGap: visible === 0 ? typicalGap() : null,
  };
}
