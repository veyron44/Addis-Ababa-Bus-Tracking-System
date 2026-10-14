import { verifyPassword } from './password';
import { generateToken, hashToken } from './tokens';
import { findDriverByUsername, createSession,findValidSession } from './auth.repository';
import { PLACEHOLDERS } from '../config/placeholders';

export async function loginDriver(username: string, password: string) {
  const driver = await findDriverByUsername(username);

  const ok = driver ? await verifyPassword(password, driver.passwordHash) : false;
  if (!driver || !ok) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + PLACEHOLDERS.sessionHours * 60 * 60 * 1000);
  await createSession(driver.id, hashToken(token), expiresAt);

  return { token, expiresAt, driver: { id: driver.id, name: driver.name } };
}


export async function authenticateToken(token: string) {
  const session = await findValidSession(hashToken(token));
  if (!session) return null;
  return { id: session.driverId, name: session.name };
}