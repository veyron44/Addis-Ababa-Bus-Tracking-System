import { Router } from 'express';
import { requireAdmin } from '../admin/admin.middleware';
import {
  listAssignmentsHandler,
  listDirectionsHandler,
  createAssignmentHandler,
  updateAssignmentHandler,
  endAssignmentHandler,
} from './admin_assignments.controller';

export const adminAssignmentsRouter = Router();

adminAssignmentsRouter.get('/admin/route-directions', requireAdmin, listDirectionsHandler);
adminAssignmentsRouter.get('/admin/assignments', requireAdmin, listAssignmentsHandler);
adminAssignmentsRouter.post('/admin/assignments', requireAdmin, createAssignmentHandler);
adminAssignmentsRouter.patch('/admin/assignments/:id', requireAdmin, updateAssignmentHandler);
adminAssignmentsRouter.post('/admin/assignments/:id/end', requireAdmin, endAssignmentHandler);
