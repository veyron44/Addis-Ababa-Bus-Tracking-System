import { sortOptions } from '../trips/trips.rules';

// No database needed: npx tsx src/scripts/test-trips-rules.ts
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

type Bus = { code: string; lowMin: number | null; highMin: number | null };
type Opt = { routeNumber: string; nextBus: Bus | null };
const est = (lowMin: number, highMin: number): Bus => ({ code: 'estimate', lowMin, highMin });
const opt = (routeNumber: string, nextBus: Bus | null): Opt => ({ routeNumber, nextBus });
const order = (list: Opt[]) => sortOptions(list).map((o) => o.routeNumber).join(',');

check('1 the soonest bus first, not the lowest route number', order([opt('49', est(12, 18)), opt('61', est(3, 5))]) === '61,49', order([opt('49', est(12, 18)), opt('61', est(3, 5))]));
check('2 a route with a bus comes before a route with none', order([opt('49', null), opt('61', est(9, 14))]) === '61,49');
check('3 arriving counts as now', order([opt('49', est(2, 4)), opt('61', { code: 'arriving', lowMin: null, highMin: null })]) === '61,49');
check('4 departing soon counts as now', order([opt('49', est(1, 3)), opt('61', { code: 'departing_soon', lowMin: null, highMin: null })]) === '61,49');
check('5 same low time: the narrower range first', order([opt('49', est(5, 12)), opt('61', est(5, 8))]) === '61,49');
check('6 same time and range: the lower route number first', order([opt('61', est(5, 8)), opt('49', est(5, 8))]) === '49,61');
check('7 route numbers are compared as numbers (9 before 10)', order([opt('10', null), opt('9', null)]) === '9,10');
check('8 a bus with no time (no signal) is after timed buses, before no bus',
  order([opt('1', null), opt('2', { code: 'no_estimate', lowMin: null, highMin: null }), opt('3', est(30, 40))]) === '3,2,1');
check('9 all without a bus: by route number', order([opt('61', null), opt('49', null)]) === '49,61');
check('10 empty list', sortOptions([]).length === 0);

const original = [opt('49', est(12, 18)), opt('61', est(3, 5))];
sortOptions(original);
check('11 the original list is not changed', original.map((o) => o.routeNumber).join(',') === '49,61');

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;