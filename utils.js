import { execSync } from "child_process";

export function freePort(port) {
  try {
    // Windows only
    const result = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
    });
    const lines = result.trim().split("\n");
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`[server] Freed port ${port} (killed PID ${pid})`);
      }
    }
  } catch {
    // Port was already free
  }
}
