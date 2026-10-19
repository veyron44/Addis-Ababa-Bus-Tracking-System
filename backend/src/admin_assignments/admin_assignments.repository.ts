import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type ServiceType = 'regular' | 'premium' | 'special';

export type AssignmentRow = {
  id: number;
  status: string;
  serviceType: string;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  lastPingAt: Date | null;
  vehicleId: number;
  plate: string;
  driverId: number;
  crew: string;
  username: string;
  routeDirectionId: number;
  routeNumber: string;
  directionName: string;
};

const SELECT_ASSIGNMENT = sql`
  SELECT a.id, a.status, a.service_type, a.created_at, a.started_at, a.ended_at, a.last_ping_at,
         a.vehicle_id, v.plate, a.driver_id, d.name AS crew, d.username,
         a.route_direction_id, r.route_number, rd.direction_name
  FROM assignments a
  JOIN vehicles v ON v.id = a.vehicle_id
  JOIN drivers d ON d.id = a.driver_id
  JOIN route_directions rd ON rd.id = a.route_direction_id
  JOIN routes r ON r.id = rd.route_id`;

function toRow(r: any): AssignmentRow {
  return {
    id: Number(r.id),
    status: String(r.status),
    serviceType: String(r.service_type),
    createdAt: new Date(r.created_at),
    startedAt: r.started_at ? new Date(r.started_at) : null,
    endedAt: r.ended_at ? new Date(r.ended_at) : null,
    lastPingAt: r.last_ping_at ? new Date(r.last_ping_at) : null,
    vehicleId: Number(r.vehicle_id),
    plate: String(r.plate),
    driverId: Number(r.driver_id),
    crew: String(r.crew),
    username: String(r.username),
    routeDirectionId: Number(r.route_direction_id),
    routeNumber: String(r.route_number),
    directionName: String(r.direction_name),
  };
}

export type StatusFilter = 'unfinished' | 'all' | 'assigned' | 'on_trip' | 'at_terminal' | 'ended';

export async function listAssignments(status: StatusFilter, limit: number): Promise<AssignmentRow[]> {
  const where =
    status === 'all'
      ? sql`TRUE`
      : status === 'unfinished'
        ? sql`a.status <> 'ended'`
        : sql`a.status = ${status}::assignment_status`;
  const res = await db.execute(sql`${SELECT_ASSIGNMENT} WHERE ${where} ORDER BY a.id DESC LIMIT ${limit}`);
  return (res.rows as any[]).map(toRow);
}

export async function getAssignment(id: number): Promise<AssignmentRow | null> {
  const res = await db.execute(sql`${SELECT_ASSIGNMENT} WHERE a.id = ${id}`);
  const r = (res.rows as any[])[0];
  return r ? toRow(r) : null;
}

export async function listDirections() {
  const res = await db.execute(sql`
    SELECT rd.id, r.route_number, rd.direction_name
    FROM route_directions rd JOIN routes r ON r.id = rd.route_id
    ORDER BY r.route_number, rd.direction_name`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    routeNumber: String(r.route_number),
    directionName: String(r.direction_name),
  }));
}

export type CreateInput = {
  driverId: number;
  vehicleId: number;
  routeDirectionId: number;
  serviceType: ServiceType;
};
export type WriteFailure =
  | 'unknown_driver'
  | 'unknown_vehicle'
  | 'unknown_direction'
  | 'driver_busy'
  | 'vehicle_busy';

async function exists(tx: any, table: 'drivers' | 'vehicles' | 'route_directions', id: number, lock: boolean) {
  const t = sql.raw(table);
  const res = await tx.execute(
    lock ? sql`SELECT id FROM ${t} WHERE id = ${id} FOR UPDATE` : sql`SELECT id FROM ${t} WHERE id = ${id}`,
  );
  return res.rows.length > 0;
}

// A crew has at most one unfinished shift, and so does a vehicle (two phones cannot claim one bus).
// The crew and vehicle rows are locked while we check, so two admins cannot both win.
async function isBusy(tx: any, column: 'driver_id' | 'vehicle_id', id: number, exceptAssignment: number | null) {
  const col = sql.raw(column);
  const res = await tx.execute(sql`
    SELECT 1 FROM assignments
    WHERE ${col} = ${id} AND status <> 'ended'
      AND (${exceptAssignment}::int IS NULL OR id <> ${exceptAssignment}::int)
    LIMIT 1`);
  return res.rows.length > 0;
}

