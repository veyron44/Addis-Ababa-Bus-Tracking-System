
import { getCurrentShift } from '../assignments/assignments.service';
import {
  commitBatch,
  loadTrackState,
  matchPoint,
  getAssignmentCrowding,
  type NewPing,
} from './tracking.repository';
import { correctBatch, distanceM } from './tracking.rules';
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

export async function receivePings(driverId: number, points: PingInput[], sentAt: Date) {
  const shift = await getCurrentShift(driverId);
  if (!shift) return { ok: false as const, reason: 'no_shift' as const };

  // Check that the shift has started.
  if (shift.status !== 'on_trip' && shift.status !== 'at_terminal') {
    return { ok: false as const, reason: 'not_started' as const };
  }

  // Correct timestamps and filter invalid points.
  const batch = correctBatch(points, sentAt, new Date());

  // Process points by timestamp.
  const sorted = [...batch.kept].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const dirId = shift.routeDirectionId;

  // Load the previous tracking state.
  const state = sorted.length
    ? await loadTrackState(shift.id, dirId, sorted[0].recordedAt)
    : { last: null, anchor: null };

  let lastProgress: number | null = state.last?.progress ?? null;
  let lastTime: Date | null = state.last?.time ?? null;
  let anchor = state.anchor;
  let rematched = 0;

  const rows: NewPing[] = [];
  for (const p of sorted) {
    let progress: number;
    let stationary = false;
    let pathDistM: number | null = null; // Distance from the road

    if (
      anchor &&
      lastProgress !== null &&
      distanceM(anchor, { lng: p.lng, lat: p.lat }) <= PLACEHOLDERS.driftIgnoreM
    ) {
      // Ignore small GPS movements while stopped.
      stationary = true;
      progress = lastProgress;
    } else {
      // Expand the search area based on the time since the last point.
      const elapsedSec = lastTime
        ? Math.max(0, (p.recordedAt.getTime() - lastTime.getTime()) / 1000)
        : 0;
      const aheadM = PLACEHOLDERS.searchAheadM + (elapsedSec * PLACEHOLDERS.maxSpeedKmh) / 3.6;

      let m = await matchPoint(dirId, p.lng, p.lat, lastProgress, aheadM, PLACEHOLDERS.backToleranceM);

      // Retry on the full route if the point is too far away.
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

  const status: 'on_trip' | 'at_terminal' = shift.status === 'at_terminal' ? 'at_terminal' : 'on_trip';
  const saved = await commitBatch(shift.id, rows, [], status, dirId);
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
    events: 0,
    flips: 0,
    routeDirectionId: dirId,
    warnings: { opened: [] as string[], closed: [] as string[] },
    crowding: crowdingView(crowdNow.status, crowdNow.setAt, new Date()),
  };
}
