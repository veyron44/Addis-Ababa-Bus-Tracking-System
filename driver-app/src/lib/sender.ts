// GPS sender: watches position, batches points, queues them in localStorage,
// and flushes to POST /pings every 5 seconds. All timing and batching rules
// live here so they can be tested without the browser.

import type { CrowdingCode } from './shift';

// ---- Types ----

export interface GpsPoint {
  t: string;        // ISO timestamp from the phone clock
  lat: number;
  lng: number;
  speed?: number;    // km/h (converted from m/s)
  acc?: number;      // metres
  crowd?: CrowdingCode;
  crowdAt?: string;  // ISO timestamp when the button was pressed
}

export interface PingReply {
  saved: number;
  dropped: number;
  status: string;
  progress: number | null;
  events: string[];
  flips: number;
  warnings: string[];
  timeTrusted: boolean;
  clockOffsetSec?: number;
  rematched?: boolean;
  routeDirectionId?: number;
  crowding?: string;
}

export type GpsLight = 'green' | 'amber' | 'red';

export interface SenderState {
  sent: number;
  waiting: number;
  light: GpsLight;
  warnings: string[];
  status: string | null;
  /** The most recent /pings error, if any. */
  error: string | null;
  /** true when the sender has stopped due to a 404/409. */
  stopped: boolean;
}

// ---- Queue (localStorage) ----

const QUEUE_KEY = 'gpsQueue';

export function loadQueue(): GpsPoint[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: GpsPoint[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked: points stay in memory only.
  }
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // nothing
  }
}

// ---- Batching rules (pure, testable) ----

/** Minimum gap between kept points in milliseconds. */
export const MIN_GAP_MS = 3_000;

/** Maximum points per /pings call. */
export const MAX_BATCH = 200;

/** Flush interval in milliseconds. */
export const FLUSH_INTERVAL_MS = 5_000;

/** Heartbeat interval (getCurrentPosition) in milliseconds. */
export const HEARTBEAT_MS = 10_000;

/** A point is "fresh" if it was sent under this many ms ago. */
export const FRESH_THRESHOLD_MS = 15_000;

/**
 * Decides whether to keep a new GPS reading based on the time since
 * the last kept point.
 */
export function shouldKeep(lastKeptIso: string | null, nowIso: string): boolean {
  if (!lastKeptIso) return true;
  const gap = new Date(nowIso).getTime() - new Date(lastKeptIso).getTime();
  return gap >= MIN_GAP_MS;
}

/**
 * Splits the queue into a batch (first ≤200) and the remainder.
 */
export function takeBatch(queue: GpsPoint[]): { batch: GpsPoint[]; rest: GpsPoint[] } {
  if (queue.length <= MAX_BATCH) return { batch: [...queue], rest: [] };
  return { batch: queue.slice(0, MAX_BATCH), rest: queue.slice(MAX_BATCH) };
}

// ---- Sender class (browser) ----

const WARNING_TEXT: Record<string, string> = {
  bad_clock: 'Your phone clock is wrong',
  off_path: 'You are off the route',
  wrong_way: 'You are going the wrong way',
};

export type SendFn = (sentAt: string, points: GpsPoint[]) => Promise<PingReply>;

export class GpsSender {
  private queue: GpsPoint[] = [];
  private lastKeptT: string | null = null;
  private lastSentAt: number = 0;  // timestamp of the last successful send
  private watchId: number | null = null;
  private flushTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private totalSent = 0;
  private _stopped = false;
  private _error: string | null = null;
  private _warnings: string[] = [];
  private _status: string | null = null;
  private pendingCrowd: { code: CrowdingCode; at: string } | null = null;
  private activeWarnings = new Set<string>();

  private sendFn: SendFn;
  private onChange: (state: SenderState) => void;

  constructor(sendFn: SendFn, onChange: (state: SenderState) => void) {
    this.sendFn = sendFn;
    this.onChange = onChange;
  }

