const fs   = require("fs");
const path = require("path");
const http = require("http");
const { app } = require("electron");

const BUNDLE_PATH   = path.join(__dirname, "data", "affiliates.json");
const CONF_FILE_URL = "http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json";
const CONFLUENCE_ID = "test_id";
const CONFLUENCE_PW = "test_pw";
const TIMEOUT_MS    = 10000;

function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

function getSlmSessionPath() {
  return path.join(app.getPath("userData"), "slm-session.json");
}

function saveSlmCookie(cookieStr) {
  fs.writeFileSync(
    getSlmSessionPath(),
    JSON.stringify({ cookie: cookieStr, savedAt: Date.now() }),
    "utf-8"
  );
}

function loadSlmCookie() {
  try {
    const p = getSlmSessionPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")).cookie || null;
  } catch { return null; }
}

// ─────────────────────────────────────────
// 단일 HTTP 요청 → res 반환 (리다이렉트 추적 안 함)
// ─────────────────────────────────────────
function httpRequest(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port:     u.port || 80,
      path:     u.pathname + u.search,
      method,
      headers
    };
    const req = http.request(opts, resolve);
    req.setTimeout(TIMEOUT_MS, () => req.destroy());
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    let buf = "";
    res.on("data", c => { buf += c; });
    res.on("end",  () => resolve(buf));
    res.on("error", reject);
  });
}

// ─────────────────────────────────────────
// 파일 다운로드 전체 흐름
//
// [흐름]
// 1. SLM 쿠키로 파일 GET
//    → 302: /confluence/login.action?os_destination=.../affiliates.json
// 2. 그 URL에 Confluence ID/PW POST
//    → 302: /confluence/download/.../affiliates.json  (로그인 성공)
//    → 200: 로그인 페이지 HTML                        (로그인 실패)
// 3. 302 Location URL로 GET → 파일 수신
// ─────────────────────────────────────────
async function downloadFile(slmCookieStr) {

  // ── 1단계: 파일 직접 요청 ──
  const r1 = await httpRequest(CONF_FILE_URL, "GET", { "Cookie": slmCookieStr });
  r1.resume();
  console.log("[download] 1단계:", r1.statusCode, r1.headers.location || "");

  if (r1.statusCode === 200) {
    // SLM 쿠키만으로 바로 파일 접근 가능한 경우
    return await readBody(r1);
  }

  if (r1.statusCode !== 302) throw new Error(`1단계 예상치 못한 응답: ${r1.statusCode}`);

  const loginUrl = r1.headers.location.startsWith("http")
    ? r1.headers.location
    : `http://slm.lignex1.com${r1.headers.location}`;

  console.log("[download] Confluence 로그인 URL:", loginUrl);

  // ── 2단계: 로그인 페이지 GET → CSRF 토큰 + 세션 쿠키 획득 ──
  const r2get = await httpRequest(loginUrl, "GET", { "Cookie": slmCookieStr });
  const r2getBody = await readBody(r2get);
  const setCookies2get = (r2get.headers["set-cookie"] || []).map(c => c.split(";")[0]);
  const cookieWithSession = setCookies2get.length > 0
    ? `${slmCookieStr}; ${setCookies2get.join("; ")}`
    : slmCookieStr;

  // atl_token (CSRF) 추출
  // <meta name="atlassian-token" content="..."> 에서 토큰 추출
  const atlTokenMatch = r2getBody.match(/name="atlassian-token"[^>]*content="([^"]+)"/);
  const atlToken = atlTokenMatch ? atlTokenMatch[1] : "";
  console.log("[download] 2단계 GET:", r2get.statusCode, "atlassian-token:", atlToken || "없음", "Set-Cookie:", setCookies2get);

  // ── 3단계: Confluence 로그인 POST ──
  // atlassian-token을 POST body + X-Atlassian-Token 헤더 양쪽으로 전송
  const postBody = [
    `os_username=${encodeURIComponent(CONFLUENCE_ID)}`,
    `os_password=${encodeURIComponent(CONFLUENCE_PW)}`,
    `os_cookie=true`,
    `login=Log+In`,
    atlToken ? `atl_token=${encodeURIComponent(atlToken)}` : ""
  ].filter(Boolean).join("&");

  const r2 = await httpRequest(loginUrl, "POST", {
    "Content-Type":        "application/x-www-form-urlencoded",
    "Content-Length":      Buffer.byteLength(postBody),
    "Cookie":              cookieWithSession,
    "Referer":             loginUrl,
    "X-Atlassian-Token":   atlToken || "no-check"
  }, postBody);
  r2.resume();

  const setCookies2 = (r2.headers["set-cookie"] || []).map(c => c.split(";")[0]);
  const cookieAfterLogin = setCookies2.length > 0
    ? `${cookieWithSession}; ${setCookies2.join("; ")}`
    : cookieWithSession;

  console.log("[download] 3단계 POST:", r2.statusCode, "Set-Cookie:", setCookies2, "Location:", r2.headers.location || "");

  if (r2.statusCode !== 302 || !r2.headers.location) {
    throw new Error(`Confluence 로그인 실패: ${r2.statusCode} (ID/PW 또는 CSRF 토큰 확인 필요)`);
  }

  const fileUrl = r2.headers.location.startsWith("http")
    ? r2.headers.location
    : `http://slm.lignex1.com${r2.headers.location}`;

  console.log("[download] 4단계 파일 URL:", fileUrl);

  // ── 4단계: 로그인 후 파일 GET ──
  const r3 = await httpRequest(fileUrl, "GET", { "Cookie": cookieAfterLogin });
  console.log("[download] 4단계:", r3.statusCode);

  if (r3.statusCode !== 200) {
    r3.resume();
    throw new Error(`파일 GET 실패: HTTP ${r3.statusCode}`);
  }

  return await readBody(r3);
}

// ─────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────
async function downloadJSON(url, requestSlmLogin, forceLogin = false) {
  const DATA_PATH = getDataPath();

  try {
    let slmCookie = forceLogin ? null : loadSlmCookie();

    if (!slmCookie) {
      console.log("[updater] SLM 로그인 창 요청");
      slmCookie = await requestSlmLogin();
      if (!slmCookie) throw new Error("SLM 로그인 취소");
      saveSlmCookie(slmCookie);
    }

    console.log("[updater] 파일 다운로드 시작...");
    const body = await downloadFile(slmCookie);
    console.log("[updater] 다운로드 성공, body 길이:", body.length);
    console.log("[updater] body 앞 200자:", body.substring(0, 200));

    const newData = JSON.parse(body);

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
