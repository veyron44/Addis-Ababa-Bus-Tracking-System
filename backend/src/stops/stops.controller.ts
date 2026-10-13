import type { Request, Response } from 'express';
import { searchPlaces } from './stops.service';

export async function searchHandler(req: Request, res: Response) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length === 0) {
      res.status(400).json({ error: 'q (the text to search for) is required' });
      return;
    }
    if (q.length > 50) {
      res.status(400).json({ error: 'q is too long' });
      return;
    }

    res.json({ places: await searchPlaces(q) });
  } catch (err) {
    console.error('Stop search failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}