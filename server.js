import dotenv from 'dotenv';
import app from './src/app.js'
import { pool } from './config/db.js';



// Load env variables
dotenv.config();
console.log("Running in", process.env.NODE_ENV);

const HOST = "localhost";
const PORT = Number(process.env.PORT || "5500");
const ENV  = process.env.NODE_ENV || "production";


const server = app.listen(PORT, HOST, () => {
  console.log("─────────────────────────────────────────────");
  console.log(`  Adjustments Service`);
  console.log(`  ENV  : ${ENV}`);
  console.log(`  URL  : http://${HOST}:${PORT}`);
  console.log(`  Health : http://${HOST}:${PORT}/health`);
  console.log(`  Live   : http://${HOST}:${PORT}/live`);
  console.log("─────────────────────────────────────────────");
});

function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);

  server.close((err) => {
    if (err) {
      console.error("[server] Error during shutdown:", err);
      process.exit(1);
    }

    // Close DB pool
  
    pool.close().then(() => {
      console.log("[server] DB pool closed. Goodbye.");
      process.exit(0);
    }).catch((e) => {
      console.error("[server] DB pool close error:", e.message);
      process.exit(1);
    });
  });

  // Force exit if graceful shutdown takes too long (10s)
  setTimeout(() => {
    console.error("[server] Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled promise rejections so the process doesn't silently die
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  shutdown("uncaughtException");
});