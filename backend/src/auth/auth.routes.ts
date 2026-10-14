import { Router } from 'express';
import { loginHandler,meHandler } from './auth.controller';
import { requireDriver } from './auth.middleware';


export const authRouter = Router();

authRouter.post('/auth/driver/login', loginHandler);
authRouter.get('/auth/me', requireDriver, meHandler);