import {
  findCrossings,
  buildSamples,
  localSlot,
  median,
  groupMedians,
  type PingPoint,
  type SegmentSample,
} from '../segments/segments.rules';

let n = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  n++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

// A bus that moves along the road: progress = p0 + t * rate, a point every stepSec.
function drive(p0: number, rate: number, untilSec: number, stepSec: number): PingPoint[] {
  const out: PingPoint[] = [];
  for (let t = 0; t <= untilSec; t += stepSec) out.push({ timeMs: t * 1000, progress: p0 + t * rate });
  return out;
}

const stops = [
  { stopId: 1, progress: 0.2 },
  { stopId: 2, progress: 0.4 },
];

// 1 to 3: crossing times
{
  const c = findCrossings(
    [{ timeMs: 0, progress: 0 }, { timeMs: 10_000, progress: 0.2 }],
    [{ stopId: 1, progress: 0.1 }],
  );
  check('crossing is worked out between two points', c[0] === 5000, `got ${c[0]}`);
}
{
  const c = findCrossings(
    [{ timeMs: 0, progress: 0.3 }, { timeMs: 10_000, progress: 0.5 }],
    [{ stopId: 1, progress: 0.1 }],
  );
  check('a stop passed before the first point has no crossing', c[0] === null);
}
{
  const c = findCrossings(
    [{ timeMs: 0, progress: 0 }, { timeMs: 120_000, progress: 0.5 }],
    [{ stopId: 1, progress: 0.25 }],
  );
  check('a hole in the points around the stop gives no crossing', c[0] === null);
}

// 4: a normal stretch (36 km/h over 2 km, about 200 s)
const good = drive(0.1, 0.001, 400, 10);
{
  const s = buildSamples(good, stops, 10_000, []);
  check('a clean stretch gives one sample of about 200 s', s.length === 1 && Math.abs(s[0].seconds - 200) < 15, `got ${s.length} / ${s[0]?.seconds}`);
}

// 5: a crawl (0.04 km/h) is not used
{
  const slow = drive(0.1, 0.00001, 40_000, 30);
  const s = buildSamples(slow, stops, 1000, []);
  check('a stretch driven at a crawl is dropped (breakdown or jam)', s.length === 0, `got ${s.length}`);
}

// 6: a hole in the data inside the stretch
{
  const holey = good.filter((p) => p.timeMs <= 150_000 || p.timeMs >= 250_000);
  const s = buildSamples(holey, stops, 10_000, []);
  check('a hole in the points inside the stretch drops it', s.length === 0, `got ${s.length}`);
}

// 7: warnings
{
  const during = buildSamples(good, stops, 10_000, [{ fromMs: 150_000, toMs: 160_000 }]);
  const after = buildSamples(good, stops, 10_000, [{ fromMs: 400_000, toMs: 500_000 }]);
  check('a stretch that overlaps a warning is dropped', during.length === 0);
  check('a warning that does not overlap changes nothing', after.length === 1);
}

// 8: an impossible speed (a GPS jump)
{
  const jump: PingPoint[] = [
    { timeMs: 0, progress: 0.1 },
    { timeMs: 5000, progress: 0.2 },
    { timeMs: 10_000, progress: 0.3 },
    { timeMs: 15_000, progress: 0.4 },
    { timeMs: 20_000, progress: 0.5 },
  ];
  const s = buildSamples(jump, stops, 10_000, []);
  check('an impossible speed is dropped', s.length === 0, `got ${s.length}`);
}

// 9: median
check('median of an odd list', median([3, 1, 2]) === 2);
check('median of an even list', median([1, 2, 3, 4]) === 2.5);

// 10: slots (Ethiopia is UTC+3; 2026-10-10 is a Saturday)
{
  const sat = localSlot(Date.UTC(2026, 9, 10, 4, 15));
  const fri = localSlot(Date.UTC(2026, 9, 9, 14, 0));
  check('Saturday 07:15 local is weekend, slot 14', sat.dayType === 'weekend' && sat.bucket === 14, `${sat.dayType} ${sat.bucket}`);
  check('Friday 17:00 local is weekday, slot 34', fri.dayType === 'weekday' && fri.bucket === 34, `${fri.dayType} ${fri.bucket}`);
}

// 11: grouping
{
  const base = Date.UTC(2026, 9, 5, 7, 0); // a Monday, 10:00 local, slot 20
  const mk = (sec: number, offsetMs: number, from = 1, to = 2): SegmentSample => ({
    fromStopId: from, toStopId: to, startMs: base + offsetMs, seconds: sec,
  });
  const three = groupMedians([mk(100, 0), mk(200, 1000), mk(300, 2000)], 3);
  check('three samples in one slot give their median', three.length === 1 && three[0].seconds === 200 && three[0].n === 3);
  const two = groupMedians([mk(100, 0), mk(200, 1000)], 3);
  check('too few samples leave the row alone', two.length === 0);
  const split = groupMedians(
    [mk(100, 0), mk(110, 1000), mk(120, 2000), mk(300, 3_600_000), mk(310, 3_601_000), mk(320, 3_602_000)],
    3,
  );
  check('samples in different slots are not mixed', split.length === 2 && split[0].seconds === 110 && split[1].seconds === 310);
  const pairs = groupMedians([mk(100, 0), mk(100, 1000), mk(100, 2000), mk(500, 0, 2, 3), mk(500, 1000, 2, 3), mk(500, 2000, 2, 3)], 3);
  check('different stop pairs are kept apart', pairs.length === 2);
}

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
if (failed > 0) process.exitCode = 1;
