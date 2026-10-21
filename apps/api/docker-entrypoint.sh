#!/bin/sh
set -e

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Ensuring the admin user exists..."
node dist/prisma/seed.js

echo "Starting the API..."
exec node dist/main.js