import { Router } from 'express';
import { requireAdmin } from '../admin/admin.middleware';
import {
  listDriversHandler,
  createDriverHandler,
  renameDriverHandler,
  resetPasswordHandler,
  deleteDriverHandler,
} from './admin_drivers.controller';

export const adminDriversRouter = Router();

adminDriversRouter.get('/admin/drivers', requireAdmin, listDriversHandler);
adminDriversRouter.post('/admin/drivers', requireAdmin, createDriverHandler);
adminDriversRouter.patch('/admin/drivers/:id', requireAdmin, renameDriverHandler);
adminDriversRouter.post('/admin/drivers/:id/password', requireAdmin, resetPasswordHandler);
adminDriversRouter.delete('/admin/drivers/:id', requireAdmin, deleteDriverHandler);
