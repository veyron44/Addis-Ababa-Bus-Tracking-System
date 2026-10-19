import { Router } from 'express';
import { requireAdmin } from '../admin/admin.middleware';
import {
  listVehiclesHandler,
  createVehicleHandler,
  renameVehicleHandler,
  deleteVehicleHandler,
} from './admin_vehicles.controller';

export const adminVehiclesRouter = Router();

adminVehiclesRouter.get('/admin/vehicles', requireAdmin, listVehiclesHandler);
adminVehiclesRouter.post('/admin/vehicles', requireAdmin, createVehicleHandler);
adminVehiclesRouter.patch('/admin/vehicles/:id', requireAdmin, renameVehicleHandler);
adminVehiclesRouter.delete('/admin/vehicles/:id', requireAdmin, deleteVehicleHandler);
