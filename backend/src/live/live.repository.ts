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

// The road as a list of [lat, lng] points for the map, with the places of its stops.
// The line is simplified to about 3 m, so the answer stays small.
export async function findRouteShape(routeDirectionId: number): Promise<{
  line: [number, number][];
  stops: Map<number, { lat: number; lng: number }>;
}> {
  const lineRes = await db.execute(sql`
    SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(path, 0.00003)) AS geojson
    FROM route_directions
    WHERE id = ${routeDirectionId} AND path IS NOT NULL`);
  const geojson = (lineRes.rows as any[])[0]?.geojson;
  const coords: [number, number][] = geojson ? JSON.parse(geojson).coordinates : [];

  const stopRes = await db.execute(sql`
    SELECT s.id, ST_Y(s.location) AS lat, ST_X(s.location) AS lng
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    WHERE rs.route_direction_id = ${routeDirectionId}`);
  const stops = new Map<number, { lat: number; lng: number }>();
  for (const r of stopRes.rows as any[]) {
    stops.set(Number(r.id), { lat: Number(r.lat), lng: Number(r.lng) });
  }

  // GeoJSON is [lng, lat]. The map wants [lat, lng].
  return { line: coords.map(([lng, lat]) => [lat, lng] as [number, number]), stops };
}
