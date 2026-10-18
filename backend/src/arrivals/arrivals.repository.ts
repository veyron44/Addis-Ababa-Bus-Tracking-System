import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { assignments, stops, warnings } from '../db/schema';

export async function findStop(stopId: number) {
  const [row] = await db
    .select({
      id: stops.id,
      placeName: stops.placeName,
      placeNameAm: stops.placeNameAm,
      side: stops.side,
    })
    .from(stops)
    .where(eq(stops.id, stopId))
    .limit(1);
  return row ?? null;
}

export async function findDirectionsServingStop(stopId: number) {
  const res = await db.execute(sql`
    SELECT rs.route_direction_id, r.route_number, rd.direction_name
    FROM route_stops rs
    JOIN route_directions rd ON rd.id = rs.route_direction_id
    JOIN routes r ON r.id = rd.route_id
    WHERE rs.stop_id = ${stopId}
    ORDER BY r.route_number, rd.direction_name`);
  return (res.rows as any[]).map((r) => ({
    routeDirectionId: Number(r.route_direction_id),
    routeNumber: String(r.route_number),
    directionName: String(r.direction_name),
  }));
}

// Buses on the road on these directions. Only regular service is ever shown to riders.
export async function findRunningBuses(directionIds: number[]) {
  if (directionIds.length === 0) return [];
  return db
    .select({
      id: assignments.id,
      routeDirectionId: assignments.routeDirectionId,
      crowding: assignments.crowding,
      crowdingSetAt: assignments.crowdingSetAt,
    })
    .from(assignments)
    .where(
      and(
        inArray(assignments.routeDirectionId, directionIds),
        eq(assignments.status, 'on_trip'),
        eq(assignments.serviceType, 'regular'),
      ),
    );
}

// Buses with an open wrong-way or off-path warning are hidden from riders.
export async function findHiddenAssignmentIds(assignmentIds: number[]): Promise<Set<number>> {
  if (assignmentIds.length === 0) return new Set();
  const rows = await db
    .select({ id: warnings.assignmentId })
    .from(warnings)
    .where(
      and(
        isNull(warnings.resolvedAt),
        inArray(warnings.type, ['wrong_way', 'off_path']),
        inArray(warnings.assignmentId, assignmentIds),
      ),
    );
  return new Set(rows.map((r) => r.id));
}
