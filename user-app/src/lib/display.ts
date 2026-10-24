// display rules for ETA and crowding
// ---- ETA text ----


export function etaText(item: {
  code: string;
  lowMin: number | null;
  highMin: number | null;
  reason?: string | null;
  lessCertain?: boolean;
}): string {
  if (item.code === 'arriving') return 'Arriving';

  if (item.lowMin !== null && item.highMin !== null) {
    const prefix = item.lessCertain ? 'About ' : '';
    if (item.lowMin === item.highMin) return `${prefix}${item.lowMin} min`;
    return `${prefix}${item.lowMin}–${item.highMin} min`;
  }

  return 'No estimate';
}


 // Returns the reason text when there is no estimate, or null.
 
export function noEstimateReason(
  item: { code: string; reason?: string | null },
  texts: Record<string, string> = {},
): string | null {
  if (item.code === 'arriving') return null;
  // A known reason code becomes readable text; an unknown one is shown as the backend sent it.
  if (item.reason) return texts[item.reason] ?? item.reason;
  return null;
}

// ---- Crowding text ----

export type CrowdingDisplay = {
  label: string;
  color: 'green' | 'amber' | 'red' | 'grey';
};


export function crowdingDisplay(crowding: {
  code: string;
  lastStatus?: string | null;
  ageSec: number | null;
} | null): CrowdingDisplay | null {
  if (!crowding) return null;

  // After 10 minutes the backend sends 'not_updated_recently' and keeps the last
  // status in lastStatus. status shows (old). 
  const stale = crowding.code === 'not_updated_recently';
  const code = stale ? crowding.lastStatus : crowding.code;
  const suffix = stale ? ' (old)' : '';

  switch (code) {
    case 'seats_available':
      return { label: `Seats available${suffix}`, color: 'green' };
    case 'standing_only':
      return { label: `Standing only${suffix}`, color: 'amber' };
    case 'full':
      return { label: `Full${suffix}`, color: 'red' };
    default:
      return null; // not_reported or unknown code: show nothing
  }
}




// "Standing 3 min" when standingMin is not null.
 
export function standingText(standingMin: number | null): string | null {
  if (standingMin === null) return null;
  return `Standing ${standingMin} min`;
}
