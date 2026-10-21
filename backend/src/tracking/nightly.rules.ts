import { PLACEHOLDERS } from '../config/placeholders';

function local(ms: number) {
  return new Date(ms + PLACEHOLDERS.localUtcOffsetHours * 3_600_000);
}

// The local date as text, for example "2026-10-21". Used to run the job once per day.
export function localDay(ms: number): string {
  return local(ms).toISOString().slice(0, 10);
}

// The day to mark as done when the nightly jobs are due now, else null.
// Due only during the nightly hour, and only once per local day. A server that starts at
// 14:00 does not run them.
export function nightlyDueDay(nowMs: number, lastRunDay: string | null): string | null {
  if (local(nowMs).getUTCHours() !== PLACEHOLDERS.nightlyHourLocal) return null;
  const today = localDay(nowMs);
  return today === lastRunDay ? null : today;
}
