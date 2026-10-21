import {
  rollingSpeed,
  distanceToStop,
  isFresh,
  estimateEta,
  toMinutes,
  buildSegments,
  farSeconds,
  standingSec,
  type Segment,
} from '../eta/eta.rules';

// No database needed.
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const LEN = 10000; // a 10 km road
const stepProgress = (kmh: number, sec: number) => ((kmh / 3.6) * sec) / LEN;
// n points, one every 10 s, moving at kmh
function steady(n: number, kmh: number, startProgress = 0.2, startMs = 0) {
  return Array.from({ length: n }, (_, i) => ({
    timeMs: startMs + i * 10_000,
    progress: startProgress + i * stepProgress(kmh, 10),
  }));
}

let r = rollingSpeed(steady(10, 20), LEN);
check('1 steady 20 km/h', !!r && near(r.speedKmh, 20, 0.5), r ? `got ${r.speedKmh.toFixed(1)}` : 'null');

r = rollingSpeed(steady(10, 0), LEN);
check('2 standing still gives 0', !!r && r.speedKmh === 0, r ? `got ${r.speedKmh}` : 'null');

check('3 one point gives null', rollingSpeed(steady(1, 20), LEN) === null);
check('4 two points 10 s apart (too short) give null', rollingSpeed(steady(2, 20), LEN) === null);

const mixed = [...steady(10, 40), ...steady(6, 10, 0.5, 100_000)];
r = rollingSpeed(mixed, LEN);
check('5 only the last 45 s count (now 10 km/h)', !!r && near(r.speedKmh, 10, 1), r ? `got ${r.speedKmh.toFixed(1)}` : 'null');

const back = steady(8, 20).map((p, i) => ({ ...p, progress: 0.6 - i * 0.01 }));
r = rollingSpeed(back, LEN);
check('6 driving backwards gives 0', !!r && r.speedKmh === 0, r ? `got ${r.speedKmh}` : 'null');

const shuffled = steady(10, 20).reverse();
r = rollingSpeed(shuffled, LEN);
check('7 points in any order', !!r && near(r.speedKmh, 20, 0.5), r ? `got ${r.speedKmh.toFixed(1)}` : 'null');

let d = distanceToStop(0.4, 0.45, LEN);
check('8 stop 500 m ahead', !d.passed && near(d.distanceM, 500, 1), `got ${d.distanceM.toFixed(0)}`);
d = distanceToStop(0.4, 0.4 - 0.01, LEN);
check('9 stop 100 m behind is passed', d.passed);
d = distanceToStop(0.4, 0.4 - 0.002, LEN);
check('10 stop 20 m behind counts as at the stop', !d.passed && d.distanceM === 0, `got ${d.distanceM}`);

check('11 fresh at 60 s', isFresh(0, 60_000));
check('12 stale at 120 s', !isFresh(0, 120_000));

let e = estimateEta(0, 20);
check('13 distance 0 is arriving', e.arriving && e.seconds === 0);

e = estimateEta(1000, 20);
check('14 1 km at live 20 km/h = 180 s, range 144-216', near(e.seconds, 180, 1) && near(e.lowSec, 144, 1) && near(e.highSec, 216, 1) && e.basis === 'live',
  `got ${e.seconds.toFixed(0)} (${e.lowSec.toFixed(0)}-${e.highSec.toFixed(0)}) ${e.basis}`);

e = estimateEta(4000, 10);
check('15 4 km at live 10: 1.5 km live + 2.5 km typical = 990 s', near(e.seconds, 990, 1), `got ${e.seconds.toFixed(0)}`);

e = estimateEta(4000, null);
check('16 no speed: all typical = 720 s, wide range, basis typical', near(e.seconds, 720, 1) && e.basis === 'typical' && near(e.highSec / e.seconds, 1.4, 0.001),
  `got ${e.seconds.toFixed(0)} ${e.basis}`);

e = estimateEta(4000, 1);
check('17 standing (1 km/h) is not used', e.basis === 'typical' && near(e.seconds, 720, 1), `got ${e.seconds.toFixed(0)} ${e.basis}`);

e = estimateEta(1500, 90);
check('18 speed is capped at 60 km/h = 90 s', near(e.seconds, 90, 1), `got ${e.seconds.toFixed(0)}`);

e = estimateEta(150, 20);
check('19 150 m at 20 km/h = 27 s reads arriving', e.arriving, `got ${e.seconds.toFixed(0)}`);

const m = toMinutes(480, 720);
check('20 480-720 s shows 8-12 min', m.lowMin === 8 && m.highMin === 12, `got ${m.lowMin}-${m.highMin}`);

