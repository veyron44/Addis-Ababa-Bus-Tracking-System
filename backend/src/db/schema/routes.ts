import { pgTable, serial, text, integer, unique } from 'drizzle-orm/pg-core';
import { lineString } from './geometry';

//routes table
export const routes = pgTable('routes', {
  id: serial('id').primaryKey(),
  routeNumber: text('route_number').notNull().unique(),
    name: text('name'),
  nameAm: text('name_am'),
});

//route_directions table

export const routeDirections = pgTable(
  'route_directions',
  {
    id: serial('id').primaryKey(),
    routeId: integer('route_id')
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    directionName: text('direction_name').notNull(), // e.g. "toward Megenagna"
    path: lineString('path'),
  },
  (t) => [unique().on(t.routeId, t.directionName)],
);