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

const envPath =
  (app.isPackaged ?? process.env.NODE_ENV === "production")
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, ".env");

dotenv.config({ path: envPath });

console.log(`[server] Loading .env from: ${envPath}`);

/* ------------------------------------------------ */
/* Track Active Connections                         */
/* ------------------------------------------------ */
let connections = new Set();

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

  // Track HTTP connections for force-close
  server.on("connection", (conn) => {
    connections.add(conn);
    conn.on("close", () => {
      connections.delete(conn);
    });
  });

  // Disable keep-alive to allow faster shutdown
  server.keepAliveTimeout = 0;

  return server;
};

/* ------------------------------------------------ */
/* Graceful Shutdown                                */
/* ------------------------------------------------ */

export async function shutdown(server, signal = "manual") {
  console.log(`[server] Shutting down (${signal})...`);

  try {
    // Step 1: Close MSSQL pool FIRST (important for MSSQL)
    if (pool && pool.connected) {
      console.log("[server] Closing MSSQL pool...");
      await Promise.race([
        pool.close(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("DB pool close timeout")), 3000)
        )
      ]);
      console.log("[server] MSSQL pool closed.");
    }

    // Step 2: Close HTTP server
    if (server && server.listening) {
      console.log("[server] Closing HTTP server...");
      
      // Destroy all active connections immediately
      console.log(`[server] Destroying ${connections.size} active connections`);
      for (const conn of connections) {
        conn.destroy();
      }
      connections.clear();

      await Promise.race([
        new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Server close timeout")), 2000)
        )
      ]);

      console.log("[server] HTTP server closed.");
    }

    console.log("[server] Shutdown complete.");
  } catch (err) {
    console.error("[server] Shutdown error:", err);
    
    // Force cleanup on error
    for (const conn of connections) {
      try {
        conn.destroy();
      } catch (e) {
        // Ignore errors during force cleanup
      }
    }
    connections.clear();

    // Force close pool if still connected
    if (pool && pool.connected) {
      try {
        await pool.close();
      } catch (e) {
        console.error("[server] Force pool close error:", e);
      }
    }
  }
}