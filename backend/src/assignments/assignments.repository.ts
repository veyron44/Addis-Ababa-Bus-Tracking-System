import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '../db/index';
import {
  assignments,
  assignmentChanges,
  departures,
  vehicles,
  routeDirections,
  routes,
} from '../db/schema';

type Status = typeof assignments.$inferSelect['status'];
export type CrowdingStatus = typeof assignments.$inferSelect['crowding'];

export async function findActiveAssignment(driverId: number) {
  const [row] = await db
    .select({
      id: assignments.id,
      status: assignments.status,
      serviceType: assignments.serviceType,
      startedAt: assignments.startedAt,
      crowding: assignments.crowding,
      crowdingSetAt: assignments.crowdingSetAt,
      plate: vehicles.plate,
      routeDirectionId: assignments.routeDirectionId,
      routeNumber: routes.routeNumber,
      directionName: routeDirections.directionName,
    })
    .from(assignments)
    .innerJoin(vehicles, eq(vehicles.id, assignments.vehicleId))
    .innerJoin(routeDirections, eq(routeDirections.id, assignments.routeDirectionId))
    .innerJoin(routes, eq(routes.id, routeDirections.routeId))
    .where(and(eq(assignments.driverId, driverId), ne(assignments.status, 'ended')))
    .orderBy(desc(assignments.createdAt))
    .limit(1);
  return row ?? null;
}

// Only succeeds if the shift is still assigned, Crowding starts as not reported 
export async function markStarted(id: number) {
  const [row] = await db
    .update(assignments)
    .set({ status: 'on_trip', startedAt: new Date(), crowding: 'not_reported', crowdingSetAt: null })
    .where(and(eq(assignments.id, id), eq(assignments.status, 'assigned')))
    .returning({ id: assignments.id });
  return row ?? null;
}

// Ends the shift and closes its open warnings.
export async function markEnded(id: number) {
  await db
    .update(assignments)
    .set({ status: 'ended', endedAt: new Date() })
    .where(eq(assignments.id, id));
  await db.execute(sql`
    UPDATE warnings
    SET resolved_at = now()
    WHERE assignment_id = ${id} AND resolved_at IS NULL`);
}

export async function findDirection(id: number) {
  const [row] = await db
    .select({ id: routeDirections.id })
    .from(routeDirections)
    .where(eq(routeDirections.id, id))
    .limit(1);
  return row ?? null;
}

// Changes the direction and logs it
// Returns false if the status changed in the meantime 
export async function changeDirection(
  assignmentId: number,
  fromId: number,
  toId: number,
  status: Status,
) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(assignments)
      .set({ routeDirectionId: toId })
      .where(
        and(
          eq(assignments.id, assignmentId),
          inArray(assignments.status, ['assigned', 'at_terminal']),
        ),
      )
      .returning({ id: assignments.id });
    if (updated.length === 0) return false;

    await tx.insert(assignmentChanges).values({
      assignmentId,
      fromRouteDirectionId: fromId,
      toRouteDirectionId: toId,
      statusAtChange: status,
    });
    return true;
  });
}

// The other direction of the same route
export async function findOppositeDirection(routeDirectionId: number) {
  const res = await db.execute(sql`
    SELECT rd2.id
    FROM route_directions rd
    JOIN route_directions rd2 ON rd2.route_id = rd.route_id AND rd2.id <> rd.id
    WHERE rd.id = ${routeDirectionId}`);
  const rows = res.rows as { id: number }[];
  return rows.length === 1 ? Number(rows[0].id) : null;
}

// The terminal arrival where this shift is waiting right now (arrived, not departed).
export async function findOpenDeparture(assignmentId: number) {
  const res = await db.execute(sql`
    SELECT id, from_route_direction_id, flip_type
    FROM departures
    WHERE assignment_id = ${assignmentId} AND departed_at IS NULL
    ORDER BY arrived_at DESC
    LIMIT 1`);
  const r = (res.rows as any[])[0];
  return r
    ? {
        id: Number(r.id),
        fromRouteDirectionId: Number(r.from_route_direction_id),
        flipType: (r.flip_type ?? null) as string | null,
      }
    : null;
}

// Flips the shift to the opposite direction and marks the arrival as confirmed.
export async function confirmFlip(assignmentId: number, departureId: number, toDirectionId: number) {
  return db.transaction(async (tx) => {
    const marked = await tx.execute(sql`
      UPDATE departures
      SET flip_type = 'confirmed', to_route_direction_id = ${toDirectionId}
      WHERE id = ${departureId}
        AND flip_type IS NULL
        AND departed_at IS NULL
        AND EXISTS (SELECT 1 FROM assignments a WHERE a.id = ${assignmentId} AND a.status = 'at_terminal')
      RETURNING id`);
    if (marked.rows.length === 0) return false;

    await tx
      .update(assignments)
      .set({ routeDirectionId: toDirectionId })
      .where(eq(assignments.id, assignmentId));
    return true;
  });
}

// The  driver reports how full the bus is. Only while the shift is running.

export async function setCrowding(id: number, status: CrowdingStatus) {
  const res = await db.execute(sql`
    UPDATE assignments
    SET crowding = ${status}::crowding_status, crowding_set_at = now()
    WHERE id = ${id} AND status IN ('on_trip', 'at_terminal')
    RETURNING id`);
  return res.rows.length > 0;
}

// "Departing now": marks the terminal stay, and can set crowding in the same tap.
export async function markDepartingNow(
  assignmentId: number,
  departureId: number,
  crowding: CrowdingStatus | null,
) {
  return db.transaction(async (tx) => {
    if (crowding !== null) {
      await tx.execute(sql`
        UPDATE assignments
        SET crowding = ${crowding}::crowding_status, crowding_set_at = now()
        WHERE id = ${assignmentId} AND status = 'at_terminal'`);
    }
    const res = await tx.execute(sql`
      UPDATE departures
      SET departing_now_at = now()
      WHERE id = ${departureId} AND departed_at IS NULL AND departing_now_at IS NULL
      RETURNING id`);
    return res.rows.length > 0;
  });
}
