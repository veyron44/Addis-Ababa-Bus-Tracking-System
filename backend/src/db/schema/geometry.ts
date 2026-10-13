import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// One coordinate  [longitude, latitude]
export type Coord = [number, number];

export const point = customType<{ data: Coord; driverData: string }>({
  dataType: () => 'geometry(Point,4326)',
  toDriver: (value) =>
    sql`ST_SetSRID(ST_MakePoint(${value[0]}, ${value[1]}), 4326)` as unknown as string,
});

export const lineString = customType<{ data: Coord[]; driverData: string }>({
  dataType: () => 'geometry(LineString,4326)',
  toDriver: (value) =>
    sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify({
      type: 'LineString',
      coordinates: value,
    })}), 4326)` as unknown as string,
});