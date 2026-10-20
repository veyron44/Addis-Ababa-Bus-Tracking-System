import { findTripRows } from './trips.repository';
import { getArrivals } from '../arrivals/arrivals.service';
import { sortOptions } from './trips.rules';

// Same codes as the stop screen.
type NextBus = {
  busId: number;
  source: 'arrival' | 'departure'; // 'departure' = a bus leaving from this terminal
  kind: string | null; // departures only: on_the_road, waiting, not_started
  code: string;
  reason: string | null;
  lowMin: number | null;
  highMin: number | null;
  boarding: boolean;
  crowding: unknown;
};

type Option = {
  routeNumber: string;
  directionName: string;
  routeDirectionId: number;
  toStopId: number;
  stopsAway: number; // stops from start to destination
  nextBus: NextBus | null; // null = no bus right now
};

type Trip = {
  waitAt: { stopId: number; placeName: string; side: string | null };
  options: Option[];
};

// Soonest bus of one route direction at one stop, from the arrivals answer.
// Buses on the road first; at a terminal, the departures list is used instead.
function pickNextBus(
  arrivalsResult: Awaited<ReturnType<typeof getArrivals>>,
  routeNumber: string,
  directionName: string,
): NextBus | null {
  if (!arrivalsResult) return null;
  const same = (x: { routeNumber: string; directionName: string }) =>
    x.routeNumber === routeNumber && x.directionName === directionName;

  // arrivals are already sorted soonest first
  const arrival = arrivalsResult.arrivals.find(same);
  if (arrival) {
    return {
      busId: arrival.busId,
      source: 'arrival',
      kind: null,
      code: arrival.code,
      reason: arrival.reason,
      lowMin: arrival.lowMin,
      highMin: arrival.highMin,
      boarding: false,
      crowding: arrival.crowding,
    };
  }

  const departure = arrivalsResult.departures?.items?.find(same);
  if (departure) {
    return {
      busId: departure.busId,
      source: 'departure',
      kind: departure.kind,
      code: departure.code,
      reason: departure.reason,
      lowMin: departure.lowMin,
      highMin: departure.highMin,
      boarding: departure.boarding,
      crowding: departure.crowding,
    };
  }
  return null;
}

export async function findTrips(from: string, to: string): Promise<Trip[]> {
  const rows = await findTripRows(from, to);

  const groups = new Map<number, Trip>();
  for (const row of rows) {
    const stopId = Number(row.from_stop_id);
    let trip = groups.get(stopId);
    if (!trip) {
      trip = {
        waitAt: { stopId, placeName: row.from_place_name, side: row.from_side },
        options: [],
      };
      groups.set(stopId, trip);
    }
    trip.options.push({
      routeNumber: row.route_number,
      directionName: row.direction_name,
      routeDirectionId: Number(row.route_direction_id),
      toStopId: Number(row.to_stop_id),
      stopsAway: Number(row.to_order) - Number(row.from_order),
      nextBus: null,
    });
  }

  const trips = [...groups.values()];

  // One arrivals lookup per waiting stop. Then the soonest bus goes first.
  for (const trip of trips) {
    const result = await getArrivals(trip.waitAt.stopId, null);
    for (const option of trip.options) {
      option.nextBus = pickNextBus(result, option.routeNumber, option.directionName);
    }
    trip.options = sortOptions(trip.options);
  }
  return trips;
}