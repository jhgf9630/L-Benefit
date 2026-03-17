const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs   = require('fs');
const { downloadJSON } = require('./updater');

const DATA_URL         = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const BUNDLE_DATA_PATH = path.join(__dirname, "data", "affiliates.json");
const SLM_BASE_URL     = "http://slm.lignex1.com";

let syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
let mainWindow  = null;
let syncResult  = null;
let pageLoaded  = false;

function trySendSyncComplete() {
  if (syncResult && pageLoaded && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-complete", syncResult);
  }
}

// ─────────────────────────────────────────
// SLM 로그인 창
// ─────────────────────────────────────────
function openSlmLoginWindow() {
  return new Promise((resolve, reject) => {

    let resolved = false;

    const loginWin = new BrowserWindow({
      width:  1000,
      height: 750,
      title:  "SLM 로그인 — 로그인 완료 후 창이 자동으로 닫힙니다",
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true
      }
    });

    loginWin.loadURL(SLM_BASE_URL);

    // 모든 페이지 이동 URL을 터미널에 출력 (디버깅용)
    loginWin.webContents.on("did-navigate", async (event, url) => {
      console.log("[SLM] did-navigate:", url);
      await checkLoginSuccess(url);
    });

    // SPA 내부 라우팅(pushState 등)도 감지
    loginWin.webContents.on("did-navigate-in-page", async (event, url) => {
      console.log("[SLM] did-navigate-in-page:", url);
      await checkLoginSuccess(url);
    });

    async function checkLoginSuccess(url) {
      if (resolved) return;
      try {
        const u = new URL(url);

        // login / otp / auth / sso 관련 페이지가 아닌 slm.lignex1.com 페이지면 로그인 완료로 간주
        const isLoginPage = ["login", "otp", "auth", "sso", "logout"].some(kw => url.toLowerCase().includes(kw));

        if (u.hostname === "slm.lignex1.com" && !isLoginPage) {
          const cookies = await session.defaultSession.cookies.get({ domain: "slm.lignex1.com" });
          console.log("[SLM] 쿠키 추출:", cookies.map(c => c.name));

          if (cookies.length > 0) {
            resolved = true;
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
            loginWin.destroy();
            resolve(cookieStr);
          }
        }
      } catch (e) {
        console.error("[SLM] 쿠키 추출 오류:", e.message);
      }
    }

    loginWin.on("closed", () => {
      if (!resolved) {
        reject(new Error("SLM 로그인 창이 닫혔습니다."));
      }
    });
  });
}

// ─────────────────────────────────────────
// 동기화 실행 (외부에서도 호출 가능)
// ─────────────────────────────────────────
async function runSync() {
  syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-status-update", syncStatus);
  }

  const result = await downloadJSON(DATA_URL, openSlmLoginWindow);
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

  mainWindow.webContents.on("did-finish-load", () => {
    pageLoaded = true;
    trySendSyncComplete();
  });

  // 백그라운드 동기화
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

// 수동 재연동 IPC
ipcMain.handle("request-slm-sync", async () => {
  await runSync();
  return syncStatus;
});

app.whenReady().then(createWindow);
