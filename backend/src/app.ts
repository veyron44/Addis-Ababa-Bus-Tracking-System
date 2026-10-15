import express from 'express';
import { pool } from './db/index';
import { stopsRouter } from './stops/stops.routes';
import { authRouter } from './auth/auth.routes';
import {directionsRouter} from './bus_routes/directions.routes';
import {assignmentsRouter} from './assignments/assignments.routes';
import { trackingRouter } from './tracking/tracking.routes';
export const app=express();
app.use(express.json());


app.use( stopsRouter);
app.use( authRouter);
app.use( directionsRouter);
app.use( assignmentsRouter);
app.use( trackingRouter);



app.get('/first', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch {
        res.status(500).json({ status: 'error', database: 'down' });
    }
});