const PANGYO_HOUSE = [37.4021, 127.1086];
let map, clusterLayer;

// userData 우선 → 없으면 IPC로 번들 파일 읽기
async function syncData() {
  try {
    const userDataPath = await window.syncAPI.getDataPath();
    const fileUrl = "file:///" + userDataPath.replace(/\\/g, '/');
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("userData 파일 없음");
    return await res.json();
  } catch {
    return await window.syncAPI.readBundleData();
  }
}

let currentDomestic = null;
let currentCategory  = 'all';

async function initApp() {
  // 1. 지도 초기화
  map = L.map('map', { minZoom: 7, maxZoom: 13 }).setView(PANGYO_HOUSE, 12);

  clusterLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 1,
    iconCreateFunction: function(cluster) {
      return L.divIcon({
        html: `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
    }
  });
  map.addLayer(clusterLayer);

  L.tileLayer('../map_tiles/{z}/{x}/{y}.png', {
    minZoom: 7
    maxZoom: 13
  }).addTo(map);

  // 2. 버튼 이벤트 — 해외 리스트
  document.getElementById('overseas-btn').onclick = () =>
    document.getElementById('overseas-popup').classList.toggle('hidden');
  document.getElementById('close-popup').onclick = () =>
    document.getElementById('overseas-popup').classList.add('hidden');

  // 버튼 이벤트 — 국내 리스트
  document.getElementById('domestic-btn').onclick = () =>
    document.getElementById('domestic-popup').classList.toggle('hidden');
  document.getElementById('close-domestic-popup').onclick = () =>
    document.getElementById('domestic-popup').classList.add('hidden');

  // 검색 X 버튼
  document.getElementById('searchClear').onclick = () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    if (currentDomestic) filterData(currentDomestic);
  };
  document.getElementById('searchInput').oninput = function() {
    document.getElementById('searchClear').style.display = this.value ? 'flex' : 'none';
    if (currentDomestic) filterData(currentDomestic);
  };

  // 3. 데이터 로드
  const data = await syncData();
  if (data && data.affiliates) {
    const domestic = data.affiliates.filter(item => item.type === 'domestic');
    const overseas = data.affiliates.filter(item => item.type === 'overseas');
    currentDomestic = domestic;

    renderMarkers(domestic);
    renderDomesticList(domestic);
    renderOverseas(overseas);
    initCustomCategoryFilter(() => filterData(currentDomestic));
  }

  // 4. 백그라운드 동기화 완료 시 갱신
  window.syncAPI.onSyncComplete(async (result) => {
    if (result.status !== "updated") return;
    const updated = await syncData();
    if (updated && updated.affiliates) {
      const domestic = updated.affiliates.filter(item => item.type === 'domestic');
      const overseas = updated.affiliates.filter(item => item.type === 'overseas');
      currentDomestic = domestic;

      renderMarkers(domestic);
      renderDomesticList(domestic);
      renderOverseas(overseas);
      initCustomCategoryFilter(() => filterData(currentDomestic));
    }
  });
}

// ─── SVG 아이콘 ───
const CATEGORY_ICONS = {
  office: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="6" y="13" width="20" height="14" rx="2" fill="#92400E" stroke="#78350F" stroke-width="1.2"/>
      <path d="M12 13v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke="#78350F" stroke-width="1.5"/>
      <line x1="6" y1="20" x2="26" y2="20" stroke="#78350F" stroke-width="1.2"/>
    </svg>`,
  hotel: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="5" y="8" width="22" height="20" rx="1.5" fill="#3B82F6" stroke="#1D4ED8" stroke-width="1.2"/>
      <rect x="9" y="12" width="4" height="4" rx="0.5" fill="white"/>
      <rect x="19" y="12" width="4" height="4" rx="0.5" fill="white"/>
      <rect x="9" y="19" width="4" height="4" rx="0.5" fill="white"/>
      <rect x="19" y="19" width="4" height="4" rx="0.5" fill="white"/>
      <rect x="13" y="22" width="6" height="6" rx="0.5" fill="white"/>
      <rect x="3" y="8" width="26" height="3" rx="1" fill="#1D4ED8"/>
    </svg>`,
  restaurant: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <line x1="12" y1="5" x2="12" y2="13" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M9 5 Q9 13 12 13 Q15 13 15 5" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="12" y1="13" x2="12" y2="27" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="20" y1="5" x2="20" y2="27" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M17 5 Q17 14 20 14" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
  etc: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <polygon points="16,4 19.5,12.5 28.5,13.5 22,19.5 24,28.5 16,24 8,28.5 10,19.5 3.5,13.5 12.5,12.5"
        fill="#F59E0B" stroke="#D97706" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`
};

const CATEGORY_ICONS_SMALL = {
  office: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32"><rect x="6" y="13" width="20" height="14" rx="2" fill="#92400E" stroke="#78350F" stroke-width="1.2"/><path d="M12 13v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke="#78350F" stroke-width="1.5"/><line x1="6" y1="20" x2="26" y2="20" stroke="#78350F" stroke-width="1.2"/></svg>`,
  hotel: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32"><rect x="5" y="8" width="22" height="20" rx="1.5" fill="#3B82F6" stroke="#1D4ED8" stroke-width="1.2"/><rect x="9" y="12" width="4" height="4" rx="0.5" fill="white"/><rect x="19" y="12" width="4" height="4" rx="0.5" fill="white"/><rect x="9" y="19" width="4" height="4" rx="0.5" fill="white"/><rect x="19" y="19" width="4" height="4" rx="0.5" fill="white"/><rect x="13" y="22" width="6" height="6" rx="0.5" fill="white"/><rect x="3" y="8" width="26" height="3" rx="1" fill="#1D4ED8"/></svg>`,
  restaurant: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32"><line x1="12" y1="5" x2="12" y2="13" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/><path d="M9 5 Q9 13 12 13 Q15 13 15 5" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/><line x1="12" y1="13" x2="12" y2="27" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/><line x1="20" y1="5" x2="20" y2="27" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/><path d="M17 5 Q17 14 20 14" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  etc: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32"><polygon points="16,4 19.5,12.5 28.5,13.5 22,19.5 24,28.5 16,24 8,28.5 10,19.5 3.5,13.5 12.5,12.5" fill="#F59E0B" stroke="#D97706" stroke-width="1.2" stroke-linejoin="round"/></svg>`
};

const CATEGORY_LABELS = {
  all: '전체 카테고리', office: '회사', hotel: '호텔', restaurant: '식당', etc: '기타'
};

const OVERSEAS_CATEGORY_LABELS = {
  hotel: '🏨 호텔', restaurant: '🍽 식당', shopping: '🛍 쇼핑', leisure: '🎡 레저', etc: '⭐ 기타'
};

// ─── 커스텀 드롭다운 ───
function initCustomCategoryFilter(onChangeCb) {
  const existing = document.getElementById('customFilter');
  if (existing) existing.remove();

  const select = document.getElementById('categoryFilter');
  select.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.id = 'customFilter';
  wrapper.className = 'custom-filter';

  const selected = document.createElement('div');
  selected.className = 'custom-filter-selected';

  const currentOpt = currentCategory === 'all'
    ? { icon: null, label: CATEGORY_LABELS['all'] }
    : { icon: CATEGORY_ICONS_SMALL[currentCategory], label: CATEGORY_LABELS[currentCategory] };

  selected.innerHTML = currentOpt.icon
    ? `<span class="cf-icon">${currentOpt.icon}</span><span class="cf-label">${currentOpt.label}</span><span class="cf-arrow">▾</span>`
    : `<span class="cf-icon-placeholder"></span><span class="cf-label">${currentOpt.label}</span><span class="cf-arrow">▾</span>`;

  const dropdown = document.createElement('ul');
  dropdown.className = 'custom-filter-dropdown hidden';

  const options = [
    { value: 'all',        label: CATEGORY_LABELS.all,        icon: null },
    { value: 'office',     label: CATEGORY_LABELS.office,     icon: CATEGORY_ICONS_SMALL.office },
    { value: 'hotel',      label: CATEGORY_LABELS.hotel,      icon: CATEGORY_ICONS_SMALL.hotel },
    { value: 'restaurant', label: CATEGORY_LABELS.restaurant, icon: CATEGORY_ICONS_SMALL.restaurant },
    { value: 'etc',        label: CATEGORY_LABELS.etc,        icon: CATEGORY_ICONS_SMALL.etc }
  ];

  options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'custom-filter-option' + (currentCategory === opt.value ? ' active' : '');
    li.innerHTML = opt.icon
      ? `<span class="cf-icon">${opt.icon}</span><span>${opt.label}</span>`
      : `<span class="cf-icon-placeholder"></span><span>${opt.label}</span>`;

    li.addEventListener('click', () => {
      currentCategory = opt.value;
      selected.innerHTML = opt.icon
        ? `<span class="cf-icon">${opt.icon}</span><span class="cf-label">${opt.label}</span><span class="cf-arrow">▾</span>`
        : `<span class="cf-icon-placeholder"></span><span class="cf-label">${opt.label}</span><span class="cf-arrow">▾</span>`;
      dropdown.querySelectorAll('.custom-filter-option').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      dropdown.classList.add('hidden');
      onChangeCb(currentCategory);
    });

    dropdown.appendChild(li);
  });

  selected.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.toggle('hidden'); });
  document.addEventListener('click', () => dropdown.classList.add('hidden'));

  wrapper.appendChild(selected);
  wrapper.appendChild(dropdown);
  select.parentNode.insertBefore(wrapper, select);
}

// ─── 아이콘 ───
function getCategoryIcon(category) {
  const svg = CATEGORY_ICONS[category] || CATEGORY_ICONS.etc;
  return L.divIcon({
    html: `<div style="width:32px;height:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">${svg}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

// ─── 팝업 HTML ───
function buildPopupHTML(item) {
  const address = item.address ? `<div class="popup-row">📍 <span class="popup-label">주소</span>${item.address}</div>` : '';
  const benefit = item.benefit ? `<div class="popup-row">🎁 <span class="popup-label">혜택</span>${item.benefit}</div>` : '';
  const period  = item.period  ? `<div class="popup-row">📅 <span class="popup-label">기간</span>${item.period}</div>`  : '';
  const note    = item.note    ? `<div class="popup-row">📝 <span class="popup-label">비고</span>${item.note}</div>`    : '';
  const link    = item.link    ? `<div class="popup-row">🔗 <a class="popup-link" href="${item.link}" target="_blank">자세히 보기</a></div>` : '';
  return `<div class="popup-content"><div class="popup-title">${item.name}</div>${address}${benefit}${period}${note}${link}</div>`;
}

// ─── 지도 마커 렌더링 ───
function renderMarkers(domesticItems) {
  clusterLayer.clearLayers();
  if (domesticItems.length === 0) { showNoResultsBanner(true); return; }
  showNoResultsBanner(false);
  domesticItems.forEach(item => {
    const marker = L.marker([item.lat, item.lng], { icon: getCategoryIcon(item.category) });
    marker.bindPopup(buildPopupHTML(item), { maxWidth: 280 });
    clusterLayer.addLayer(marker);
  });
}

// ─── 국내 리스트 렌더링 (카테고리별 그룹화) ───
function renderDomesticList(domesticItems) {
  const list = document.getElementById('domesticList');
  list.innerHTML = '';

  if (domesticItems.length === 0) {
    list.innerHTML = '<li class="overseas-empty">국내 제휴 업체가 없습니다.</li>';
    return;
  }

  const groups = new Map();
  domesticItems.forEach(item => {
    const cat = item.category || 'etc';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  const catLabels = {
    office: '🏢 회사', hotel: '🏨 호텔', restaurant: '🍽 식당', etc: '⭐ 기타'
  };

  groups.forEach((items, cat) => {
    const header = document.createElement('li');
    header.className = 'overseas-category-header';
    header.textContent = catLabels[cat] || `⭐ ${cat}`;
    list.appendChild(header);

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'overseas-item';
      li.innerHTML = buildPopupHTML(item);
      list.appendChild(li);
    });
  });
}

// ─── 해외 리스트 렌더링 ───
function renderOverseas(overseasItems) {
  const list = document.getElementById('overseasList');
  list.innerHTML = '';

  if (overseasItems.length === 0) {
    list.innerHTML = '<li class="overseas-empty">해외 제휴 업체가 없습니다.</li>';
    return;
  }

  const groups = new Map();
  overseasItems.forEach(item => {
    const cat = item.category || 'etc';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  groups.forEach((items, cat) => {
    const header = document.createElement('li');
    header.className = 'overseas-category-header';
    header.textContent = OVERSEAS_CATEGORY_LABELS[cat] || `⭐ ${cat}`;
    list.appendChild(header);

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'overseas-item';
      li.innerHTML = buildPopupHTML(item);
      list.appendChild(li);
    });
  });
}

// ─── 검색 결과 없음 배너 ───
function showNoResultsBanner(show) {
  let banner = document.getElementById('noResultsBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'noResultsBanner';
    banner.className = 'no-results-banner';
    banner.textContent = '검색 결과가 없습니다.';
    document.body.appendChild(banner);
  }
  banner.style.display = show ? 'block' : 'none';
}

// ─── 필터 ───
function filterData(domesticItems) {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = domesticItems.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search);
    const matchCat    = (currentCategory === 'all' || item.category === currentCategory);
    return matchSearch && matchCat;
  });
  renderMarkers(filtered);
}

window.onload = initApp;