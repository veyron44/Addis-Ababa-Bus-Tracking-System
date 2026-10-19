import type { Request, Response } from 'express';
import { getDrivers, addDriver, renameDriver, resetPassword, removeDriver } from './admin_drivers.service';
import { cleanName, cleanUsername, parseId, passwordProblem } from '../admin/admin.validation';

const BAD_NAME = 'name must be 2 to 60 characters';
const BAD_USERNAME = 'username must be 3 to 30 characters: lowercase letters, digits, dot, underscore or hyphen';

function idOrFail(req: Request, res: Response): number | null {
  const id = parseId(req.params.id);
  if (!id) res.status(400).json({ error: 'The crew id must be a positive whole number' });
  return id;
}

export async function listDriversHandler(_req: Request, res: Response) {
  try {
    res.json({ drivers: await getDrivers() });
  } catch (err) {
    console.error('List drivers failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createDriverHandler(req: Request, res: Response) {
  try {
    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: BAD_NAME });
      return;
    }
    const username = cleanUsername(req.body?.username);
    if (!username) {
      res.status(400).json({ error: BAD_USERNAME });
      return;
    }
    const problem = passwordProblem(req.body?.password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    const result = await addDriver(name, username, req.body.password);
    if (!result.ok) {
      res.status(409).json({ error: 'That username already exists', code: result.reason });
      return;
    }
    res.status(201).json({ driver: result.driver });
  } catch (err) {
    console.error('Create driver failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function renameDriverHandler(req: Request, res: Response) {
  try {
    const id = idOrFail(req, res);
    if (!id) return;
    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: BAD_NAME });
      return;
    }
    const result = await renameDriver(id, name);
    if (!result.ok) {
      res.status(404).json({ error: 'Unknown crew login' });
      return;
    }
    res.json({ driver: result.driver });
  } catch (err) {
    console.error('Rename driver failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function resetPasswordHandler(req: Request, res: Response) {
  try {
    const id = idOrFail(req, res);
    if (!id) return;
    const problem = passwordProblem(req.body?.password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    const result = await resetPassword(id, req.body.password);
    if (!result.ok) {
      res.status(404).json({ error: 'Unknown crew login' });
      return;
    }
    res.json({ reset: true, sessionsClosed: true });
  } catch (err) {
    console.error('Reset password failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteDriverHandler(req: Request, res: Response) {
  try {
    const id = idOrFail(req, res);
    if (!id) return;
    const result = await removeDriver(id);
    if (!result.ok) {
      if (result.reason === 'not_found') res.status(404).json({ error: 'Unknown crew login' });
      else res.status(409).json({ error: 'This crew login has shifts on record and cannot be deleted', code: result.reason });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete driver failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
