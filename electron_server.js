// server.js
import path from "path";
import { fileURLToPath } from "url";
import http from "http";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveEnvPath() {
  const isPackaged =
    typeof process.resourcesPath === "string" &&
    !process.resourcesPath.includes("node_modules");

  return isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, ".env");
}

/* ------------------------------------------------ */
/* Track Active Connections                         */
/* ------------------------------------------------ */
let connections = new Set();

/* ------------------------------------------------ */
/* Graceful Shutdown                                */
/* ------------------------------------------------ */

export async function shutdown(server, signal = "manual") {
  console.log(`[server] Shutting down (${signal})...`);

  try {
    if (server && server.listening) {

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

    // Dynamically access pool only if it was ever loaded.
    try {
      const { closePool } = await import("./config/db.js");

      console.log("[electron-server-shutdown] closing pool");

      await closePool(); // ✅ closes the SAME pool

      console.log("[server] DB pool closed.");
    } catch {
      // Pool was never imported (e.g. app quit before setup finished)
    }

    console.log("[server] Shutdown complete.");
  } catch (err) {
    // Force cleanup on error
    for (const conn of connections) {
      try {
        conn.destroy();
      } catch (e) {
        // Ignore errors during force cleanup
      }
    }
    connections.clear();

  }
}

export const startServer = async () => {
  const { default: app } = await import("./src/app.js");
  console.log("[electron-server] importing pool");

  const HOST = "127.0.0.1";
  const PORT = Number(process.env.PORT || "5500");
  const ENV = process.env.NODE_ENV || "production";

  console.log("[election-server] after pool connection");

  return new Promise((resolve, reject) => {
    console.log("[electron-server] creating http server, PORT:", PORT, "HOST:", HOST);
    const server = http.createServer(app);
    console.log("[electron-server] server created, calling listen...");

    server.on("connection", (conn) => {
      connections.add(conn);
      conn.on("close", () => connections.delete(conn));
    });

    server.listen({ port: PORT, host: HOST, exclusive: false }, () => {
      console.log("─────────────────────────────────────────────");
      console.log(`  Adjustments Service`);
      console.log(`  ENV  : ${ENV}`);
      console.log(`  URL  : http://${HOST}:${PORT}`);
      console.log(`  Health : http://${HOST}:${PORT}/health`);
      console.log(`  Live   : http://${HOST}:${PORT}/live`);
      console.log("─────────────────────────────────────────────");
      server.keepAliveTimeout = 0;
      resolve(server);
    });

    server.on("error", (err) => {
      console.error("[electron] Backend server failed to start:", err);
      reject(err);
    });
  });


}
