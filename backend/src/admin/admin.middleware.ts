import type { Request, Response, NextFunction } from 'express';
import { authenticateAdminToken } from './admin.service';

// The admin gate. A crew token is not in the admin tables, so it is always refused here.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }

    const admin = await authenticateAdminToken(token);
    if (!admin) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }

    res.locals.admin = admin;
    next();
  } catch (err) {
    console.error('Admin auth check failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
