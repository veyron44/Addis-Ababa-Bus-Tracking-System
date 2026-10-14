import { Router } from 'express';
import { requireDriver } from '../auth/auth.middleware';
import { directionsHandler } from './directions.controller';

export const directionsRouter = Router();

directionsRouter.get('/routes/directions', requireDriver, directionsHandler);