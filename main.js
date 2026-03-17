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

    let resolved     = false;
    let firstNavDone = false;
    let pollTimer    = null;

    const loginSession = session.fromPartition('persist:slm-login');

    // CSP / X-Frame-Options 헤더 제거 (iframe 로그인 허용)
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

    // ── URL 기반 감지 ──
    loginWin.webContents.on("did-navigate", async (event, url) => {
      console.log("[SLM] did-navigate:", url);
      if (!firstNavDone) { firstNavDone = true; return; }
      await checkLoginSuccess(url);
    });

    loginWin.webContents.on("did-navigate-in-page", async (event, url) => {
      console.log("[SLM] did-navigate-in-page:", url);
      if (!firstNavDone) return;
      await checkLoginSuccess(url);
    });

    // ── 쿠키 폴링: 1초마다 SLM 세션 쿠키 존재 여부 확인 ──
    // URL 감지가 실패해도 쿠키가 생기면 로그인 완료로 처리
    pollTimer = setInterval(async () => {
      if (resolved) { clearInterval(pollTimer); return; }
      try {
        const cookies = await loginSession.cookies.get({ domain: "slm.lignex1.com" });
        // SLM 인증 쿠키가 있는지 확인 (이름에 SESSION, JSESSION, TOKEN 포함)
        const authCookies = cookies.filter(c =>
          /session|token|jsession|sso/i.test(c.name)
        );
        if (authCookies.length > 0) {
          console.log("[SLM] 폴링으로 인증 쿠키 감지:", authCookies.map(c => c.name));
          await handleLoginSuccess();
        }
      } catch (e) {
        console.error("[SLM] 폴링 오류:", e.message);
      }
    }, 1000);

    async function checkLoginSuccess(url) {
      if (resolved) return;
      const isAuthPage = ["login", "otp", "auth", "sso", "logout", "dologin"].some(
        kw => url.toLowerCase().includes(kw)
      );
      if (isAuthPage) return;

      const u = new URL(url);
      if (u.hostname === "slm.lignex1.com") {
        await handleLoginSuccess();
      }
    }

    async function handleLoginSuccess() {
      if (resolved) return;
      try {
        const [cookies1, cookies2] = await Promise.all([
          loginSession.cookies.get({ domain: "slm.lignex1.com" }),
          session.defaultSession.cookies.get({ domain: "slm.lignex1.com" })
        ]);
        const allCookies = [...cookies1, ...cookies2];
        const uniqueCookies = allCookies.filter(
          (c, i, arr) => arr.findIndex(x => x.name === c.name) === i
        );
        console.log("[SLM] 쿠키 추출:", uniqueCookies.map(c => c.name));

        if (uniqueCookies.length > 0) {
          resolved = true;
          clearInterval(pollTimer);
          const cookieStr = uniqueCookies.map(c => `${c.name}=${c.value}`).join("; ");
          loginWin.destroy();
          resolve(cookieStr);
        }
      } catch (e) {
        console.error("[SLM] 쿠키 추출 오류:", e.message);
      }
    }

    loginWin.on("closed", () => {
      clearInterval(pollTimer);
      if (!resolved) {
        reject(new Error("SLM 로그인 창이 닫혔습니다."));
      }
    });
  });
}

// ─────────────────────────────────────────
// 동기화 실행
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
  await runSync(true);
  return syncStatus;
});

app.whenReady().then(createWindow);
