import {
  listAssignments,
  listDirections,
  getAssignment,
  insertAssignment,
  patchAssignment,
  closeAssignment,
  type AssignmentRow,
  type StatusFilter,
  type CreateInput,
  type UpdateInput,
} from './admin_assignments.repository';

// What the admin sees for one shift (dates as text, no hashes, no passwords).
function view(r: AssignmentRow) {
  return {
    id: r.id,
    status: r.status,
    serviceType: r.serviceType,
    vehicle: { id: r.vehicleId, plate: r.plate },
    crew: { id: r.driverId, name: r.crew, username: r.username },
    route: { directionId: r.routeDirectionId, routeNumber: r.routeNumber, directionName: r.directionName },
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    lastPingAt: r.lastPingAt ? r.lastPingAt.toISOString() : null,
  };
}

export async function getAssignments(status: StatusFilter, limit: number) {
  return (await listAssignments(status, limit)).map(view);
}

export async function getDirections() {
  return listDirections();
}

export async function createAssignment(input: CreateInput) {
  const result = await insertAssignment(input);
  if (!result.ok) return result;
  const row = await getAssignment(result.id);
  return { ok: true as const, assignment: view(row!) };
}

export async function updateAssignment(id: number, patch: UpdateInput) {
  const result = await patchAssignment(id, patch);
  if (!result.ok) return result;
  const row = await getAssignment(id);
  return { ok: true as const, assignment: view(row!) };
}

export async function endAssignment(id: number) {
  const outcome = await closeAssignment(id);
  if (outcome !== 'ended') return { ok: false as const, reason: outcome };
  const row = await getAssignment(id);
  return { ok: true as const, assignment: view(row!) };
}
