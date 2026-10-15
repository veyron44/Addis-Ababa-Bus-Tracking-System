import { Router } from 'express';
import { requireDriver } from '../auth/auth.middleware';
import {
  currentHandler,
  startHandler,
  endHandler,
  selectHandler,
  returnHandler,
  crowdingHandler,
  departingHandler,
} from './assignments.controller';

export const assignmentsRouter = Router();

assignmentsRouter.get('/assignments/current', requireDriver, currentHandler);
assignmentsRouter.post('/assignments/select', requireDriver, selectHandler);
assignmentsRouter.post('/assignments/start', requireDriver, startHandler);
assignmentsRouter.post('/assignments/return', requireDriver, returnHandler);
assignmentsRouter.post('/assignments/end', requireDriver, endHandler);
assignmentsRouter.post('/assignments/crowding', requireDriver, crowdingHandler);
assignmentsRouter.post('/assignments/departing', requireDriver, departingHandler);
