export const HEADER_H = 263;
export const NAV_H = 92;
export const SHEET_BOTTOM = 70;
export const SHEET_TUCK = NAV_H - SHEET_BOTTOM;
export const SHEET_PEEK = 78;

export type Snap = 'peek' | 'half' | 'full';

export function sheetHeights(viewH: number): Record<Snap, number> {
  return {
    peek: SHEET_PEEK,
    half: Math.round((viewH - HEADER_H - NAV_H) * 0.55) + SHEET_TUCK,
    full: viewH - HEADER_H - SHEET_BOTTOM + 14,
  };
}

export function nearestSnap(h: number, viewH: number): Snap {
  const all = sheetHeights(viewH);
  let best: Snap = 'half';
  for (const key of ['peek', 'half', 'full'] as Snap[]) {
    if (Math.abs(all[key] - h) < Math.abs(all[best] - h)) best = key;
  }
  return best;
}
