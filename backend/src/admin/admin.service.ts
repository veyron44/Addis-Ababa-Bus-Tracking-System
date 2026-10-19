import { verifyPassword } from '../auth/password';
import { generateToken, hashToken } from '../auth/tokens';
import { PLACEHOLDERS } from '../config/placeholders';
import { crowdingView } from '../crowding/crowding.rules';
import {
  findAdminByUsername,
  createAdminSession,
  findValidAdminSession,
  findActiveShifts,
  findOpenWarnings,
  findAssignmentChanges,
  getChangeSummary,
} from './admin.repository';

export async function loginAdmin(username: string, password: string) {
  const admin = await findAdminByUsername(username);

  // Same outcome whether the user or the password is wrong.
  const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;
  if (!admin || !ok) return null;

  // Make a token, store only its hash, return the real token once.
  const token = generateToken();
  const expiresAt = new Date(Date.now() + PLACEHOLDERS.sessionHours * 60 * 60 * 1000);
  await createAdminSession(admin.id, hashToken(token), expiresAt);

  return { token, expiresAt, admin: { id: admin.id, name: admin.name } };
}

// Null when the token is unknown or expired.
export async function authenticateAdminToken(token: string) {
  const session = await findValidAdminSession(hashToken(token));
  if (!session) return null;
  return { id: session.adminId, name: session.name };
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

// The whole fleet in one answer: every unended shift with position, crowding and open warnings.
export async function getLiveAll() {
  const now = new Date();
  const shifts = await findActiveShifts();
  const warnings = await findOpenWarnings(shifts.map((s) => s.id));

  const byBus = new Map<number, ReturnType<typeof toWarningView>[]>();
  const toWarningView = (w: (typeof warnings)[number]) => ({
    type: w.type,
    severity: w.severity,
    detail: w.detail,
    startedAt: w.startedAt.toISOString(),
    ageSec: Math.max(0, Math.round((now.getTime() - w.startedAt.getTime()) / 1000)),
  });
  for (const w of warnings) {
    const list = byBus.get(w.assignmentId) ?? [];
    list.push(toWarningView(w));
    byBus.set(w.assignmentId, list);
  }

  const buses = shifts.map((s) => {
    const own = byBus.get(s.id) ?? [];
    const hiding = own.some((w) => w.type === 'wrong_way' || w.type === 'off_path');
    const running = s.status === 'on_trip' || s.status === 'at_terminal';
    return {
      busId: s.id,
      plate: s.plate,
      crew: s.crew,
      routeNumber: s.routeNumber,
      directionName: s.directionName,
      routeDirectionId: s.routeDirectionId,
      serviceType: s.serviceType,
      status: s.status,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      lastPingAgeSec: s.lastPingAt
        ? Math.max(0, Math.round((now.getTime() - s.lastPingAt.getTime()) / 1000))
        : null,
      position: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
      progress: s.progress,
      crowding: crowdingView(s.crowding as any, s.crowdingSetAt, now),
      // Would a rider see this bus? Only a running, regular bus with no hiding warning.
      shownToRiders: running && s.serviceType === 'regular' && !hiding,
      warnings: own,
    };
  });

  // One flat list for a warnings panel: most severe first, then oldest first.
  const flat = buses
    .flatMap((b) => b.warnings.map((w) => ({ ...w, busId: b.busId, plate: b.plate, routeNumber: b.routeNumber })))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.ageSec - a.ageSec,
    );

  return {
    generatedAt: now.toISOString(),
    counts: {
      onTrip: buses.filter((b) => b.status === 'on_trip').length,
      atTerminal: buses.filter((b) => b.status === 'at_terminal').length,
      notStarted: buses.filter((b) => b.status === 'assigned').length,
      busesWithWarnings: buses.filter((b) => b.warnings.length > 0).length,
      openWarnings: flat.length,
    },
    buses,
    warnings: flat,
  };
}

// Route change log, plus how often crews override the route they were given.
export async function getAssignmentChanges(limit: number, assignmentId: number | null) {
  const [rows, summary] = await Promise.all([
    findAssignmentChanges(limit, assignmentId),
    getChangeSummary(),
  ]);
  return {
    summary,
    changes: rows.map((r) => ({
      id: r.id,
      assignmentId: r.assignmentId,
      plate: r.plate,
      crew: r.crew,
      statusAtChange: r.statusAtChange,
      from: { routeNumber: r.fromRoute, directionName: r.fromDirection },
      to: { routeNumber: r.toRoute, directionName: r.toDirection },
      changedAt: r.changedAt.toISOString(),
    })),
  };
}
