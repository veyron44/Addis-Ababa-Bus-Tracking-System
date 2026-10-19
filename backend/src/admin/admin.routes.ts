import { Router } from 'express';
import {
  adminLoginHandler,
  adminMeHandler,
  liveAllHandler,
  assignmentChangesHandler,
} from './admin.controller';
import { requireAdmin } from './admin.middleware';

export const adminRouter = Router();

adminRouter.post('/auth/admin/login', adminLoginHandler);
adminRouter.get('/auth/admin/me', requireAdmin, adminMeHandler);
adminRouter.get('/admin/live-all', requireAdmin, liveAllHandler);
adminRouter.get('/admin/assignment-changes', requireAdmin, assignmentChangesHandler);
