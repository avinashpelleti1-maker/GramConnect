# GramConnect v1.0 — Full-stack starter

A responsive web application for village complaint management, local workers and Panchayat operations.

There are two clients for this API: the responsive web client in `public/` and the native [Flutter client](../gramconnect-flutter/README.md).

## Included flows

- Register/sign-in with email, password, JWT authentication and Citizen/Worker/Admin roles
- Complaint reporting with category/priority detection, geolocation and duplicate detection within 100 metres
- Web capture flow with camera/gallery attachments and browser Telugu speech-to-text where supported
- Citizen complaint tracking and community confirmation data model
- Worker job updates (on the way, in progress, resolved)
- Admin assignment, complaint lifecycle controls, SOS control centre and analytics
- SOS alerts with location, notifications and a database audit trail
- Authenticated JPG, PNG and WebP upload endpoint (up to three 10 MB complaint images)
- PostgreSQL schema, migration script, Docker database and an empty account-seed command

## Run locally

1. Install Node.js 20+ and Docker Desktop.
2. In this folder, duplicate `.env.example` as `.env`.
3. Start PostgreSQL: `docker compose up -d`.
4. Install server dependencies: `npm install`.
5. Create the schema: `npm run db:migrate`.
6. Run `npm run db:seed` to verify the database connection (it does not create accounts).
7. Start the app: `npm run dev`.
8. Open `http://localhost:3000`.

No accounts or sample data are pre-created. Use **Create account** in the app to register the first account.

When testing the Flutter app on a physical phone, set `PUBLIC_BASE_URL` in `.env` to `http://YOUR_COMPUTER_LAN_IP:3000`; otherwise uploaded-image URLs will point to localhost on the phone.

## Production hand-off

Set a strong `JWT_SECRET`, restrict CORS, move database credentials to a secret manager, add object storage for images, and enforce password-reset and account-verification policies before deploying publicly.
