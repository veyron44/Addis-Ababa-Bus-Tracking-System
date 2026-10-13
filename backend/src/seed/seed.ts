import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../db/index';
import { routes, routeDirections, stops, routeStops, segmentTimes } from '../db/schema';
import { PLACEHOLDERS } from '../config/placeholders';

type Coord = [number, number]; // [longitude, latitude]
type SeedStop = { placeName: string; placeNameAm?: string; side: string; location: Coord };
type SeedDirection = { directionName: string; path: Coord[] | null; stops: SeedStop[] };
type SeedRoute = {
  routeNumber: string;
  name: string;
  nameAm?: string;
  reverseDirectionName?: string;
  directions: SeedDirection[];
};

// PLACEHOLDER for which 30-minute slots count as rush hour on weekdays
const RUSH_SLOTS = new Set([14, 15, 16, 17, 18, 19, 34, 35, 36, 37, 38]);

// Straight-line distance in km. Used ONLY to fill placeholder segment times.
function distanceKm(a: Coord, b: Coord): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
  const fileName = process.argv[2] ?? 'route61.json';
  const file = path.join(process.cwd(), 'src', 'seed', fileName);
  const data: SeedRoute = JSON.parse(fs.readFileSync(file, 'utf-8'));

  // If there is one direction, build the other by reversing it
  const directions = [...data.directions];
  if (directions.length === 1) {
    const first = directions[0];
    const name = data.reverseDirectionName ?? `reverse of ${first.directionName}`;
    directions.push({
      directionName: name,
      path: first.path ? [...first.path].reverse() : null,
      stops: [...first.stops].reverse().map((s) => ({ ...s, side: name })),
    });
  }

  await db.transaction(async (tx) => {
    // Reuse a stop if one with the same name is already within a few meters.
    async function findOrCreateStop(s: SeedStop): Promise<number> {
      const found = await tx.execute(sql`
        SELECT id FROM stops
        WHERE place_name = ${s.placeName}
          AND ST_DWithin(
                location::geography,
                ST_SetSRID(ST_MakePoint(${s.location[0]}, ${s.location[1]}), 4326)::geography,
                ${PLACEHOLDERS.sameStopM})
        LIMIT 1`);
      if (found.rows.length > 0) return Number(found.rows[0].id);

      const [row] = await tx
        .insert(stops)
        .values({
          placeName: s.placeName,
          placeNameAm: s.placeNameAm ?? null,
          side: s.side,
          location: s.location,
        })
        .returning({ id: stops.id });
      return row.id;
    }

    //  Remove an older copy of This route only
    const old = await tx.execute(sql`
      SELECT DISTINCT rs.stop_id AS id FROM route_stops rs
      JOIN route_directions rd ON rd.id = rs.route_direction_id
      JOIN routes r ON r.id = rd.route_id
      WHERE r.route_number = ${data.routeNumber}`);
    const oldIds = old.rows.map((r) => Number(r.id));

    await tx.delete(routes).where(eq(routes.routeNumber, data.routeNumber));

    // Delete old stops only if no other route still uses them.
    if (oldIds.length > 0) {
      await tx.execute(sql`
        DELETE FROM stops s
        WHERE s.id IN (${sql.join(oldIds.map((i) => sql`${i}`), sql`, `)})
          AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.stop_id = s.id)`);
    }

    // The route
    const [route] = await tx
      .insert(routes)
      .values({ routeNumber: data.routeNumber, name: data.name, nameAm: data.nameAm ?? null })
      .returning({ id: routes.id });

    //  Each direction: path, stops, stop order, placeholder segment times.
    for (const dir of directions) {
      const line: Coord[] = dir.path ?? dir.stops.map((s) => s.location);

      const [d] = await tx
        .insert(routeDirections)
        .values({ routeId: route.id, directionName: dir.directionName, path: line })
        .returning({ id: routeDirections.id });

      const stopIds: number[] = [];
      for (const s of dir.stops) stopIds.push(await findOrCreateStop(s));

      await tx.insert(routeStops).values(
        stopIds.map((id, i) => ({
          routeDirectionId: d.id,
          stopId: id,
          stopOrder: i + 1,
        })),
      );

           //  Existing pairs are skipped.
      const rows: (typeof segmentTimes.$inferInsert)[] = [];
      for (let i = 0; i < dir.stops.length - 1; i++) {
        const km = distanceKm(dir.stops[i].location, dir.stops[i + 1].location);
        for (const dayType of ['weekday', 'weekend'] as const) {
          for (let slot = 0; slot < 48; slot++) {
            const rush = dayType === 'weekday' && RUSH_SLOTS.has(slot);
            const speed = rush ? PLACEHOLDERS.rushHourSpeedKmh : PLACEHOLDERS.middaySpeedKmh;
            rows.push({
              fromStopId: stopIds[i],
              toStopId: stopIds[i + 1],
              dayType,
              timeBucket: slot,
              seconds: Math.max(1, Math.round((km / speed) * 3600)),
            });
          }
        }
      }
      let added = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const inserted = await tx
          .insert(segmentTimes)
          .values(rows.slice(i, i + 500))
          .onConflictDoNothing()
          .returning({ id: segmentTimes.id });
        added += inserted.length;
      }

      console.log(`Seeded "${dir.directionName}": ${dir.stops.length} stops, ${added} new segment times`);
    }
  });
}

main()
  .then(() => console.log('Seed finished.'))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());