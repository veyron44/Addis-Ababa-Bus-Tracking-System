// Tests for the GPS sender batching rules, run with: npx tsx src/lib/test-sender.ts

import { shouldKeep, takeBatch, MAX_BATCH, MIN_GAP_MS, type GpsPoint } from './sender';

let failed = 0;
let n = 0;

function check(name: string, ok: boolean, got?: unknown) {
  n += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${name}${got === undefined ? '' : '  got ' + String(got)}`);
}



check('first point is always kept', shouldKeep(null, '2026-10-22T10:00:00.000Z'));

check(
  'point 3s later is kept',
  shouldKeep('2026-10-22T10:00:00.000Z', '2026-10-22T10:00:03.000Z'),
);

check(
  'point 2s later is skipped',
  !shouldKeep('2026-10-22T10:00:00.000Z', '2026-10-22T10:00:02.000Z'),
);

check(
  'point exactly at gap boundary is kept',
  shouldKeep('2026-10-22T10:00:00.000Z', new Date(new Date('2026-10-22T10:00:00.000Z').getTime() + MIN_GAP_MS).toISOString()),
);

check(
  'point 1ms before gap is skipped',
  !shouldKeep('2026-10-22T10:00:00.000Z', new Date(new Date('2026-10-22T10:00:00.000Z').getTime() + MIN_GAP_MS - 1).toISOString()),
);

// ---- takeBatch ----

function makePoints(count: number): GpsPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(Date.now() + i * 3000).toISOString(),
    lat: 9.03 + i * 0.0001,
    lng: 38.75 + i * 0.0001,
  }));
}

const small = makePoints(5);
const { batch: b1, rest: r1 } = takeBatch(small);
check('small queue: batch is all points', b1.length === 5);
check('small queue: rest is empty', r1.length === 0);

const exact = makePoints(MAX_BATCH);
const { batch: b2, rest: r2 } = takeBatch(exact);
check('exact-200 queue: batch is 200', b2.length === MAX_BATCH);
check('exact-200 queue: rest is empty', r2.length === 0);

const big = makePoints(MAX_BATCH + 50);
const { batch: b3, rest: r3 } = takeBatch(big);
check('250-point queue: batch is 200', b3.length === MAX_BATCH);
check('250-point queue: rest is 50', r3.length === 50);

const empty = takeBatch([]);
check('empty queue: batch is empty', empty.batch.length === 0);
check('empty queue: rest is empty', empty.rest.length === 0);


const points: GpsPoint[] = [
  { t: '2026-10-22T10:00:00.000Z', lat: 9.03, lng: 38.75, speed: 25.2, acc: 12 },
  { t: '2026-10-22T10:00:03.000Z', lat: 9.031, lng: 38.751, crowd: 'seats_available', crowdAt: '2026-10-22T10:00:02.500Z' },
];
const serialized = JSON.stringify(points);
const parsed = JSON.parse(serialized) as GpsPoint[];
check('round-trip preserves point count', parsed.length === 2);
check('round-trip preserves lat', parsed[0].lat === 9.03);
check('round-trip preserves crowd', parsed[1].crowd === 'seats_available');
check('round-trip preserves speed', parsed[0].speed === 25.2);
check('round-trip preserves acc', parsed[0].acc === 12);

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
if (failed > 0) throw new Error('Some checks failed');
