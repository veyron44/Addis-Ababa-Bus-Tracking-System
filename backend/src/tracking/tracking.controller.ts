import type { Request, Response } from 'express';
import { crowdingStatus } from '../db/schema';
import { receivePings, type PingInput, type CrowdingValue } from './tracking.service';

const MAX_POINTS = 200;

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function parseDate(x: unknown): Date | null {
  if (typeof x !== 'string') return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Validates and converts a point.
function parsePoint(raw: any): PingInput | null {
  if (!raw || typeof raw !== 'object') return null;

  const recordedAt = parseDate(raw.t);
  if (!recordedAt) return null;
  if (!isNum(raw.lng) || raw.lng < -180 || raw.lng > 180) return null;
  if (!isNum(raw.lat) || raw.lat < -90 || raw.lat > 90) return null;
  if (raw.speed !== undefined && (!isNum(raw.speed) || raw.speed < 0)) return null;
  if (raw.acc !== undefined && (!isNum(raw.acc) || raw.acc < 0)) return null;

  let crowding: CrowdingValue = 'not_reported';
  if (raw.crowd !== undefined) {
    if (!(crowdingStatus.enumValues as readonly string[]).includes(raw.crowd)) return null;
    crowding = raw.crowd as CrowdingValue;
  }

  let crowdingSetAt: Date | null = null;
  if (raw.crowdAt !== undefined) {
    crowdingSetAt = parseDate(raw.crowdAt);
    if (!crowdingSetAt) return null;
  }

  return {
    recordedAt,
    lng: raw.lng,
    lat: raw.lat,
    speedKmh: isNum(raw.speed) ? raw.speed : null,
    accuracyM: isNum(raw.acc) ? raw.acc : null,
    crowding,
    crowdingSetAt,
  };
}

export async function pingsHandler(req: Request, res: Response) {
  try {
    // Read the phone's send time.
    const sentAt = parseDate(req.body?.sentAt);
    if (!sentAt) {
      res.status(400).json({ error: 'sentAt (the phone time, as text) is required' });
      return;
    }

    const raw = req.body?.points;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({ error: 'points (a non-empty list) is required' });
      return;
    }
    if (raw.length > MAX_POINTS) {
      res.status(400).json({ error: `at most ${MAX_POINTS} points per batch` });
      return;
    }

    const points: PingInput[] = [];
    for (let i = 0; i < raw.length; i++) {
      const point = parsePoint(raw[i]);
      if (!point) {
        res.status(400).json({ error: `point ${i} is not valid` });
        return;
      }
      points.push(point);
    }

    const result = await receivePings(res.locals.driver.id, points, sentAt);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else {
        res.status(409).json({ error: 'Start your shift before sending positions' });
      }
      return;
    }

    res.json({
      saved: result.saved,
      dropped: result.dropped,
      clockOffsetSec: result.clockOffsetSec,
      timeTrusted: result.timeTrusted,
      progress: result.progress,
      rematched: result.rematched,
      status: result.status,
      events: result.events,
      flips: result.flips,
      routeDirectionId: result.routeDirectionId,
      warnings: result.warnings,
      crowding: result.crowding,
    });
  } catch (err) {
    console.error('Pings failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
