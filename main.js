// main.js
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { startServer, shutdown, resolveEnvPath } from "./electron_server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------ */
/* Single Instance Lock                             */
/* ------------------------------------------------ */

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let serverInstance = null;
let mainWindow = null;

/* ------------------------------------------------ */
/* Env Helpers                                      */
/* ------------------------------------------------ */

const REQUIRED_KEYS = [
  "MSSQL_HOST",
  "MSSQL_PORT",
  "MSSQL_USER",
  "MSSQL_PASSWORD",
  "MSSQL_DB_OFFICERS",
  "MSSQL_DB_WOFFICERS",
  "MSSQL_DB_RATINGS",
  "MSSQL_DB_RATINGS_A",
  "MSSQL_DB_RATINGS_B",
  "MSSQL_DB_JUNIOR_TRAINEE",
];

/**
 * Parse a .env file into a key→value map.
 * Lines starting with # and blank lines are ignored.
 */
function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

/**
 * Write key=value pairs into an existing .env file,
 * preserving all comments and unrelated keys.
 */
function patchEnv(filePath, values) {
  let content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";

  for (const [key, val] of Object.entries(values)) {
    const re = new RegExp(`^(${key}\\s*=).*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `$1${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  }

  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Returns true if any REQUIRED_KEYS are missing or empty in the .env file.
 */
function envNeedsSetup(envPath) {
  const parsed = parseEnv(envPath);
  return REQUIRED_KEYS.some((k) => !parsed[k] || parsed[k].trim() === "");
}

/* ------------------------------------------------ */
/* IPC Handlers (setup window)                      */
/* ------------------------------------------------ */

// Holds the resolve fn for the setup-complete promise.
// Set before the setup window opens, called by the handler on success.
let _setupResolve = null;

function registerStaticHandlers(envPath) {
  // Permanent handler — just returns the path, safe to register once.
  ipcMain.handle("setup:get-env-path", () => envPath);
}

function waitForSetup(envPath, setupWin) {
  return new Promise((resolve, reject) => {
    ipcMain.handleOnce("setup:save-env", (_event, values) => {
      try {
        patchEnv(envPath, values);

        // Inject into process.env so config.js lazy getters
        // pick up real values when startServer() runs.
        for (const [k, v] of Object.entries(values)) {
          process.env[k] = v;
        }

        // Close setup window after brief pause so user sees confirmation.
        setTimeout(() => {
          if (!setupWin.isDestroyed()) setupWin.close();
        }, 800);

        resolve();
        return { ok: true };
      } catch (err) {
        console.error("[electron] Failed to write .env:", err);
        reject(err);
        return { ok: false, error: err.message };
      }
    });
  });
}

/* ------------------------------------------------ */
/* Create Splash Window                             */
/* ------------------------------------------------ */

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    webPreferences: { contextIsolation: true },
  });

  splash.loadFile(path.join(__dirname, "electron-ui", "splash.html"));
  splash.setAlwaysOnTop(true, "normal");
  return splash;
}

/* ------------------------------------------------ */
/* Create Setup Window                              */
/* ------------------------------------------------ */

function createSetupWindow() {
  const win = new BrowserWindow({
    width: 540,
    height: 620,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "electron-ui", "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "electron-ui", "setup.html"));
  win.setAlwaysOnTop(true, "modal-panel");
  return win;
}

/* ------------------------------------------------ */
/* Create Main Window                               */
/* ------------------------------------------------ */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: { contextIsolation: true },
  });

  mainWindow.loadURL("http://localhost:5500");
  mainWindow.once("ready-to-show", () => mainWindow.show());
  return mainWindow;
}

/* ------------------------------------------------ */
/* Start Backend                                    */
/* ------------------------------------------------ */

async function startBackend() {
  console.log("[electron main]: starting server");
  try {
    serverInstance = await startServer();
    console.log("[electron] Backend started.");
  } catch (err) {
    console.error("[electron] Failed to start backend:", err);
    setTimeout(startBackend, 2000);
  }
}

/* ------------------------------------------------ */
/* Wait Until Backend Is Ready                     */
/* ------------------------------------------------ */

async function waitForBackend(maxAttempts = 20, intervalMs = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    console.log(i, "index");
    try {
      await axios.get("http://localhost:5500/api/live", { timeout: 2000 });
      console.log("[electron] Backend is ready.");
      return true;
    } catch (err) {
      console.error("[electron] Failed to check backend status:", err);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.error("[electron] Backend did not become ready in time.");
  return false;
}

/* ------------------------------------------------ */
/* App Boot Sequence                                */
/* ------------------------------------------------ */

app.whenReady().then(async () => {
  const envPath = resolveEnvPath();
  registerStaticHandlers(envPath);

  // 1. Show splash immediately
  const splash = createSplashWindow();

  // 2. Check if setup is needed
  if (envNeedsSetup(envPath)) {
    console.log("[electron] Env setup required — showing setup dialog.");

    const setupWin = createSetupWindow();
    await waitForSetup(envPath, setupWin);
  }

  dotenv.config({ path: envPath, override: true });
  console.log(`[electron] Env loaded from: ${envPath}`);

  // 3. Start backend (env is now populated)
  await startBackend();

  // 4. Wait for backend to be ready
  const ready = await waitForBackend();
  console.log("[electron-server]: Ready?", ready);

  if (!ready) {
    splash.close();
    console.error(
      "[electron] Backend failed to start in time. Showing error dialog.",
    );
    dialog.showErrorBox(
      "Startup Failed",
      "The backend service failed to start. Please restart the app.\n\nIf the issue persists, contact support.",
    );
    app.quit();
    return;
  }

  // 5. Open main window, close splash
  createMainWindow();
  splash.close();
  console.log("[electron] Splash has been closed");
});

app.on("second-instance", () => {
  // Focus existing window if user opens a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/* ------------------------------------------------ */
/* Graceful Shutdown                                */
/* ------------------------------------------------ */

app.on("window-all-closed", async () => {
  console.log("[electron] App closing...");

  if (serverInstance) {
    await shutdown(serverInstance, "app-close");
  }

  app.quit();
});
