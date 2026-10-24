import { routeColor } from './routeColors';

let failed = 0;
let n = 0;

function check(name: string, ok: boolean, got?: unknown) {
  n += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${name}${got === undefined ? '' : '  got ' + String(got)}`);
}

check('route 49 is red', routeColor('49') === '#d1242f', routeColor('49'));
check('route 61 is blue', routeColor('61') === '#0969da', routeColor('61'));
check('the same number always gets the same colour', routeColor('7') === routeColor('7'));
check('other routes are not red or blue', !['#d1242f', '#0969da'].includes(routeColor('12')), routeColor('12'));
check('every colour is a valid hex colour', ['1', '12', '25', '100', 'A1'].every((r) => /^#[0-9a-f]{6}$/i.test(routeColor(r))));

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
if (failed > 0) throw new Error('Some checks failed');
