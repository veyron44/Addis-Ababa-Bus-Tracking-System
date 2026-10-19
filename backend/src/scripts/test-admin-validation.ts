import { parseId, cleanPlate, cleanName, cleanUsername, passwordProblem } from '../admin/admin.validation';

// No database needed: npx tsx src/scripts/test-admin-validation.ts
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

check('1 parseId "12"', parseId('12') === 12);
check('2 parseId 7 (number)', parseId(7) === 7);
check('3 parseId rejects 0, -1, 1.5, "abc", "", null, "12abc"',
  [0, -1, 1.5, 'abc', '', null, '12abc'].every((x) => parseId(x) === null));
check('4 parseId rejects a huge number', parseId('99999999999999999999') === null);

check('5 plate is trimmed and capitalised', cleanPlate('  aa-1234 ') === 'AA-1234', String(cleanPlate('  aa-1234 ')));
check('6 plate inner spaces collapse', cleanPlate('3  12345   aa') === '3 12345 AA');
check('7 plate rejects "", "A", symbols, too long',
  ['', 'A', 'AA#12', 'X'.repeat(21), 12 as any].every((x) => cleanPlate(x) === null));

check('8 name ok', cleanName('  Abebe  Kebede ') === 'Abebe Kebede');
check('9 name rejects 1 character and 61 characters', cleanName('A') === null && cleanName('A'.repeat(61)) === null);
check('10 name accepts Amharic', cleanName('አበበ ከበደ') === 'አበበ ከበደ');

check('11 username lowercased', cleanUsername(' Bus.Two ') === 'bus.two');
check('12 username rejects spaces, "ab", capitals-only symbols',
  ['bus one', 'ab', 'bus$', 'x'.repeat(31), 5 as any].every((x) => cleanUsername(x) === null));

check('13 password too short', passwordProblem('abc1234') !== null);
check('14 password 8 characters is fine', passwordProblem('abcd1234') === null);
check('15 password over 72 bytes refused', passwordProblem('a'.repeat(73)) !== null);
check('16 password must be text', passwordProblem(12345678 as any) !== null && passwordProblem(undefined) !== null);

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
process.exitCode = failed === 0 ? 0 : 1;
