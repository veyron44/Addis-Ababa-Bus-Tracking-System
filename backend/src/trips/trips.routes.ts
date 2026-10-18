import { Router } from 'express';
import { tripsHandler } from './trips.controller';

export const tripsRouter = Router();

tripsRouter.get('/trips', tripsHandler);