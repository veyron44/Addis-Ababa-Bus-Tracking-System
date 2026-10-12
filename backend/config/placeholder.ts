// ALL VALUES HERE ARE PLACEHOLDERS (estimates, not measurements)

export const PLACEHOLDERS = {
  // --- Terminal behaviour ---
  terminalLayoverMin: 10,       // typical wait at a terminal
  maxWaitMin: 25,               // longest expected wait
  terminalRadiusM: 100,         // within this distance the bus is "at terminal"
  terminalLeaveRadiusM: 200,    // a bus farther than this from the terminal it waited at has left
  flipMinPings: 3,              // points of evidence needed before the direction flips
  flipTrailPings: 6,            // the flip looks at the last 6 points at most
  flipMinRiseM: 50,             // progress on the opposite road must rise  this much
  flipSearchM: 2000,            // how much of each road is searched for the evidence
  flipGiveUpMin: 15,            // after this long without evidence, stop waiting for a flip
  arrivalMinProgress: 0.8,      // a bus counts as arriving only after this much of its road is done
  sessionHours: 14,             // a login token lasts about one shift

  // --- Path matching and warnings ---
  futureToleranceSec: 5,        // a point this far ahead of the server clock is still accepted
  offPathM: 100,                // farther than this from the path = off path
  searchAheadM: 500,            // only look this far ahead of the last position
  mismatchWindowSec: 60,        // progress must fall this long = wrong direction
  driftIgnoreM: 15,             // ignore movements smaller than this while stopped
  sameStopM: 5,                 // two stops with the same name within this distance = the same stop
  wrongWayMinFallM: 80,         // progress must fall at least this far over the window to count as wrong way
  offPathMinPings: 3,           // points in a row beyond offPathM before off path is raised
  warningClearPings: 3,         // good points in a row that clear a warning
  wrongWayMinPings: 4,          // at least this many moving points in the window
  wrongWayMinSpanShare: 0.75,   // the window must cover this share of mismatchWindowSec
  wrongWayFallShare: 0.7,       // this share of steps must be falling

  // --- Pings and time ---
  poorAccuracyM: 50,            // drop GPS points less accurate than this (proposed)
  noPingTimeoutMin: 30,         // shift auto-ends after this long without pings
  noSignalWarnSec: 180,         // admin warning when a running shift sent nothing for this long
  sweepIntervalSec: 60,         // how often the server looks for dead shifts
  maxClockOffsetMin: 3,         // bigger phone clock error = ignore batch for timing
  clockNoiseSec: 2,             // a clock difference below this is network delay, not a wrong clock
  backToleranceM: 50,           // how far back the match may go (GPS noise)
  maxSpeedKmh: 60,              // used to widen the search window after a gap in pings

  // --- Where a bus is and how fast ---
  freshPingSec: 90,             // a bus whose newest point is older than this has "no recent signal"
  speedMinSpanSec: 20,          // need points covering at least this long to work out a speed
  atStopM: 30,                  // within this distance behind a stop, the bus counts as at the stop

  // --- Starting points (what riders see at a terminal) ---
  typicalGapLowMin: 10,         // "usually one every X-Y min" when no bus is visible (placeholder per route)
  typicalGapHighMin: 20,
  lastLeftMaxMin: 180,          // "last bus left X min ago" is not shown when it was longer ago than this
  notStartedMaxHours: 14,       // an assigned shift that never started is shown for this long

  // --- Crowding ---
  crowdingStaleMin: 10,         // older than this = "not updated recently"

  // --- ETA ---
  rollingSpeedWindowSec: 45,    // average speed over this window (30 to 60)
  fallbackSpeedKmh: 20,         // used when a segment has no data
  etaRangePercent: 0.2,         // range is +/- 20 percent (proposed)
  etaWideRangePercent: 0.4,     // wider range when the bus's own speed cannot be used
  minLiveSpeedKmh: 3,           // below this the live speed is not used (standing: boarding or jam, unknown)
  arrivingSec: 60,              // an ETA of this or less reads "arriving"
  nearPartKm: 1.5,              // next stretch that uses live speed

  // --- Typical segment speeds (used only to fill segment_times with placeholders) ---
  rushHourSpeedKmh: 8,
  middaySpeedKmh: 20,

  // --- Nightly segment-time job (replaces guesses by measured medians) ---
  segmentLookbackDays: 60,      // only shifts from this many recent days are used
  segmentMinSamples: 3,         // a slot needs at least this many real crossings before its guess is replaced
  segmentMaxPingGapSec: 60,     // a hole in the points longer than this makes a crossing unusable
  segmentMinSpeedKmh: 2,        // a stretch driven slower than this on average was a breakdown or a standstill
  segmentWarningPadSec: 120,    // a warning excludes this much time before and after it
  localUtcOffsetHours: 3,       // Addis Ababa is UTC+3, no daylight saving (decides the day type and slot)
} as const;
