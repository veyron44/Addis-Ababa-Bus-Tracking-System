import { sortArrivals } from '../arrivals/arrivals.rules';

// No database needed.
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(',');

type Row = { id: string; etaSec: number | null; distanceM: number };

let r: Row[] = sortArrivals([
  { id: 'c', etaSec: 900, distanceM: 4000 },
  { id: 'a', etaSec: 120, distanceM: 600 },
  { id: 'b', etaSec: 400, distanceM: 2000 },
]);
check('1 soonest first', ids(r) === 'a,b,c', ids(r));

r = sortArrivals([
  { id: 'x', etaSec: null, distanceM: 500 },
  { id: 'a', etaSec: 300, distanceM: 1500 },
]);
check('2 no estimate goes last', ids(r) === 'a,x', ids(r));

r = sortArrivals([
  { id: 'far', etaSec: null, distanceM: 9000 },
  { id: 'near', etaSec: null, distanceM: 800 },
  { id: 'ok', etaSec: 60, distanceM: 300 },
]);
check('3 several without estimate: nearest first, after the rest', ids(r) === 'ok,near,far', ids(r));

r = sortArrivals([
  { id: 'later', etaSec: 300, distanceM: 2000 },
  { id: 'closer', etaSec: 300, distanceM: 1000 },
]);
check('4 same ETA: the closer bus first', ids(r) === 'closer,later', ids(r));

check('5 empty list', sortArrivals([]).length === 0);

const original = [
  { id: 'b', etaSec: 5, distanceM: 1 },
  { id: 'a', etaSec: 1, distanceM: 1 },
];
sortArrivals(original);
check('6 the original list is not changed', ids(original) === 'b,a', ids(original));

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
