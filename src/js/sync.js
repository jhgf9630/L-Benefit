async function loadStatus() {
  const status = await window.syncAPI.getStatus();
  setSyncStatus(status);

  // 동기화 진행 중 상태 업데이트
  window.syncAPI.onSyncStatus((status) => {
    setSyncStatus(status);
  });

  // 동기화 완료 업데이트
  window.syncAPI.onSyncComplete((result) => {
    setSyncStatus(result);
  });
}

function setSyncStatus(status) {
  const el = document.getElementById("syncStatus");
  el.textContent = status.message;

  el.className = 'sync-status';
  if (status.status === 'same') {
    el.classList.add('sync-same');
  } else if (status.status === 'updated') {
    el.classList.add('sync-updated');
  } else {
    el.classList.add('sync-neutral');
  }
}

// 재연동 버튼 클릭
document.getElementById('slmReconnectBtn').addEventListener('click', async () => {
  const btn = document.getElementById('slmReconnectBtn');
  btn.textContent = '연동 중...';
  btn.disabled = true;

  await window.syncAPI.requestSlmSync();

  btn.textContent = 'SLM 재연동';
  btn.disabled = false;
});

loadStatus();
