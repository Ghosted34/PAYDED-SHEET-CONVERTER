# PAYDED-SHEET-CONVERTER

> Standalone multi-class payroll adjustment and converter batch upload service for the Nigerian Navy.
> Runs as a **web app** (Node.js/Nodemon) or a **desktop app** (Electron).

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Building the Desktop App](#building-the-desktop-app)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)
- [Notes](#notes)

---

## Overview

| Mode        | How it works                                                 | Entry point                      |
| ----------- | ------------------------------------------------------------ | -------------------------------- |
| **Web**     | Express serves the frontend and API on a local port          | `server.js`                      |
| **Desktop** | Electron wraps the Express backend and opens a native window | `main.js` → `electron_server.js` |

On first launch in **desktop mode**, the app detects missing database credentials and shows a setup dialog to collect them before starting the backend.

---

## Prerequisites

| Tool         | Minimum version | Notes                            |
| ------------ | --------------- | -------------------------------- |
| Node.js      | 18+             | [nodejs.org](https://nodejs.org) |
| npm          | 9+              | Comes with Node.js               |
| MSSQL Server | Any             | Must be reachable on the network |

---

## Installation

```bash
# 1. Clone or download the repository
git clone <repo-url>
cd PAYDED-SHEET-CONVERTER

# 2. Install dependencies
npm install
```

---

## Configuration

The app reads its configuration from a `.env` file at the project root (development) or in the `resources/` folder of the installed app (production).

### Setup

```bash
# Copy the example file and fill in your values
cp .env.example .env
```

Then open `.env` and fill in every value:

```dotenv
# ── Server ────────────────────────────────────────
NODE_ENV=production          # or: development
PORT=5500                    # port the Express server listens on

# ── MSSQL ─────────────────────────────────────────
MSSQL_HOST=                  # e.g. 192.168.1.10
MSSQL_PORT=                  # default: 1433
MSSQL_USER=                  # e.g. sa
MSSQL_PASSWORD=

# ── Databases ─────────────────────────────────────
MSSQL_DB_OFFICERS=
MSSQL_DB_WOFFICERS=
MSSQL_DB_RATINGS=
MSSQL_DB_RATINGS_A=
MSSQL_DB_RATINGS_B=
MSSQL_DB_JUNIOR_TRAINEE=
```

> **Desktop mode:** if any MSSQL value is empty when the app launches, a setup dialog will appear and write the values to the `.env` file automatically. You do not need to edit the file manually.

---

## Running the App

### Web mode

```bash
# Production
npm start
# nodemon: restarts on file changes (development)
npm run dev
```

Then open `http://localhost:5500` in your browser (or whatever `PORT` is set to).

### Desktop mode (development — no installer needed)

```bash
npm run electron:dev
```

The Electron window opens automatically. The Express backend starts in the background — no browser required.

---

## Building the Desktop App

```bash
npm run build
```

This runs `electron-builder` and produces a platform-specific installer in the `dist/` folder:

| Platform | Output                  |
| -------- | ----------------------- |
| Windows  | `.exe` installer (NSIS) |
| macOS    | `.dmg`                  |
| Linux    | `.AppImage` or `.deb`   |

> Build configuration is in `electron-builder.json`.

### Distributing the `.env`

When packaging, the `.env` file must be placed in the app's `resources/` folder (outside the read-only `app.asar` archive) so the app can write to it. Configure this in `electron-builder.json`:

```json
{
  "extraResources": [{ "from": ".env.example", "to": ".env" }]
}
```

---

## Project Structure

```structure
PAYDED-SHEET-CONVERTER/
│
├── main.js                  # Electron main process — boot sequence, windows, IPC
├── electron_server.js       # Express server entry point for Electron
├── server.js                # Express server entry point for Node/Nodemon
│
├── electron-ui/             # Electron-only UI (not served by Express)
│   ├── splash.html          # Splash screen shown on startup
│   ├── setup.html           # First-run env configuration dialog
│   └── preload.js           # IPC bridge between setup dialog and main process
│
├── src/                     # Backend source code
│   └── app.js               # Express app definition (routes, middleware)
│
├── config/                  # Backend configuration modules
│   └── db.js                # MSSQL connection pool
│
├── public/                  # Frontend — served statically by Express
│   └── ...                  # HTML, CSS, JS files
│
├── uploads/                 # Uploaded files (runtime, not committed)
│
├── .env                     # Local environment variables — never commit this
├── .env.example             # Committed template showing required keys
├── .env.prod                # Optional production defaults
├── electron-builder.json    # Electron packaging configuration
├── package.json
└── README.md
```

---

## Dependencies

### Runtime

| Package                    | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `express`                  | HTTP server and routing                                  |
| `dotenv`                   | Loads `.env` into `process.env`                          |
| `mssql`                    | MSSQL database client                                    |
| `exceljs` / `xlsx`         | Excel file reading and writing                           |
| `csv-parse` / `csv-parser` | CSV parsing                                              |
| `multer`                   | File upload handling                                     |
| `axios`                    | Internal HTTP requests (Electron → Express health check) |
| `cors`                     | Cross-origin headers                                     |
| `helmet`                   | HTTP security headers                                    |
| `morgan`                   | HTTP request logging                                     |
| `body-parser`              | Request body parsing                                     |
| `serve-index`              | Directory browsing for static files                      |

### Dev / Desktop

| Package            | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `electron`         | Desktop app runtime                          |
| `electron-builder` | Packaging and installer generation           |
| `nodemon`          | Auto-restart during development              |
| `tailwindcss`      | Utility CSS (with `postcss`, `autoprefixer`) |

---

## Notes

- **Single instance:** launching the desktop app a second time focuses the existing window instead of opening a second one.
- **Graceful shutdown:** closing the desktop window cleanly stops the Express server and closes the database pool.
- **Web mode has no setup dialog** — it expects a fully populated `.env` file to already exist.
- **Logo:** place `logo.png` in the `electron-ui/` folder to display the Nigerian Navy crest in the splash screen and setup dialog. A fallback anchor icon (⚓) is shown if the file is missing.
