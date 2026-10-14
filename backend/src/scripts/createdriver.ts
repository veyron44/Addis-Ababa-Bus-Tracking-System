import 'dotenv/config';
import { db, pool } from '../db/index';
import { drivers } from '../db/schema';
import { hashPassword } from '../auth/password';

async function main() {
  const [username, password, ...nameParts] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: npx tsx src/scripts/create-driver.ts USERNAME PASSWORD [NAME]');
    process.exitCode = 1;
    return;
  }

  const name = nameParts.join(' ') || username;
  const passwordHash = await hashPassword(password);

  // New username: create it. Existing username: reset its name and password.
  await db
    .insert(drivers)
    .values({ name, username, passwordHash })
    .onConflictDoUpdate({ target: drivers.username, set: { name, passwordHash } });

  console.log(`Driver "${username}" saved.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());