import { pgTable, serial, text, integer, unique, index } from 'drizzle-orm/pg-core';
import { point } from './geometry';
import { routeDirections } from './routes';


export const stops = pgTable(
  'stops',
  {
    id: serial('id').primaryKey(),
    side: text('side'),     
    placeName: text('place_name').notNull(), 
    placeNameAm: text('place_name_am'),                     
    location: point('location').notNull(),
  },
  (t) => [
    index('stops_place_name_idx').on(t.placeName),
    index('stops_location_gix').using('gist', t.location),
  ],
);

// Which stops each route direction serves, and in what order.
export const routeStops = pgTable(
  'route_stops',
  {
    id: serial('id').primaryKey(),
    routeDirectionId: integer('route_direction_id')
      .notNull()
      .references(() => routeDirections.id, { onDelete: 'cascade' }),
    stopId: integer('stop_id')
      .notNull()
      .references(() => stops.id, { onDelete: 'cascade' }),
    stopOrder: integer('stop_order').notNull(), //1 is the termianl
  },
  (t) => [unique().on(t.routeDirectionId, t.stopOrder)],
);