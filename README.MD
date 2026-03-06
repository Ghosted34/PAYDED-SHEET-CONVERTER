# PAYDED-SHEET-CONVERTER

A desktop application and web interface for converting payroll sheets, built with Express.js and Electron.

## Features

- Web-based HTML interface via Express.js
- Desktop application support with Electron
- Local development with Node.js and Nodemon
- Installable desktop app via Electron Builder

## Prerequisites

- Node.js 14+
- npm

## Installation

```bash
npm install
```

## Development

### Web Interface (Localhost)

```bash
npm run dev
# or
nodemon server.js
```

Access the application at `http://localhost:{port}`

### Desktop Application

```bash
npm run electron:dev
```

## Building

### Create Installer

```bash
npm run build
```

Generates platform-specific installers (Windows, macOS, Linux).

## Project Structure

- **Express.js**: Backend server and HTML interface
- **Electron**: Desktop app wrapper with `main.js`
- **Electron Builder**: Packaging and distribution

## Technologies

- Express.js
- Electron
- Electron Builder
- Node.js

See `package.json` for additional dependencies.
