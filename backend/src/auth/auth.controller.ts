import type { Request, Response } from 'express';
import { loginDriver } from './auth.service';

export async function loginHandler(req: Request, res: Response) {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const result = await loginDriver(username, password);
    if (!result) {
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export function meHandler(_req: Request, res: Response) {
  res.json({ driver: res.locals.driver });
}