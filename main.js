const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { downloadJSON } = require('./updater');

const DATA_URL = "http://slm.lignex1.com/confluence/spaces/~76936/pages/181662037/DB/affiliates.json";
const BUNDLE_DATA_PATH = path.join(__dirname, "data", "affiliates.json");

let syncStatus = {
  status: "loading",
  message: "데이터 동기화 확인 중..."
};

let mainWindow = null;
let syncResult = null;
let pageLoaded = false;

function trySendSyncComplete() {
  if (syncResult && pageLoaded && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-complete", syncResult);
  }
}

async function createWindow() {

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'L-Benefit.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile("index.html");
  // mainWindow.webContents.openDevTools(); // 디버깅용 — 배포 전 제거

  mainWindow.webContents.on("did-finish-load", () => {
    pageLoaded = true;
    trySendSyncComplete();
  });

  downloadJSON(DATA_URL).then((result) => {
    syncStatus = result;
    syncResult = result;
    trySendSyncComplete();
  });
}

ipcMain.handle("get-sync-status", () => {
  return syncStatus;
});

ipcMain.handle("get-userdata-path", () => {
  return path.join(app.getPath("userData"), "affiliates.json");
});

// 번들 내 data/affiliates.json을 fs로 직접 읽어서 반환
ipcMain.handle("read-bundle-data", () => {
  try {
    const raw = fs.readFileSync(BUNDLE_DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
});

app.whenReady().then(createWindow);