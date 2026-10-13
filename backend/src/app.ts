import express from 'express';
import { pool } from './db/index';

export const app=express();

app.use(express.json());

app.get('/first', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch {
        res.status(500).json({ status: 'error', database: 'down' });
    }
});