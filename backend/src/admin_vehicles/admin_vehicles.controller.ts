import type { Request, Response } from 'express';
import { getVehicles, addVehicle, changePlate, removeVehicle } from './admin_vehicles.service';
import { cleanPlate, parseId } from '../admin/admin.validation';

const BAD_PLATE = 'plate must be 2 to 20 letters, digits, spaces or hyphens';

export async function listVehiclesHandler(_req: Request, res: Response) {
  try {
    res.json({ vehicles: await getVehicles() });
  } catch (err) {
    console.error('List vehicles failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createVehicleHandler(req: Request, res: Response) {
  try {
    const plate = cleanPlate(req.body?.plate);
    if (!plate) {
      res.status(400).json({ error: BAD_PLATE });
      return;
    }
    const result = await addVehicle(plate);
    if (!result.ok) {
      res.status(409).json({ error: 'That plate already exists', code: result.reason });
      return;
    }
    res.status(201).json({ vehicle: result.vehicle });
  } catch (err) {
    console.error('Create vehicle failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function renameVehicleHandler(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'The vehicle id must be a positive whole number' });
      return;
    }
    const plate = cleanPlate(req.body?.plate);
    if (!plate) {
      res.status(400).json({ error: BAD_PLATE });
      return;
    }
    const result = await changePlate(id, plate);
    if (!result.ok) {
      if (result.reason === 'not_found') res.status(404).json({ error: 'Unknown vehicle' });
      else res.status(409).json({ error: 'That plate already exists', code: result.reason });
      return;
    }
    res.json({ vehicle: result.vehicle });
  } catch (err) {
    console.error('Rename vehicle failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteVehicleHandler(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'The vehicle id must be a positive whole number' });
      return;
    }
    const result = await removeVehicle(id);
    if (!result.ok) {
      if (result.reason === 'not_found') res.status(404).json({ error: 'Unknown vehicle' });
      else res.status(409).json({ error: 'This vehicle has shifts on record and cannot be deleted', code: result.reason });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete vehicle failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
