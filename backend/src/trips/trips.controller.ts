import type { Request, Response } from 'express';
import { findTrips } from './trips.service';

export async function tripsHandler(req: Request, res: Response) {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';

    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required' });
      return;
    }
    if (from.length > 50 || to.length > 50) {
      res.status(400).json({ error: 'from or to is too long' });
      return;
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      res.status(400).json({ error: 'from and to must be different places' });
      return;
    }

    res.json({ trips: await findTrips(from, to) });
  } catch (err) {
    console.error('Trip search failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}