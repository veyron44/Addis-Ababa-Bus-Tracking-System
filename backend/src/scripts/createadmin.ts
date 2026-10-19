import 'dotenv/config';
import { db, pool } from '../db/index';
import { admins } from '../db/schema';
import { hashPassword } from '../auth/password';

async function main() {
  const [username, password, ...nameParts] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: npx tsx src/scripts/createadmin.ts USERNAME PASSWORD [NAME]');
    process.exitCode = 1;
    return;
  }

  const name = nameParts.join(' ') || username;
  const passwordHash = await hashPassword(password);

  // New username: create it. Existing username: reset its name and password.
  await db
    .insert(admins)
    .values({ name, username, passwordHash })
    .onConflictDoUpdate({ target: admins.username, set: { name, passwordHash } });

  console.log(`Admin "${username}" saved.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
