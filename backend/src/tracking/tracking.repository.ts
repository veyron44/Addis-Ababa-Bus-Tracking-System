
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { locationPings, assignments, departures } from '../db/schema';

export type NewPing = typeof locationPings.$inferInsert;
export type StopPoint = { stopId: number; lng: number; lat: number };

export type TerminalEvent =
  | { type: 'arrive'; at: Date; terminalStopId: number; fromRouteDirectionId: number }
  | { type: 'depart'; at: Date; crowding: NonNullable<NewPing['crowding']> }
  | { type: 'flip'; toRouteDirectionId: number };

// Saves pings, handles terminal events, and updates the shift in one transaction.
export async function commitBatch(
  assignmentId: number,
  rows: NewPing[],
  events: TerminalEvent[],
  finalStatus: 'on_trip' | 'at_terminal',
  finalDirectionId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    let saved = 0;
    if (rows.length > 0) {
      const inserted = await tx
        .insert(locationPings)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: locationPings.id });
      saved = inserted.length;
    }

    for (const e of events) {
      if (e.type === 'arrive') {
        await tx.insert(departures).values({
          assignmentId,
          terminalStopId: e.terminalStopId,
          fromRouteDirectionId: e.fromRouteDirectionId,
          arrivedAt: e.at,
        });

        // Reset crowding when the bus arrives.
        const arrivedIso = e.at.toISOString();
        await tx.execute(sql`
          UPDATE assignments
          SET crowding = 'not_reported', crowding_set_at = ${arrivedIso}::timestamptz
          WHERE id = ${assignmentId} AND status <> 'ended'`);
      } else if (e.type === 'depart') {
        const at = e.at.toISOString();
        await tx.execute(sql`
          UPDATE departures
          SET departed_at = ${at}::timestamptz,
              layover_seconds = GREATEST(0, floor(extract(epoch FROM (${at}::timestamptz - arrived_at)))::int),
              crowding_at_departure = COALESCE(
                NULLIF((SELECT a.crowding FROM assignments a WHERE a.id = ${assignmentId}), 'not_reported'),
                ${e.crowding}::crowding_status)
          WHERE assignment_id = ${assignmentId} AND departed_at IS NULL`);
      } else {
        // Mark the latest unflipped departure.
        await tx.execute(sql`
          UPDATE departures
          SET flip_type = 'auto', to_route_direction_id = ${e.toRouteDirectionId}
          WHERE id = (
            SELECT id FROM departures
            WHERE assignment_id = ${assignmentId} AND departed_at IS NOT NULL AND flip_type IS NULL
            ORDER BY arrived_at DESC
            LIMIT 1)`);
      }
    }

    // Apply the newest crowding update from the phone.
    const withCrowd = rows.filter((r) => r.crowdingSetAt);
    if (withCrowd.length > 0) {
      const best = withCrowd.reduce((a, b) => {
        const ta = (a.crowdingSetAt as Date).getTime();
        const tb = (b.crowdingSetAt as Date).getTime();
        return tb > ta || (tb === ta && b.recordedAt.getTime() > a.recordedAt.getTime()) ? b : a;
      });
      const setIso = (best.crowdingSetAt as Date).toISOString();
      const bestStatus = best.crowding ?? 'not_reported';
      await tx.execute(sql`
        UPDATE assignments
        SET crowding = ${bestStatus}::crowding_status, crowding_set_at = ${setIso}::timestamptz
        WHERE id = ${assignmentId} AND status <> 'ended'
          AND (crowding_set_at IS NULL OR crowding_set_at < ${setIso}::timestamptz)`);
    }

    // Don't reactivate an ended shift.
    await tx
      .update(assignments)
      .set({ status: finalStatus, routeDirectionId: finalDirectionId, lastPingAt: new Date() })
      .where(and(eq(assignments.id, assignmentId), ne(assignments.status, 'ended')));

    return saved;
  });
}

export type TrackState = {
  last: { progress: number; time: Date } | null; // Latest matched point
  anchor: { lng: number; lat: number } | null; // Last moving point
};

// Loads the previous tracking state for this direction.
export async function loadTrackState(
  assignmentId: number,
  routeDirectionId: number,
  before: Date,
): Promise<TrackState> {
  const beforeIso = before.toISOString();

  const lastRes = await db.execute(sql`
    SELECT progress, recorded_at
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND progress IS NOT NULL
      AND recorded_at < ${beforeIso}::timestamptz
    ORDER BY recorded_at DESC
    LIMIT 1`);

  const anchorRes = await db.execute(sql`
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND progress IS NOT NULL
      AND stationary = false
      AND recorded_at < ${beforeIso}::timestamptz
    ORDER BY recorded_at DESC
    LIMIT 1`);

  const l = (lastRes.rows as any[])[0];
  const a = (anchorRes.rows as any[])[0];
  return {
    last: l ? { progress: Number(l.progress), time: new Date(l.recorded_at) } : null,
    anchor: a ? { lng: Number(a.lng), lat: Number(a.lat) } : null,
  };
}

export type Match = { progress: number; distanceM: number };

