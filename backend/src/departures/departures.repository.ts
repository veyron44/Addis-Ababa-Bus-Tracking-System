import { sql } from 'drizzle-orm';
import { db } from '../db/index';

export type StartingDirection = {
  yId: number; // direction that starts at this stop
  routeNumber: string;
  directionName: string;
  xId: number | null; // opposite direction: its buses end here, turn around and become y
};

export async function findStartingDirections(stopId: number): Promise<StartingDirection[]> {
  const res = await db.execute(sql`
    SELECT rs.route_direction_id AS y_id, r.route_number, rd.direction_name, opp.id AS x_id
    FROM route_stops rs
    JOIN route_directions rd ON rd.id = rs.route_direction_id
    JOIN routes r ON r.id = rd.route_id
    LEFT JOIN route_directions opp ON opp.route_id = rd.route_id AND opp.id <> rd.id
    WHERE rs.stop_id = ${stopId} AND rs.stop_order = 1
    ORDER BY r.route_number, rd.direction_name`);
  return (res.rows as any[]).map((r) => ({
    yId: Number(r.y_id),
    routeNumber: String(r.route_number),
    directionName: String(r.direction_name),
    xId: r.x_id === null ? null : Number(r.x_id),
  }));
}

export async function findLastStops(directionIds: number[]): Promise<Map<number, number>> {
  if (directionIds.length === 0) return new Map();
  const res = await db.execute(sql`
    SELECT DISTINCT ON (rs.route_direction_id) rs.route_direction_id, rs.stop_id
    FROM route_stops rs
    WHERE rs.route_direction_id IN ${directionIds}
    ORDER BY rs.route_direction_id, rs.stop_order DESC`);
  return new Map((res.rows as any[]).map((r) => [Number(r.route_direction_id), Number(r.stop_id)]));
}

export type WaitingRow = {
  id: number;
  routeDirectionId: number; // direction the shift has now
  fromDirectionId: number; // direction it arrived on
  crowding: 'not_reported' | 'seats_available' | 'standing_only' | 'full';
  crowdingSetAt: Date | null;
  arrivedAt: Date;
  departingNowAt: Date | null;
};

// Regular buses waiting at a terminal that could leave from this stop.
export async function findWaitingBuses(xIds: number[], yIds: number[]): Promise<WaitingRow[]> {
  if (xIds.length === 0 && yIds.length === 0) return [];
  const fromX = xIds.length ? sql`d.from_route_direction_id IN ${xIds}` : sql`FALSE`;
  const nowY = yIds.length ? sql`a.route_direction_id IN ${yIds}` : sql`FALSE`;
  const res = await db.execute(sql`
    SELECT DISTINCT ON (a.id)
           a.id, a.route_direction_id, a.crowding, a.crowding_set_at,
           d.from_route_direction_id, d.arrived_at, d.departing_now_at
    FROM assignments a
    JOIN departures d ON d.assignment_id = a.id AND d.departed_at IS NULL
    WHERE a.status = 'at_terminal'
      AND a.service_type = 'regular'
      AND (${fromX} OR ${nowY})
    ORDER BY a.id, d.arrived_at DESC`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    routeDirectionId: Number(r.route_direction_id),
    fromDirectionId: Number(r.from_route_direction_id),
    crowding: r.crowding,
    crowdingSetAt: r.crowding_set_at ? new Date(r.crowding_set_at) : null,
    arrivedAt: new Date(r.arrived_at),
    departingNowAt: r.departing_now_at ? new Date(r.departing_now_at) : null,
  }));
}

export type RoadRow = {
  id: number;
  routeDirectionId: number;
  crowding: 'not_reported' | 'seats_available' | 'standing_only' | 'full';
  crowdingSetAt: Date | null;
};

// Regular buses on the road toward their terminal.
export async function findRoadBuses(xIds: number[]): Promise<RoadRow[]> {
  if (xIds.length === 0) return [];
  const res = await db.execute(sql`
    SELECT id, route_direction_id, crowding, crowding_set_at
    FROM assignments
    WHERE status = 'on_trip' AND service_type = 'regular' AND route_direction_id IN ${xIds}`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    routeDirectionId: Number(r.route_direction_id),
    crowding: r.crowding,
    crowdingSetAt: r.crowding_set_at ? new Date(r.crowding_set_at) : null,
  }));
}

export type NotStartedRow = { id: number; routeDirectionId: number; createdAt: Date };

// Shifts assigned but not started (recent ones only).
export async function findNotStarted(yIds: number[], maxHours: number): Promise<NotStartedRow[]> {
  if (yIds.length === 0) return [];
  const res = await db.execute(sql`
    SELECT id, route_direction_id, created_at
    FROM assignments
    WHERE status = 'assigned' AND service_type = 'regular'
      AND route_direction_id IN ${yIds}
      AND created_at > now() - make_interval(hours => ${maxHours}::int)`);
  return (res.rows as any[]).map((r) => ({
    id: Number(r.id),
    routeDirectionId: Number(r.route_direction_id),
    createdAt: new Date(r.created_at),
  }));
}

export async function findLastDeparture(xIds: number[]): Promise<Date | null> {
  if (xIds.length === 0) return null;
  const res = await db.execute(sql`
    SELECT max(departed_at) AS t
    FROM departures
    WHERE from_route_direction_id IN ${xIds} AND departed_at IS NOT NULL`);
  const r = (res.rows as any[])[0];
  return r && r.t ? new Date(r.t) : null;
}

// Open wrong-way or off-path warning: the bus is hidden from riders.
export async function findHiddenIds(assignmentIds: number[]): Promise<Set<number>> {
  if (assignmentIds.length === 0) return new Set();
  const res = await db.execute(sql`
    SELECT DISTINCT assignment_id FROM warnings
    WHERE resolved_at IS NULL
      AND type IN ('wrong_way', 'off_path')
      AND assignment_id IN ${assignmentIds}`);
  return new Set((res.rows as any[]).map((r) => Number(r.assignment_id)));
}
