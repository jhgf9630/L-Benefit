@echo off
chcp 65001 >nul
echo ==============================
echo   L-Benefit 빌드 및 배포 패키징
echo ==============================
echo.

:: node_modules 존재 확인
if not exist "node_modules" (
    echo [1/2] node_modules 없음. npm install 실행 중...
    npm install
    if errorlevel 1 (
        echo npm install 실패.
        pause
        exit /b 1
    )
) else (
    echo [1/2] node_modules 확인 완료
)

:: 빌드 + zip 실행
echo [2/2] 빌드 및 zip 패키징 시작...
node build-zip.js
if errorlevel 1 (
    echo 빌드 실패.
    pause
    exit /b 1
)

echo.
echo 배포 파일: L-Benefit.zip
pause