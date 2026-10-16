import { sweepStaleShifts } from './tracking.sweep';
import { checkTimeWarnings } from '../warnings/warnings.service';
import { PLACEHOLDERS } from '../config/placeholders';

let timer: NodeJS.Timeout | null = null;

export function startShiftSweeper() {
  if (timer) return;

  const run = async () => {
    try {
      await sweepStaleShifts();
    } catch (err) {
      console.error('Shift sweep failed:', err);
    }

    // Run after the sweep to avoid warnings for shifts just ended.
    try {
      await checkTimeWarnings();
    } catch (err) {
      console.error('Time warning check failed:', err);
    }
  };

  void run();
  timer = setInterval(run, PLACEHOLDERS.sweepIntervalSec * 1000);
}
