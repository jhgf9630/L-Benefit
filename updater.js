const fs   = require("fs");
const path = require("path");
const http = require("http");
const { app } = require("electron");

const BUNDLE_PATH = path.join(__dirname, "data", "affiliates.json");

function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

const TIMEOUT_MS = 10000;

const CONFLUENCE_BASE     = "slm.lignex1.com";
const CONFLUENCE_LOGIN    = "/confluence/login.action";
const CONFLUENCE_FILE_URL = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const CONFLUENCE_ID       = "test_id";
const CONFLUENCE_PW       = "test_pw";

// ─────────────────────────────────────────
// 1단계: /confluence/login.action 에 POST → 세션 쿠키 반환
// ─────────────────────────────────────────
function confluenceLogin() {
  return new Promise((resolve, reject) => {

    const postBody = [
      `os_username=${encodeURIComponent(CONFLUENCE_ID)}`,
      `os_password=${encodeURIComponent(CONFLUENCE_PW)}`,
      `os_cookie=true`,
      `login=Log+In`
    ].join("&");

    const options = {
      hostname: CONFLUENCE_BASE,
      port: 80,
      path: CONFLUENCE_LOGIN,
      method: "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postBody)
      }
    };

    const req = http.request(options, res => {
      res.resume(); // 바디 불필요, 흘려보냄

      const rawCookies = res.headers["set-cookie"] || [];
      if (rawCookies.length === 0) {
        reject(new Error("로그인 실패: 쿠키가 반환되지 않았습니다."));
        return;
      }

      const cookieStr = rawCookies
        .map(c => c.split(";")[0])
        .join("; ");

      resolve(cookieStr);
    });

    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); });
    req.on("error", reject);
    req.write(postBody);
    req.end();
  });
}

// ─────────────────────────────────────────
// 2단계: 세션 쿠키로 파일 다운로드 → 바디(string) 반환
// ─────────────────────────────────────────
function downloadWithCookie(url, cookieStr) {
  return new Promise((resolve, reject) => {

    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || 80,
      path:     urlObj.pathname + urlObj.search,
      method:   "GET",
      headers:  { "Cookie": cookieStr }
    };

    const req = http.request(options, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        reject(new Error(`리다이렉트(${res.statusCode}): 로그인이 실패했을 수 있습니다.`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end",  () => resolve(body));
    });

    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); });
    req.on("error", reject);
    req.end();
  });
}

// ─────────────────────────────────────────
// 메인: 로그인 → 다운로드 → userData에 저장
// ─────────────────────────────────────────
function downloadJSON(url) {
  return new Promise(async (resolve) => {

    const DATA_PATH = getDataPath();

    try {
      // 1. 로그인
      const cookieStr = await confluenceLogin();

      // 2. 파일 다운로드 (메모리로 수신, 다운로드 폴더에 저장하지 않음)
      const body = await downloadWithCookie(url, cookieStr);

      // 3. JSON 파싱 검증
      const newData = JSON.parse(body);

      // 4. 로컬 파일과 비교
      const comparePath = fs.existsSync(DATA_PATH) ? DATA_PATH : BUNDLE_PATH;
      let localData = null;
      if (fs.existsSync(comparePath)) {
        localData = JSON.parse(fs.readFileSync(comparePath, "utf-8"));
      }

      if (JSON.stringify(newData) === JSON.stringify(localData)) {
        resolve({
          status: "same",
          message: "제휴업체/혜택 정보가 최신 상태입니다."
        });
      } else {
        // 5. userData 경로에 저장 (다운로드 폴더가 아닌 앱 전용 경로)
        fs.writeFileSync(DATA_PATH, body, "utf-8");
        resolve({
          status: "updated",
          message: "제휴업체/혜택 정보가 Confluence와 동기화되었습니다."
        });
      }

    } catch (e) {
      console.error("[updater] 동기화 실패:", e.message);

      const isParseError = e.message && e.message.includes("JSON");
      resolve({
        status: isParseError ? "parse_error" : "offline",
        message: "제휴업체/혜택 정보가 최신 버전이 아닐 수 있습니다. Confluence 연동을 확인하세요."
      });
    }
  });
}

module.exports = { downloadJSON, getDataPath };