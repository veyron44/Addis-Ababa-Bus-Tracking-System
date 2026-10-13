import {
  pgTable, pgEnum, serial, text, integer, timestamp,
} from 'drizzle-orm/pg-core';
import { routeDirections } from './routes';

export const assignmentStatus = pgEnum('assignment_status', [
  'assigned', 'on_trip', 'at_terminal', 'ended',
]);

export const serviceType = pgEnum('service_type', [
  'regular', 'premium', 'special',
]);

// How full a bus is
export const crowdingStatus = pgEnum('crowding_status', [
  'not_reported', 'seats_available', 'standing_only', 'full',
]);

// A physical bus
export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  plate: text('plate').notNull().unique(), 
});

// One login per bus
export const drivers = pgTable('drivers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), 
});

// Login sessions
export const driverSessions = pgTable('driver_sessions', {
  id: serial('id').primaryKey(),
  driverId: integer('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Admin accounts
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), 
});

// Admin login sessions
export const adminSessions = pgTable('admin_sessions', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id')
    .notNull()
    .references(() => admins.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Links a bus,a driver login and a route direction for one shift
export const assignments = pgTable('assignments', { 
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id')
    .notNull()
    .references(() => vehicles.id),
  driverId: integer('driver_id')
    .notNull()
    .references(() => drivers.id),
  routeDirectionId: integer('route_direction_id')
    .notNull()
    .references(() => routeDirections.id),
  status: assignmentStatus('status').notNull().default('assigned'),
  serviceType: serviceType('service_type').notNull().default('regular'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  lastPingAt: timestamp('last_ping_at', { withTimezone: true }),
  crowding: crowdingStatus('crowding').notNull().default('not_reported'), 
  crowdingSetAt: timestamp('crowding_set_at', { withTimezone: true }),   
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row each time a crew changes their route direction
export const assignmentChanges = pgTable('assignment_changes', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  fromRouteDirectionId: integer('from_route_direction_id')
    .notNull()
    .references(() => routeDirections.id),
  toRouteDirectionId: integer('to_route_direction_id')
    .notNull()
    .references(() => routeDirections.id),
  statusAtChange: assignmentStatus('status_at_change').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
// A problem the system noticed with a bus. Open while resolved_at is empty.
export const warnings = pgTable('warnings', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'wrong_way' | 'off_path' | 'bad_clock' | 'no_signal' | 'overdue_at_terminal'
  severity: text('severity').notNull().default('warning'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  detail: text('detail'),
});
