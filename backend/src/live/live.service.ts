import { findDirection, findLatestPositions } from './live.repository';
import { findRunningBuses, findHiddenAssignmentIds } from '../arrivals/arrivals.repository';
import { getStopsOnPath } from '../eta/eta.repository';
import { describeBus } from '../eta/eta.service';
import { crowdingView } from '../crowding/crowding.rules';

export type LiveResult =
  | { kind: 'not_found' }
  | { kind: 'stop_not_on_route' }
  | { kind: 'ok'; data: any };

// Every bus running on one route direction, with its place along the road. With stopId, each bus
// also says whether it passed that stop. Same rules as arrivals: only moving regular buses,
// and buses with an open wrong-way or off-path warning are hidden.
export async function getRouteLive(routeDirectionId: number, stopId: number | null): Promise<LiveResult> {
  const direction = await findDirection(routeDirectionId);
  if (!direction) return { kind: 'not_found' };

  const path = await getStopsOnPath(routeDirectionId);
  if (!path) {
    return { kind: 'ok', data: { route: { ...direction, lengthM: null }, stops: [], buses: [] } };
  }
  if (stopId !== null && !path.stops.some((s) => s.stopId === stopId)) {
    return { kind: 'stop_not_on_route' };
  }

  const now = new Date();
  const running = await findRunningBuses([routeDirectionId]);
  const hidden = await findHiddenAssignmentIds(running.map((b) => b.id));
  const visible = running.filter((b) => !hidden.has(b.id));
  const positions = await findLatestPositions(visible.map((b) => b.id), routeDirectionId);

  const buses = [];
  for (const bus of visible) {
    const view = await describeBus(bus.id, now);
    if (!view) continue; // no points yet

    const ahead = view.stops.find((s) => !s.passed) ?? null; // stops are in order
    const forStop = stopId === null ? null : view.stops.find((s) => s.stopId === stopId) ?? null;

    buses.push({
      busId: bus.id,
      progress: view.progress,
      position: positions.get(bus.id) ?? null,
      fresh: view.fresh,
      pointAgeSec: view.pointAgeSec,
      nextStop: ahead ? { stopId: ahead.stopId, placeName: ahead.placeName } : null,
      forStop: forStop
        ? { stopId: forStop.stopId, passed: forStop.passed, distanceM: Math.round(forStop.distanceM) }
        : null,
      crowding: crowdingView(bus.crowding, bus.crowdingSetAt, now),
    });
  }
  buses.sort((a, b) => b.progress - a.progress); // furthest along the road first

  return {
    kind: 'ok',
    data: {
      route: { ...direction, lengthM: Math.round(path.lenM) },
      stops: path.stops.map((s) => ({
        stopId: s.stopId,
        stopOrder: s.stopOrder,
        placeName: s.placeName,
        side: s.side,
        progress: s.progress,
      })),
      buses,
    },
  };
}
