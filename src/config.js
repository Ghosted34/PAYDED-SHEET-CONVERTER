// config.js

import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "electron";

const { app } = pkg;

/* ------------------------------------------------ */
/* Resolve Correct Environment Path                 */
/* ------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  When packaged:
  .env should be placed in:
  resources/.env
*/

const envPath = app?.isPackaged
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, "../.env");

/* ------------------------------------------------ */
/* Load Environment                                 */
/* ------------------------------------------------ */

loadEnv({
  path: envPath,
});

console.log("Loaded env from:", envPath);

/* ------------------------------------------------ */
/* Config Object                                    */
/* ------------------------------------------------ */

const config = {
  app: {
    port: process.env.PORT,
    env: process.env.NODE_ENV || "development",
  },
  mssql: {
    host: process.env.MSSQL_HOST || "localhost\\SQLEXPRESS",
    port: Number(process.env.MSSQL_PORT) || 1433,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
  },
  databases: {
    officers: process.env.MSSQL_DB_OFFICERS,
    wofficers: process.env.MSSQL_DB_WOFFICERS,
    ratings: process.env.MSSQL_DB_RATINGS,
    ratingsA: process.env.MSSQL_DB_RATINGS_A,
    ratingsB: process.env.MSSQL_DB_RATINGS_B,
    juniorTrainee: process.env.MSSQL_DB_JUNIOR_TRAINEE,
  },
};

export default config;