  /** Start watching GPS + flushing. */
  start(): void {
    // Restore any queued points from a previous session.
    this.queue = loadQueue();
    this._stopped = false;
    this._error = null;

    // Watch position.
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.onPosition(pos),
        (err) => { console.warn('[GPS] watchPosition error:', err.message); },
        { enableHighAccuracy: true, maximumAge: 2000 },
      );
    }

    // Heartbeat: getCurrentPosition every 10s for parked buses.
    this.heartbeatTimer = window.setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => this.onPosition(pos, true),
          (err) => { console.warn('[GPS] heartbeat error:', err.message); },
          { enableHighAccuracy: true, maximumAge: 10000 },
        );
      }
    }, HEARTBEAT_MS);

    // Flush every 5s.
    this.flushTimer = window.setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

    this.notify();
  }

  /** Stop watching, stop flushing, clear the queue. */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.queue = [];
    clearQueue();
    this._stopped = true;
    this.notify();
  }

  /** The crew pressed a crowding button. Attach to the next kept point. */
  setCrowding(code: CrowdingCode): void {
    this.pendingCrowd = { code, at: new Date().toISOString() };
  }

  getState(): SenderState {
    return {
      sent: this.totalSent,
      waiting: this.queue.length,
      light: this.computeLight(),
      warnings: this._warnings,
      status: this._status,
      error: this._error,
      stopped: this._stopped,
    };
  }

  // ---- Private ----

  private onPosition(pos: GeolocationPosition, isHeartbeat = false): void {
    if (this._stopped) return;

    const nowIso = new Date().toISOString();

    // For heartbeat: only keep if nothing was kept in the last ~9s.
    // We subtract 1s to avoid timer-jitter misses at the 10s boundary.
    if (isHeartbeat && this.lastKeptT) {
      const gap = Date.now() - new Date(this.lastKeptT).getTime();
      if (gap < HEARTBEAT_MS - 1000) return;
    }

    if (!shouldKeep(this.lastKeptT, nowIso)) return;

    const point: GpsPoint = {
      t: nowIso,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };

    // speed: Geolocation gives m/s, the backend expects km/h.
    if (pos.coords.speed !== null && pos.coords.speed >= 0) {
      point.speed = Math.round(pos.coords.speed * 3.6 * 10) / 10;
    }
    if (pos.coords.accuracy !== undefined) {
      point.acc = Math.round(pos.coords.accuracy);
    }

    // Attach pending crowding to this point.
    if (this.pendingCrowd) {
      point.crowd = this.pendingCrowd.code;
      point.crowdAt = this.pendingCrowd.at;
      this.pendingCrowd = null;
    }

    this.lastKeptT = nowIso;
    this.queue.push(point);
    saveQueue(this.queue);
    console.log(`[GPS] kept point #${this.queue.length} (heartbeat=${isHeartbeat})`, point.lat.toFixed(4), point.lng.toFixed(4));
    this.notify();
  }

  private async flush(): Promise<void> {
    if (this._stopped) return;
    if (this.queue.length === 0) return;
    if (!navigator.onLine) { console.log('[GPS] offline, skipping flush'); return; }

    const { batch, rest } = takeBatch(this.queue);
    console.log(`[GPS] flushing ${batch.length} points...`);

    try {
      const reply = await this.sendFn(new Date().toISOString(), batch);
      // Success: remove sent points.
      this.queue = rest;
      saveQueue(this.queue);
      this.totalSent += batch.length;
      this.lastSentAt = Date.now();
      this._error = null;

      console.log(`[GPS] flush OK — saved=${reply.saved}, status=${reply.status}, total sent=${this.totalSent}`);

      // Update from reply.
      if (reply.status) this._status = reply.status;
      // The backend sends warnings as { opened: [...], closed: [...] }.
      const w = reply.warnings as unknown as { opened?: string[]; closed?: string[] } | undefined;
      for (const x of w?.opened ?? []) this.activeWarnings.add(x);
      for (const x of w?.closed ?? []) this.activeWarnings.delete(x);
      if (reply.timeTrusted === false) this.activeWarnings.add('bad_clock');
      else this.activeWarnings.delete('bad_clock');
      this._warnings = [...this.activeWarnings].map((x) => WARNING_TEXT[x] ?? x);

      this.notify();
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      console.error('[GPS] flush error:', err.message, 'status:', err.status);
      // 404 or 409: terminal error, stop sending.
      if (err.status === 404 || err.status === 409) {
        this._error = err.message ?? 'Shift error';
        this._stopped = true;
        this.stop();
        return;
      }
      // Network error: keep points, try again next tick.
      this._error = err.message ?? 'Network error';
      this.notify();
    }
  }

  private computeLight(): GpsLight {
    if (!navigator.geolocation || this.watchId === null) return 'red';
    if (this.lastSentAt === 0 && this.lastKeptT === null) return 'amber';
    if (this.lastSentAt > 0 && Date.now() - this.lastSentAt < FRESH_THRESHOLD_MS) return 'green';
    if (this.lastKeptT && Date.now() - new Date(this.lastKeptT).getTime() < FRESH_THRESHOLD_MS) return 'amber';
    return 'red';
  }

  private notify(): void {
    this.onChange(this.getState());
  }
}