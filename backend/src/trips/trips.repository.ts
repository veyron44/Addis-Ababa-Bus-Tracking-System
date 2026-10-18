import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type TripRow = {
  route_direction_id: number;
  route_number: string;
  direction_name: string;
  from_stop_id: number;
  from_place_name: string;
  from_side: string | null;
  from_order: number;
  to_stop_id: number;
  to_place_name: string;
  to_side: string | null;
  to_order: number;
};

// Route directions where the "from" place comes before the "to" place.
// DISTINCT ON keeps one row per direction (the nearest match) in case a name appears twice.
export async function findTripRows(from: string, to: string): Promise<TripRow[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (rd.id)
           rd.id            AS route_direction_id,
           r.route_number,
           rd.direction_name,
           sa.id            AS from_stop_id,
           sa.place_name    AS from_place_name,
           sa.side          AS from_side,
           a.stop_order     AS from_order,
           sb.id            AS to_stop_id,
           sb.place_name    AS to_place_name,
           sb.side          AS to_side,
           b.stop_order     AS to_order
    FROM route_directions rd
    JOIN routes r      ON r.id = rd.route_id
    JOIN route_stops a ON a.route_direction_id = rd.id
    JOIN stops sa      ON sa.id = a.stop_id
    JOIN route_stops b ON b.route_direction_id = rd.id AND b.stop_order > a.stop_order
    JOIN stops sb      ON sb.id = b.stop_id
    WHERE (lower(sa.place_name) = lower(${from}) OR sa.place_name_am = ${from})
      AND (lower(sb.place_name) = lower(${to})   OR sb.place_name_am = ${to})
    ORDER BY rd.id, (b.stop_order - a.stop_order)`);
  return result.rows as unknown as TripRow[];
}