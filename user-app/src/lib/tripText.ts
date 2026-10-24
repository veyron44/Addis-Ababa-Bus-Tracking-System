import type { TripOption } from '../api';
import { etaText } from './display';
import { t } from '../strings';

function range(low: number, high: number): string {
  return low === high ? `${low} ${t.min}` : `${low}–${high} ${t.min}`;
}

export function nextBusText(option: TripOption): string {
  const bus = option.nextBus;
  if (!bus) return t.noBusNow;

  if (bus.source === 'departure') {
    if (bus.lowMin !== null && bus.highMin !== null) return `${t.leavesTerminal} ${range(bus.lowMin, bus.highMin)}`;
    if (bus.boarding) return t.boarding;
    return t.atTerminal;
  }

  if (bus.source === 'upcoming') {
    return etaText({ code: 'estimate', lowMin: bus.lowMin, highMin: bus.highMin, lessCertain: true });
  }

  return etaText({ code: bus.code, lowMin: bus.lowMin, highMin: bus.highMin });
}

function waitMinutes(option: TripOption): number {
  const bus = option.nextBus;
  if (!bus) return Infinity;
  if (bus.code === 'arriving' || bus.boarding) return 0;
  return bus.lowMin ?? Infinity;
}

export function sheetSummary(options: TripOption[]): string {
  if (options.length === 0) return t.noTripsFound;
  const count = `${options.length} ${options.length === 1 ? t.route : t.routes}`;
  const best = options.reduce((a, b) => (waitMinutes(b) < waitMinutes(a) ? b : a));
  return `${count} · ${nextBusText(best)}`;
}

export function departureText(item: {
  code: string;
  reason: string | null;
  lowMin: number | null;
  highMin: number | null;
  boarding: boolean;
}): string {
  if (item.boarding) return t.boarding;
  if (item.code === 'departing_soon') return t.leavesSoon;
  if (item.code === 'assigned_not_started') return t.notStarted;
  if (item.lowMin !== null && item.highMin !== null) return `${t.leavesIn} ${range(item.lowMin, item.highMin)}`;
  if (item.reason) return t.reasons[item.reason] ?? item.reason;
  return t.noEstimate;
}
