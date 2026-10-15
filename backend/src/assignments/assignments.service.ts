import {
  findActiveAssignment,
  markStarted,
  markEnded,
  findDirection,
  changeDirection,
  findOppositeDirection,
  findOpenDeparture,
  confirmFlip,
  setCrowding,
  markDepartingNow,
  type CrowdingStatus,
} from './assignments.repository';
import { crowdingView } from '../crowding/crowding.rules';

export async function getCurrentShift(driverId: number) {
  return findActiveAssignment(driverId);
}

export async function startShift(driverId: number) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };
  if (current.status !== 'assigned') return { ok: false as const, reason: 'already_started' as const };

  const updated = await markStarted(current.id);
  if (!updated) return { ok: false as const, reason: 'already_started' as const };

  return { ok: true as const, assignment: await findActiveAssignment(driverId) };
}

export async function endShift(driverId: number) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };

  await markEnded(current.id);
  return { ok: true as const, assignmentId: current.id };
}

// The crew picks a different route direction.
// Allowed only before Start ('assigned') or at a terminal ('at_terminal').
export async function selectDirection(driverId: number, routeDirectionId: number) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };

  if (current.status !== 'assigned' && current.status !== 'at_terminal') {
    return { ok: false as const, reason: 'not_allowed' as const };
  }

  const target = await findDirection(routeDirectionId);
  if (!target) return { ok: false as const, reason: 'unknown_direction' as const };

  // Same direction: nothing to change, nothing to log.
  if (current.routeDirectionId === routeDirectionId) {
    return { ok: true as const, changed: false, assignment: current };
  }

  const changed = await changeDirection(
    current.id,
    current.routeDirectionId,
    routeDirectionId,
    current.status,
  );
  if (!changed) return { ok: false as const, reason: 'not_allowed' as const };

  return { ok: true as const, changed: true, assignment: await findActiveAssignment(driverId) };
}

// The driver taps "Start return trip" while the bus is at the terminal.

export async function startReturnTrip(driverId: number) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };
  if (current.status !== 'at_terminal') return { ok: false as const, reason: 'not_at_terminal' as const };

  const open = await findOpenDeparture(current.id);
  if (!open) return { ok: false as const, reason: 'not_at_terminal' as const };

  // Already flipped (by an earlier tap): a second tap does nothing
  if (open.flipType !== null) return { ok: true as const, changed: false, assignment: current };

  // The crew changed the route at this terminal
  if (open.fromRouteDirectionId !== current.routeDirectionId) {
    return { ok: false as const, reason: 'route_changed' as const };
  }

  const oppositeId = await findOppositeDirection(current.routeDirectionId);
  if (oppositeId === null) return { ok: false as const, reason: 'no_opposite' as const };

  const done = await confirmFlip(current.id, open.id, oppositeId);
  if (!done) return { ok: false as const, reason: 'not_at_terminal' as const };

  return { ok: true as const, changed: true, assignment: await findActiveAssignment(driverId) };
}
export function describeAssignment<T extends { crowding: CrowdingStatus; crowdingSetAt: Date | null }>(a: T) {
  return { ...a, crowdingView: crowdingView(a.crowding, a.crowdingSetAt, new Date()) };
}

// The crew reports how full the bus is. Allowed only while the shift is running.
export async function setCrowdingStatus(driverId: number, status: CrowdingStatus) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };
  if (current.status !== 'on_trip' && current.status !== 'at_terminal') {
    return { ok: false as const, reason: 'not_running' as const };
  }
  const done = await setCrowding(current.id, status);
  if (!done) return { ok: false as const, reason: 'not_running' as const };
  return { ok: true as const, assignment: await findActiveAssignment(driverId) };
}

// The driver taps "Departing now" while the bus waits at the terminal.

export async function departingNow(driverId: number, crowding: CrowdingStatus | null) {
  const current = await findActiveAssignment(driverId);
  if (!current) return { ok: false as const, reason: 'no_shift' as const };
  if (current.status !== 'at_terminal') return { ok: false as const, reason: 'not_at_terminal' as const };

  const open = await findOpenDeparture(current.id);
  if (!open) return { ok: false as const, reason: 'not_at_terminal' as const };

  const changed = await markDepartingNow(current.id, open.id, crowding);
  return { ok: true as const, changed, assignment: await findActiveAssignment(driverId) };
}
