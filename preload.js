const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("syncAPI", {
  getStatus:       () => ipcRenderer.invoke("get-sync-status"),
  getDataPath:     () => ipcRenderer.invoke("get-userdata-path"),
  readBundleData:  () => ipcRenderer.invoke("read-bundle-data"),
  requestSlmSync:  () => ipcRenderer.invoke("request-slm-sync"),
  onSyncComplete:  (cb) => ipcRenderer.on("sync-complete",      (_e, s) => cb(s)),
  onSyncStatus:    (cb) => ipcRenderer.on("sync-status-update", (_e, s) => cb(s))
});
