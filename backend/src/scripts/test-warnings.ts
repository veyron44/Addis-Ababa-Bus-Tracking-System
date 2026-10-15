import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index';
import { checkWarnings } from '../warnings/warnings.service';
import { hasOpenHidingWarning } from '../warnings/warnings.repository';

// Insert test points and check the warnings.
async function main() {
  const res = await db.execute(
    sql`SELECT id, status, route_direction_id FROM assignments ORDER BY id DESC LIMIT 1`,
  );
  const a = (res.rows as any[])[0];

  if (!a || a.status !== 'on_trip') {
    console.log('Start a fresh shift first (status must be on_trip).');
    return;
  }

  const cnt = await db.execute(
    sql`SELECT count(*)::int AS n FROM location_pings WHERE assignment_id = ${a.id}`,
  );

  if (Number((cnt.rows as any[])[0].n) > 0) {
    console.log('This shift already has pings. Use a fresh shift with none.');
    return;
  }

  const lenRes = await db.execute(
    sql`SELECT ST_Length(path::geography) AS len FROM route_directions WHERE id = ${a.route_direction_id}`,
  );
  const len = Number((lenRes.rows as any[])[0].len);

  await db.execute(sql`DELETE FROM warnings WHERE assignment_id = ${a.id}`);

  let clock = Date.now() - 30 * 60 * 1000;
  let progress = 0.5;

  async function add(deltaM: number, distM: number) {
    progress = Math.min(1, Math.max(0, progress + deltaM / len));
    clock += 10_000;
    const at = new Date(clock).toISOString();

    await db.execute(sql`
      INSERT INTO location_pings
        (assignment_id, route_direction_id, recorded_at, location, progress, path_distance_m, stationary)
      VALUES
        (${a.id}, ${a.route_direction_id}, ${at}::timestamptz,
         ST_SetSRID(ST_MakePoint(38.76, 9.0), 4326), ${progress}::float8, ${distM}::real, false)`);
  }

  async function check(label: string, expected: string[], expectHidden: boolean) {
    await checkWarnings(a.id);

    const open = await db.execute(
      sql`SELECT type FROM warnings WHERE assignment_id = ${a.id} AND resolved_at IS NULL ORDER BY type`,
    );
    const got = (open.rows as any[]).map((r) => String(r.type));
    const hidden = await hasOpenHidingWarning(a.id);
    const ok = JSON.stringify(got) === JSON.stringify(expected) && hidden === expectHidden;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  open=[${got.join(',')}] hidden=${hidden}`);
  }

  for (let i = 0; i < 8; i++) await add(+60, 10);
  await check('1 normal driving', [], false);

  for (let i = 0; i < 4; i++) {
    await add(+20, 10);
    await add(-20, 10);
  }
  await check('2 GPS wobble, no real movement back', [], false);

  for (let i = 0; i < 8; i++) await add(-60, 10);
  await check('3 driving the wrong way', ['wrong_way'], true);

  for (let i = 0; i < 3; i++) await add(+60, 10);
  await check('4 recovered, going forward again', [], false);

  for (let i = 0; i < 2; i++) await add(+60, 300);
  await check('5 two points off the road (not enough)', [], false);

  await add(+60, 300);
  await check('6 third point off the road', ['off_path'], true);

  for (let i = 0; i < 3; i++) await add(+60, 20);
  await check('7 back on the road', [], false);
}

main()
  .catch((e) => console.error(e))
  .finally(() => pool.end());