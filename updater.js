const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { app } = require("electron");

// 번들 기본 데이터 (asar 내부, 읽기 전용)
const BUNDLE_PATH = path.join(__dirname, "data", "affiliates.json");

// 업데이트 데이터 저장 경로 (userData, 쓰기 가능)
// Windows: C:\Users\[사용자명]\AppData\Roaming\L-Benefit\affiliates.json
function getDataPath() {
  return path.join(app.getPath("userData"), "affiliates.json");
}

const TIMEOUT_MS = 5000;

function downloadJSON(url) {

  return new Promise((resolve) => {

    const DATA_PATH = getDataPath();

    // URL 스킴에 따라 http / https 모듈 자동 선택
    const client = url.startsWith("https") ? https : http;

    const req = client.get(url, res => {

      let body = "";

      res.on("data", chunk => {
        body += chunk;
      });

      res.on("end", () => {

        try {

          const newData = JSON.parse(body);

          // userData 파일이 있으면 그걸 기준으로, 없으면 번들 파일과 비교
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

            // userData 경로에 저장 (asar 패키징 여부와 무관하게 쓰기 가능)
            fs.writeFileSync(DATA_PATH, body, "utf-8");

            resolve({
              status: "updated",
              message: "제휴업체/혜택 정보가 Confluence와 동기화되었습니다."
            });

          }

        } catch (e) {

          // JSON 파싱 실패 - Confluence 로그인 페이지 등 비정상 응답
          resolve({
            status: "parse_error",
            message: "Confluence 응답을 파싱할 수 없습니다. 로그인 페이지가 반환되었을 수 있습니다."
          });

        }

      });

    });

    // 타임아웃 설정: 지정 시간 내 응답 없으면 요청 강제 종료
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
    });

    // 네트워크 오류 또는 타임아웃으로 인한 destroy 시 처리
    req.on("error", () => {

      resolve({
        status: "offline",
        message: "제휴업체/혜택 정보가 최신 버전이 아닐 수 있습니다. Confluence 연동을 확인하세요."
      });

    });

  });

}

module.exports = { downloadJSON, getDataPath };