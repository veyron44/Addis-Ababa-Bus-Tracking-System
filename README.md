https://drive.google.com/file/d/14G05X3dZ60-Iq3MZqJsDGAW_pMgCtSHV/view?usp=drive_link

**NAME-RAHEL GEBEYHU
DEPARTMENT-DEVELOPMENT
CTC-3637
INDIVIDUAL PROJECT**

# Addis Ababa Bus Tracking System

Real-time bus tracking for Addis Ababa. Bus crews send GPS from a phone, riders see live buses and arrival estimates, and admins manage buses, drivers and shifts.

## What is inside

 Folder | What it is 
| --- | --- |
| backend/ | Node, Express 5, TypeScript API. PostgreSQL + PostGIS with Drizzle ORM |
| user-app/ | Rider app (React + Vite): trip search, live map, stop arrivals |
| driver-app/ | Crew app (React + Vite): start shift, send GPS, report crowding |
| admin-app/ | Admin app (React + Vite): buses, drivers, shifts, warnings |

## Requirements

- Node.js 20 or newer
- Docker (for the local database) or any PostgreSQL with PostGIS

## Run locally

1. Start the database:
   
   docker compose up -d
   
2. Create `backend/.env` (never commit it):
   
   DATABASE_URL=postgres://
   ADMIN_USERNAME
   ADMIN_PASSWORD
   PORT
   
3. Set up and start the backend:
   
   cd backend
   npm install
   npm run db:migrate
   npm run bootstrap
   npm run dev
   
   bootstrap loads routes 49 and 61 and creates the admin. It runs only once on an empty database.
4. Start an app (repeat for each app):
   
   cd user-app
   npm install
   npm run dev
   
   Set `VITE_API_URL` in the app's .env to the backend address.

On a new database, run `CREATE EXTENSION IF NOT EXISTS postgis;` before migrating.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| DATABASE_URL | backend | PostgreSQL connection string |
| ADMIN_USERNAME, `ADMIN_PASSWORD`, `ADMIN_NAME` | backend | First admin account (password at least 8 characters) |
| PORT | backend | Server port |
| NIGHTLY_JOBS | backend | Controls the nightly job that learns travel times |
| VITE_API_URL | each app | Backend address |

## Try it without a real bus


cd backend
npx tsx src/scripts/createshift.ts
npx tsx src/scripts/fake-bus.ts <args> --send --live


The fake bus drives a route in real time. Without `--send` it only prints. Set `API_URL` to point it at an online backend.

## Tests

cd backend && npm run test:rules
cd driver-app && npm test


## Deployment

Backend on Render (Docker, runs migrate, bootstrap, then the server) with a Neon database. The three apps are on Vercel; each needs a `vercel.json` rewrite to `/index.html` so deep links work. The Render free tier sleeps after about 15 minutes idle.

## More documentation

Project Report, SRS, System Design, Database Document, and Deployment and Setup Guide.
