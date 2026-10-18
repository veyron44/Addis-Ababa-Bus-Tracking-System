import {
  findStop,
  findDirectionsServingStop,
  findRunningBuses,
  findHiddenAssignmentIds,
} from './arrivals.repository';
import { estimateForBus } from '../eta/eta.service';
import { crowdingView } from '../crowding/crowding.rules';
import { sortArrivals } from './arrivals.rules';
import { getDepartures } from '../departures/departures.service';

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
    });
  }

  return {
    stop,
    routes: serves.map((s) => ({ routeNumber: s.routeNumber, directionName: s.directionName })),
    arrivals: sortArrivals(items).map(({ etaSec, ...rest }) => rest),
    // Filled only when this stop is the first stop of a route (a terminal).
    departures: await getDepartures(stopId, routeFilter, now),
  };
}
