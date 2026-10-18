import type { Request, Response } from 'express';
import { getRouteLive } from './live.service';

// Every bus on one route direction, for the route map. Public.
// GET /routes/:id/live?stop=30  (stop is optional; :id is a route direction id)
export async function liveHandler(req: Request, res: Response) {
  try {
    const directionId = Number(req.params.id);
    if (!Number.isInteger(directionId) || directionId <= 0) {
      res.status(400).json({ error: 'The route direction id must be a positive whole number' });
      return;
    }

    let stopId: number | null = null;
    const raw = req.query.stop;
    if (typeof raw === 'string' && raw.trim() !== '') {
      stopId = Number(raw);
      if (!Number.isInteger(stopId) || stopId <= 0) {
        res.status(400).json({ error: 'The stop must be a positive whole number' });
        return;
      }
    }

    const result = await getRouteLive(directionId, stopId);
    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Unknown route direction' });
      return;
    }
    if (result.kind === 'stop_not_on_route') {
      res.status(400).json({ error: 'That stop is not on this route direction' });
      return;
    }
    res.json(result.data);
  } catch (err) {
    console.error('Route live failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
