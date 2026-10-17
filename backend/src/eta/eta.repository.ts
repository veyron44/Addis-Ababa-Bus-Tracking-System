import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type StopOnPath = {
  stopId: number;
  stopOrder: number;
  placeName: string;
  side: string | null;
  progress: number; // 0 to 1 along the road
};

export async function getStopsOnPath(
  routeDirectionId: number,
): Promise<{ lenM: number; stops: StopOnPath[] } | null> {
  const res = await db.execute(sql`
    SELECT ST_Length(rd.path::geography) AS len,
           rs.stop_id, rs.stop_order, s.place_name, s.side,
           ST_LineLocatePoint(rd.path, s.location) AS progress
    FROM route_directions rd
    JOIN route_stops rs ON rs.route_direction_id = rd.id
    JOIN stops s ON s.id = rs.stop_id
    WHERE rd.id = ${routeDirectionId} AND rd.path IS NOT NULL
    ORDER BY rs.stop_order`);
  const rows = res.rows as any[];
  if (rows.length === 0) return null;
  return {
    lenM: Number(rows[0].len),
    stops: rows.map((r) => ({
      stopId: Number(r.stop_id),
      stopOrder: Number(r.stop_order),
      placeName: String(r.place_name),
      side: r.side === null ? null : String(r.side),
      progress: Number(r.progress),
    })),
  };
}

// Newest first. Stopped points are kept: they repeat the old progress, which gives speed 0.
export async function getRecentPoints(
  assignmentId: number,
  routeDirectionId: number,
  limit: number,
): Promise<{ time: Date; progress: number }[]> {
  const res = await db.execute(sql`
    SELECT recorded_at, progress
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND progress IS NOT NULL
    ORDER BY recorded_at DESC
    LIMIT ${limit}`);
  return (res.rows as any[]).map((r) => ({ time: new Date(r.recorded_at), progress: Number(r.progress) }));
}

export async function getAssignmentBasics(assignmentId: number) {
  const res = await db.execute(sql`
    SELECT id, status, route_direction_id FROM assignments WHERE id = ${assignmentId}`);
  const r = (res.rows as any[])[0];
  return r
    ? { id: Number(r.id), status: String(r.status), routeDirectionId: Number(r.route_direction_id) }
    : null;
}

// Used by the show-eta script.
export async function findLatestRunning() {
  const res = await db.execute(sql`
    SELECT id FROM assignments
    WHERE status IN ('on_trip', 'at_terminal')
    ORDER BY id DESC LIMIT 1`);
  const r = (res.rows as any[])[0];
  return r ? Number(r.id) : null;
}