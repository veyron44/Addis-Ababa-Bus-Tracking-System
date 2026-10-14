import { eq ,and,gt} from 'drizzle-orm';
import { db } from '../db/index';
import { drivers, driverSessions } from '../db/schema';


export async function findDriverByUsername(username: string) {
  const [driver] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.username, username))
    .limit(1);
  return driver ?? null;
}

export async function createSession(driverId: number, tokenHash: string, expiresAt: Date) {
  await db.insert(driverSessions).values({ driverId, tokenHash, expiresAt });
}


export async function findValidSession(tokenHash: string) {
  const [row] = await db
    .select({ driverId: drivers.id, name: drivers.name })
    .from(driverSessions)
    .innerJoin(drivers, eq(drivers.id, driverSessions.driverId))
    .where(and(eq(driverSessions.tokenHash, tokenHash), gt(driverSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}