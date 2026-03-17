const fs   = require("fs");
const path = require("path");
const { app } = require("electron");

const BUNDLE_PATH   = path.join(__dirname, "data", "affiliates.json");
const CONF_FILE_URL = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const TIMEOUT_MS    = 30000;
const POLL_INTERVAL = 500;

function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

function getDownloadDir() {
  return app.getPath("downloads");
}

// 다운로드 폴더에서 affiliates.json 감지 → userData로 이동
function waitForDownload() {
  return new Promise((resolve, reject) => {
    const downloadDir = getDownloadDir();
    const targetFile  = path.join(downloadDir, "affiliates.json");
    const startTime   = Date.now();

    // 시작 전 기존 파일 mtime 기록
    let prevMtime = null;
    if (fs.existsSync(targetFile)) {
      prevMtime = fs.statSync(targetFile).mtimeMs;
    }

    console.log("[updater] 다운로드 폴더 감시 시작:", downloadDir);

    const poll = setInterval(() => {
      try {
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(poll);
          reject(new Error("다운로드 대기 시간 초과 (30초). SLM 로그인 후 재시도해 주세요."));
          return;
        }

        if (!fs.existsSync(targetFile)) return;

        const stat = fs.statSync(targetFile);
        if (prevMtime !== null && stat.mtimeMs === prevMtime) return;

        // 파일 쓰기 완료 여부 확인 (0.5초 간격으로 크기 비교)
        const size1 = stat.size;
        setTimeout(() => {
          try {
            if (!fs.existsSync(targetFile)) return;
            const size2 = fs.statSync(targetFile).size;
            if (size2 !== size1) return; // 아직 쓰는 중

            const body = fs.readFileSync(targetFile, "utf-8");
            JSON.parse(body); // JSON 유효성 검사

            // 원본 삭제 (다음 동기화 시 중복 파일 affiliates(1).json 방지)
            try {
              fs.unlinkSync(targetFile);
              console.log("[updater] 원본 파일 삭제 완료:", targetFile);
            } catch (e) {
              console.log("[updater] 원본 파일 삭제 실패:", e.message);
            }

            clearInterval(poll);
            resolve(body);
          } catch (e) {
            // JSON 파싱 실패 = 아직 다운로드 중
          }
        }, 500);

      } catch (e) {
        console.error("[updater] 폴링 오류:", e.message);
      }
    }, POLL_INTERVAL);
  });
}

// ─────────────────────────────────────────
// 메인 진입점
// requestDownload: Electron 숨김 창으로 다운로드 트리거 (main.js에서 전달)
// ─────────────────────────────────────────
async function downloadJSON(requestDownload) {
  const DATA_PATH = getDataPath();

  try {
    console.log("[updater] 다운로드 요청...");
    await requestDownload(CONF_FILE_URL);

    const body = await waitForDownload();
    const newData = JSON.parse(body);
    console.log("[updater] 파일 감지 성공, body 길이:", body.length);

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
