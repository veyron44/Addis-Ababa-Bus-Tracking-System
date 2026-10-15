import { sql } from 'drizzle-orm';
import { db } from '../db/index';

// Open a warning if one isn't already open.
export async function openWarning(
  assignmentId: number,
  type: string,
  detail?: string,
  severity: string = 'warning',
) {
  const res = await db.execute(sql`
    INSERT INTO warnings (assignment_id, type, severity, detail)
    SELECT ${assignmentId}::int, ${type}::text, ${severity}::text, ${detail ?? null}::text
    WHERE NOT EXISTS (
      SELECT 1 FROM warnings
      WHERE assignment_id = ${assignmentId} AND type = ${type} AND resolved_at IS NULL)
    RETURNING id`);
  return res.rows.length > 0;
}

// Close an open warning.
export async function closeWarning(assignmentId: number, type: string) {
  const res = await db.execute(sql`
    UPDATE warnings SET resolved_at = now()
    WHERE assignment_id = ${assignmentId} AND type = ${type} AND resolved_at IS NULL
    RETURNING id`);
  return res.rows.length > 0;
}

// Check if the bus should be hidden from riders.
export async function hasOpenHidingWarning(assignmentId: number) {
  const res = await db.execute(sql`
    SELECT 1 FROM warnings
    WHERE assignment_id = ${assignmentId}
      AND type IN ('wrong_way', 'off_path')
      AND resolved_at IS NULL
    LIMIT 1`);
  return res.rows.length > 0;
}

export type RecentPing = { time: Date; progress: number | null; pathDistanceM: number | null };

export async function getShiftBasics(assignmentId: number) {
  const res = await db.execute(sql`
    SELECT a.status, a.route_direction_id, ST_Length(rd.path::geography) AS len
    FROM assignments a
    JOIN route_directions rd ON rd.id = a.route_direction_id
    WHERE a.id = ${assignmentId}`);
  const r = (res.rows as any[])[0];
  return r
    ? { status: String(r.status), routeDirectionId: Number(r.route_direction_id), pathLenM: Number(r.len) }
    : null;
}

// Load recent moving points for this route, newest first.
export async function loadRecentMoving(
  assignmentId: number,
  routeDirectionId: number,
  limit: number,
): Promise<RecentPing[]> {
  const res = await db.execute(sql`
    SELECT recorded_at, progress, path_distance_m
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND stationary = false
      AND progress IS NOT NULL
    ORDER BY recorded_at DESC
    LIMIT ${limit}`);
  return (res.rows as any[]).map((r) => ({
    time: new Date(r.recorded_at),
    progress: r.progress === null ? null : Number(r.progress),
    pathDistanceM: r.path_distance_m === null ? null : Number(r.path_distance_m),
  }));
}

// Check if the route direction change is still pending.
export async function isFlipPending(
  assignmentId: number,
  routeDirectionId: number,
  at: Date,
  giveUpMin: number,
) {
  const atIso = at.toISOString();
  const res = await db.execute(sql`
    SELECT 1 FROM departures
    WHERE assignment_id = ${assignmentId}
      AND from_route_direction_id = ${routeDirectionId}
      AND departed_at IS NOT NULL
      AND flip_type IS NULL
      AND departed_at > ${atIso}::timestamptz - make_interval(mins => ${giveUpMin}::int)
    LIMIT 1`);
  return res.rows.length > 0;
}

// Time-based warnings, checked by the sweeper.

// Find running shifts that haven't sent a ping in time.
export async function findSilentShifts(silentSec: number): Promise<{ id: number; silentSec: number }[]> {
  const res = await db.execute(sql`
    SELECT id,
           EXTRACT(EPOCH FROM (now() - COALESCE(last_ping_at, started_at)))::int AS silent
    FROM assignments
    WHERE status IN ('on_trip', 'at_terminal')
      AND COALESCE(last_ping_at, started_at) < now() - ${silentSec}::int * interval '1 second'`);
  return (res.rows as any[]).map((r) => ({ id: Number(r.id), silentSec: Number(r.silent) }));
}

// Close silence warnings that no longer apply.
export async function closeSilenceWarnings(silentSec: number): Promise<number> {
  const res = await db.execute(sql`
    UPDATE warnings w SET resolved_at = now()
    WHERE w.type = 'no_signal' AND w.resolved_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id = w.assignment_id
          AND a.status IN ('on_trip', 'at_terminal')
          AND COALESCE(a.last_ping_at, a.started_at) < now() - ${silentSec}::int * interval '1 second')
    RETURNING w.id`);
  return res.rows.length;
}

// Find buses that have waited too long at a terminal.
export async function findOverdueAtTerminal(maxWaitMin: number): Promise<{ id: number; waitedMin: number }[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (d.assignment_id)
           d.assignment_id AS id,
           (EXTRACT(EPOCH FROM (now() - d.arrived_at)) / 60)::int AS waited
    FROM departures d
    JOIN assignments a ON a.id = d.assignment_id
    WHERE a.status = 'at_terminal'
      AND d.departed_at IS NULL
      AND d.arrived_at < now() - ${maxWaitMin}::int * interval '1 minute'
    ORDER BY d.assignment_id, d.arrived_at DESC`);
  return (res.rows as any[]).map((r) => ({ id: Number(r.id), waitedMin: Number(r.waited) }));
}

// Close terminal warnings that no longer apply.
export async function closeOverdueWarnings(maxWaitMin: number): Promise<number> {
  const res = await db.execute(sql`
    UPDATE warnings w SET resolved_at = now()
    WHERE w.type = 'overdue_at_terminal' AND w.resolved_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM departures d
        JOIN assignments a ON a.id = d.assignment_id
        WHERE d.assignment_id = w.assignment_id
          AND a.status = 'at_terminal'
          AND d.departed_at IS NULL
          AND d.arrived_at < now() - ${maxWaitMin}::int * interval '1 minute')
    RETURNING w.id`);
  return res.rows.length;
}

// Close all warnings for ended shifts.
export async function closeWarningsOfEndedShifts(): Promise<number> {
  const res = await db.execute(sql`
    UPDATE warnings w SET resolved_at = now()
    FROM assignments a
    WHERE a.id = w.assignment_id
      AND a.status = 'ended'
      AND w.resolved_at IS NULL
    RETURNING w.id`);
  return res.rows.length;
}