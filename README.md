# igNYte LOI Apparatus

Monorepo for the IgNYte Lab limiting oxygen index (LOI) test bench. This
repository combines the embedded apparatus work and the operator web
application into one project while preserving the commit history of the original
repositories.

The apparatus is a custom LOI test bench inspired by ISO 4589-2 / ASTM D2863
workflows. It includes ESP32-P4 firmware, electronics documentation, validation
notes, serial control tools, camera-tracking prototypes, and a Next.js dashboard
for monitoring and recording tests.

## Repository Layout

```text
igNYte-LOI-Apparatus/,
  embedded/   Firmware, hardware files, validation docs, and apparatus tools
  mechanical/ Mechanical design docs, CAD exports, assembly notes, and BOMs
  webapp/     Next.js operator dashboard and test-monitoring application
```

## What Is Included

| Path | Contents |
| --- | --- |
| [`embedded/`](embedded/) | Former `IgNYte-FPA` repository. Contains the ESP32-P4 sensor-hub firmware, KiCad hardware files, firmware protocol docs, validation notes, OpenCV prototype, and apparatus helper tools. |
| [`mechanical/`](mechanical/) | Mechanical documentation and future design artifacts for the chamber, frame, sample holder, camera stage, motor mount, assembly process, and mechanical bill of materials. |
| [`webapp/`](webapp/) | Former `ignyte` repository. Contains the production web dashboard for Web Serial device control, live telemetry, session recording, camera/vision controls, Firebase auth, and user management. |

## Embedded Apparatus

Start here for firmware, hardware, and apparatus-level documentation:

- [Embedded README](embedded/README.md)
- [Firmware README](embedded/firmware/p4-sensor-hub-arduino/README.md)
- [Serial protocol](embedded/docs/firmware-serial-protocol.md)
- [Hardware overview](embedded/hardware/README.md)
- [Hardware errata](embedded/hardware/errata.md)
- [Operator demo flow](embedded/docs/operator-demo-flow.md)
- [Final validation notes](embedded/docs/final-validation.md)
- [Future work](embedded/docs/futurework.md)

Active firmware path:

```text
embedded/firmware/p4-sensor-hub-arduino/
```

Common firmware commands:

```powershell
pio run -d embedded/firmware/p4-sensor-hub-arduino
pio test -d embedded/firmware/p4-sensor-hub-arduino -e native
pio run -d embedded/firmware/p4-sensor-hub-arduino -e esp32-p4-motor-debug
```

The firmware communicates over USB serial at `115200` baud using
newline-delimited JSON. Commands and telemetry are documented in
[`embedded/docs/firmware-serial-protocol.md`](embedded/docs/firmware-serial-protocol.md).

## System Block Diagram

The system block diagram shows how the physical apparatus, `motherV1`
electronics, ESP32-P4 firmware, host web app, camera/vision tools, and exported
test data fit together.

![IgNYte LOI apparatus system block diagram](embedded/images/system-block-diagram.svg)

## Mechanical

Use [`mechanical/`](mechanical/) for documentation and artifacts tied to the
physical apparatus: CAD files, exported drawings, assembly notes, mechanical
BOMs, camera-stage hardware, chamber/frame design, sample-holder details, travel
limits, alignment notes, and build photos.

Mechanical changes can affect firmware constants, camera tracking behavior, and
validation results. When the physical stage, chamber, camera payload, or motion
hardware changes, update the relevant embedded validation and future-work docs.

## Web Application

Start here for the dashboard and operator UI:

- [Web app README](webapp/README.md)
- [Firmware protocol parser](webapp/lib/firmware.ts)
- [Firestore security rules](webapp/firestore.rules)
- [Sample-test database schema](webapp/db/schema.sql)
- [Vision controller code](webapp/lib/vision/)

The web app provides:

- Web Serial connection to the ESP32-P4 apparatus
- Live sensor telemetry and rolling charts
- Motor, flow-controller, and sensor command controls
- Safety-gated test recording
- RGB camera capture and OpenCV flame tracking
- Firebase authentication and user management
- Exported test archives for post-processing

Run the web app locally:

```powershell
cd webapp
npm install
npm run dev
```

Open <http://localhost:3000> in Chrome or Edge. Web Serial requires a Chromium
browser served from `localhost` or HTTPS.

Create `webapp/.env.local` before running against Firebase-backed features. The
web app expects `NEXT_PUBLIC_FIREBASE_*` values and optional camera stream URLs;
see [`webapp/README.md`](webapp/README.md) for the current environment details.

## Monorepo History

This repository was assembled with `git subtree` so that both source histories
remain visible in the combined repository.

Original sources:

- `embedded/`: <https://github.com/andre-llaneta/IgNYte-FPA>
- `webapp/`: <https://github.com/ikasturirangan/ignyte>

Useful history commands:

```powershell
git log --all --graph --oneline --decorate --date-order
git log -- embedded
git log -- webapp
```

## Syncing Source Repositories

While the original repositories remain active, sync their latest changes into
this monorepo with the GitHub Actions workflow:

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Sync Source Repos**.
4. Click **Run workflow**.
5. Choose the `main` branch.
6. Click **Run workflow** again to start the sync.

The workflow also runs automatically on its configured schedule. It pulls:

- `embedded/` from `andre-llaneta/IgNYte-FPA`
- `webapp/` from `ikasturirangan/ignyte`

Do not use `--squash` if the goal is to preserve the full upstream commit
history.

## Development Notes

- Keep apparatus firmware and hardware work under `embedded/`.
- Keep mechanical design files, CAD exports, assembly notes, and mechanical BOMs
  under `mechanical/`.
- Keep dashboard, auth, database, and browser-side control work under `webapp/`.
- Update root-level documentation when behavior crosses both parts of the
  system.
- Keep local secrets in ignored `.env.local` files. Do not commit credentials,
  private keys, Firebase service-account files, or machine-specific build
  artifacts.
- Generated directories such as `node_modules/`, `.next/`, build outputs, and
  cache files should stay out of Git.

## Project Status

The combined repository is intended to be the long-term home for the full IgNYte
LOI apparatus stack. The embedded subtree documents the apparatus firmware,
hardware bring-up, validation history, and remaining integration work. The web
app subtree contains the operator-facing dashboard for connecting to the board,
streaming telemetry, controlling the test bench, recording sessions, and
exporting test data.
