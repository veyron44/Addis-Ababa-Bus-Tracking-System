import bcrypt from 'bcryptjs';

// Same bcrypt hashing the existing logins expect. The real password is never stored.
export async function hashNewPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
