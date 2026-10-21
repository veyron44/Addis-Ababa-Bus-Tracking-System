import { sweepStaleShifts } from './tracking.sweep';
import { checkTimeWarnings } from '../warnings/warnings.service';
import { PLACEHOLDERS } from '../config/placeholders';
import { nightlyDueDay } from './nightly.rules';
import { runNightly } from './nightly';

let timer: NodeJS.Timeout | null = null;

export function startShiftSweeper() {
  if (timer) return;

  const run = async () => {
    try {
      await sweepStaleShifts();
    } catch (err) {
      console.error('Shift sweep failed:', err);
    }
    // After the sweep, so a shift that was just auto-ended does not get a no-signal warning.
    try {
      await checkTimeWarnings();
    } catch (err) {
      console.error('Time warning check failed:', err);
    }
  };

  void run();
  timer = setInterval(run, PLACEHOLDERS.sweepIntervalSec * 1000);
}

let nightlyTimer: NodeJS.Timeout | null = null;
let lastNightlyDay: string | null = null;

// Checks every minute. Once per local day, during the nightly hour, learns the segment times
// and deletes old points. Marked done before it starts, so a failure does not repeat all hour.
export function startNightlyJobs() {
  if (nightlyTimer) return;

  const check = async () => {
    const day = nightlyDueDay(Date.now(), lastNightlyDay);
    if (!day) return;
    lastNightlyDay = day;
    try {
      const r = await runNightly(true);
      console.log(
        `Nightly jobs done: ${r.segments.applied} segment rows written, ${r.pingsOld} old points deleted.`,
      );
    } catch (err) {
      console.error('Nightly jobs failed:', err);
    }
  };

  nightlyTimer = setInterval(check, 60_000);
}
