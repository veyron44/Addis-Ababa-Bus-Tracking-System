import type { Request, Response } from 'express';
import { listDirections } from './directions.repository';

export async function directionsHandler(_req: Request, res: Response) {
  try {
    res.json({ directions: await listDirections() });
  } catch (err) {
    console.error('List directions failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}