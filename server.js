// server.js
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import app from "./src/app.js";
import { pool } from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------ */
/* Resolve .env Path                                */
/* ------------------------------------------------ */
// When packaged by electron-builder, extraResources land in
// process.resourcesPath (e.g. /path/to/app/resources/).
// In dev, fall back to the project root __dirname.

const envPath = app.isPackaged ?? process.env.NODE_ENV === "production"
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");

dotenv.config({ path: envPath });

console.log(`[server] Loading .env from: ${envPath}`);

/* ------------------------------------------------ */
/* Start Server                                     */
/* ------------------------------------------------ */

export const startServer = () => {
  const HOST = "localhost";
  const PORT = Number(process.env.PORT || "5500");
  const ENV = process.env.NODE_ENV || "production";

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("─────────────────────────────────────────────");
    console.log(`  Adjustments Service`);
    console.log(`  ENV  : ${ENV}`);
    console.log(`  URL  : http://${HOST}:${PORT}`);
    console.log(`  Health : http://${HOST}:${PORT}/health`);
    console.log(`  Live   : http://${HOST}:${PORT}/live`);
    console.log("─────────────────────────────────────────────");
  });

  return server;
};

/* ------------------------------------------------ */
/* Graceful Shutdown                                */
/* ------------------------------------------------ */

export async function shutdown(server, signal = "manual") {
  console.log(`[server] Shutting down (${signal})...`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("[server] HTTP server closed.");
    }

    if (pool && typeof pool.close === "function") {
      await pool.close();
      console.log("[server] DB pool closed.");
    }

    console.log("[server] Shutdown complete.");
  } catch (err) {
    console.error("[server] Shutdown error:", err);
  }
}