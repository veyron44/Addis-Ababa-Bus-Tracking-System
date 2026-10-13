import { Router } from 'express';
import { searchHandler } from './stops.controller';

export const stopsRouter = Router();

stopsRouter.get('/stops', searchHandler);