import 'dotenv/config';
import { app } from './app';
import { startShiftSweeper, startNightlyJobs } from './tracking/tracking.scheduler';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  startShiftSweeper();
  // Off unless NIGHTLY_JOBS=on, so a development database is never changed by itself.
  if (process.env.NIGHTLY_JOBS === 'on') startNightlyJobs();
});