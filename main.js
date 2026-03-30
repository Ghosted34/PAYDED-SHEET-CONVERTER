// main.js
import { app, BrowserWindow } from "electron";
import axios from "axios";
import { startServer, shutdown } from "./electron_server.js";

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
/* Start Backend                                    */
/* ------------------------------------------------ */

function startBackend() {
  try {
    serverInstance = startServer();
    console.log("[electron] Backend started.");
  } catch (err) {
    console.error("[electron] Failed to start backend:", err);
    setTimeout(startBackend, 2000);
  }
}

/* ------------------------------------------------ */
/* Wait Until Backend Is Ready                     */
/* ------------------------------------------------ */

async function waitForBackend(maxAttempts = 50, intervalMs = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get("http://localhost:5500/api/ready");
      console.log("[electron] Backend is ready.");
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.error("[electron] Backend did not become ready in time.");
  return false;
}

/* ------------------------------------------------ */
/* Create Splash Screen                             */
/* ------------------------------------------------ */

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: {
      contextIsolation: true,
    },
  });

  // Inline splash HTML — no file needed
  splash.loadURL(`data:text/html,
    <html>
      <body style="
        margin: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100vh; background: #1a1a2e; color: #e0e0e0;
        font-family: sans-serif; border-radius: 12px;
        overflow: hidden;
      ">
        <h2 style="margin-bottom: 12px; font-size: 1.4rem; color: #ffffff;">
          Navy PayHead Converter
        </h2>
        <p style="font-size: 0.85rem; color: #aaa;">Starting backend service...</p>
        <div style="
          margin-top: 20px; width: 180px; height: 4px;
          background: #333; border-radius: 4px; overflow: hidden;
        ">
          <div style="
            width: 40%; height: 100%; background: #4e9af1;
            border-radius: 4px;
            animation: slide 1.2s ease-in-out infinite alternate;
          "></div>
        </div>
        <style>
          @keyframes slide {
            from { margin-left: 0; }
            to { margin-left: 60%; }
          }
        </style>
      </body>
    </html>
  `);

  return splash;
}

/* ------------------------------------------------ */
/* Create Main Window                               */
/* ------------------------------------------------ */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until ready
    webPreferences: {
      contextIsolation: true,
    },
  });

  mainWindow.loadURL("http://localhost:5500");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  return mainWindow;
}

/* ------------------------------------------------ */
/* App Lifecycle                                    */
/* ------------------------------------------------ */

app.whenReady().then(async () => {
  const splash = createSplashWindow();

  startBackend();

  const ready = await waitForBackend();

  if (!ready) {
    splash.close();
    // Show a basic error dialog and quit
    const { dialog } = await import("electron");
    await dialog.showErrorBox(
      "Startup Failed",
      "The backend service failed to start. Please restart the app.\n\nIf the issue persists, contact support.",
    );
    app.quit();
    return;
  }

  createMainWindow();
  splash.close();
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

let isShuttingDown = false;

async function performShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[electron] Shutting down (${signal})...`);

  if (serverInstance) {
    try {
      await Promise.race([
        shutdown(serverInstance, signal),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Shutdown timeout")), 10000)
        )
      ]);
    } catch (err) {
      console.error("[electron] Shutdown error:", err);
    } finally {
      serverInstance = null;
    }
  }
}

app.on("window-all-closed", async () => {
  await performShutdown("window-all-closed");
  app.quit();
});

app.on("before-quit", async (event) => {
  if (!isShuttingDown && serverInstance) {
    event.preventDefault();
    await performShutdown("before-quit");
    app.quit();
  }
});

process.on("SIGTERM", async () => {
  await performShutdown("SIGTERM");
  process.exit(0);
});

process.on("SIGINT", async () => {
  await performShutdown("SIGINT");
  process.exit(0);
});