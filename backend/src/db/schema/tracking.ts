import {
  pgTable, pgEnum, serial, bigserial, integer, real, doublePrecision,
  timestamp, index, unique, boolean,
} from 'drizzle-orm/pg-core';
import { point } from './geometry';
import { routeDirections } from './routes';
import { stops } from './stops';
import { assignments, crowdingStatus } from './fleet';

export const flipType = pgEnum('flip_type', ['auto', 'confirmed']);

export const dayType = pgEnum('day_type', ['weekday', 'weekend']);

// Every GPS point a bus phone sends.
export const locationPings = pgTable(
  'location_pings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    assignmentId: integer('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    routeDirectionId: integer('route_direction_id')
      .notNull()
      .references(() => routeDirections.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(), // corrected phone time
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    location: point('location').notNull(),
    speedKmh: real('speed_kmh'),
    accuracyM: real('accuracy_m'),
    progress: doublePrecision('progress'), // 0 to 1 along the path
    pathDistanceM: real('path_distance_m'), // metres from the road, null while stopped
    crowding: crowdingStatus('crowding').notNull().default('not_reported'),
    crowdingSetAt: timestamp('crowding_set_at', { withTimezone: true }),
    timeTrusted: boolean('time_trusted').notNull().default(true),
    stationary: boolean('stationary').notNull().default(false),
  },
  (t) => [
    index('pings_assignment_time_idx').on(t.assignmentId, t.recordedAt),
    index('pings_location_gix').using('gist', t.location),
    unique('pings_assignment_time_uq').on(t.assignmentId, t.recordedAt),
  ],
);

// One row each time a bus reaches a terminal and later leaves it.
export const departures = pgTable('departures', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  terminalStopId: integer('terminal_stop_id')
    .notNull()
    .references(() => stops.id),
  fromRouteDirectionId: integer('from_route_direction_id')
    .notNull()
    .references(() => routeDirections.id),
  toRouteDirectionId: integer('to_route_direction_id')
    .references(() => routeDirections.id),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
  departingNowAt: timestamp('departing_now_at', { withTimezone: true }), // the crew tapped Departing now
  departedAt: timestamp('departed_at', { withTimezone: true }),
  flipType: flipType('flip_type'),
  crowdingAtDeparture: crowdingStatus('crowding_at_departure'),
  layoverSeconds: integer('layover_seconds'),
});

// Typical time to cross one stretch of road between two stops,
// by day type and 30-minute slot. Shared by every route that uses the stretch.
// Every row starts as a guess (measured = false). The nightly job replaces a guess with the median of real crossings once a slot has enough samples, and sets measured = true.
export const segmentTimes = pgTable(
  'segment_times',
  {
    id: serial('id').primaryKey(),
    fromStopId: integer('from_stop_id')
      .notNull()
      .references(() => stops.id, { onDelete: 'cascade' }),
    toStopId: integer('to_stop_id')
      .notNull()
      .references(() => stops.id, { onDelete: 'cascade' }),
    dayType: dayType('day_type').notNull(),
    timeBucket: integer('time_bucket').notNull(), 
    seconds: integer('seconds').notNull(),
    measured: boolean('measured').notNull().default(false), // false = guess, true = real median
    sampleCount: integer('sample_count').notNull().default(0), // real crossings behind a measured value
  },
  (t) => [unique().on(t.fromStopId, t.toStopId, t.dayType, t.timeBucket)],
);
