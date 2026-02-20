import mssql from "mssql";
import cfg from "../config.js";

const config = {
  user: cfg.mssql.user,
  password: cfg.mssql.password,
  server: cfg.mssql.host,
  port: cfg.mssql.port,
  database: cfg.databases.officers,
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export const pool = new mssql.ConnectionPool(config);
export const poolConnect = pool.connect();

pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

poolConnect
  .then(() => console.log("[DB] Connected to MSSQL"))
  .catch((err) => {
    console.log(err);
    console.error("[DB] Connection failed:", err.message);
    process.exit(1);
  });

// Simple query helper — params bound as @p0, @p1, ...
export async function query(sql, params = []) {
  await poolConnect;
  const req = pool.request();
  params.forEach((val, i) => req.input(`p${i}`, val));
  return req.query(sql);
}
