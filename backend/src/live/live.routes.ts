import { Router } from 'express';
import { liveHandler } from './live.controller';

export const liveRouter = Router();

liveRouter.get('/routes/:id/live', liveHandler);
