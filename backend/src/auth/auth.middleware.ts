import type { Request, Response, NextFunction } from 'express';
import { authenticateToken } from './auth.service';

export async function requireDriver(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }

    const driver = await authenticateToken(token);
    if (!driver) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }

    res.locals.driver = driver;
    next(); 
  } catch (err) {
    console.error('Auth check failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}