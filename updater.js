const fs   = require("fs");
const path = require("path");
const http = require("http");
const { app } = require("electron");

const BUNDLE_PATH    = path.join(__dirname, "data", "affiliates.json");
const SLM_LOGIN_URL  = "http://slm.lignex1.com";
const CONF_LOGIN_URL = "http://slm.lignex1.com/confluence/login.action";
const CONF_FILE_URL  = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const CONFLUENCE_ID  = "test_id";
const CONFLUENCE_PW  = "test_pw";
const TIMEOUT_MS     = 10000;

function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

// SLM 세션 쿠키 저장 경로
function getSlmSessionPath() {
  return path.join(app.getPath("userData"), "slm-session.json");
}

// ─────────────────────────────────────────
// SLM 쿠키 저장 / 불러오기
// ─────────────────────────────────────────
function saveSlmCookie(cookieStr) {
  const sessionPath = getSlmSessionPath();
  fs.writeFileSync(sessionPath, JSON.stringify({ cookie: cookieStr, savedAt: Date.now() }), "utf-8");
}

function loadSlmCookie() {
  try {
    const sessionPath = getSlmSessionPath();
    if (!fs.existsSync(sessionPath)) return null;
    const data = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    return data.cookie || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 공통 HTTP 요청
// ─────────────────────────────────────────
function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const reqOptions = {
      hostname: u.hostname,
      port:     u.port || 80,
      path:     u.pathname + u.search,
      ...options
    };
    const req = http.request(reqOptions, resolve);
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────
// SLM 쿠키 유효성 검사 (SLM 메인에 GET 요청 후 200 여부 확인)
// ─────────────────────────────────────────
function validateSlmCookie(cookieStr) {
  return new Promise(async (resolve) => {
    try {
      const res = await httpRequest(SLM_LOGIN_URL, {
        method: "GET",
        headers: { "Cookie": cookieStr }
      });
      res.resume();
      // 로그인 페이지로 리다이렉트되면 쿠키 만료
      resolve(res.statusCode === 200);
    } catch {
      resolve(false);
    }
  });
}

// ─────────────────────────────────────────
// Confluence 공유 계정 자동 로그인 → 쿠키 반환
// ─────────────────────────────────────────
function confluenceLogin(slmCookieStr) {
  return new Promise(async (resolve, reject) => {
    const postBody = [
      `os_username=${encodeURIComponent(CONFLUENCE_ID)}`,
      `os_password=${encodeURIComponent(CONFLUENCE_PW)}`,
      `os_cookie=true`,
      `login=Log+In`
    ].join("&");

    try {
      const res = await httpRequest(CONF_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type":   "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postBody),
          // SLM 쿠키를 함께 전송하여 통합 로그인 세션 유지
          "Cookie": slmCookieStr
        }
      }, postBody);

      res.resume();

      const rawCookies = res.headers["set-cookie"] || [];
      if (rawCookies.length === 0) {
        reject(new Error("Confluence 로그인 실패: 쿠키 없음"));
        return;
      }

      // SLM 쿠키 + Confluence 쿠키 합산
      const confCookieStr = rawCookies.map(c => c.split(";")[0]).join("; ");
      resolve(`${slmCookieStr}; ${confCookieStr}`);
    } catch (e) {
      reject(e);
    }
  });
}

// ─────────────────────────────────────────
// 세션 쿠키로 파일 다운로드
// ─────────────────────────────────────────
function downloadWithCookie(cookieStr) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpRequest(CONF_FILE_URL, {
        method: "GET",
        headers: { "Cookie": cookieStr }
      });

      if (res.statusCode === 301 || res.statusCode === 302) {
        reject(new Error(`리다이렉트(${res.statusCode}): 세션이 만료됐을 수 있습니다.`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end",  () => resolve(body));
    } catch (e) {
      reject(e);
    }
  });
}

// ─────────────────────────────────────────
// 메인: SLM 쿠키 확인 → Confluence 로그인 → 다운로드 → 저장
// forceLogin: true 이면 쿠키 유효 여부와 관계없이 강제로 로그인 창 띄움
// ─────────────────────────────────────────
async function downloadJSON(url, requestSlmLogin, forceLogin = false) {
  const DATA_PATH = getDataPath();

  try {
    // 1. 저장된 SLM 쿠키 로드
    let slmCookie = loadSlmCookie();

    // 2. 강제 로그인 / 쿠키 없음 / 쿠키 만료 → 로그인 창 요청
    const needLogin = forceLogin || !slmCookie || !(await validateSlmCookie(slmCookie));
    if (needLogin) {
      console.log("[updater] SLM 로그인 창 요청 (forceLogin:", forceLogin, ")");
      slmCookie = await requestSlmLogin();
      if (!slmCookie) throw new Error("SLM 로그인 취소 또는 실패");
      saveSlmCookie(slmCookie);
    }

    // 3. Confluence 공유 계정 자동 로그인
    const fullCookie = await confluenceLogin(slmCookie);

    // 4. 파일 다운로드
    const body = await downloadWithCookie(fullCookie);

    // 5. JSON 파싱
    const newData = JSON.parse(body);

    // 6. 로컬과 비교 후 저장
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
    const isParseError = e.message && e.message.includes("JSON");
    return {
      status: isParseError ? "parse_error" : "offline",
      message: "제휴업체/혜택 정보가 최신 버전이 아닐 수 있습니다. Confluence 연동을 확인하세요."
    };
  }
}

module.exports = { downloadJSON, getDataPath };
