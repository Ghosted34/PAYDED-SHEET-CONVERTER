// config.js

// import { config as loadEnv } from "dotenv";
// import path from "path";
// import { fileURLToPath } from "url";
// import pkg from "electron";

// const { app } = pkg;

/* ------------------------------------------------ */
/* Resolve Correct Environment Path                 */
/* ------------------------------------------------ */

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

/*
  When packaged:
  .env should be placed in:
  resources/.env
*/

// const envPath = app?.isPackaged
//   ? path.join(process.resourcesPath, ".env")
//   : path.join(__dirname, "../.env");

/* ------------------------------------------------ */
/* Load Environment                                 */
/* ------------------------------------------------ */

// loadEnv({
//   path: envPath,
// });

// console.log("Loaded env from:", envPath);

/* ------------------------------------------------ */
/* Config Object                                    */
/* ------------------------------------------------ */

// src/config.js

// NOTE: dotenv is loaded by electron_server.js (Electron) or server.js (Node).
// Do NOT call loadEnv() here — it would snapshot empty values before setup runs.
// All values are read lazily via getters so they reflect process.env at use time.

const config = {
  app: {
    get port() {
      return process.env.PORT;
    },
    get env() {
      return process.env.NODE_ENV || "development";
    },
  },
  mssql: {
    get host() {
      return process.env.MSSQL_HOST || "localhost\\SQLEXPRESS";
    },
    get port() {
      return Number(process.env.MSSQL_PORT) || 1433;
    },
    get user() {
      return process.env.MSSQL_USER;
    },
    get password() {
      return process.env.MSSQL_PASSWORD;
    },
  },
  databases: {
    get officers() {
      return process.env.MSSQL_DB_OFFICERS;
    },
    get wofficers() {
      return process.env.MSSQL_DB_WOFFICERS;
    },
    get ratings() {
      return process.env.MSSQL_DB_RATINGS;
    },
    get ratingsA() {
      return process.env.MSSQL_DB_RATINGS_A;
    },
    get ratingsB() {
      return process.env.MSSQL_DB_RATINGS_B;
    },
    get juniorTrainee() {
      return process.env.MSSQL_DB_JUNIOR_TRAINEE;
    },
  },
};

export default config;
