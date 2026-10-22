import { canChangeRoute, canStart, isRunning, statusLabel } from './shift';

let failed = 0;
let n = 0;

function check(name: string, ok: boolean, got?: unknown) {
  n += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${name}${got === undefined ? '' : '  got ' + String(got)}`);
}

check('route can change before start', canChangeRoute('assigned'));
check('route can change at the terminal', canChangeRoute('at_terminal'));
check('route cannot change on the road', !canChangeRoute('on_trip'));
check('route cannot change after the shift ended', !canChangeRoute('ended'));
check('start only when not started', canStart('assigned'));
check('start is not offered on the road', !canStart('on_trip'));
check('start is not offered at the terminal', !canStart('at_terminal'));
check('on the road is running', isRunning('on_trip'));
check('at the terminal is running', isRunning('at_terminal'));
check('not started is not running', !isRunning('assigned'));
check('ended is not running', !isRunning('ended'));
check('labels', statusLabel('assigned') === 'Not started' && statusLabel('at_terminal') === 'At the terminal');

console.log(failed === 0 ? '\nAll passed.' : `\n${failed} FAILED.`);
if (failed > 0) throw new Error('Some checks failed');
