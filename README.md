# Ignyte — LOI Test Bench Monitor

Web app for the **IgNYte-FPA** Limiting Oxygen Index (LOI) apparatus — a custom
ESP32-P4 DAQ rig for running ASTM D2863 oxygen-index tests. The app connects to
the board over **Web Serial**, streams live sensor telemetry, records sessions,
and sends motor / flow / sensor commands..

## Features

- **Live monitoring** — per-sensor readouts and rolling 60-second charts for
  thermocouples (`tc1`–`tc4`), environment sensors (`sht45`, `bme688`), the D6F
  flow-velocity sensor, and the Bronkhorst flow controllers (`flow1`/`flow2`).
- **Session recording** — safety-gated capture of every sensor sample plus the
  RGB sample-chamber video, saved locally (JSON + WebM) and to a browser archive.
- **Device control** — motor (enable/disable/stop/home, jog, absolute moves,
  velocity), flow-controller setpoints, and per-sensor polling rates.
- **Mainsail / Klipper-inspired UI** — always-visible **E-STOP** (kills motion
  and cuts both gas flows), a raw serial **Console** with command input, and
  Klipper-style jog controls, split into **Monitoring** and **Config** tabs.
- **Auth & user management** — Firebase email/password sign-in gating the
  dashboard, plus an admin-only **User Management** page to add users (creates
  the account and emails a password-setup link) and manage roles and access.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Recharts · Firebase · Web Serial API.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Firebase web config
npm run dev
```

Open http://localhost:3000.

> **Browser support:** the board connection uses the Web Serial API, which
> requires a Chromium browser (Chrome or Edge) served over `localhost` or HTTPS.

### Environment

Copy `.env.local.example` to `.env.local` and provide your Firebase web app
config (`NEXT_PUBLIC_FIREBASE_*`). Optional camera stream URLs:

- `NEXT_PUBLIC_CAMERA_URL` — RGB sample-chamber IP/MJPEG stream.
- `NEXT_PUBLIC_HSI_CAMERA_URL` — hyperspectral (monitoring-only) stream.

## User management

Admins add users from **User Management** (`/dashboard/users`, in the sidebar).
Adding a user:

1. creates a real Firebase Authentication account (on a short-lived secondary
   app instance, so you stay signed in);
2. writes a profile to the Firestore `users` collection (email, name, role,
   status); and
3. emails the person a **password-reset link** so they set their own password,
   then sign in at `/login`.

Roles are `admin` (can manage users) and `member` (standard access). Admins can
resend the setup link, change roles, and disable accounts. A disabled user is
signed out on their next navigation (a hard Firebase Auth disable would need the
Admin SDK).

This flow runs entirely client-side; the authorization boundary is **Firestore
Security Rules** ([`firestore.rules`](firestore.rules)), not just the UI.

### First-time setup

1. **Deploy the rules:** `firebase deploy --only firestore:rules`
   (or paste [`firestore.rules`](firestore.rules) into Firebase Console →
   Firestore → Rules).
2. **Bootstrap the first admin:** in the Firebase Console, create a document in
   the `users` collection whose **ID is your Auth UID** with fields
   `role: "admin"`, `status: "active"`, and `email: "<you>"`. After that you can
   add everyone else from the app.

> Email/password sign-in must be enabled in **Firebase Console → Authentication
> → Sign-in method**, and your domain listed under **Authorized domains** for
> the reset emails to work.

## Firmware serial protocol

The board speaks newline-delimited JSON at 115200 baud. Telemetry is per-sensor
and event-based (`{"type":"sample",...}`) with status/boot messages
(`{"type":"status",...}`); commands are `{"cmd":"..."}` lines. Parsing and the
command builders live in [`lib/firmware.ts`](lib/firmware.ts).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run format` | Format with Prettier |
