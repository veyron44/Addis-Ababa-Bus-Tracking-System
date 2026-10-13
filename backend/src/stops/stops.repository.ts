import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type StopRow = {
  id: number;
  place_name: string;
  place_name_am: string | null;
  side: string | null;
  lng: number;
  lat: number;
  route_number: string | null;
  direction_name: string | null;
};


function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => '\\' + c);
}


export async function searchStopRows(text: string): Promise<StopRow[]> {
  const pattern = `%${escapeLike(text)}%`;
  const result = await db.execute(sql`
    SELECT s.id,
           s.place_name,
           s.place_name_am,
           s.side,
           ST_X(s.location) AS lng,
           ST_Y(s.location) AS lat,
           r.route_number,
           rd.direction_name
    FROM stops s
    LEFT JOIN route_stops rs ON rs.stop_id = s.id
    LEFT JOIN route_directions rd ON rd.id = rs.route_direction_id
    LEFT JOIN routes r ON r.id = rd.route_id
    WHERE s.place_name ILIKE ${pattern}
       OR s.place_name_am ILIKE ${pattern}
    ORDER BY s.place_name, s.id, r.route_number, rd.direction_name`);
  return result.rows as unknown as StopRow[];
}