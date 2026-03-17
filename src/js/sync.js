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

// 재동기화 버튼 클릭
document.getElementById('slmReconnectBtn').addEventListener('click', async () => {
  const btn = document.getElementById('slmReconnectBtn');
  btn.textContent = '동기화 중...';
  btn.disabled = true;

  await window.syncAPI.requestSlmSync();

  btn.textContent = '데이터 동기화';
  btn.disabled = false;
});

loadStatus();
