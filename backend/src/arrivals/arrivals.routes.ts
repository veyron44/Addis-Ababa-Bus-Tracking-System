import { Router } from 'express';
import { arrivalsHandler } from './arrivals.controller';

export const arrivalsRouter = Router();

arrivalsRouter.get('/stops/:id/arrivals', arrivalsHandler);
