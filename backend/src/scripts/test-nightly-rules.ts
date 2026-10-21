import { nightlyDueDay, localDay } from '../tracking/nightly.rules';

// No database needed: npx tsx src/scripts/test-nightly-rules.ts
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

// Local time is UTC+3, so 03:30 local is 00:30 UTC.
const at = (iso: string) => Date.parse(iso);

check('1 local date uses local time (23:30 UTC is already the next day)', localDay(at('2026-10-20T23:30:00Z')) === '2026-10-21', localDay(at('2026-10-20T23:30:00Z')));
check('2 02:59 local is not due', nightlyDueDay(at('2026-10-20T23:59:00Z'), null) === null);
check('3 03:00 local is due', nightlyDueDay(at('2026-10-21T00:00:00Z'), null) === '2026-10-21');
check('4 03:59 local is still due', nightlyDueDay(at('2026-10-21T00:59:00Z'), null) === '2026-10-21');
check('5 04:00 local is not due', nightlyDueDay(at('2026-10-21T01:00:00Z'), null) === null);
check('6 already run today: not due again', nightlyDueDay(at('2026-10-21T00:30:00Z'), '2026-10-21') === null);
check('7 ran yesterday: due again today', nightlyDueDay(at('2026-10-21T00:05:00Z'), '2026-10-20') === '2026-10-21');
check('8 a server that starts at 14:00 local does not run the jobs', nightlyDueDay(at('2026-10-21T11:00:00Z'), null) === null);

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
