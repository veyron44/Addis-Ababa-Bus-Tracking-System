import { rollingSpeed, distanceToStop, isFresh, estimateEta, toMinutes } from '../eta/eta.rules';

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

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;