import mssql from "mssql";

let pool = null;

export const createPool = () =>
  new mssql.ConnectionPool({
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_HOST,
    port: Number(process.env.MSSQL_PORT),
    database: process.env.MSSQL_DB_OFFICERS,
    options: {
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  });

export async function getPool() {
  if (pool) return pool;

  pool = await createPool().connect();

  console.log("[DB] Connected to MSSQL");
  pool.on("error", (err) => {
    console.error("[DB] Pool error:", err.message);
  });

  return pool;
}

export function closePool() {
  if (!pool) return null;
  return pool.close();
}

// export const pool = new mssql.ConnectionPool(config);

pool?.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

// Simple query helper — params bound as @p0, @p1, ...
export async function query(sql, params = []) {
  if (!pool || (!pool.connected && !pool.connecting)) {
    console.log("[query] before connect");
    await getPool();
    console.log("[query] after connect");
  }
  const req = pool.request();
  params.forEach((val, i) => req.input(`p${i}`, val));
  return req.query(sql);
}
