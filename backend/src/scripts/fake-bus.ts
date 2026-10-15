import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index';

type Coord = [number, number]; // [lng, lat]
type SimPoint = {
  lng: number;
  lat: number;
  speedKmh: number;
  accuracy: number;
  progress: number;
  crowd?: string;
  crowdFrom?: number; // first point of this report
};

// Simulator settings
const TICK_SEC = 10;          // GPS point interval
const BATCH_SIZE = 3;         // points per batch
const BASE_SPEED_KMH = 20;    // km/h
const NOISE_M = 5;            // GPS noise in meters
const SEED = 42;              // repeatable runs
const LEAVE_M = 600;          // distance driven after waiting
const CROWD_VALUES = ['not_reported', 'seats_available', 'standing_only', 'full'];

// Seeded random values keep runs repeatable.
function makeRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate normally distributed values.
function makeGaussian(rand: () => number) {
  return () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
}

// Distance between coordinates in meters.
function meters(a: Coord, b: Coord): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111320 * Math.cos(midLat);
  const dy = (b[1] - a[1]) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

// Add GPS noise to a coordinate.
function jitter(c: Coord, gaussian: () => number) {
  return {
    lng: c[0] + (gaussian() * NOISE_M) / (111320 * Math.cos(c[1] * (Math.PI / 180))),
    lat: c[1] + (gaussian() * NOISE_M) / 111320,
  };
}

async function loadPath(routeNumber: string, directionName: string): Promise<Coord[] | null> {
  const result = await db.execute(sql`
    SELECT ST_AsGeoJSON(rd.path) AS g
    FROM route_directions rd
    JOIN routes r ON r.id = rd.route_id
    WHERE r.route_number = ${routeNumber} AND rd.direction_name = ${directionName}
    LIMIT 1`);
  const row = (result.rows as unknown as { g: string }[])[0];
  if (!row) return null;
  return JSON.parse(row.g).coordinates as Coord[];
}

// Load the route in the opposite direction.
async function loadOtherPath(routeNumber: string, directionName: string): Promise<Coord[] | null> {
  const result = await db.execute(sql`
    SELECT ST_AsGeoJSON(rd.path) AS g
    FROM route_directions rd
    JOIN routes r ON r.id = rd.route_id
    WHERE r.route_number = ${routeNumber} AND rd.direction_name <> ${directionName}
    LIMIT 1`);
  const row = (result.rows as unknown as { g: string }[])[0];
  if (!row) return null;
  return JSON.parse(row.g).coordinates as Coord[];
}

// Get a point at a given distance along the route.
function makeWalker(path: Coord[]) {
  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + meters(path[i - 1], path[i]));
  }
  const total = cumulative[cumulative.length - 1];

  function pointAt(d: number): Coord {
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    const segLen = cumulative[i] - cumulative[i - 1];
    const t = segLen === 0 ? 0 : (d - cumulative[i - 1]) / segLen;
    return [
      path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
      path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
    ];
  }
  return { total, pointAt };
}

// Generate GPS points for the trip.
function simulate(path: Coord[]): { points: SimPoint[]; total: number } {
  const { total, pointAt } = makeWalker(path);
  const rand = makeRandom(SEED);
  const gaussian = makeGaussian(rand);

  const points: SimPoint[] = [];
  let distance = 0;
  let factor = 1;     // traffic factor
  let stopTicks = 0;  // remaining stop ticks

  while (distance < total) {
    factor += (rand() - 0.5) * 0.3;
    factor = Math.min(1.2, Math.max(0.25, factor));
    if (stopTicks === 0 && rand() < 0.04) stopTicks = 2 + Math.floor(rand() * 4);

    let speedKmh = BASE_SPEED_KMH * factor;
    if (stopTicks > 0) {
      speedKmh = 0;
      stopTicks--;
    }
    distance = Math.min(total, distance + (speedKmh / 3.6) * TICK_SEC);

    points.push({
      ...jitter(pointAt(distance), gaussian),
      speedKmh: speedKmh === 0 ? 0 : Math.max(0, speedKmh + gaussian() * 1.5),
      accuracy: Math.round(5 + rand() * 15),
      progress: distance / total,
    });
  }
  return { points, total };
}

