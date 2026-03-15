const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BUILD_DIR = "L-Benefit-win32-x64";
const ZIP_NAME = "L-Benefit.zip";

// 1. 기존 zip 제거
if (fs.existsSync(ZIP_NAME)) {
  fs.rmSync(ZIP_NAME);
  console.log(`[1/3] 기존 ${ZIP_NAME} 삭제 완료`);
} else {
  console.log(`[1/3] 기존 ${ZIP_NAME} 없음, 건너뜀`);
}

// 2. 빌드 실행
console.log("[2/3] electron-packager 빌드 시작...");
try {
  execSync("npm run build", { stdio: "inherit" });
} catch (e) {
  console.error("빌드 실패:", e.message);
  process.exit(1);
}

// 3. 빌드 결과 폴더를 zip으로 압축
//    PowerShell Compress-Archive 사용 (Windows 기본 내장)
console.log(`[3/3] ${BUILD_DIR} → ${ZIP_NAME} 압축 중...`);
try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${BUILD_DIR}' -DestinationPath '${ZIP_NAME}' -Force"`,
    { stdio: "inherit" }
  );
  console.log(`\n✅ 완료: ${ZIP_NAME} 생성됨`);
  console.log(`   압축 해제 시 구조: ${BUILD_DIR}/L-Benefit.exe`);
} catch (e) {
  console.error("zip 압축 실패:", e.message);
  process.exit(1);
}