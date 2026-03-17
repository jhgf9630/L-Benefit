const fs   = require("fs");
const path = require("path");
const { app, shell } = require("electron");

const BUNDLE_PATH   = path.join(__dirname, "data", "affiliates.json");
const CONF_FILE_URL = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const TIMEOUT_MS    = 30000; // 다운로드 대기 최대 30초
const POLL_INTERVAL = 1000;  // 1초마다 파일 확인

function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

// Windows 기본 다운로드 폴더
function getDownloadDir() {
  return app.getPath("downloads");
}

// 다운로드 폴더에서 affiliates.json 파일 감지 후 userData로 복사
function waitForDownload() {
  return new Promise((resolve, reject) => {
    const downloadDir  = getDownloadDir();
    const targetFile   = path.join(downloadDir, "affiliates.json");
    const startTime    = Date.now();

    // 기존 파일이 있으면 시작 전 mtime 기록 (새 다운로드 구분용)
    let prevMtime = null;
    if (fs.existsSync(targetFile)) {
      prevMtime = fs.statSync(targetFile).mtimeMs;
    }

    console.log("[updater] 다운로드 폴더 감시 시작:", downloadDir);

    const poll = setInterval(() => {
      try {
        if (!fs.existsSync(targetFile)) return;

        const stat = fs.statSync(targetFile);

        // 새로 다운로드된 파일인지 확인 (이전 mtime과 다르거나 처음 생긴 경우)
        if (prevMtime !== null && stat.mtimeMs === prevMtime) return;

        // 파일이 아직 쓰이는 중인지 확인 (크기 변화 없으면 완료)
        const size1 = stat.size;
        setTimeout(() => {
          try {
            if (!fs.existsSync(targetFile)) return;
            const size2 = fs.statSync(targetFile).size;
            if (size2 !== size1) return; // 아직 쓰는 중

            // 다운로드 완료 → userData로 복사
            const body = fs.readFileSync(targetFile, "utf-8");
            JSON.parse(body); // JSON 유효성 검사

            clearInterval(poll);
            resolve(body);
            console.log("[updater] 다운로드 완료 감지:", targetFile);
          } catch (e) {
            console.log("[updater] 파일 읽기 대기 중...");
          }
        }, 500);

      } catch (e) {
        console.error("[updater] 폴링 오류:", e.message);
      }

      // 타임아웃
      if (Date.now() - startTime > TIMEOUT_MS) {
        clearInterval(poll);
        reject(new Error("다운로드 대기 시간 초과 (30초). 브라우저에서 파일이 다운로드됐는지 확인하세요."));
      }
    }, POLL_INTERVAL);
  });
}

// ─────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────
async function downloadJSON() {
  const DATA_PATH = getDataPath();

  try {
    console.log("[updater] 브라우저로 다운로드 URL 열기:", CONF_FILE_URL);

    // 기본 브라우저로 다운로드 URL 열기 (기존 SLM 세션으로 자동 다운로드)
    await shell.openExternal(CONF_FILE_URL);

    // 다운로드 폴더에서 파일 감지 대기
    const body = await waitForDownload();
    const newData = JSON.parse(body);

    console.log("[updater] 파일 감지 성공, body 길이:", body.length);

    // 로컬과 비교
    const comparePath = fs.existsSync(DATA_PATH) ? DATA_PATH : BUNDLE_PATH;
    let localData = null;
    if (fs.existsSync(comparePath)) {
      localData = JSON.parse(fs.readFileSync(comparePath, "utf-8"));
    }

    if (JSON.stringify(newData) === JSON.stringify(localData)) {
      return { status: "same", message: "제휴업체/혜택 정보가 최신 상태입니다." };
    } else {
      fs.writeFileSync(DATA_PATH, body, "utf-8");
      return { status: "updated", message: "제휴업체/혜택 정보가 Confluence와 동기화되었습니다." };
    }

  } catch (e) {
    console.error("[updater] 동기화 실패:", e.message);
    return {
      status:  "offline",
      message: "제휴업체/혜택 정보가 최신 버전이 아닐 수 있습니다. Confluence 연동을 확인하세요."
    };
  }
}

module.exports = { downloadJSON, getDataPath };