// Generate points while the bus waits at the terminal.
function waitPoints(end: Coord, waitMin: number, crowd?: string): SimPoint[] {
  const rand = makeRandom(SEED + 1);
  const gaussian = makeGaussian(rand);
  const out: SimPoint[] = [];
  const ticks = Math.round((waitMin * 60) / TICK_SEC);
  for (let i = 0; i < ticks; i++) {
    out.push({
      ...jitter(end, gaussian),
      speedKmh: 0,
      accuracy: Math.round(5 + rand() * 15),
      progress: 1,
      crowd,
    });
  }
  return out;
}

// Generate points as the bus drives away.
function drivePoints(
  pointAt: (d: number) => Coord,
  lengthM: number,
  maxM: number,
  crowd?: string,
): SimPoint[] {
  const rand = makeRandom(SEED + 2);
  const gaussian = makeGaussian(rand);
  const out: SimPoint[] = [];
  const stepM = (BASE_SPEED_KMH / 3.6) * TICK_SEC;
  for (let d = stepM; d <= Math.min(maxM, lengthM); d += stepM) {
    out.push({
      ...jitter(pointAt(d), gaussian),
      speedKmh: BASE_SPEED_KMH,
      accuracy: Math.round(5 + rand() * 15),
      progress: 1,
      crowd,
    });
  }
  return out;
}

// Wrong-way and off-path scenarios
const WRONG_WAY_AT = 0.4;     // turn-back point
const WRONG_WAY_TICKS = 9;    // ticks in each direction
const OFF_PATH_AT = 0.7;      // point where it leaves the road
const OFF_PATH_TICKS = 5;     // ticks off the road
const OFF_PATH_M = 300;       // distance from the road in meters

// Add a short wrong-way stretch, then return to the same spot.

function addWrongWay(points: SimPoint[], path: Coord[]): number {
  const { total, pointAt } = makeWalker(path);
  const i0 = points.findIndex((p) => p.progress >= WRONG_WAY_AT);
  if (i0 < 0) return 0;
  const rand = makeRandom(SEED + 3);
  const gaussian = makeGaussian(rand);
  const stepM = (BASE_SPEED_KMH / 3.6) * TICK_SEC;
  const d0 = points[i0].progress * total;
  const extra: SimPoint[] = [];
  const addAt = (k: number) => {
    const d = Math.max(0, d0 - k * stepM);
    extra.push({
      ...jitter(pointAt(d), gaussian),
      speedKmh: BASE_SPEED_KMH,
      accuracy: Math.round(5 + rand() * 15),
      progress: d / total,
    });
  };
  for (let k = 1; k <= WRONG_WAY_TICKS; k++) addAt(k);         
  for (let k = WRONG_WAY_TICKS - 1; k >= 0; k--) addAt(k);     
  points.splice(i0 + 1, 0, ...extra);
  return extra.length;
}

// Move some GPS points away from the road without changing progress.

function addOffPath(points: SimPoint[], path: Coord[]): number {
  const { total, pointAt } = makeWalker(path);
  const i0 = points.findIndex((p) => p.progress >= OFF_PATH_AT);
  if (i0 < 0) return 0;
  let moved = 0;
  for (let i = i0; i < Math.min(points.length, i0 + OFF_PATH_TICKS); i++) {
    const d = points[i].progress * total;
    const a = pointAt(Math.max(0, d - 20));
    const b = pointAt(Math.min(total, d + 20));
    const midLat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
    const dx = (b[0] - a[0]) * 111320 * Math.cos(midLat);
    const dy = (b[1] - a[1]) * 111320;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    points[i].lng += (nx * OFF_PATH_M) / (111320 * Math.cos(midLat));
    points[i].lat += (ny * OFF_PATH_M) / 111320;
    moved++;
  }
  return moved;
}


// Server requests
const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

async function api(method: string, urlPath: string, token?: string, body?: unknown) {
  const res = await fetch(BASE_URL + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* Keep non-JSON responses as text. */ }
  return { status: res.status, data };
}

