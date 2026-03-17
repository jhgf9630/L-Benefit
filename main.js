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

    // 로그인 창 전용 세션 생성 (persist: 로 껐다켜도 쿠키 유지)
    const loginSession = session.fromPartition('persist:slm-login');

    // CSP 및 X-Frame-Options 헤더 제거 (iframe 내 로그인 버튼 동작 허용)
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
      title:  "SLM 로그인 — 로그인 완료 후 아래 [연동 완료] 버튼을 눌러주세요",
      webPreferences: {
        nodeIntegration:             false,
        contextIsolation:            true,
        webSecurity:                 false,
        allowRunningInsecureContent: true,
        session:                     loginSession
      }
    });

    loginWin.loadURL(SLM_BASE_URL);

    // 창 하단에 "연동 완료" 버튼 오버레이 삽입
    loginWin.webContents.on("did-finish-load", () => {
      loginWin.webContents.executeJavaScript(`
        (function() {
          if (document.getElementById('_lbenefit_done_btn')) return;
          const btn = document.createElement('button');
          btn.id = '_lbenefit_done_btn';
          btn.innerText = '✅ SLM 로그인 완료 — 클릭하여 연동';
          btn.style.cssText = [
            'position:fixed', 'bottom:0', 'left:0', 'width:100%',
            'z-index:999999', 'padding:14px',
            'background:#1a6b3c', 'color:white',
            'font-size:16px', 'font-weight:bold',
            'border:none', 'cursor:pointer',
            'letter-spacing:0.05em'
          ].join(';');
          btn.onclick = () => { window._lbenefit_login_done = true; };
          document.body.appendChild(btn);
        })();
      `).catch(() => {});
    });

    // 버튼 클릭 여부를 0.5초마다 폴링
    const pollInterval = setInterval(async () => {
      if (resolved || loginWin.isDestroyed()) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const clicked = await loginWin.webContents.executeJavaScript(
          'window._lbenefit_login_done === true'
        );
        if (!clicked) return;

        // 버튼 클릭됨 → 쿠키 수집
        const [cookies1, cookies2] = await Promise.all([
          loginSession.cookies.get({ domain: ".lignex1.com" }),
          session.defaultSession.cookies.get({ domain: ".lignex1.com" })
        ]);
        const allCookies = [...cookies1, ...cookies2].filter(
          (c, i, arr) => arr.findIndex(x => x.name === c.name) === i
        );
        console.log("[SLM] 쿠키 추출:", allCookies.map(c => `${c.name}(${c.domain})`));

        if (allCookies.length > 0) {
          resolved = true;
          clearInterval(pollInterval);
          const cookieStr = allCookies.map(c => `${c.name}=${c.value}`).join("; ");
          loginWin.destroy();
          resolve(cookieStr);
        } else {
          // 쿠키가 없으면 아직 로그인 안 된 것 → 버튼 초기화해서 재시도 유도
          await loginWin.webContents.executeJavaScript(
            'window._lbenefit_login_done = false;'
          ).catch(() => {});
          console.log("[SLM] 쿠키 없음 — 아직 로그인 전입니다.");
        }
      } catch (e) {
        // executeJavaScript 실패 (페이지 전환 중) → 무시
      }
    }, 500);

    loginWin.on("closed", () => {
      clearInterval(pollInterval);
      if (!resolved) reject(new Error("SLM 로그인 창이 닫혔습니다."));
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
