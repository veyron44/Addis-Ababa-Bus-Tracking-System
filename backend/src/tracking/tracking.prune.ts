import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { PLACEHOLDERS } from '../config/placeholders';

// Points older than this are no longer needed. Never shorter than what the segment job reads.
export function pingKeepDays(): number {
  return Math.max(PLACEHOLDERS.pingKeepDays, PLACEHOLDERS.segmentLookbackDays);
}

// Deletes old location points, or only counts them when apply is false.
export async function pruneOldPings(apply: boolean): Promise<number> {
  const days = pingKeepDays();
  const res = apply
    ? await db.execute(sql`
        WITH gone AS (
          DELETE FROM location_pings
          WHERE recorded_at < now() - make_interval(days => ${days}::int)
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM gone`)
    : await db.execute(sql`
        SELECT count(*)::int AS n FROM location_pings
        WHERE recorded_at < now() - make_interval(days => ${days}::int)`);
  return Number((res.rows as any[])[0].n);
}