const m2 = toMinutes(20, 50);
check('21 tiny range never below 1 min', m2.lowMin === 1 && m2.highMin === 1, `got ${m2.lowMin}-${m2.highMin}`);

// ---- Measured segment times ----
const seg = (startM: number, endM: number, seconds: number | null): Segment => ({ startM, endM, seconds });

const built = buildSegments(
  [{ stopId: 1, progress: 0 }, { stopId: 2, progress: 0.5 }, { stopId: 3, progress: 1 }],
  LEN,
  new Map([['1-2', 300]]),
);
check('22 segments are built between neighbouring stops, with the measured time where there is one',
  built.length === 2 && built[0].seconds === 300 && built[1].seconds === null && built[1].startM === 5000 && built[1].endM === 10000,
  JSON.stringify(built));

let f = farSeconds(0, 4000, [seg(0, 10000, null)]);
check('23 no measured time: typical speed, 4 km = 720 s', near(f.seconds, 720, 1) && f.learnedM === 0, `got ${f.seconds.toFixed(0)}`);

f = farSeconds(0, 5000, [seg(0, 5000, 300)]);
check('24 a whole measured stretch: its time (300 s)', near(f.seconds, 300, 0.01) && f.learnedM === 5000, `got ${f.seconds.toFixed(0)}`);

f = farSeconds(2500, 5000, [seg(0, 5000, 300)]);
check('25 half of a measured stretch: half its time (150 s)', near(f.seconds, 150, 0.01), `got ${f.seconds.toFixed(0)}`);

f = farSeconds(0, 10000, [seg(0, 5000, 300), seg(5000, 10000, null)]);
check('26 measured then unmeasured: 300 + 900 s', near(f.seconds, 1200, 1) && f.learnedM === 5000, `got ${f.seconds.toFixed(0)}`);

f = farSeconds(0, 12000, [seg(0, 10000, 600)]);
check('27 road beyond the last stretch uses typical speed: 600 + 360 s', near(f.seconds, 960, 1), `got ${f.seconds.toFixed(0)}`);

f = farSeconds(5000, 5000, [seg(0, 10000, 600)]);
check('28 zero distance is 0 s', f.seconds === 0);

e = estimateEta(5000, 20, { busM: 0, segments: [seg(0, 5000, 300)] });
check('29 near 1.5 km at live speed (270 s) + far 3.5 km at measured pace (210 s) = 480 s, all learned',
  near(e.seconds, 480, 1) && e.learnedShare === 1 && e.basis === 'live', `got ${e.seconds.toFixed(0)} share ${e.learnedShare}`);

e = estimateEta(5000, 20, { busM: 0, segments: [seg(0, 5000, null)] });
const plain = estimateEta(5000, 20);
check('30 stretches without measured times give the same answer as before', near(e.seconds, plain.seconds, 0.01) && e.learnedShare === 0,
  `got ${e.seconds.toFixed(0)} vs ${plain.seconds.toFixed(0)}`);

e = estimateEta(1000, 20, { busM: 0, segments: [seg(0, 5000, 300)] });
check('31 a stop inside the near 1.5 km ignores the measured times', near(e.seconds, 180, 1) && e.learnedShare === 0, `got ${e.seconds.toFixed(0)}`);

e = estimateEta(5000, 20, { busM: 2000, segments: [seg(0, 2000, null), seg(2000, 8000, 360)] });
check('32 a bus part-way along the road: far part measured from where it is (360 s per 6 km)',
  near(e.seconds, 270 + ((5000 - 1500) / 6000) * 360, 1), `got ${e.seconds.toFixed(0)}`);

// ---- Standing still ----
const stood = Array.from({ length: 31 }, (_, i) => ({ timeMs: i * 10_000, progress: 0.4 + (i % 2) * 0.0001 }));
let sd = standingSec(stood, LEN);
check('33 standing 5 minutes (GPS noise of a few metres) reads about 300 s', sd !== null && near(sd, 300, 1), `got ${sd}`);

sd = standingSec(steady(10, 20), LEN);
check('34 a moving bus is not standing (0 s)', sd === 0, `got ${sd}`);

const movedThenStopped = [...steady(10, 20), ...Array.from({ length: 6 }, (_, i) => ({ timeMs: 100_000 + i * 10_000, progress: 0.2 + 9 * stepProgress(20, 10) + 0.0001 }))];
sd = standingSec(movedThenStopped, LEN);
check('35 moved, then stopped 50 s ago: counts only the stop', sd !== null && near(sd, 50, 10), `got ${sd}`);

check('36 one point gives null', standingSec(steady(1, 20), LEN) === null);

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
