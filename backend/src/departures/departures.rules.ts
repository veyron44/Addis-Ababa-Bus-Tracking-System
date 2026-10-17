import { PLACEHOLDERS } from '../config/placeholders';
import { toMinutes } from '../eta/eta.rules';

export type DepartureCode = 'departing_soon' | 'estimate' | 'no_estimate';

export type WaitingDeparture = {
  code: DepartureCode;
  reason: 'overdue' | null;
  lowMin: number | null;
  highMin: number | null;
};

// A bus waiting at the terminal. maxWaitMin is a ceiling on what we promise, not a timer.
//  - past the ceiling: overdue, no countdown (the admin gets a warning)
//  - full, "Departing now" tapped, or past the typical layover: departing soon
//  - otherwise: from the typical remaining wait up to the ceiling
export function waitingDeparture(elapsedSec: number, full: boolean, departingNow: boolean): WaitingDeparture {
  const layoverSec = PLACEHOLDERS.terminalLayoverMin * 60;
  const maxSec = PLACEHOLDERS.maxWaitMin * 60;

  if (elapsedSec >= maxSec) return { code: 'no_estimate', reason: 'overdue', lowMin: null, highMin: null };
  if (full || departingNow || elapsedSec >= layoverSec) {
    return { code: 'departing_soon', reason: null, lowMin: null, highMin: null };
  }
  const m = toMinutes(layoverSec - elapsedSec, maxSec - elapsedSec);
  return { code: 'estimate', reason: null, lowMin: m.lowMin, highMin: m.highMin };
}

// A bus on the road to the terminal: arrival range + layover, up to arrival + ceiling.
// Arrives in 3 min -> leaves in 13 to 28 min. An arriving bus has no range (null, null),
// so it is just the layover up to the ceiling.
export function upcomingDeparture(etaLowMin: number | null, etaHighMin: number | null) {
  return {
    lowMin: (etaLowMin ?? 0) + PLACEHOLDERS.terminalLayoverMin,
    highMin: (etaHighMin ?? 0) + PLACEHOLDERS.maxWaitMin,
  };
}

// "Last bus left X min ago". Null when there is none or it was too long ago to mean anything.
export function minutesAgo(at: Date | null, now: Date): number | null {
  if (!at) return null;
  const min = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  return min > PLACEHOLDERS.lastLeftMaxMin ? null : min;
}

export function typicalGap() {
  return { lowMin: PLACEHOLDERS.typicalGapLowMin, highMin: PLACEHOLDERS.typicalGapHighMin };
}

export type Orderable = { group: 'waiting' | 'road' | 'not_started'; order: number };
const GROUP_RANK = { waiting: 0, road: 1, not_started: 2 } as const;

// Waiting first (earliest arrival boards first), then on the road (soonest first), then not started.
export function sortDepartures<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.order - b.order);
}

// The boarding bus: the one that has waited longest and is not overdue.
export function pickBoarding(waiting: { id: number; arrivedMs: number; overdue: boolean }[]): number | null {
  const ok = waiting.filter((w) => !w.overdue).sort((a, b) => a.arrivedMs - b.arrivedMs);
  return ok.length > 0 ? ok[0].id : null;
}
