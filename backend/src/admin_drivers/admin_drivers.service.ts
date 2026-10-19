import {
  listDrivers,
  findDriver,
  insertDriver,
  updateDriverName,
  replacePassword,
  countDriverShifts,
  deleteDriver,
} from './admin_drivers.repository';
import { hashNewPassword } from '../admin/admin.password';

export async function getDrivers() {
  return listDrivers();
}

export async function addDriver(name: string, username: string, password: string) {
  const hash = await hashNewPassword(password);
  const created = await insertDriver(name, username, hash);
  if (!created) return { ok: false as const, reason: 'username_taken' as const };
  return { ok: true as const, driver: created };
}

export async function renameDriver(id: number, name: string) {
  const current = await findDriver(id);
  if (!current) return { ok: false as const, reason: 'not_found' as const };
  await updateDriverName(id, name);
  return { ok: true as const, driver: { ...current, name } };
}

export async function resetPassword(id: number, password: string) {
  const current = await findDriver(id);
  if (!current) return { ok: false as const, reason: 'not_found' as const };
  const done = await replacePassword(id, await hashNewPassword(password));
  if (!done) return { ok: false as const, reason: 'not_found' as const };
  return { ok: true as const };
}

// A crew login that has had any shift is kept: the history needs it.
export async function removeDriver(id: number) {
  const current = await findDriver(id);
  if (!current) return { ok: false as const, reason: 'not_found' as const };
  if ((await countDriverShifts(id)) > 0) return { ok: false as const, reason: 'has_shifts' as const };

  await deleteDriver(id);
  return { ok: true as const };
}
