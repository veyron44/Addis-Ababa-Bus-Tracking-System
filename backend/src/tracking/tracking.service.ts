import { getCurrentShift } from '../assignments/assignments.service';
import {
  commitBatch,
  loadTrackState,
  matchPoint,
  getTerminalOfDirection,
  getOpenDeparture,
  latestPingTime,
  getPendingFlip,
  loadTrail,
  getFlipContext,
  getAssignmentCrowding,
  type NewPing,
  type StopPoint,
  type TerminalEvent,
  type FlipContext,
  type Match,
} from './tracking.repository';
import { correctBatch, distanceM, flipEvidence } from './tracking.rules';
import { checkWarnings, recordClockStatus } from '../warnings/warnings.service';
import { crowdingView } from '../crowding/crowding.rules';
import { PLACEHOLDERS } from '../config/placeholders';

export type CrowdingValue = 'not_reported' | 'seats_available' | 'standing_only' | 'full';

export type PingInput = {
  recordedAt: Date;
  lng: number;
  lat: number;
  speedKmh: number | null;
  accuracyM: number | null;
  crowding: CrowdingValue;
  crowdingSetAt: Date | null;
};

// Points used to detect a direction change.
type TrailPoint = { lng: number; lat: number; opp?: Match; old?: Match };

async function fillMatches(trail: TrailPoint[], ctx: FlipContext, oldDirectionId: number) {
  for (const t of trail) {
    // Match the start of the opposite road and the end of the old one.
    if (!t.opp) t.opp = await matchPoint(ctx.oppId, t.lng, t.lat, 0, PLACEHOLDERS.flipSearchM, 0);
    if (!t.old) t.old = await matchPoint(oldDirectionId, t.lng, t.lat, 1, 0, PLACEHOLDERS.flipSearchM);
  }
}

