const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("syncAPI", {
  getStatus:    () => ipcRenderer.invoke("get-sync-status"),
  getDataPath:  () => ipcRenderer.invoke("get-userdata-path"),
  readBundleData: () => ipcRenderer.invoke("read-bundle-data"),
  onSyncComplete: (callback) => ipcRenderer.on("sync-complete", (_event, status) => callback(status))
});