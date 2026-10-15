import { PLACEHOLDERS } from '../config/placeholders';
import { offPathVerdict, wrongWayVerdict } from './warnings.rules';
import {
  openWarning,
  closeWarning,
  getShiftBasics,
  loadRecentMoving,
  isFlipPending,
  findSilentShifts,
  closeSilenceWarnings,
  findOverdueAtTerminal,
  closeOverdueWarnings,
  closeWarningsOfEndedShifts,
} from './warnings.repository';

const SEVERITY = {
  bad_clock: 'info',
  no_signal: 'warning',
  overdue_at_terminal: 'warning',
} as const;

export async function checkWarnings(assignmentId: number) {
  const opened: string[] = [];
  const closed: string[] = [];

  const shift = await getShiftBasics(assignmentId);
  if (!shift || shift.status === 'ended') return { opened, closed };

  // Clear both warnings at the terminal.
  if (shift.status === 'at_terminal') {
    for (const t of ['wrong_way', 'off_path']) {
      if (await closeWarning(assignmentId, t)) closed.push(t);
    }
    return { opened, closed };
  }

  const recent = await loadRecentMoving(assignmentId, shift.routeDirectionId, 100);
  if (recent.length === 0) return { opened, closed };
  const newest = recent[0].time;

  // Skip checks while the direction flip is pending.
  if (await isFlipPending(assignmentId, shift.routeDirectionId, newest, PLACEHOLDERS.flipGiveUpMin)) {
    return { opened, closed };
  }

  // Check if the bus is off the route.
  const dists = recent.map((r) => r.pathDistanceM).filter((d): d is number => d !== null);
  const off = offPathVerdict(dists);
  if (off === 'off') {
    if (await openWarning(assignmentId, 'off_path', `${Math.round(dists[0])} m from the road`)) {
      opened.push('off_path');
    }
  } else if (off === 'back') {
    if (await closeWarning(assignmentId, 'off_path')) closed.push('off_path');
  }

  // Check if the bus is moving the wrong way.
  const windowStart = newest.getTime() - PLACEHOLDERS.mismatchWindowSec * 1000;
  const points = recent
    .filter((r) => r.time.getTime() >= windowStart && r.progress !== null)
    .reverse()
    .map((r) => ({ timeMs: r.time.getTime(), progress: r.progress as number }));
  const ww = wrongWayVerdict(points, shift.pathLenM);
  if (ww === 'wrong') {
    if (await openWarning(assignmentId, 'wrong_way', 'progress falling along the road')) {
      opened.push('wrong_way');
    }
  } else if (ww === 'ok') {
    if (await closeWarning(assignmentId, 'wrong_way')) closed.push('wrong_way');
  }

  return { opened, closed };
}

// Check whether the phone clock is correct.
export async function recordClockStatus(assignmentId: number, timeTrusted: boolean, offsetSec: number) {
  if (timeTrusted) {
    await closeWarning(assignmentId, 'bad_clock');
    return;
  }
  const min = Math.round(Math.abs(offsetSec) / 60);
  await openWarning(assignmentId, 'bad_clock', `phone clock off by ${min} min`, SEVERITY.bad_clock);
}

// Check for silent buses and long waits at terminals.
export async function checkTimeWarnings() {
  const opened: string[] = [];

  for (const s of await findSilentShifts(PLACEHOLDERS.noSignalWarnSec)) {
    const min = Math.max(1, Math.round(s.silentSec / 60));
    if (await openWarning(s.id, 'no_signal', `no points for ${min} min`, SEVERITY.no_signal)) {
      opened.push(`no_signal:${s.id}`);
    }
  }
  for (const o of await findOverdueAtTerminal(PLACEHOLDERS.maxWaitMin)) {
    if (await openWarning(o.id, 'overdue_at_terminal', `waiting ${o.waitedMin} min at the terminal`, SEVERITY.overdue_at_terminal)) {
      opened.push(`overdue_at_terminal:${o.id}`);
    }
  }

  // Close warnings for shifts that ended or are no longer overdue.
  const closed =
    (await closeSilenceWarnings(PLACEHOLDERS.noSignalWarnSec)) +
    (await closeOverdueWarnings(PLACEHOLDERS.maxWaitMin)) +
    (await closeWarningsOfEndedShifts());

  return { opened, closed };
}