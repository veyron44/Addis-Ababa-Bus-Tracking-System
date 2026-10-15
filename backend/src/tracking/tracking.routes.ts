import { Router } from 'express';
import { requireDriver } from '../auth/auth.middleware';
import { pingsHandler } from './tracking.controller';

export const trackingRouter = Router();

trackingRouter.post('/pings', requireDriver, pingsHandler);
