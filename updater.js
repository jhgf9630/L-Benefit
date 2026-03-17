const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { app, shell } = require("electron");

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

// 자동 다운로드 후 탭을 닫는 중간 HTML 페이지를 임시 파일로 생성
function createBridgePage(downloadUrl) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>L-Benefit 데이터 동기화 중...</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; display:flex; align-items:center;
         justify-content:center; height:100vh; margin:0; background:#f0f9ff; }
  .box { text-align:center; padding:40px; background:white; border-radius:16px;
         box-shadow:0 4px 20px rgba(0,0,0,0.1); }
  h2 { color:#1a6b3c; margin-bottom:12px; }
  p  { color:#6b7280; font-size:14px; }
</style>
</head>
<body>
<div class="box">
  <h2>✅ L-Benefit 데이터 동기화</h2>
  <p>파일을 다운로드하고 있습니다.<br>완료되면 이 탭을 닫아주세요.</p>
</div>
<script>
  // 페이지 열리자마자 파일 다운로드 트리거
  const a = document.createElement('a');
  a.href = ${JSON.stringify(downloadUrl)};
  a.download = 'affiliates.json';
  document.body.appendChild(a);
  a.click();

  // 3초 후 탭 닫기 시도 (보안 정책상 안 닫힐 수 있음)
  setTimeout(() => { window.close(); }, 3000);
</script>
</body>
</html>`;

  const tmpPath = path.join(os.tmpdir(), "lbenefit-sync.html");
  fs.writeFileSync(tmpPath, html, "utf-8");
  return tmpPath;
}

// 다운로드 폴더에서 affiliates.json 감지 → userData로 이동
function waitForDownload() {
  return new Promise((resolve, reject) => {
    const downloadDir = getDownloadDir();
    const targetFile  = path.join(downloadDir, "affiliates.json");
    const startTime   = Date.now();

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

        const size1 = stat.size;
        setTimeout(() => {
          try {
            if (!fs.existsSync(targetFile)) return;
            const size2 = fs.statSync(targetFile).size;
            if (size2 !== size1) return;

            const body = fs.readFileSync(targetFile, "utf-8");
            JSON.parse(body); // JSON 유효성 검사

            // 원본 삭제 (다음 동기화 시 중복 파일 방지)
            try {
              fs.unlinkSync(targetFile);
              console.log("[updater] 원본 파일 삭제 완료:", targetFile);
            } catch (e) {
              console.log("[updater] 원본 파일 삭제 실패:", e.message);
            }

            clearInterval(poll);
            resolve(body);
          } catch (e) {
            // 아직 다운로드 중
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
// ─────────────────────────────────────────
async function downloadJSON() {
  const DATA_PATH = getDataPath();

  try {
    console.log("[updater] 브라우저 다운로드 트리거...");

    // 중간 HTML 페이지 생성 후 기본 브라우저로 열기
    const bridgePath = createBridgePage(CONF_FILE_URL);
    await shell.openExternal(`file://${bridgePath}`);

    const body = await waitForDownload();
    const newData = JSON.parse(body);
    console.log("[updater] 파일 감지 성공, body 길이:", body.length);

    // 임시 HTML 파일 삭제
    try { fs.unlinkSync(bridgePath); } catch (e) {}

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
