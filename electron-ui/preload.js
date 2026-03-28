// // electron-ui/preload.js
// import { contextBridge, ipcRenderer } from "electron";

// contextBridge.exposeInMainWorld("setupAPI", {
//   /**
//    * Send env values to main process to be written to .env
//    * @param {Record<string, string>} values
//    * @returns {Promise<{ ok: boolean, error?: string }>}
//    */
//   saveEnv: (values) => ipcRenderer.invoke("setup:save-env", values),

//   /**
//    * Get the resolved .env path (for display only)
//    * @returns {Promise<string>}
//    */
//   getEnvPath: () => ipcRenderer.invoke("setup:get-env-path"),
// });

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setupAPI", {
  saveEnv: (values) => ipcRenderer.invoke("setup:save-env", values),
  getEnvPath: () => ipcRenderer.invoke("setup:get-env-path"),
});
