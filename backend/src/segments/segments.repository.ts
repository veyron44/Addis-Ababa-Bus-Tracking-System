import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import type { PingPoint, BadWindow, SegmentGroup } from './segments.rules';

export async function findShiftDirections(
  sinceDays: number,
): Promise<{ assignmentId: number; routeDirectionId: number }[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT assignment_id, route_direction_id
    FROM location_pings
    WHERE recorded_at >= now() - ${sinceDays}::int * interval '1 day'
      AND time_trusted = true
      AND progress IS NOT NULL
    ORDER BY assignment_id, route_direction_id`);
  return (res.rows as any[]).map((r) => ({
    assignmentId: Number(r.assignment_id),
    routeDirectionId: Number(r.route_direction_id),
  }));
}

// Oldest first. Trusted clocks only.
export async function loadPings(
  assignmentId: number,
  routeDirectionId: number,
  sinceDays: number,
): Promise<PingPoint[]> {
  const res = await db.execute(sql`
    SELECT recorded_at, progress
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND time_trusted = true
      AND progress IS NOT NULL
      AND recorded_at >= now() - ${sinceDays}::int * interval '1 day'
    ORDER BY recorded_at`);
  return (res.rows as any[]).map((r) => ({
    timeMs: new Date(r.recorded_at).getTime(),
    progress: Number(r.progress),
  }));
}

// Warning periods that make timing unreliable, widened by padSec on both sides (a warning opens
// a little after the trouble starts and closes a little after it ends).
export async function loadBadWindows(assignmentId: number, padSec: number): Promise<BadWindow[]> {
  const res = await db.execute(sql`
    SELECT started_at, COALESCE(resolved_at, now()) AS until
    FROM warnings
    WHERE assignment_id = ${assignmentId}
      AND type IN ('wrong_way', 'off_path', 'no_signal', 'bad_clock')`);
  return (res.rows as any[]).map((r) => ({
    fromMs: new Date(r.started_at).getTime() - padSec * 1000,
    toMs: new Date(r.until).getTime() + padSec * 1000,
  }));
}

export type CurrentRow = { seconds: number; measured: boolean; sampleCount: number };

// Every segment_times row, keyed "from-to-dayType-bucket".
export async function loadCurrentRows(): Promise<Map<string, CurrentRow>> {
  const res = await db.execute(sql`
    SELECT from_stop_id, to_stop_id, day_type, time_bucket, seconds, measured, sample_count
    FROM segment_times`);
  const map = new Map<string, CurrentRow>();
  for (const r of res.rows as any[]) {
    map.set(`${r.from_stop_id}-${r.to_stop_id}-${r.day_type}-${r.time_bucket}`, {
      seconds: Number(r.seconds),
      measured: Boolean(r.measured),
      sampleCount: Number(r.sample_count),
    });
  }
  return map;
}

// Replaces the guess with the measured median; adds the pair if it is missing.
export async function saveMeasured(g: SegmentGroup) {
  await db.execute(sql`
    INSERT INTO segment_times (from_stop_id, to_stop_id, day_type, time_bucket, seconds, measured, sample_count)
    VALUES (${g.fromStopId}, ${g.toStopId}, ${g.dayType}::day_type, ${g.bucket}, ${g.seconds}, true, ${g.n})
    ON CONFLICT (from_stop_id, to_stop_id, day_type, time_bucket)
    DO UPDATE SET seconds = EXCLUDED.seconds, measured = true, sample_count = EXCLUDED.sample_count`);
}

// How much of the table is measured (for the report to the authority).
export async function countSegments() {
  const res = await db.execute(sql`
    SELECT count(*) AS rows_total,
           count(*) FILTER (WHERE measured) AS rows_measured,
           (SELECT count(*) FROM (SELECT DISTINCT from_stop_id, to_stop_id FROM segment_times) x) AS pairs_total,
           (SELECT count(*) FROM (SELECT DISTINCT from_stop_id, to_stop_id FROM segment_times WHERE measured) y) AS pairs_measured
    FROM segment_times`);
  const r = (res.rows as any[])[0];
  return {
    rowsTotal: Number(r.rows_total),
    rowsMeasured: Number(r.rows_measured),
    pairsTotal: Number(r.pairs_total),
    pairsMeasured: Number(r.pairs_measured),
  };
}
