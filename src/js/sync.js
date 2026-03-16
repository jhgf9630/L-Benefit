async function loadStatus() {

  // 앱 실행 직후 현재 상태 표시
  const status = await window.syncAPI.getStatus();
  setSyncStatus(status);

  // 백그라운드 동기화 완료 시 UI 업데이트
  window.syncAPI.onSyncComplete((result) => {
    setSyncStatus(result);
  });

}

function setSyncStatus(status) {
  const el = document.getElementById("syncStatus");
  el.textContent = status.message;

  // 상태별 색상 구분
  el.className = 'sync-status';
  if (status.status === 'same') {
    el.classList.add('sync-same');
  } else if (status.status === 'updated') {
    el.classList.add('sync-updated');
  } else {
    // offline, parse_error, loading → 기본 회색
    el.classList.add('sync-neutral');
  }
}

loadStatus();