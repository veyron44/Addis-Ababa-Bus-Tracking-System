import 'dotenv/config';
import { and, eq, ne } from 'drizzle-orm';
import { db, pool } from '../db/index';
import { assignments, drivers, routeDirections, routes, vehicles } from '../db/schema';

async function main() {
  // Usage: npx tsx src/scripts/createshift.ts [username] [routeNumber] [directionName] [plate]
  // Defaults: bus1, route 61 toward Legehar (it starts at Ayat), bus AA-1234.
  const [
    username = 'bus1',
    routeNumber = '61',
    directionName = 'toward Legehar',
    plate = 'AA-1234',
  ] = process.argv.slice(2);

  const [driver] = await db.select().from(drivers).where(eq(drivers.username, username)).limit(1);
  if (!driver) {
    console.error(`No driver "${username}". Create one with createdriver.ts first.`);
    process.exitCode = 1;
    return;
  }

  const [dir] = await db
    .select({ id: routeDirections.id })
    .from(routeDirections)
    .innerJoin(routes, eq(routes.id, routeDirections.routeId))
    .where(and(eq(routes.routeNumber, routeNumber), eq(routeDirections.directionName, directionName)))
    .limit(1);
  if (!dir) {
    console.error(`No direction "${directionName}" on route ${routeNumber}.`);
    process.exitCode = 1;
    return;
  }

  await db.insert(vehicles).values({ plate }).onConflictDoNothing();
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.plate, plate)).limit(1);

  // End any older unfinished shift for this driver, so the script can be rerun.
  await db
    .update(assignments)
    .set({ status: 'ended', endedAt: new Date() })
    .where(and(eq(assignments.driverId, driver.id), ne(assignments.status, 'ended')));

  await db.insert(assignments).values({
    vehicleId: vehicle.id,
    driverId: driver.id,
    routeDirectionId: dir.id,
  });

  console.log(`Shift created: ${username}, bus ${plate}, route ${routeNumber} ${directionName}.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());