// Matches a point to the route, searching near the last position when available.
export async function matchPoint(
  routeDirectionId: number,
  lng: number,
  lat: number,
  lastProgress: number | null,
  aheadM: number,
  backM: number,
): Promise<Match> {
  const res = await db.execute(sql`
    WITH base AS (
      SELECT path, ST_Length(path::geography) AS len
      FROM route_directions
      WHERE id = ${routeDirectionId}
    ),
    win AS (
      SELECT path,
        CASE WHEN ${lastProgress}::float8 IS NULL THEN 0::float8
             ELSE GREATEST(0::float8, ${lastProgress}::float8 - ${backM}::float8 / len) END AS s,
        CASE WHEN ${lastProgress}::float8 IS NULL THEN 1::float8
             ELSE LEAST(1::float8, ${lastProgress}::float8 + ${aheadM}::float8 / len) END AS e
      FROM base
    ),
    win2 AS (
      SELECT path, s, LEAST(1::float8, GREATEST(e, s + 0.0001::float8)) AS e FROM win
    ),
    seg AS (
      SELECT s, e, ST_LineSubstring(path, s, e) AS g FROM win2
    ),
    pt AS (
      SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS g
    )
    SELECT seg.s + ST_LineLocatePoint(seg.g, pt.g) * (seg.e - seg.s) AS progress,
           ST_Distance(seg.g::geography, pt.g::geography) AS dist_m
    FROM seg, pt`);

  const row = (res.rows as any[])[0];
  return { progress: Number(row.progress), distanceM: Number(row.dist_m) };
}

// Returns the last stop on the route direction.
export async function getTerminalOfDirection(routeDirectionId: number): Promise<StopPoint | null> {
  const res = await db.execute(sql`
    SELECT s.id AS stop_id, ST_X(s.location) AS lng, ST_Y(s.location) AS lat
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    WHERE rs.route_direction_id = ${routeDirectionId}
    ORDER BY rs.stop_order DESC
    LIMIT 1`);
  const r = (res.rows as any[])[0];
  return r ? { stopId: Number(r.stop_id), lng: Number(r.lng), lat: Number(r.lat) } : null;
}

// Returns the terminal where the bus is waiting, if any.
export async function getOpenDeparture(
  assignmentId: number,
): Promise<(StopPoint & { flipped: boolean }) | null> {
  const res = await db.execute(sql`
    SELECT d.terminal_stop_id AS stop_id, ST_X(s.location) AS lng, ST_Y(s.location) AS lat, d.flip_type
    FROM departures d
    JOIN stops s ON s.id = d.terminal_stop_id
    WHERE d.assignment_id = ${assignmentId} AND d.departed_at IS NULL
    ORDER BY d.arrived_at DESC
    LIMIT 1`);
  const r = (res.rows as any[])[0];
  return r
    ? { stopId: Number(r.stop_id), lng: Number(r.lng), lat: Number(r.lat), flipped: r.flip_type !== null }
    : null;
}

// Returns the time of the latest saved ping.
export async function latestPingTime(assignmentId: number): Promise<Date | null> {
  const res = await db.execute(sql`
    SELECT max(recorded_at) AS t FROM location_pings WHERE assignment_id = ${assignmentId}`);
  const r = (res.rows as any[])[0];
  return r && r.t ? new Date(r.t) : null;
}

export type FlipContext = { oppId: number; oppLenM: number; oldLenM: number };

// Gets the opposite direction and both route lengths.
export async function getFlipContext(routeDirectionId: number): Promise<FlipContext | null> {
  const res = await db.execute(sql`
    SELECT rd2.id AS opp_id,
           ST_Length(rd2.path::geography) AS opp_len,
           ST_Length(rd.path::geography) AS old_len
    FROM route_directions rd
    JOIN route_directions rd2 ON rd2.route_id = rd.route_id AND rd2.id <> rd.id
    WHERE rd.id = ${routeDirectionId}`);
  const rows = res.rows as any[];
  if (rows.length !== 1) return null;
  return {
    oppId: Number(rows[0].opp_id),
    oppLenM: Number(rows[0].opp_len),
    oldLenM: Number(rows[0].old_len),
  };
}

// Finds a departure that still needs a direction flip.
export async function getPendingFlip(
  assignmentId: number,
  routeDirectionId: number,
): Promise<{ departedAt: Date } | null> {
  const res = await db.execute(sql`
    SELECT departed_at
    FROM departures
    WHERE assignment_id = ${assignmentId}
      AND from_route_direction_id = ${routeDirectionId}
      AND departed_at IS NOT NULL
      AND flip_type IS NULL
    ORDER BY arrived_at DESC
    LIMIT 1`);
  const r = (res.rows as any[])[0];
  return r ? { departedAt: new Date(r.departed_at) } : null;
}

// Loads recent pings since departure, oldest first.
export async function loadTrail(
  assignmentId: number,
  routeDirectionId: number,
  since: Date,
  limit: number,
): Promise<{ lng: number; lat: number }[]> {
  const sinceIso = since.toISOString();
  const res = await db.execute(sql`
    SELECT ST_X(location) AS lng, ST_Y(location) AS lat
    FROM location_pings
    WHERE assignment_id = ${assignmentId}
      AND route_direction_id = ${routeDirectionId}
      AND recorded_at >= ${sinceIso}::timestamptz
    ORDER BY recorded_at DESC
    LIMIT ${limit}`);
  return (res.rows as any[]).reverse().map((r) => ({ lng: Number(r.lng), lat: Number(r.lat) }));
}

// Returns the current crowding status and when it was set.
export async function getAssignmentCrowding(
  assignmentId: number,
): Promise<{ status: 'not_reported' | 'seats_available' | 'standing_only' | 'full'; setAt: Date | null }> {
  const res = await db.execute(sql`
    SELECT crowding, crowding_set_at FROM assignments WHERE id = ${assignmentId}`);
  const r = (res.rows as any[])[0];
  return {
    status: (r?.crowding ?? 'not_reported') as 'not_reported' | 'seats_available' | 'standing_only' | 'full',
    setAt: r?.crowding_set_at ? new Date(r.crowding_set_at) : null,
  };
}