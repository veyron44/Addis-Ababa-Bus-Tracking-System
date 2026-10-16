import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { PLACEHOLDERS } from '../config/placeholders';

export async function sweepStaleShifts(): Promise<number[]> {
  const res = await db.execute(sql`
    WITH ended AS (
      UPDATE assignments
      SET status = 'ended', ended_at = now()
      WHERE status IN ('on_trip', 'at_terminal')
        AND COALESCE(last_ping_at, started_at)
            < now() - make_interval(mins => ${PLACEHOLDERS.noPingTimeoutMin}::int)
      RETURNING id
    ),
    closed AS (
      UPDATE warnings
      SET resolved_at = now()
      WHERE resolved_at IS NULL
        AND assignment_id IN (SELECT id FROM ended)
      RETURNING id
    )
    SELECT id FROM ended`);

  const ids = (res.rows as any[]).map((r) => Number(r.id));
  if (ids.length > 0) {
    console.log(
      `Auto-ended ${ids.length} shift(s) with no pings for ${PLACEHOLDERS.noPingTimeoutMin} min: ${ids.join(', ')}`,
    );
  }
  return ids;
}
