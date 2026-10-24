
import { etaText, noEstimateReason, crowdingDisplay, standingText } from './display';

let pass = 0;
let fail = 0;

function assert(label: string, got: unknown, want: unknown) {
  const gotStr = JSON.stringify(got);
  const wantStr = JSON.stringify(want);
  if (gotStr === wantStr) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}\n  got:  ${gotStr}\n  want: ${wantStr}`);
  }
}

// ---- etaText ----

assert('arriving',
  etaText({ code: 'arriving', lowMin: null, highMin: null }),
  'Arriving');

assert('exact estimate',
  etaText({ code: 'estimate', lowMin: 7, highMin: 7 }),
  '7 min');

assert('range estimate',
  etaText({ code: 'estimate', lowMin: 6, highMin: 9 }),
  '6–9 min');

assert('no estimate',
  etaText({ code: 'no_estimate', lowMin: null, highMin: null }),
  'No estimate');

assert('less certain exact',
  etaText({ code: 'estimate', lowMin: 12, highMin: 12, lessCertain: true }),
  'About 12 min');

assert('less certain range',
  etaText({ code: 'estimate', lowMin: 10, highMin: 15, lessCertain: true }),
  'About 10–15 min');

assert('unknown code with range still shows range',
  etaText({ code: 'something_new', lowMin: 3, highMin: 5 }),
  '3–5 min');

assert('unknown code no range shows No estimate',
  etaText({ code: 'something_new', lowMin: null, highMin: null }),
  'No estimate');

// ---- noEstimateReason ----

assert('arriving has no reason',
  noEstimateReason({ code: 'arriving' }),
  null);

assert('reason is returned',
  noEstimateReason({ code: 'no_estimate', reason: 'Lost signal' }),
  'Lost signal');

assert('no reason returns null',
  noEstimateReason({ code: 'no_estimate', reason: null }),
  null);

assert('known reason becomes readable text',
  noEstimateReason({ code: 'no_estimate', reason: 'no_signal' }, { no_signal: 'No recent signal from the bus' }),
  'No recent signal from the bus');

assert('unknown reason is shown as sent',
  noEstimateReason({ code: 'no_estimate', reason: 'something_new' }, { no_signal: 'x' }),
  'something_new');

// ---- crowdingDisplay ----

assert('seats_available',
  crowdingDisplay({ code: 'seats_available', ageSec: 30 }),
  { label: 'Seats available', color: 'green' });

assert('standing_only',
  crowdingDisplay({ code: 'standing_only', ageSec: 60 }),
  { label: 'Standing only', color: 'amber' });

assert('full',
  crowdingDisplay({ code: 'full', ageSec: 0 }),
  { label: 'Full', color: 'red' });

assert('old crowding shows the last status with (old)',
  crowdingDisplay({ code: 'not_updated_recently', lastStatus: 'seats_available', ageSec: 900 }),
  { label: 'Seats available (old)', color: 'green' });

assert('old full keeps its colour',
  crowdingDisplay({ code: 'not_updated_recently', lastStatus: 'full', ageSec: 1200 }),
  { label: 'Full (old)', color: 'red' });

assert('old without a last status shows nothing',
  crowdingDisplay({ code: 'not_updated_recently', lastStatus: null, ageSec: 1200 }),
  null);

assert('not_reported returns null',
  crowdingDisplay({ code: 'not_reported', ageSec: null }),
  null);

assert('null crowding returns null',
  crowdingDisplay(null),
  null);

assert('unknown crowding code returns null',
  crowdingDisplay({ code: 'something_else', ageSec: 10 }),
  null);

// ---- standingText ----

assert('standing 3 min',
  standingText(3),
  'Standing 3 min');

assert('standing null',
  standingText(null),
  null);

assert('standing 0 min',
  standingText(0),
  'Standing 0 min');


console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
