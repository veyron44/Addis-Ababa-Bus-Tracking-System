import type { Request, Response } from 'express';
import { loginAdmin, getLiveAll, getAssignmentChanges } from './admin.service';

// POST /auth/admin/login   { username, password }
export async function adminLoginHandler(req: Request, res: Response) {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const result = await loginAdmin(username, password);
    if (!result) {
      res.status(401).json({ error: 'Wrong username or password' });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Admin login failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Only reachable through the admin gate, so res.locals.admin is always set.
export function adminMeHandler(_req: Request, res: Response) {
  res.json({ admin: res.locals.admin });
}

// GET /admin/live-all   (admin login required)
export async function liveAllHandler(_req: Request, res: Response) {
  try {
    res.json(await getLiveAll());
  } catch (err) {
    console.error('Live-all failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /admin/assignment-changes?limit=50&assignment=86   (both optional; admin login required)
export async function assignmentChangesHandler(req: Request, res: Response) {
  try {
    let limit = 50;
    if (typeof req.query.limit === 'string' && req.query.limit.trim() !== '') {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        res.status(400).json({ error: 'limit must be a whole number from 1 to 200' });
        return;
      }
    }

    let assignmentId: number | null = null;
    if (typeof req.query.assignment === 'string' && req.query.assignment.trim() !== '') {
      assignmentId = Number(req.query.assignment);
      if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
        res.status(400).json({ error: 'assignment must be a positive whole number' });
        return;
      }
    }

    res.json(await getAssignmentChanges(limit, assignmentId));
  } catch (err) {
    console.error('Assignment changes failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
