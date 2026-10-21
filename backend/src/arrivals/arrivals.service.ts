import {
  findStop,
  findDirectionsServingStop,
  findRunningBuses,
  findHiddenAssignmentIds,
} from './arrivals.repository';
import { estimateForBus, travelSecondsToStop } from '../eta/eta.service';
import { getStopsOnPath } from '../eta/eta.repository';
import { crowdingView } from '../crowding/crowding.rules';
import { sortArrivals, upcomingAtStop, pickUpcoming } from './arrivals.rules';
import { getDepartures } from '../departures/departures.service';

// Buses that will reach this stop but are not on the road yet: waiting at the first stop of the
// road, or still coming back to it. Their time is the leave time at the first stop plus the drive
// from there, so it is marked less certain. A first stop shows its own departures instead.
async function findUpcoming(
  directions: { routeDirectionId: number; routeNumber: string; directionName: string }[],
  stopId: number,
  now: Date,
) {
  const out = [];
  for (const dir of directions) {
    const path = await getStopsOnPath(dir.routeDirectionId);
    const here = path?.stops.find((s) => s.stopId === stopId);
    if (!path || !here || here.stopOrder === 1) continue;

    const travelSec = await travelSecondsToStop(path, stopId, now);
    if (travelSec === null) continue;

    const departures = await getDepartures(path.stops[0].stopId, dir.routeNumber, now);
    for (const item of departures.items) {
      if (item.routeNumber !== dir.routeNumber || item.directionName !== dir.directionName) continue;
      const t = upcomingAtStop(item, travelSec);
      if (!t) continue;
      out.push({
        busId: item.busId,
        routeNumber: dir.routeNumber,
        directionName: dir.directionName,
        kind: item.kind,
        lowMin: t.lowMin,
        highMin: t.highMin,
        lessCertain: true as const,
        crowding: item.crowding,
      });
    }
  }
  return pickUpcoming(out);
}

// Buses coming to one stop, soonest first. Null for an unknown stop.
export async function getArrivals(stopId: number, routeFilter: string | null) {
  const stop = await findStop(stopId);
  if (!stop) return null;

  const serves = await findDirectionsServingStop(stopId);
  const relevant = routeFilter ? serves.filter((s) => s.routeNumber === routeFilter) : serves;
  const byDirection = new Map(relevant.map((d) => [d.routeDirectionId, d]));

  const buses = await findRunningBuses(relevant.map((d) => d.routeDirectionId));
  const hidden = await findHiddenAssignmentIds(buses.map((b) => b.id));

  const now = new Date();
  const items = [];
  for (const bus of buses) {
    if (hidden.has(bus.id)) continue; // wrong way or off the road: do not show a wrong ETA

    const est = await estimateForBus(bus.id, now);
    if (!est) continue; // no points yet

    const here = est.arrivals.find((a) => a.stopId === stopId);
    if (!here) continue; // the bus has already passed this stop

    const dir = byDirection.get(bus.routeDirectionId)!;
    items.push({
      busId: bus.id,
      routeNumber: dir.routeNumber,
      directionName: dir.directionName,
      code: here.code,
      reason: here.reason,
      lowMin: here.lowMin,
      highMin: here.highMin,
      basis: here.basis,
      distanceM: Math.round(here.distanceM),
      etaSec: here.etaSec,
      crowding: crowdingView(bus.crowding, bus.crowdingSetAt, now),
      pointAgeSec: est.bus.pointAgeSec,
      standingMin: est.bus.standingMin,
      learnedShare: here.learnedShare,
    });
  }

  const upcoming = await findUpcoming(relevant, stopId, now);

  return {
    stop,
    routes: serves.map((s) => ({ routeNumber: s.routeNumber, directionName: s.directionName })),
    arrivals: sortArrivals(items).map(({ etaSec, ...rest }) => rest),
    // Buses not on the road yet that will pass this stop, less certain than the ones above.
    upcoming,
    // Filled only when this stop is the first stop of a route (a terminal).
    departures: await getDepartures(stopId, routeFilter, now),
  };
}
