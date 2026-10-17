import 'dotenv/config';
import { pool } from '../db/index';
import { estimateForBus } from '../eta/eta.service';
import { findLatestRunning } from '../eta/eta.repository';

// Prints the newest running bus and ETAs for its next stops.
// Usage: npx tsx src/scripts/show-eta.ts [assignmentId]
async function main() {
  const arg = process.argv[2];
  const id = arg ? Number(arg) : await findLatestRunning();
  if (!id) {
    console.log('No running shift. Run createshift.ts and fake-bus.ts --send --stop-at 40 first.');
    return;
  }
  const result = await estimateForBus(id);
  if (!result) {
    console.log(`Shift ${id} is not running or has no points yet.`);
    return;
  }
  const { bus, arrivals } = result;

  console.log(`Shift ${bus.assignmentId}, direction ${bus.routeDirectionId}, status ${bus.status}`);
  console.log(
    `Newest point: ${bus.pointAgeSec} s ago -> ${bus.fresh ? 'fresh' : 'STALE (no recent signal, no ETA)'}`,
  );
  console.log(`Progress: ${(bus.progress * 100).toFixed(1)}% of ${Math.round(bus.pathLenM)} m`);
  console.log(
    bus.speedKmh === null
      ? 'Rolling speed: not enough points'
      : `Rolling speed: ${bus.speedKmh.toFixed(1)} km/h (over ${bus.speedSpanSec!.toFixed(0)} s)`,
  );
  console.log(`Stops ahead: ${arrivals.length}`);
  console.log('order  distance  eta                       stop');
  for (const a of arrivals.slice(0, 10)) {
    let eta: string;
    if (a.code === 'no_estimate') eta = 'no estimate (' + a.reason + ')';
    else if (a.code === 'arriving') eta = 'arriving';
    else eta = `about ${a.lowMin}-${a.highMin} min (${a.basis})`;
    console.log(
      `${String(a.stopOrder).padStart(5)}  ${(a.distanceM / 1000).toFixed(2).padStart(6)} km  ${eta.padEnd(24)}  ${a.placeName}` +
        (a.side ? ` (${a.side})` : ''),
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => pool.end());