export async function receivePings(driverId: number, points: PingInput[], sentAt: Date) {
  const shift = await getCurrentShift(driverId);
  if (!shift) return { ok: false as const, reason: 'no_shift' as const };

  // Only active shifts can send pings.
  if (shift.status !== 'on_trip' && shift.status !== 'at_terminal') {
    return { ok: false as const, reason: 'not_started' as const };
  }

  // Check the phone's clock before saving.
  const batch = correctBatch(points, sentAt, new Date());

  // Process points by timestamp.
  const sorted = [...batch.kept].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  // The direction may change during this batch.
  let dirId = shift.routeDirectionId;

  // Load the previous tracking state.
  const state = sorted.length
    ? await loadTrackState(shift.id, dirId, sorted[0].recordedAt)
    : { last: null, anchor: null };

  let lastProgress: number | null = state.last?.progress ?? null;
  let lastTime: Date | null = state.last?.time ?? null;
  let anchor = state.anchor;
  let rematched = 0;

  // Terminal state at batch start.
  const latestSaved = await latestPingTime(shift.id);
  let dirTerminal = await getTerminalOfDirection(dirId);
  let status: 'on_trip' | 'at_terminal' = shift.status === 'at_terminal' ? 'at_terminal' : 'on_trip';
  let waitingAt: StopPoint | null = null;
  let waitingFlipped = false; // crew already requested the return
  if (status === 'at_terminal') {
    const open = await getOpenDeparture(shift.id);
    if (open) {
      waitingAt = open;
      waitingFlipped = open.flipped;
    } else {
      // No arrival record, so resume the trip.
      status = 'on_trip';
    }
  }

  // Check for a pending direction change.
  let pending: { departedAt: Date; fromDirId: number } | null = null;
  let trail: TrailPoint[] = [];
  let flipCtx: FlipContext | null | undefined; // undefined = not loaded yet
  if (status === 'on_trip') {
    const p0 = await getPendingFlip(shift.id, dirId);
    if (p0) {
      pending = { departedAt: p0.departedAt, fromDirId: dirId };
      trail = await loadTrail(shift.id, dirId, p0.departedAt, PLACEHOLDERS.flipTrailPings - 1);
    }
  }

  const events: TerminalEvent[] = [];

  const rows: NewPing[] = [];
  for (const p of sorted) {
    let progress: number;
    let stationary = false;
    let pathDistM: number | null = null; // distance from road in metres

    if (
      anchor &&
      lastProgress !== null &&
      distanceM(anchor, { lng: p.lng, lat: p.lat }) <= PLACEHOLDERS.driftIgnoreM
    ) {
      // Ignore GPS drift while stopped.
      stationary = true;
      progress = lastProgress;
    } else {
      // Allow more progress after a longer gap.
      const elapsedSec = lastTime
        ? Math.max(0, (p.recordedAt.getTime() - lastTime.getTime()) / 1000)
        : 0;
      const aheadM = PLACEHOLDERS.searchAheadM + (elapsedSec * PLACEHOLDERS.maxSpeedKmh) / 3.6;

      let m = await matchPoint(dirId, p.lng, p.lat, lastProgress, aheadM, PLACEHOLDERS.backToleranceM);

      // If the point is far away, search the full road
      if (lastProgress !== null && m.distanceM > PLACEHOLDERS.offPathM) {
        const whole = await matchPoint(dirId, p.lng, p.lat, null, aheadM, PLACEHOLDERS.backToleranceM);
        if (whole.distanceM < m.distanceM) {
          m = whole;
          rematched++;
        }
      }
      progress = m.progress;
      pathDistM = m.distanceM;
      anchor = { lng: p.lng, lat: p.lat };
    }

    // Handle terminal events for new points only.
    const isNew = !latestSaved || p.recordedAt.getTime() > latestSaved.getTime();
    if (isNew) {
      let departedNow = false;

      if (status === 'on_trip' && !pending && dirTerminal) {
        const inside = distanceM(dirTerminal, p) <= PLACEHOLDERS.terminalRadiusM;
        if (inside && progress >= PLACEHOLDERS.arrivalMinProgress) {
          events.push({
            type: 'arrive',
            at: p.recordedAt,
            terminalStopId: dirTerminal.stopId,
            fromRouteDirectionId: dirId,
          });
          status = 'at_terminal';
          waitingAt = dirTerminal;
          waitingFlipped = false;
        }
      } else if (status === 'at_terminal' && waitingAt) {
        // Use distance from the arrival stop, not speed.
        if (distanceM(waitingAt, p) > PLACEHOLDERS.terminalLeaveRadiusM) {
          events.push({ type: 'depart', at: p.recordedAt, crowding: p.crowding });
          status = 'on_trip';
          waitingAt = null;
          departedNow = true;
          // The crew already changed direction.
          if (!waitingFlipped) {
            pending = { departedAt: p.recordedAt, fromDirId: dirId };
            trail = [];
            flipCtx = undefined;
          }
        }
      }

      if (pending) {
        const giveUpMs = PLACEHOLDERS.flipGiveUpMin * 60_000;
        if (!departedNow && p.recordedAt.getTime() - pending.departedAt.getTime() > giveUpMs) {
          // Give up if there's no flip evidence in time.
          pending = null;
          trail = [];
        } else {
          trail.push({ lng: p.lng, lat: p.lat });
          if (trail.length > PLACEHOLDERS.flipTrailPings) trail = trail.slice(-PLACEHOLDERS.flipTrailPings);

          if (trail.length >= PLACEHOLDERS.flipMinPings) {
            if (flipCtx === undefined) flipCtx = await getFlipContext(pending.fromDirId);
            if (flipCtx) {
              await fillMatches(trail, flipCtx, pending.fromDirId);
              const samples = trail.map((t) => ({
                oppProgress: t.opp!.progress,
                oppDistM: t.opp!.distanceM,
                oldProgress: t.old!.progress,
              }));

              if (flipEvidence(samples, flipCtx.oppLenM, flipCtx.oldLenM)) {
                // Switch to the new direction.
                events.push({ type: 'flip', toRouteDirectionId: flipCtx.oppId });
                dirId = flipCtx.oppId;
                progress = trail[trail.length - 1].opp!.progress;
                pathDistM = trail[trail.length - 1].opp!.distanceM;
                stationary = false;
                anchor = { lng: p.lng, lat: p.lat };
                dirTerminal = await getTerminalOfDirection(dirId);
                pending = null;
                trail = [];
                flipCtx = undefined;
              }
            }
          }
        }
      }
    }

    lastProgress = progress;
    lastTime = p.recordedAt;

    rows.push({
      assignmentId: shift.id,
      routeDirectionId: dirId,
      recordedAt: p.recordedAt,
      location: [p.lng, p.lat],
      speedKmh: p.speedKmh,
      accuracyM: p.accuracyM,
      progress,
      pathDistanceM: pathDistM,
      stationary,
      crowding: p.crowding,
      crowdingSetAt: p.crowdingSetAt,
      timeTrusted: batch.timeTrusted,
    });
  }

  const saved = await commitBatch(shift.id, rows, events, status, dirId);

  // Check warnings after saving the pings.
  let warningResult: { opened: string[]; closed: string[] } = { opened: [], closed: [] };
  try {
    warningResult = await checkWarnings(shift.id);
  } catch (err) {
    console.error('Warning check failed (pings were saved):', err);
  }

  // Update the phone clock warning.
  try {
    await recordClockStatus(shift.id, batch.timeTrusted, Math.round(batch.offsetMs / 1000));
  } catch (err) {
    console.error('Clock warning failed (pings were saved):', err);
  }

  const crowdNow = await getAssignmentCrowding(shift.id);

  return {
    ok: true as const,
    saved,
    dropped: {
      futureTime: batch.droppedFutureTime,
      poorAccuracy: batch.droppedPoorAccuracy,
      duplicate: rows.length - saved,
    },
    clockOffsetSec: Math.round(batch.offsetMs / 1000),
    timeTrusted: batch.timeTrusted,
    progress: lastProgress,
    rematched,
    status,
    events: events.length,
    flips: events.filter((e) => e.type === 'flip').length,
    routeDirectionId: dirId,
    warnings: warningResult,
    crowding: crowdingView(crowdNow.status, crowdNow.setAt, new Date()),
  };
}
