// Run with: npx tsx src/lib/test-trip-text.ts
import { departureText, nextBusText, sheetSummary } from './tripText';
import type { TripOption } from '../api';

let fail = 0;
function assert(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail++;
    console.error(`FAIL: ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
}

function option(nextBus: Partial<NonNullable<TripOption['nextBus']>> | null): TripOption {
  return {
    routeNumber: '61',
    directionName: 'toward Legehar',
    routeDirectionId: 1,
    toStopId: 2,
    stopsAway: 3,
    nextBus: nextBus && {
      busId: 1, source: 'arrival', kind: null, code: 'estimate', reason: null, lowMin: 5, highMin: 8,
      boarding: false, lessCertain: false, standingMin: null, crowding: null, ...nextBus,
    },
  };
}

assert('no bus', nextBusText(option(null)), 'No bus right now');
assert('arrival range', nextBusText(option({})), '5–8 min');
assert('arriving', nextBusText(option({ code: 'arriving', lowMin: null, highMin: null })), 'Arriving');
assert('terminal estimate', nextBusText(option({ source: 'departure', lowMin: 4, highMin: 19 })), 'Leaves terminal in 4–19 min');
assert('terminal boarding', nextBusText(option({ source: 'departure', lowMin: null, highMin: null, boarding: true })), 'Boarding now');
assert('terminal waiting', nextBusText(option({ source: 'departure', lowMin: null, highMin: null })), 'At terminal');
assert('upcoming', nextBusText(option({ source: 'upcoming', lowMin: 20, highMin: 30 })), 'About 20–30 min');

assert('summary empty', sheetSummary([]), 'No routes connect these places');
assert('summary one', sheetSummary([option({})]), '1 route · 5–8 min');
assert('summary picks soonest', sheetSummary([option({ lowMin: 9, highMin: 12 }), option({ lowMin: 2, highMin: 4 })]), '2 routes · 2–4 min');
assert('summary arriving wins', sheetSummary([option({ lowMin: 1, highMin: 2 }), option({ code: 'arriving', lowMin: null, highMin: null })]), '2 routes · Arriving');
assert('summary no bus', sheetSummary([option(null), option(null)]), '2 routes · No bus right now');

const dep = { code: 'estimate', reason: null, lowMin: 3, highMin: 6, boarding: false };
assert('dep estimate', departureText(dep), 'Leaves in 3–6 min');
assert('dep boarding', departureText({ ...dep, boarding: true }), 'Boarding now');
assert('dep soon', departureText({ ...dep, code: 'departing_soon', lowMin: null, highMin: null }), 'Leaves soon');
assert('dep overdue', departureText({ ...dep, code: 'no_estimate', reason: 'overdue', lowMin: null, highMin: null }), 'Later than expected');
assert('dep not started', departureText({ ...dep, code: 'assigned_not_started', lowMin: null, highMin: null }), 'Not started yet');

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log('all passed');
