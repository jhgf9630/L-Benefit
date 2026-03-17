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
// SLM 로그인 창 띄우기
// 사용자가 직접 로그인(OTP 포함) → 완료 후 쿠키 추출 → 반환
// ─────────────────────────────────────────
function openSlmLoginWindow() {
  return new Promise((resolve, reject) => {
    const loginWin = new BrowserWindow({
      width:  900,
      height: 700,
      title:  "SLM 로그인 - 로그인 완료 후 창이 자동으로 닫힙니다",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    loginWin.loadURL(SLM_BASE_URL);

    // 페이지 이동마다 로그인 완료 여부 감지
    // SLM 메인(/)에 성공적으로 도달하면 로그인 완료로 간주
    loginWin.webContents.on("did-navigate", async (event, url) => {
      try {
        const u = new URL(url);

        // SLM 메인 도달 시 쿠키 추출
        if (u.hostname === "slm.lignex1.com" && !url.includes("login") && !url.includes("otp")) {
          const cookies = await session.defaultSession.cookies.get({ domain: "slm.lignex1.com" });

          if (cookies.length > 0) {
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
            loginWin.close();
            resolve(cookieStr);
          }
        }
      } catch (e) {
        console.error("[login] 쿠키 추출 오류:", e.message);
      }
    });

    loginWin.on("closed", () => {
      // 사용자가 창을 직접 닫은 경우
      reject(new Error("SLM 로그인 창이 닫혔습니다."));
    });
  });
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

  // 백그라운드 동기화 — SLM 로그인 필요 시 창 띄우기
  downloadJSON(DATA_URL, openSlmLoginWindow).then((result) => {
    syncStatus = result;
    syncResult = result;
    trySendSyncComplete();
  });
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

app.whenReady().then(createWindow);
