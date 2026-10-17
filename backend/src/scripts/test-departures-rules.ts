import {
  waitingDeparture,
  upcomingDeparture,
  minutesAgo,
  typicalGap,
  sortDepartures,
  pickBoarding,
} from '../departures/departures.rules';

// No database needed: npx tsx src/scripts/test-departures-rules.ts
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}
const MIN = 60;

let w = waitingDeparture(3 * MIN, false, false);
check('1 waiting 3 min, not full: leaves in 7-22 min', w.code === 'estimate' && w.lowMin === 7 && w.highMin === 22, `got ${w.code} ${w.lowMin}-${w.highMin}`);

w = waitingDeparture(1 * MIN, true, false);
check('2 full at 1 min: departing soon at once', w.code === 'departing_soon', w.code);

w = waitingDeparture(2 * MIN, false, true);
check('3 Departing now tapped: departing soon at once', w.code === 'departing_soon', w.code);

w = waitingDeparture(12 * MIN, false, false);
check('4 past the typical layover (12 min): departing soon, no new time', w.code === 'departing_soon', w.code);

w = waitingDeparture(25 * MIN, false, false);
check('5 25 min: overdue, no countdown', w.code === 'no_estimate' && w.reason === 'overdue', `${w.code} ${w.reason}`);

w = waitingDeparture(30 * MIN, true, true);
check('6 overdue wins even if full and tapped', w.code === 'no_estimate' && w.reason === 'overdue', `${w.code} ${w.reason}`);

w = waitingDeparture(9.5 * MIN, false, false);
check('7 9.5 min: 1 to 16 min, never below 1', w.code === 'estimate' && w.lowMin === 1 && w.highMin === 16, `got ${w.lowMin}-${w.highMin}`);

let u = upcomingDeparture(10, 15);
check('8 arrives in 10-15 min: leaves in 20-40 min', u.lowMin === 20 && u.highMin === 40, `got ${u.lowMin}-${u.highMin}`);

u = upcomingDeparture(null, null);
check('9 arriving now: leaves in 10-25 min', u.lowMin === 10 && u.highMin === 25, `got ${u.lowMin}-${u.highMin}`);

const now = new Date('2026-10-08T12:00:00Z');
check('10 last bus left 3 min ago', minutesAgo(new Date(now.getTime() - 3 * 60_000), now) === 3);
check('11 nothing before', minutesAgo(null, now) === null);
check('12 4 hours ago is not shown', minutesAgo(new Date(now.getTime() - 240 * 60_000), now) === null);
check('13 a clock slightly ahead gives 0', minutesAgo(new Date(now.getTime() + 5000), now) === 0);

const g = typicalGap();
check('14 typical gap is the placeholder range', g.lowMin === 10 && g.highMin === 20, `${g.lowMin}-${g.highMin}`);

const sorted = sortDepartures([
  { id: 'n', group: 'not_started' as const, order: 1 },
  { id: 'r2', group: 'road' as const, order: 900 },
  { id: 'w2', group: 'waiting' as const, order: 2000 },
  { id: 'r1', group: 'road' as const, order: 300 },
  { id: 'w1', group: 'waiting' as const, order: 1000 },
]).map((x) => x.id).join(',');
check('15 order: waiting (first arrived first), road (soonest), not started', sorted === 'w1,w2,r1,r2,n', sorted);

check('16 boarding is the first that arrived', pickBoarding([
  { id: 5, arrivedMs: 2000, overdue: false },
  { id: 7, arrivedMs: 1000, overdue: false },
]) === 7);
check('17 an overdue bus is not boarding', pickBoarding([
  { id: 7, arrivedMs: 1000, overdue: true },
  { id: 5, arrivedMs: 2000, overdue: false },
]) === 5);
check('18 all overdue: nobody boarding', pickBoarding([{ id: 7, arrivedMs: 1000, overdue: true }]) === null);
check('19 nobody waiting', pickBoarding([]) === null);

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
