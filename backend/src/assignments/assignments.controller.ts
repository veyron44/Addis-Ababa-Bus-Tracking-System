import type { Request, Response } from 'express';
import { crowdingStatus } from '../db/schema';
import {
  getCurrentShift,
  startShift,
  endShift,
  selectDirection,
  startReturnTrip,
  setCrowdingStatus,
  departingNow,
  describeAssignment,
} from './assignments.service';

type Crowd = (typeof crowdingStatus.enumValues)[number];
function isCrowd(x: unknown): x is Crowd {
  return typeof x === 'string' && (crowdingStatus.enumValues as readonly string[]).includes(x);
}

export async function currentHandler(_req: Request, res: Response) {
  try {
    const assignment = await getCurrentShift(res.locals.driver.id);
    if (!assignment) {
      res.status(404).json({ error: 'No shift assigned' });
      return;
    }
    res.json({ assignment: describeAssignment(assignment) });
  } catch (err) {
    console.error('Current shift failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function startHandler(_req: Request, res: Response) {
  try {
    const result = await startShift(res.locals.driver.id);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else {
        res.status(409).json({ error: 'Shift already started' });
      }
      return;
    }
    res.json({ assignment: result.assignment });
  } catch (err) {
    console.error('Start shift failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function endHandler(_req: Request, res: Response) {
  try {
    const result = await endShift(res.locals.driver.id);
    if (!result.ok) {
      res.status(404).json({ error: 'No shift to end' });
      return;
    }
    res.json({ ended: true, assignmentId: result.assignmentId });
  } catch (err) {
    console.error('End shift failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function selectHandler(req: Request, res: Response) {
  try {
    const { routeDirectionId } = req.body ?? {};
    if (!Number.isInteger(routeDirectionId)) {
      res.status(400).json({ error: 'routeDirectionId (a number) is required' });
      return;
    }

    const result = await selectDirection(res.locals.driver.id, routeDirectionId);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else if (result.reason === 'unknown_direction') {
        res.status(400).json({ error: 'Unknown route direction' });
      } else {
        res.status(409).json({ error: 'You can change the route only before starting or at a terminal' });
      }
      return;
    }
    res.json({ changed: result.changed, assignment: result.assignment });
  } catch (err) {
    console.error('Select route failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function returnHandler(_req: Request, res: Response) {
  try {
    const result = await startReturnTrip(res.locals.driver.id);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else if (result.reason === 'route_changed') {
        res.status(409).json({ error: 'You changed the route at this terminal; the direction is already set' });
      } else if (result.reason === 'no_opposite') {
        res.status(409).json({ error: 'This route has no single opposite direction' });
      } else {
        res.status(409).json({ error: 'Tap Start return trip only while the bus is at the terminal' });
      }
      return;
    }
    res.json({ changed: result.changed, assignment: result.assignment });
  } catch (err) {
    console.error('Start return trip failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
// The conductor reports how full the bus is.
export async function crowdingHandler(req: Request, res: Response) {
  try {
    const status = req.body?.status;
    if (!isCrowd(status)) {
      res.status(400).json({ error: `status must be one of: ${crowdingStatus.enumValues.join(', ')}` });
      return;
    }
    const result = await setCrowdingStatus(res.locals.driver.id, status);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else {
        res.status(409).json({ error: 'Start your shift before reporting crowding' });
      }
      return;
    }
    res.json({ assignment: describeAssignment(result.assignment!) });
  } catch (err) {
    console.error('Set crowding failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function departingHandler(req: Request, res: Response) {
  try {
    const raw = req.body?.crowding;
    if (raw !== undefined && !isCrowd(raw)) {
      res.status(400).json({ error: `crowding must be one of: ${crowdingStatus.enumValues.join(', ')}` });
      return;
    }
    const result = await departingNow(res.locals.driver.id, raw === undefined ? null : raw);
    if (!result.ok) {
      if (result.reason === 'no_shift') {
        res.status(404).json({ error: 'No shift assigned' });
      } else {
        res.status(409).json({ error: 'Tap Departing now only while the bus is at the terminal' });
      }
      return;
    }
    res.json({ changed: result.changed, assignment: describeAssignment(result.assignment!) });
  } catch (err) {
    console.error('Departing now failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
