import { sortArrivals, upcomingAtStop, pickUpcoming } from '../arrivals/arrivals.rules';

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

// ---- Buses that are not on the road yet ----
// Wide range is +/- 40 percent: a 10 minute drive (600 s) is 6 to 14 minutes.
let u = upcomingAtStop({ code: 'estimate', lowMin: 7, highMin: 22 }, 600);
check('7 waiting bus leaving in 7-22 min, 10 min drive: 13-36 min', !!u && u.lowMin === 13 && u.highMin === 36, JSON.stringify(u));

u = upcomingAtStop({ code: 'departing_soon', lowMin: null, highMin: null }, 600);
check('8 departing soon: drive time, plus up to 3 min at the top: 6-17 min', !!u && u.lowMin === 6 && u.highMin === 17, JSON.stringify(u));

u = upcomingAtStop({ code: 'departing_soon', lowMin: null, highMin: null }, 20);
check('9 a stop right by the start still reads at least 1 min', !!u && u.lowMin === 1, JSON.stringify(u));

check('10 overdue or no estimate gives nothing', upcomingAtStop({ code: 'no_estimate', lowMin: null, highMin: null }, 600) === null);
check('11 assigned but not started gives nothing', upcomingAtStop({ code: 'assigned_not_started', lowMin: null, highMin: null }, 600) === null);

const many = [30, 5, 90, 12, 8, 61, 20, 44].map((m) => ({ id: m, lowMin: m, highMin: m + 10 }));
const picked = pickUpcoming(many);
check('12 soonest first, at most 5, nothing more than 60 min away', picked.map((p) => p.id).join(',') === '5,8,12,20,30', picked.map((p) => p.id).join(','));

check('13 the narrower range goes first at the same time', pickUpcoming([{ id: 1, lowMin: 10, highMin: 30 }, { id: 2, lowMin: 10, highMin: 20 }]).map((p) => p.id).join(',') === '2,1');

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
