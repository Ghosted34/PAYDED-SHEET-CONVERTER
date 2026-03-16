import { query } from "../../config/db.js";

const SERVICE_START = Date.now();


export const health = async (req, res) => {
  const uptimeMs = Date.now() - SERVICE_START;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  let dbStatus = "ok";
  let dbError = null;

  try {
    await query("SELECT 1 AS ping");
  } catch (err) {
    dbStatus = "unreachable";
    dbError = err.message;
  }

  const healthy = dbStatus === "ok";

  const payload = {
    status: healthy ? "healthy" : "degraded",
    uptime: {
      ms: uptimeMs,
      human: formatUptime(uptimeSec),
    },
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbStatus,
        ...(dbError && { error: dbError }),
      },
    },
  };

  return res.status(healthy ? 200 : 503).json(payload);
}

export const liveness = (req, res) => {
  return res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: {
      ms: Date.now() - SERVICE_START,
      human: formatUptime(Math.floor((Date.now() - SERVICE_START) / 1000)),
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(totalSeconds) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(" ");
}
