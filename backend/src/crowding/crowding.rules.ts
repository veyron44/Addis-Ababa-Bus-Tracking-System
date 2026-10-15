import { PLACEHOLDERS } from '../config/placeholders';

export type CrowdingStatus = 'not_reported' | 'seats_available' | 'standing_only' | 'full';
export type CrowdingCode = CrowdingStatus | 'not_updated_recently';

// What the backend sends to the apps. Codes only: the apps turn them into Amharic.
export type CrowdingView = {
  code: CrowdingCode;                  // what to show
  lastStatus: CrowdingStatus | null;   // the last real status (set also when it is old)
  ageSec: number | null;               // how long ago it was reported
};

// A status that nobody reported this trip reads "not_reported". A real status older than
// crowdingStaleMin reads "not_updated_recently". Never claim more than we know.
export function crowdingView(
  status: CrowdingStatus,
  setAt: Date | null,
  now: Date,
): CrowdingView {
  if (status === 'not_reported' || !setAt) {
    return { code: 'not_reported', lastStatus: null, ageSec: null };
  }
  const ageSec = Math.max(0, Math.round((now.getTime() - setAt.getTime()) / 1000));
  if (ageSec > PLACEHOLDERS.crowdingStaleMin * 60) {
    return { code: 'not_updated_recently', lastStatus: status, ageSec };
  }
  return { code: status, lastStatus: status, ageSec };
}