export async function insertAssignment(
  input: CreateInput,
): Promise<{ ok: true; id: number } | { ok: false; reason: WriteFailure }> {
  return db.transaction(async (tx) => {
    if (!(await exists(tx, 'drivers', input.driverId, true))) return { ok: false as const, reason: 'unknown_driver' as const };
    if (!(await exists(tx, 'vehicles', input.vehicleId, true))) return { ok: false as const, reason: 'unknown_vehicle' as const };
    if (!(await exists(tx, 'route_directions', input.routeDirectionId, false))) return { ok: false as const, reason: 'unknown_direction' as const };

    if (await isBusy(tx, 'driver_id', input.driverId, null)) return { ok: false as const, reason: 'driver_busy' as const };
    if (await isBusy(tx, 'vehicle_id', input.vehicleId, null)) return { ok: false as const, reason: 'vehicle_busy' as const };

    const res = await tx.execute(sql`
      INSERT INTO assignments (vehicle_id, driver_id, route_direction_id, service_type)
      VALUES (${input.vehicleId}, ${input.driverId}, ${input.routeDirectionId}, ${input.serviceType}::service_type)
      RETURNING id`);
    return { ok: true as const, id: Number((res.rows as any[])[0].id) };
  });
}

export type UpdateInput = {
  driverId?: number;
  vehicleId?: number;
  routeDirectionId?: number;
  serviceType?: ServiceType;
};

// The admin's default can change while the shift has not started. Only the service type can
// change after that (to take a running bus out of public view). This is NOT logged in
// assignment_changes, which must keep showing only what the crews override.
export async function patchAssignment(
  id: number,
  patch: UpdateInput,
): Promise<{ ok: true } | { ok: false; reason: WriteFailure | 'not_found' | 'ended' | 'already_started' }> {
  return db.transaction(async (tx) => {
    const curRes = await tx.execute(sql`
      SELECT status, driver_id, vehicle_id, route_direction_id, service_type
      FROM assignments WHERE id = ${id} FOR UPDATE`);
    const cur = (curRes.rows as any[])[0];
    if (!cur) return { ok: false as const, reason: 'not_found' as const };
    if (cur.status === 'ended') return { ok: false as const, reason: 'ended' as const };

    const driverId = patch.driverId ?? Number(cur.driver_id);
    const vehicleId = patch.vehicleId ?? Number(cur.vehicle_id);
    const directionId = patch.routeDirectionId ?? Number(cur.route_direction_id);
    const serviceType = patch.serviceType ?? (cur.service_type as ServiceType);

    const driverChanged = driverId !== Number(cur.driver_id);
    const vehicleChanged = vehicleId !== Number(cur.vehicle_id);
    const directionChanged = directionId !== Number(cur.route_direction_id);

    if ((driverChanged || vehicleChanged || directionChanged) && cur.status !== 'assigned') {
      return { ok: false as const, reason: 'already_started' as const };
    }

    if (driverChanged) {
      if (!(await exists(tx, 'drivers', driverId, true))) return { ok: false as const, reason: 'unknown_driver' as const };
      if (await isBusy(tx, 'driver_id', driverId, id)) return { ok: false as const, reason: 'driver_busy' as const };
    }
    if (vehicleChanged) {
      if (!(await exists(tx, 'vehicles', vehicleId, true))) return { ok: false as const, reason: 'unknown_vehicle' as const };
      if (await isBusy(tx, 'vehicle_id', vehicleId, id)) return { ok: false as const, reason: 'vehicle_busy' as const };
    }
    if (directionChanged && !(await exists(tx, 'route_directions', directionId, false))) {
      return { ok: false as const, reason: 'unknown_direction' as const };
    }

    await tx.execute(sql`
      UPDATE assignments
      SET driver_id = ${driverId}, vehicle_id = ${vehicleId},
          route_direction_id = ${directionId}, service_type = ${serviceType}::service_type
      WHERE id = ${id}`);
    return { ok: true as const };
  });
}

// Cancels a shift that has not started, or force-ends a stuck running one.
// The row is kept (history). Its open warnings are closed.
export async function closeAssignment(id: number): Promise<'ended' | 'not_found' | 'already_ended'> {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      UPDATE assignments SET status = 'ended', ended_at = now()
      WHERE id = ${id} AND status <> 'ended'
      RETURNING id`);
    if (res.rows.length > 0) {
      await tx.execute(sql`UPDATE warnings SET resolved_at = now() WHERE assignment_id = ${id} AND resolved_at IS NULL`);
      return 'ended' as const;
    }
    const still = await tx.execute(sql`SELECT 1 FROM assignments WHERE id = ${id}`);
    return still.rows.length > 0 ? ('already_ended' as const) : ('not_found' as const);
  });
}