function flag(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// Print simulated points without sending them.
async function runPrint(args: string[]) {
  const [routeNumber = '61', directionName = 'toward Legehar', delayArg = '0'] = args;
  const delayMs = Number(delayArg);

  const path = await loadPath(routeNumber, directionName);
  if (!path || path.length < 2) {
    console.error(`No path for route ${routeNumber} "${directionName}".`);
    process.exitCode = 1;
    return;
  }

  const { points, total } = simulate(path);
  console.log(`Route ${routeNumber} "${directionName}": ${path.length} path points, ${Math.round(total)} m`);
  console.log('time (UTC)               lng        lat        speed  acc  progress');

  const start = Date.now();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const time = new Date(start + i * TICK_SEC * 1000).toISOString();
    console.log(
      `${time}  ${p.lng.toFixed(6)}  ${p.lat.toFixed(6)}  ` +
        `${p.speedKmh.toFixed(1).padStart(5)}  ${String(p.accuracy).padStart(3)}  ` +
        `${(p.progress * 100).toFixed(1)}%`,
    );
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  const minutes = (points.length * TICK_SEC) / 60;
  console.log(`Arrived at the terminal. ${points.length} points, ${minutes.toFixed(1)} min.`);
}

// Log in, start a shift, and send points to /pings.
async function runSend(args: string[]) {
  const username = flag(args, '--user', 'bus1');
  const password = flag(args, '--pass', 'test1234');
  const delayMs = Number(flag(args, '--delay', '200'));
  // Simulate a phone clock offset.
  const clockOffsetMs = Number(flag(args, '--clock-offset-min', '0')) * 60_000;
  // Add bad GPS data and resend a batch.
  const noisy = args.includes('--noisy');
  // Wait at the terminal, then leave.
  const waitMin = Number(flag(args, '--wait-min', '0'));
  const stay = args.includes('--stay');         // wait, but never leave
  const detour = args.includes('--detour');     // leave in a direction that is on neither road
  const fullReturn = args.includes('--return'); // drive the whole other road: a full round trip
  const tap = args.includes('--tap');           // the crew taps "Start return trip" while waiting
  const wrongWay = args.includes('--wrong-way'); // mid-road the bus turns back for 90 s, then returns
  const offPath = args.includes('--off-path');   // the bus drifts 300 m sideways for 50 s
  // Crowding reported at the terminal.
  const crowd = flag(args, '--crowd', '');
  // Crowding reported during the trip.
  const crowdTrip = flag(args, '--crowd-trip', '');
  // Stop at this percentage of the route.
  const stopAt = Number(flag(args, '--stop-at', '0'));

  if (crowd && !CROWD_VALUES.includes(crowd)) {
    console.error(`--crowd must be one of: ${CROWD_VALUES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (stopAt && (stopAt < 5 || stopAt > 95)) {
    console.error('--stop-at must be between 5 and 95 (percent of the road).');
    process.exitCode = 1;
    return;
  }
  if (crowdTrip && !CROWD_VALUES.includes(crowdTrip)) {
    console.error(`--crowd-trip must be one of: ${CROWD_VALUES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if ((stay || detour || fullReturn || tap) && waitMin <= 0) {
    console.error('--stay, --detour, --return and --tap need --wait-min (for example --wait-min 3).');
    process.exitCode = 1;
    return;
  }

  const login = await api('POST', '/auth/driver/login', undefined, { username, password });
  if (login.status !== 200) {
    console.error(`Login failed (${login.status}):`, login.data);
    process.exitCode = 1;
    return;
  }
  const token: string = login.data.token;

  const current = await api('GET', '/assignments/current', token);
  if (current.status !== 200) {
    console.error('No shift. Run: npx tsx src/scripts/createshift.ts');
    process.exitCode = 1;
    return;
  }
  const shift = current.data.assignment;
  if (shift.status !== 'assigned') {
    console.error(`The shift is already "${shift.status}". Run createshift.ts for a fresh one.`);
    process.exitCode = 1;
    return;
  }

  const path = await loadPath(shift.routeNumber, shift.directionName);
  if (!path || path.length < 2) {
    console.error(`No path for route ${shift.routeNumber} "${shift.directionName}".`);
    process.exitCode = 1;
    return;
  }

  const sim = simulate(path);
  if (offPath) addOffPath(sim.points, path);
  if (wrongWay) addWrongWay(sim.points, path);
  const total = sim.total;
  const tripCount = sim.points.length;
  const crowdOrUndefined = crowd || undefined;

  // Simulate the terminal wait and departure.
  let tail: SimPoint[] = [];
  if (waitMin > 0) {
    const end = path[path.length - 1];
    tail = waitPoints(end, waitMin, crowdOrUndefined);
    if (!stay) {
      if (detour) {
        tail = tail.concat(
          drivePoints((d) => [end[0], end[1] + d / 111320], LEAVE_M, LEAVE_M, crowdOrUndefined),
        );
      } else {
        const other = await loadOtherPath(shift.routeNumber, shift.directionName);
        if (!other) {
          console.error('Could not find the other direction of this route.');
          process.exitCode = 1;
          return;
        }
        if (fullReturn) {
          tail = tail.concat(simulate(other).points.map((p) => ({ ...p, crowd: crowdOrUndefined })));
        } else {
          const walker = makeWalker(other);
          tail = tail.concat(drivePoints(walker.pointAt, walker.total, LEAVE_M, crowdOrUndefined));
        }
      }
    }
  }

  const started = await api('POST', '/assignments/start', token);
  if (started.status !== 200) {
    console.error(`Could not start the shift (${started.status}):`, started.data);
    process.exitCode = 1;
    return;
  }

  const points = sim.points.concat(tail);
  if (stopAt > 0) {
    const cut = points.findIndex((p, i) => i < tripCount && p.progress >= stopAt / 100);
    if (cut > 0) points.length = cut;
  }
  if (noisy) points.forEach((p, i) => { if (i % 40 === 20) p.accuracy = 120; });
  // Add crowding reports from 30% of the route.
  if (crowdTrip) {
    points.forEach((p, i) => { if (i < tripCount && p.progress >= 0.3) p.crowd = crowdTrip; });
  }
  // Keep the start time of each crowding report.
  points.forEach((p, i) => {
    if (!p.crowd) return;
    const prev = points[i - 1];
    p.crowdFrom = prev && prev.crowd === p.crowd ? prev.crowdFrom : i;
  });

  console.log(
    `Route ${shift.routeNumber} "${shift.directionName}" (direction id ${shift.routeDirectionId}, ${Math.round(total)} m): ` +
      `sending ${points.length} points in batches of ${BATCH_SIZE}.` +
      (clockOffsetMs !== 0 ? ` Phone clock is off by ${clockOffsetMs / 60_000} min.` : '') +
      (noisy ? ' Noisy mode.' : '') +
      (waitMin > 0
        ? ` Waits ${waitMin} min at the terminal, then ${
            stay ? 'stays' : detour ? 'drives away on a detour' : fullReturn ? 'drives the whole way back' : 'leaves'
          }.`
        : '') +
      (tap ? ' The crew taps Start return trip.' : '') +
      (wrongWay ? ' The bus turns back at 40% of the road, then returns.' : '') +
      (offPath ? ' The bus drifts 300 m off the road at 70%.' : '') +
      (crowd ? ` Crowding at the terminal: ${crowd}.` : '') +
      (crowdTrip ? ` Crowding on the road: ${crowdTrip}.` : '') +
      (stopAt ? ` Stops at ${stopAt}% of the road and stays running.` : ''),
  );

  // Use the phone’s clock, including any offset.
  const phoneNow = () => Date.now() + clockOffsetMs;
  const lastTime = phoneNow();
  // Space earlier points 10 seconds apart.
  const timeOf = (idx: number) =>
    new Date(lastTime - (points.length - 1 - idx) * TICK_SEC * 1000).toISOString();

  const totals = { saved: 0, futureTime: 0, poorAccuracy: 0, duplicate: 0, events: 0, flips: 0 };
  let clockOffsetSec = 0;
  let timeTrusted = true;
  let lastStatus = '';
  let lastDirection = shift.routeDirectionId;
  let tapped = false;
  let lastCrowding = '';

  async function send(batch: unknown[]): Promise<boolean> {
    const res = await api('POST', '/pings', token, {
      sentAt: new Date(phoneNow()).toISOString(),
      points: batch,
    });
    if (res.status !== 200) {
      console.error(`Batch failed (${res.status}):`, res.data);
      return false;
    }
    totals.saved += res.data.saved;
    totals.futureTime += res.data.dropped.futureTime;
    totals.poorAccuracy += res.data.dropped.poorAccuracy;
    totals.duplicate += res.data.dropped.duplicate;
    totals.events += res.data.events;
    totals.flips += res.data.flips;
    clockOffsetSec = res.data.clockOffsetSec;
    timeTrusted = res.data.timeTrusted;
    lastStatus = res.data.status;
    lastDirection = res.data.routeDirectionId;
    if (res.data.flips > 0) {
      console.log(`  Automatic flip: now on direction id ${lastDirection} (point ${totals.saved}).`);
    }
    const w = res.data.warnings;
    if (w?.opened?.length) console.log(`  Warning OPENED: ${w.opened.join(', ')} (after point ${totals.saved}).`);
    if (w?.closed?.length) console.log(`  Warning closed: ${w.closed.join(', ')} (after point ${totals.saved}).`);
    const cNow = res.data.crowding?.code;
    if (cNow && cNow !== lastCrowding) {
      console.log(`  Server crowding: ${cNow} (after point ${totals.saved}).`);
      lastCrowding = cNow;
    }
    return true;
  }

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch: any[] = points.slice(i, i + BATCH_SIZE).map((p, k) => ({
      t: timeOf(i + k),
      lng: Number(p.lng.toFixed(6)),
      lat: Number(p.lat.toFixed(6)),
      speed: Number(p.speedKmh.toFixed(1)),
      acc: p.accuracy,
      ...(p.crowd ? { crowd: p.crowd, crowdAt: timeOf(p.crowdFrom ?? i + k) } : {}),
    }));

    // Add one point timestamped 10 minutes in the future.
    if (noisy && i === 0) {
      batch.push({ t: new Date(lastTime + 10 * 60_000).toISOString(), lng: batch[0].lng, lat: batch[0].lat, speed: 0, acc: 8 });
    }

    if (!(await send(batch))) { process.exitCode = 1; return; }

    // Simulate resending a batch after signal loss.
    if (noisy && i === 0) {
      if (!(await send(batch))) { process.exitCode = 1; return; }
    }

    // Simulate the crew starting the return trip during the wait.
    if (tap && !tapped && i + BATCH_SIZE >= tripCount + 3) {
      tapped = true;
      const r = await api('POST', '/assignments/return', token);
      console.log(
        `  Crew tapped Start return trip: ${r.status}` +
          (r.status === 200 ? `, changed ${r.data.changed}` : ` ${JSON.stringify(r.data)}`),
      );
    }

    if ((i / BATCH_SIZE) % 20 === 0) {
      console.log(`  ${totals.saved} saved so far (${(points[i].progress * 100).toFixed(0)}% of the road)`);
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  console.log(
    `Done. Server totals: saved ${totals.saved}, dropped poor accuracy ${totals.poorAccuracy}, ` +
      `future time ${totals.futureTime}, duplicates ${totals.duplicate}.`,
  );
  console.log(`Last reply: clock offset ${clockOffsetSec} s, time trusted: ${timeTrusted}.`);
  console.log(
    `Server state at the end: status ${lastStatus}, direction id ${lastDirection}, ` +
      `terminal events ${totals.events}, automatic flips ${totals.flips}.`,
  );
  console.log('The shift stays started; run createshift.ts before the next run.');
}

async function main() {
  // Print points: npx tsx src/scripts/fake-bus.ts 61 "toward Legehar" [delayMs]
  // Send points: npx tsx src/scripts/fake-bus.ts --send [options]
  
  
  const args = process.argv.slice(2);
  if (args.includes('--send')) await runSend(args);
  else await runPrint(args);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
