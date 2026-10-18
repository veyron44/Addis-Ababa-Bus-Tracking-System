import type { Request, Response } from 'express';
import { getArrivals } from './arrivals.service';

// Rider stop screen: buses coming to a stop. Public.
// GET /stops/:id/arrivals?route=61  (route is optional)
export async function arrivalsHandler(req: Request, res: Response) {
  try {
    const stopId = Number(req.params.id);
    if (!Number.isInteger(stopId) || stopId <= 0) {
      res.status(400).json({ error: 'The stop id must be a positive whole number' });
      return;
    }
    const raw = req.query.route;
    const route = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;

    const result = await getArrivals(stopId, route);
    if (!result) {
      res.status(404).json({ error: 'Unknown stop' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Arrivals failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
