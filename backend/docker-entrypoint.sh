#!/bin/sh
# Starts the backend container: migrations, first-time data, then the server.
set -e

echo "Applying database migrations..."
npx drizzle-kit migrate

echo "Checking route data and the admin account..."
npx tsx src/scripts/bootstrap.ts

echo "Starting the server..."
exec npx tsx src/server.ts
