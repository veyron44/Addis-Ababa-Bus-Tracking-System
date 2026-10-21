import 'dotenv/config';
import { pool } from '../db/index';
import { PLACEHOLDERS } from '../config/placeholders';
import { runSegmentUpdate } from '../segments/segments.service';

// Usage:  npx tsx src/scripts/update-segment-times.ts [--apply] [--days 60]
// Dry run by default: nothing is written. --apply saves the medians. The server runs this by
// itself every night when NIGHTLY_JOBS=on. Never --apply on simulator data you care about: the
// fake buses would become "measured" times.

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const i = args.indexOf('--days');
  const sinceDays = i >= 0 ? Number(args[i + 1]) : PLACEHOLDERS.segmentLookbackDays;
  if (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 365) {
    console.error('--days must be a whole number from 1 to 365.');
    process.exitCode = 1;
    return;
  }

  const r = await runSegmentUpdate({ apply, sinceDays });

  console.log(`Segment-time update: ${apply ? 'APPLY' : 'DRY RUN (nothing written)'}, last ${sinceDays} days`);
  console.log(`Shifts looked at:               ${r.shiftsLookedAt}`);
  console.log(`Real stretch crossings kept:    ${r.samplesKept}`);
  console.log(`Slots with at least ${PLACEHOLDERS.segmentMinSamples} samples:  ${r.slotsWithEnoughSamples}`);
  console.log(`Rows written:                   ${r.applied}`);
  console.log('Preview (most samples first):');
  for (const p of r.preview) {
    const old = p.oldSeconds === null ? 'none' : `${p.oldSeconds} s${p.wasMeasured ? ' (measured)' : ' (guess)'}`;
    console.log(
      `  stops ${p.fromStopId}->${p.toStopId}  ${p.dayType} slot ${p.bucket}  n=${p.n}  old ${old}  new ${p.newSeconds} s`,
    );
  }
  console.log(
    `Table now: ${r.totals.rowsMeasured} of ${r.totals.rowsTotal} rows measured; ` +
      `${r.totals.pairsMeasured} of ${r.totals.pairsTotal} stop pairs have a measured row.`,
  );
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
