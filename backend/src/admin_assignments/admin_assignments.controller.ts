import type { Request, Response } from 'express';
import { serviceType } from '../db/schema';
import {
  getAssignments,
  getDirections,
  createAssignment,
  updateAssignment,
  endAssignment,
} from './admin_assignments.service';
import type { ServiceType, StatusFilter } from './admin_assignments.repository';
import { parseId } from '../admin/admin.validation';

const STATUS_FILTERS = ['unfinished', 'all', 'assigned', 'on_trip', 'at_terminal', 'ended'];

function isServiceType(x: unknown): x is ServiceType {
  return typeof x === 'string' && (serviceType.enumValues as readonly string[]).includes(x);
}

// The error shown for each way a write can fail.
const FAILURES: Record<string, { status: number; error: string }> = {
  unknown_driver: { status: 400, error: 'Unknown crew login' },
  unknown_vehicle: { status: 400, error: 'Unknown vehicle' },
  unknown_direction: { status: 400, error: 'Unknown route direction' },
  driver_busy: { status: 409, error: 'This crew already has an unfinished shift' },
  vehicle_busy: { status: 409, error: 'This vehicle already has an unfinished shift' },
  not_found: { status: 404, error: 'Unknown shift' },
  ended: { status: 409, error: 'This shift has ended and cannot be changed' },
  already_started: { status: 409, error: 'The shift has started: only the service type can change now' },
  already_ended: { status: 409, error: 'This shift has already ended' },
};

function fail(res: Response, reason: string) {
  const f = FAILURES[reason] ?? { status: 500, error: 'Server error' };
  res.status(f.status).json({ error: f.error, code: reason });
}

export async function listAssignmentsHandler(req: Request, res: Response) {
  try {
    let status = 'unfinished';
    if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      status = req.query.status.trim();
      if (!STATUS_FILTERS.includes(status)) {
        res.status(400).json({ error: `status must be one of: ${STATUS_FILTERS.join(', ')}` });
        return;
      }
    }
    let limit = 50;
    if (typeof req.query.limit === 'string' && req.query.limit.trim() !== '') {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        res.status(400).json({ error: 'limit must be a whole number from 1 to 200' });
        return;
      }
    }
    res.json({ assignments: await getAssignments(status as StatusFilter, limit) });
  } catch (err) {
    console.error('List assignments failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function listDirectionsHandler(_req: Request, res: Response) {
  try {
    res.json({ directions: await getDirections() });
  } catch (err) {
    console.error('List directions failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /admin/assignments   { driverId, vehicleId, routeDirectionId, serviceType? }
export async function createAssignmentHandler(req: Request, res: Response) {
  try {
    const driverId = parseId(req.body?.driverId);
    const vehicleId = parseId(req.body?.vehicleId);
    const routeDirectionId = parseId(req.body?.routeDirectionId);
    if (!driverId || !vehicleId || !routeDirectionId) {
      res.status(400).json({ error: 'driverId, vehicleId and routeDirectionId (positive whole numbers) are required' });
      return;
    }
    let type: ServiceType = 'regular';
    if (req.body?.serviceType !== undefined) {
      if (!isServiceType(req.body.serviceType)) {
        res.status(400).json({ error: `serviceType must be one of: ${serviceType.enumValues.join(', ')}` });
        return;
      }
      type = req.body.serviceType;
    }

    const result = await createAssignment({ driverId, vehicleId, routeDirectionId, serviceType: type });
    if (!result.ok) {
      fail(res, result.reason);
      return;
    }
    res.status(201).json({ assignment: result.assignment });
  } catch (err) {
    console.error('Create assignment failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PATCH /admin/assignments/:id   any of { driverId, vehicleId, routeDirectionId, serviceType }
export async function updateAssignmentHandler(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'The shift id must be a positive whole number' });
      return;
    }
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    for (const key of ['driverId', 'vehicleId', 'routeDirectionId'] as const) {
      if (body[key] !== undefined) {
        const v = parseId(body[key]);
        if (!v) {
          res.status(400).json({ error: `${key} must be a positive whole number` });
          return;
        }
        patch[key] = v;
      }
    }
    if (body.serviceType !== undefined) {
      if (!isServiceType(body.serviceType)) {
        res.status(400).json({ error: `serviceType must be one of: ${serviceType.enumValues.join(', ')}` });
        return;
      }
      patch.serviceType = body.serviceType;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'Send at least one of: driverId, vehicleId, routeDirectionId, serviceType' });
      return;
    }

    const result = await updateAssignment(id, patch);
    if (!result.ok) {
      fail(res, result.reason);
      return;
    }
    res.json({ assignment: result.assignment });
  } catch (err) {
    console.error('Update assignment failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /admin/assignments/:id/end   cancel a shift that has not started, or end a stuck one
export async function endAssignmentHandler(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'The shift id must be a positive whole number' });
      return;
    }
    const result = await endAssignment(id);
    if (!result.ok) {
      fail(res, result.reason);
      return;
    }
    res.json({ assignment: result.assignment });
  } catch (err) {
    console.error('End assignment failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
