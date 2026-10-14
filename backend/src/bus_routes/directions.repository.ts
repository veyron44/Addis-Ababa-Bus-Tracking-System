import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { routes, routeDirections } from '../db/schema';

export async function listDirections() {
  return db
    .select({
      id: routeDirections.id,
      routeNumber: routes.routeNumber,
      routeName: routes.name,
      routeNameAm: routes.nameAm,
      directionName: routeDirections.directionName,
    })
    .from(routeDirections)
    .innerJoin(routes, eq(routes.id, routeDirections.routeId))
    .orderBy(asc(routes.routeNumber), asc(routeDirections.directionName));
}