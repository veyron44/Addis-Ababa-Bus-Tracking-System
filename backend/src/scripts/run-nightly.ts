import 'dotenv/config';
import { pool } from '../db/index';
import { runNightly } from '../tracking/nightly';
import { pingKeepDays } from '../tracking/tracking.prune';

// Usage:  npx tsx src/scripts/run-nightly.ts [--apply]
// Runs both nightly jobs once. Without --apply it only reports (nothing written or deleted).
// The server runs the same jobs by itself every night when NIGHTLY_JOBS=on.
async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const r = await runNightly(apply);

  console.log(`Nightly jobs: ${apply ? 'APPLY' : 'DRY RUN (nothing written or deleted)'}`);
  console.log(`Segment times: ${r.segments.slotsWithEnoughSamples} slots with enough samples, ${r.segments.applied} rows written`);
  console.log(
    `Table now: ${r.segments.totals.rowsMeasured} of ${r.segments.totals.rowsTotal} rows measured`,
  );
  console.log(`Location points older than ${pingKeepDays()} days: ${r.pingsOld} ${apply ? 'deleted' : 'would be deleted'}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
