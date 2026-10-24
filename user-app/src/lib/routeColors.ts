// One colour per route, used for badges, map lines and bus markers.
const FIXED: Record<string, string> = {
  '49': '#d1242f', // red
  '61': '#0969da', // blue
};

// Routes without a fixed colour get one of these, always the same for the same number.
const PALETTE = ['#1a7f37', '#c26a00', '#8250df', '#bf3989', '#0a7ea4', '#6e7781'];

export const STALE_COLOR = '#8b95a3';

export function routeColor(routeNumber: string): string {
  const fixed = FIXED[routeNumber];
  if (fixed) return fixed;
  let h = 0;
  for (const ch of routeNumber) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
