const { app, BrowserWindow, ipcMain, session } = require('electron');
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

// Electron 숨김 창으로 다운로드 — 외부 브라우저 창 없이 처리
function requestDownload(url) {
  return new Promise((resolve, reject) => {
    const dlSession = session.fromPartition('persist:slm-download');

    // 다운로드 경로를 기본 다운로드 폴더로 설정
    dlSession.setDownloadPath(app.getPath("downloads"));

    const hiddenWin = new BrowserWindow({
      show: false, // 창을 화면에 표시하지 않음
      webPreferences: {
        session:          dlSession,
        nodeIntegration:  false,
        contextIsolation: true
      }
    });

    // 다운로드 시작 이벤트 감지
    dlSession.on("will-download", (event, item) => {
      console.log("[download] 다운로드 시작:", item.getFilename());

      item.on("done", (e, state) => {
        hiddenWin.destroy();
        if (state === "completed") {
          console.log("[download] 다운로드 완료");
          resolve();
        } else {
          reject(new Error(`다운로드 실패: ${state}`));
        }
      });
    });

    // URL 로드 → SLM 세션 쿠키로 자동 다운로드
    hiddenWin.loadURL(url);

    // 10초 안에 다운로드가 시작되지 않으면 실패 처리
    setTimeout(() => {
      if (!hiddenWin.isDestroyed()) {
        hiddenWin.destroy();
        reject(new Error("다운로드가 시작되지 않았습니다. SLM 로그인 상태를 확인하세요."));
      }
    }, 10000);
  });
}

async function runSync() {
  syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-status-update", syncStatus);
  }

  const result = await downloadJSON(requestDownload);
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
