// server.js
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "./config/db.js";
// import { freePort } from "./utils.js";

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
/* Start Server                                     */
/* ------------------------------------------------ */

// export const startServer = async () => {
//   const { default: app } = await import("./src/app.js");

//   const HOST = "localhost";
//   const PORT = Number(process.env.PORT || "5500");
//   const ENV = process.env.NODE_ENV || "production";

//   const server = app.listen(PORT, "0.0.0.0", () => {
//     console.log("─────────────────────────────────────────────");
//     console.log(`  Adjustments Service`);
//     console.log(`  ENV  : ${ENV}`);
//     console.log(`  URL  : http://${HOST}:${PORT}`);
//     console.log(`  Health : http://${HOST}:${PORT}/health`);
//     console.log(`  Live   : http://${HOST}:${PORT}/live`);
//     console.log("─────────────────────────────────────────────");
//   });

//   return server;
// };

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
    console.error("[server] Shutdown error:", err);
  }
}

export const startServer = async () => {
  const { default: app } = await import("./src/app.js");
  console.log("[electron-server] importing pool");

  const HOST = "localhost";
  const PORT = Number(process.env.PORT || "5500");
  const ENV = process.env.NODE_ENV || "production";

  // freePort(PORT);

  // try {
  //   await getPool();
  // } catch (error) {
  //   console.error("[electron-server] Failed to connect to DB:", error);
  //   throw error;
  // }

  console.log("[election-server] after pool connection");

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log("─────────────────────────────────────────────");
      console.log(`  Adjustments Service`);
      console.log(`  ENV  : ${ENV}`);
      console.log(`  URL  : http://${HOST}:${PORT}`);
      console.log(`  Health : http://${HOST}:${PORT}/health`);
      console.log(`  Live   : http://${HOST}:${PORT}/live`);
      console.log("─────────────────────────────────────────────");
      resolve(server);
    });

    server.on("error", (err) => {
      console.error("[electron] Backend server failed to start:", err);
      reject(err);
    });
  });
};
