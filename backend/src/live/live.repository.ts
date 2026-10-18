import { sql } from 'drizzle-orm';
import { db } from '../db/index';

// Null when the direction does not exist.
export async function findDirection(routeDirectionId: number) {
  const res = await db.execute(sql`
    SELECT rd.id, r.route_number, rd.direction_name
    FROM route_directions rd
    JOIN routes r ON r.id = rd.route_id
    WHERE rd.id = ${routeDirectionId}`);
  const r = (res.rows as any[])[0];
  return r
    ? {
        routeDirectionId: Number(r.id),
        routeNumber: String(r.route_number),
        directionName: String(r.direction_name),
      }
    : null;
}

// Newest map position of each shift on this direction.
// Same filter as the ETA code (progress is not null), so both read the same point.
export async function findLatestPositions(
  assignmentIds: number[],
  routeDirectionId: number,
): Promise<Map<number, { lat: number; lng: number }>> {
  if (assignmentIds.length === 0) return new Map();
  const ids = sql.join(assignmentIds.map((id) => sql`${id}`), sql`, `);
  const res = await db.execute(sql`
    SELECT DISTINCT ON (assignment_id)
           assignment_id, ST_Y(location) AS lat, ST_X(location) AS lng
    FROM location_pings
    WHERE assignment_id IN (${ids})
      AND route_direction_id = ${routeDirectionId}
      AND progress IS NOT NULL
    ORDER BY assignment_id, recorded_at DESC`);
  const out = new Map<number, { lat: number; lng: number }>();
  for (const r of res.rows as any[]) {
    out.set(Number(r.assignment_id), { lat: Number(r.lat), lng: Number(r.lng) });
  }
  return out;
}
