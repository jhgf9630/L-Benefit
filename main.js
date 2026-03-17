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

    let resolved    = false;
    let firstNavDone = false; // 최초 페이지 로드 무시용 플래그

    // 로그인 창 전용 세션 생성 (메인 앱 세션과 분리)
    const loginSession = session.fromPartition('persist:slm-login');

    // CSP 및 cross-origin 제한 헤더 제거
    loginSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['x-frame-options'];
      delete headers['X-Frame-Options'];
      delete headers['content-security-policy'];
      delete headers['Content-Security-Policy'];
      callback({ responseHeaders: headers });
    });

    const loginWin = new BrowserWindow({
      width:  1000,
      height: 750,
      title:  "SLM 로그인 — 로그인 완료 후 창이 자동으로 닫힙니다",
      webPreferences: {
        nodeIntegration:             false,
        contextIsolation:            true,
        webSecurity:                 false,
        allowRunningInsecureContent: true,
        session:                     loginSession
      }
    });

    loginWin.loadURL(SLM_BASE_URL);

    loginWin.webContents.on("did-navigate", async (event, url) => {
      console.log("[SLM] did-navigate:", url);

      // 최초 로드(SLM_BASE_URL 진입)는 무시하고 플래그만 세팅
      if (!firstNavDone) {
        firstNavDone = true;
        return;
      }

      await checkLoginSuccess(url);
    });

    loginWin.webContents.on("did-navigate-in-page", async (event, url) => {
      console.log("[SLM] did-navigate-in-page:", url);
      if (!firstNavDone) return;
      await checkLoginSuccess(url);
    });

    async function checkLoginSuccess(url) {
      if (resolved) return;
      try {
        const u = new URL(url);

        // 로그인/인증 관련 페이지이면 아직 로그인 중 → 무시
        const isAuthPage = ["login", "otp", "auth", "sso", "logout", "dologin"].some(
          kw => url.toLowerCase().includes(kw)
        );
        if (isAuthPage) return;

        // slm.lignex1.com 도메인의 일반 페이지에 도달 = 로그인 완료
        if (u.hostname === "slm.lignex1.com") {
          // 전용 세션과 기본 세션 양쪽에서 쿠키 수집
          const [cookies1, cookies2] = await Promise.all([
            loginSession.cookies.get({ domain: "slm.lignex1.com" }),
            session.defaultSession.cookies.get({ domain: "slm.lignex1.com" })
          ]);
          const allCookies = [...cookies1, ...cookies2];
          // 중복 제거
          const uniqueCookies = allCookies.filter(
            (c, i, arr) => arr.findIndex(x => x.name === c.name) === i
          );
          console.log("[SLM] 쿠키 추출:", uniqueCookies.map(c => c.name));

          if (uniqueCookies.length > 0) {
            resolved = true;
            const cookieStr = uniqueCookies.map(c => `${c.name}=${c.value}`).join("; ");
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
// 동기화 실행
// forceLogin: true 이면 쿠키 무시하고 로그인 창 강제 오픈
// ─────────────────────────────────────────
async function runSync(forceLogin = false) {
  syncStatus = { status: "loading", message: "데이터 동기화 확인 중..." };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync-status-update", syncStatus);
  }

  const result = await downloadJSON(DATA_URL, openSlmLoginWindow, forceLogin);
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

// 수동 재연동 IPC — 항상 로그인 창 강제 오픈
ipcMain.handle("request-slm-sync", async () => {
  await runSync(true);
  return syncStatus;
});

app.whenReady().then(createWindow);
