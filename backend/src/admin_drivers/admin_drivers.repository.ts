import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type DriverRow = {
  id: number;
  name: string;
  username: string;
  hasUnfinishedShift: boolean;
  shiftCount: number;
};

// Never returns the password hash.
export async function listDrivers(): Promise<DriverRow[]> {
  const res = await db.execute(sql`
    SELECT d.id, d.name, d.username,
           EXISTS (SELECT 1 FROM assignments a WHERE a.driver_id = d.id AND a.status <> 'ended') AS unfinished,
           (SELECT count(*) FROM assignments a WHERE a.driver_id = d.id)::int AS shift_count
    FROM drivers d
    ORDER BY d.username`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    username: String(r.username),
    hasUnfinishedShift: Boolean(r.unfinished),
    shiftCount: Number(r.shift_count),
  }));
}

export async function findDriver(id: number) {
  const res = await db.execute(sql`SELECT id, name, username FROM drivers WHERE id = ${id}`);
  const r = (res.rows as any[])[0];
  return r ? { id: Number(r.id), name: String(r.name), username: String(r.username) } : null;
}

// Returns the new login, or null when the username already exists.
export async function insertDriver(name: string, username: string, passwordHash: string) {
  const res = await db.execute(sql`
    INSERT INTO drivers (name, username, password_hash)
    VALUES (${name}, ${username}, ${passwordHash})
    ON CONFLICT (username) DO NOTHING
    RETURNING id, name, username`);
  const r = (res.rows as any[])[0];
  return r ? { id: Number(r.id), name: String(r.name), username: String(r.username) } : null;
}

export async function updateDriverName(id: number, name: string) {
  const res = await db.execute(sql`UPDATE drivers SET name = ${name} WHERE id = ${id} RETURNING id`);
  return res.rows.length > 0;
}

// New password, and every login session of this crew is closed: an old token stops working.
export async function replacePassword(id: number, passwordHash: string) {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      UPDATE drivers SET password_hash = ${passwordHash} WHERE id = ${id} RETURNING id`);
    if (res.rows.length === 0) return false;
    await tx.execute(sql`DELETE FROM driver_sessions WHERE driver_id = ${id}`);
    return true;
  });
}

export async function countDriverShifts(id: number) {
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM assignments WHERE driver_id = ${id}`);
  return Number((res.rows as any[])[0].n);
}

export async function deleteDriver(id: number) {
  const res = await db.execute(sql`DELETE FROM drivers WHERE id = ${id} RETURNING id`);
  return res.rows.length > 0;
}
