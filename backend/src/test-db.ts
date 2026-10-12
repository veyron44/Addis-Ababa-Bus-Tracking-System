import { pool } from './db/index';

async function main() {
  const result = await pool.query('SELECT PostGIS_Version() AS version');
  console.log('Connected. PostGIS version:', result.rows[0].version);
  await pool.end();
}

main().catch((err) => {
  console.error('Connection failed:', err);
  process.exit(1);
});