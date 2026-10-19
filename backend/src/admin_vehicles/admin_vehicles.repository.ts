import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type VehicleRow = { id: number; plate: string; inUse: boolean; shiftCount: number };

export async function listVehicles(): Promise<VehicleRow[]> {
  const res = await db.execute(sql`
    SELECT v.id, v.plate,
           EXISTS (SELECT 1 FROM assignments a WHERE a.vehicle_id = v.id AND a.status <> 'ended') AS in_use,
           (SELECT count(*) FROM assignments a WHERE a.vehicle_id = v.id)::int AS shift_count
    FROM vehicles v
    ORDER BY v.plate`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    plate: String(r.plate),
    inUse: Boolean(r.in_use),
    shiftCount: Number(r.shift_count),
  }));
}

export async function findVehicle(id: number) {
  const res = await db.execute(sql`SELECT id, plate FROM vehicles WHERE id = ${id}`);
  const r = (res.rows as any[])[0];
  return r ? { id: Number(r.id), plate: String(r.plate) } : null;
}

// Returns the new vehicle, or null when the plate already exists.
export async function insertVehicle(plate: string) {
  const res = await db.execute(sql`
    INSERT INTO vehicles (plate) VALUES (${plate})
    ON CONFLICT (plate) DO NOTHING
    RETURNING id, plate`);
  const r = (res.rows as any[])[0];
  return r ? { id: Number(r.id), plate: String(r.plate) } : null;
}

// Renames a vehicle unless another vehicle already has that plate. True if renamed.
export async function renameVehicle(id: number, plate: string) {
  const res = await db.execute(sql`
    UPDATE vehicles SET plate = ${plate}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM vehicles v2 WHERE v2.plate = ${plate} AND v2.id <> ${id})
    RETURNING id`);
  return res.rows.length > 0;
}

export async function countVehicleShifts(id: number) {
  const res = await db.execute(sql`SELECT count(*)::int AS n FROM assignments WHERE vehicle_id = ${id}`);
  return Number((res.rows as any[])[0].n);
}

export async function deleteVehicle(id: number) {
  const res = await db.execute(sql`DELETE FROM vehicles WHERE id = ${id} RETURNING id`);
  return res.rows.length > 0;
}
