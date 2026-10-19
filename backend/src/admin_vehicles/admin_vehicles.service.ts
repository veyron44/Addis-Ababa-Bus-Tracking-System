import {
  listVehicles,
  findVehicle,
  insertVehicle,
  renameVehicle,
  countVehicleShifts,
  deleteVehicle,
} from './admin_vehicles.repository';

export async function getVehicles() {
  return listVehicles();
}

export async function addVehicle(plate: string) {
  const created = await insertVehicle(plate);
  if (!created) return { ok: false as const, reason: 'plate_taken' as const };
  return { ok: true as const, vehicle: created };
}

export async function changePlate(id: number, plate: string) {
  const current = await findVehicle(id);
  if (!current) return { ok: false as const, reason: 'not_found' as const };
  if (current.plate === plate) return { ok: true as const, vehicle: current };

  const done = await renameVehicle(id, plate);
  if (!done) return { ok: false as const, reason: 'plate_taken' as const };
  return { ok: true as const, vehicle: { id, plate } };
}

// A vehicle that has had any shift is kept: the history needs it.
export async function removeVehicle(id: number) {
  const current = await findVehicle(id);
  if (!current) return { ok: false as const, reason: 'not_found' as const };
  if ((await countVehicleShifts(id)) > 0) return { ok: false as const, reason: 'has_shifts' as const };

  await deleteVehicle(id);
  return { ok: true as const };
}
