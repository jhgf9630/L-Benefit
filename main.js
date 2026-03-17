const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const { downloadJSON } = require('./updater');

const BUNDLE_DATA_PATH = path.join(__dirname, "data", "affiliates.json");

let syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
let mainWindow  = null;
let syncResult  = null;
let pageLoaded  = false;

// ── 로그를 파일로도 저장 (exe 환경 디버깅용) ──
function setupFileLogger() {
  const logPath = path.join(app.getPath("userData"), "debug.log");
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const write = (level, args) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ')}\n`;
    logStream.write(line);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `console.log(${JSON.stringify('[MAIN] ' + line.trim())})`
      ).catch(() => {});
    }
  };

  const origLog   = console.log.bind(console);
  const origError = console.error.bind(console);
  console.log   = (...a) => { origLog(...a);   write('LOG',   a); };
  console.error = (...a) => { origError(...a); write('ERROR', a); };
  console.log(`===== L-Benefit 시작 : ${new Date().toISOString()} =====`);
  console.log("로그 파일:", logPath);
}

function trySendSyncComplete() {
  if (syncResult && pageLoaded && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-complete", syncResult);
  }
}

async function runSync() {
  syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-status-update", syncStatus);
  }

  const result = await downloadJSON();
  syncStatus = result;
  syncResult = result;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-complete", syncResult);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    icon: path.join(__dirname, 'L-Benefit.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.webContents.openDevTools(); // 디버깅용 — 배포 전 제거

  mainWindow.webContents.on("did-finish-load", () => {
    pageLoaded = true;
    trySendSyncComplete();
  });

  runSync();
}

ipcMain.handle("get-sync-status", () => syncStatus);

ipcMain.handle("get-userdata-path", () => {
  return path.join(app.getPath("userData"), "affiliates.json");
});

ipcMain.handle("read-bundle-data", () => {
  try {
    const raw = fs.readFileSync(BUNDLE_DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
});

// 수동 재동기화
ipcMain.handle("request-slm-sync", async () => {
  await runSync();
  return syncStatus;
});

app.on('ready', setupFileLogger);
app.whenReady().then(createWindow);
