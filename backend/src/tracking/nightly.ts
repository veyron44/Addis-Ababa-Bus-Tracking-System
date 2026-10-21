import { PLACEHOLDERS } from '../config/placeholders';
import { runSegmentUpdate } from '../segments/segments.service';
import { pruneOldPings } from './tracking.prune';

// The two nightly jobs: learn real segment times, then delete old points.
// With apply false nothing is written or deleted (a report only).
export async function runNightly(apply: boolean) {
  const segments = await runSegmentUpdate({ apply, sinceDays: PLACEHOLDERS.segmentLookbackDays });
  const pingsOld = await pruneOldPings(apply);
  return { segments, pingsOld };
}
