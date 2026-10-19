import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { admins, adminSessions } from '../db/schema';

export async function findAdminByUsername(username: string) {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);
  return admin ?? null;
}

export async function createAdminSession(adminId: number, tokenHash: string, expiresAt: Date) {
  await db.insert(adminSessions).values({ adminId, tokenHash, expiresAt });
}

export async function findValidAdminSession(tokenHash: string) {
  const [row] = await db
    .select({ adminId: admins.id, name: admins.name })
    .from(adminSessions)
    .innerJoin(admins, eq(admins.id, adminSessions.adminId))
    .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export type ActiveShiftRow = {
  id: number;
  status: string;
  serviceType: string;
  startedAt: Date | null;
  lastPingAt: Date | null;
  crowding: string;
  crowdingSetAt: Date | null;
  plate: string;
  crew: string;
  routeNumber: string;
  directionName: string;
  routeDirectionId: number;
  lat: number | null;
  lng: number | null;
  progress: number | null;
  positionAt: Date | null;
};

// Every shift that is not ended (assigned, on a trip, or at a terminal), all service types.
export async function findActiveShifts(): Promise<ActiveShiftRow[]> {
  const res = await db.execute(sql`
    SELECT a.id, a.status, a.service_type, a.started_at, a.last_ping_at,
           a.crowding, a.crowding_set_at, a.route_direction_id,
           v.plate, d.name AS crew, r.route_number, rd.direction_name,
           p.lat, p.lng, p.progress, p.recorded_at AS position_at
    FROM assignments a
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN drivers d ON d.id = a.driver_id
    JOIN route_directions rd ON rd.id = a.route_direction_id
    JOIN routes r ON r.id = rd.route_id
    LEFT JOIN LATERAL (
      SELECT ST_Y(lp.location) AS lat, ST_X(lp.location) AS lng, lp.progress, lp.recorded_at
      FROM location_pings lp
      WHERE lp.assignment_id = a.id
      ORDER BY lp.recorded_at DESC
      LIMIT 1
    ) p ON true
    WHERE a.status IN ('assigned', 'on_trip', 'at_terminal')
    ORDER BY r.route_number, a.id`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    status: String(r.status),
    serviceType: String(r.service_type),
    startedAt: r.started_at ? new Date(r.started_at) : null,
    lastPingAt: r.last_ping_at ? new Date(r.last_ping_at) : null,
    crowding: String(r.crowding),
    crowdingSetAt: r.crowding_set_at ? new Date(r.crowding_set_at) : null,
    plate: String(r.plate),
    crew: String(r.crew),
    routeNumber: String(r.route_number),
    directionName: String(r.direction_name),
    routeDirectionId: Number(r.route_direction_id),
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
    progress: r.progress === null ? null : Number(r.progress),
    positionAt: r.position_at ? new Date(r.position_at) : null,
  }));
}

export type OpenWarningRow = {
  assignmentId: number;
  type: string;
  severity: string;
  detail: string | null;
  startedAt: Date;
};

export async function findOpenWarnings(assignmentIds: number[]): Promise<OpenWarningRow[]> {
  if (assignmentIds.length === 0) return [];
  const ids = sql.join(assignmentIds.map((id) => sql`${id}`), sql`, `);
  const res = await db.execute(sql`
    SELECT assignment_id, type, severity, detail, started_at
    FROM warnings
    WHERE resolved_at IS NULL AND assignment_id IN (${ids})
    ORDER BY started_at`);
  return (res.rows as any[]).map((r) => ({
    assignmentId: Number(r.assignment_id),
    type: String(r.type),
    severity: String(r.severity),
    detail: r.detail === null ? null : String(r.detail),
    startedAt: new Date(r.started_at),
  }));
}

export type AssignmentChangeRow = {
  id: number;
  assignmentId: number;
  statusAtChange: string;
  changedAt: Date;
  plate: string;
  crew: string;
  fromRoute: string;
  fromDirection: string;
  toRoute: string;
  toDirection: string;
};

// Newest first. assignmentId null means every shift.
export async function findAssignmentChanges(
  limit: number,
  assignmentId: number | null,
): Promise<AssignmentChangeRow[]> {
  const res = await db.execute(sql`
    SELECT c.id, c.assignment_id, c.status_at_change, c.changed_at,
           v.plate, d.name AS crew,
           fr.route_number AS from_route, fd.direction_name AS from_direction,
           tr.route_number AS to_route,   td.direction_name AS to_direction
    FROM assignment_changes c
    JOIN assignments a ON a.id = c.assignment_id
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN drivers d ON d.id = a.driver_id
    JOIN route_directions fd ON fd.id = c.from_route_direction_id
    JOIN routes fr ON fr.id = fd.route_id
    JOIN route_directions td ON td.id = c.to_route_direction_id
    JOIN routes tr ON tr.id = td.route_id
    WHERE (${assignmentId}::int IS NULL OR c.assignment_id = ${assignmentId}::int)
    ORDER BY c.changed_at DESC, c.id DESC
    LIMIT ${limit}`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    assignmentId: Number(r.assignment_id),
    statusAtChange: String(r.status_at_change),
    changedAt: new Date(r.changed_at),
    plate: String(r.plate),
    crew: String(r.crew),
    fromRoute: String(r.from_route),
    fromDirection: String(r.from_direction),
    toRoute: String(r.to_route),
    toDirection: String(r.to_direction),
  }));
}

// How often crews change the route the admin gave them.
export async function getChangeSummary() {
  const res = await db.execute(sql`
    SELECT (SELECT count(*) FROM assignment_changes) AS changes,
           (SELECT count(DISTINCT assignment_id) FROM assignment_changes) AS shifts_changed,
           (SELECT count(*) FROM assignments) AS shifts_total`);
  const r = (res.rows as any[])[0];
  return {
    totalChanges: Number(r.changes),
    shiftsWithChange: Number(r.shifts_changed),
    totalShifts: Number(r.shifts_total),
  };
}
