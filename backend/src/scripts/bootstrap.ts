import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db/index';
import { admins } from '../db/schema';
import { hashPassword } from '../auth/password';

// Gets a new, empty database ready: the route data and a first admin login.
// Safe to run on every start: it only fills what is empty and never overwrites anything.
//
// Routes: every file in src/seed is seeded, but only when the routes table is empty.
//         Seeding again would replace the route direction ids.
// Admin:  made from ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_NAME when no admin with that
//         username exists. An existing admin's password is never reset here.

async function seedRoutesIfEmpty() {
  const res = await db.execute(sql`SELECT count(*) AS n FROM routes`);
  if (Number((res.rows as any[])[0].n) > 0) {
    console.log('Routes are already in the database: seeding skipped.');
    return;
  }

  const dir = path.join(process.cwd(), 'src', 'seed');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  let seeded = 0;

  for (const f of files) {
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    } catch {
      console.log(`Skipped ${f}: not valid JSON.`);
      continue;
    }
    if (!data || typeof data.routeNumber !== 'string' || !Array.isArray(data.directions)) {
      console.log(`Skipped ${f}: not a route file.`);
      continue;
    }
    console.log(`Seeding ${f} ...`);
    execFileSync('npx', ['tsx', 'src/seed/seed.ts', f], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    seeded++;
  }

  if (seeded === 0) console.log('No route files found in src/seed: nothing was seeded.');
}

async function createAdminIfMissing() {
  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = (process.env.ADMIN_NAME ?? 'Administrator').trim() || username;

  if (!password) {
    console.log('ADMIN_PASSWORD is not set: no admin account was created. Set it in .env and start again,');
    console.log('or create one with: npx tsx src/scripts/createadmin.ts USERNAME PASSWORD [NAME]');
    return;
  }
  if (password.length < 8) {
    console.log('ADMIN_PASSWORD is shorter than 8 characters: no admin account was created.');
    return;
  }

  const existing = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);
  if (existing.length > 0) {
    console.log(`Admin "${username}" already exists: left as it is.`);
    return;
  }

  await db.insert(admins).values({ name, username, passwordHash: await hashPassword(password) });
  console.log(`Admin "${username}" created.`);
}

async function main() {
  await seedRoutesIfEmpty();
  await createAdminIfMissing();
}

main()
  .catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
