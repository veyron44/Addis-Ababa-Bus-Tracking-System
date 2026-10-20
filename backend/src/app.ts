import express from 'express';
import cors from 'cors';
import { pool } from './db/index';
import { stopsRouter } from './stops/stops.routes';
import { authRouter } from './auth/auth.routes';
import {directionsRouter} from './bus_routes/directions.routes';
import {assignmentsRouter} from './assignments/assignments.routes';
import { trackingRouter } from './tracking/tracking.routes';
import { arrivalsRouter } from './arrivals/arrivals.routes';
import { tripsRouter } from './trips/trips.routes';
import { liveRouter } from './live/live.routes';
import { adminRouter } from './admin/admin.routes';
import { adminVehiclesRouter } from './admin_vehicles/admin_vehicles.routes';
import { adminDriversRouter } from './admin_drivers/admin_drivers.routes';
import { adminAssignmentsRouter } from './admin_assignments/admin_assignments.routes';


export const app=express();
app.use(cors());
app.use(express.json());


app.use( stopsRouter);
app.use( authRouter);
app.use( directionsRouter);
app.use( assignmentsRouter);
app.use( trackingRouter);
app.use(arrivalsRouter);
app.use(tripsRouter);
app.use(liveRouter);
app.use(adminRouter);
app.use(adminVehiclesRouter);
app.use(adminDriversRouter);
app.use(adminAssignmentsRouter);


app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch {
        res.status(500).json({ status: 'error', database: 'down' });
    }
});