// =====================================================
// Aliascall — 브라우저 내장 카메라 직접 촬영 공용 모듈
// 2026-08-22 신설. 2026-08-25 다국어(한국어/영어) 적용.
//
// ⚠ <input type="file" capture> 방식은 모바일에서만 실제 카메라 앱이 열리고, 노트북/PC
// 브라우저에서는 대부분 그냥 무시되고 파일탐색기가 열림 — 그래서 이 방식 대신, 영상통화
// 때 이미 쓰던 것과 같은 방식(getUserMedia로 카메라 스트림 직접 열기)으로 만듦. 이러면
// 모바일 후면카메라든 노트북 웹캠이든 항상 실제로 카메라 화면이 뜸.
// =====================================================

// ─────────────────────────────────────────────────────
// 공용 언어 감지 블록 (4개 공용 스크립트에 똑같이 들어있음 — 먼저 불려온 파일이 한 번만 정의)
// ─────────────────────────────────────────────────────
(function(){
  if (typeof window.getAliascallLang === 'function') return;
  var KEYS = ['aliascall_lang', 'aliascall_language', 'ac_lang', 'lang'];
  window.ALIASCALL_LANG_KEYS = KEYS;
  window.getAliascallLang = function(){
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (q) return q.toLowerCase().indexOf('en') === 0 ? 'en' : 'ko';
    } catch (e) {}
    for (var i = 0; i < KEYS.length; i++) {
      try {
        var v = localStorage.getItem(KEYS[i]);
        if (v) return String(v).toLowerCase().indexOf('en') === 0 ? 'en' : 'ko';
      } catch (e) {}
    }
    return (navigator.language || 'ko').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  };
  window.setAliascallLang = function(lang){
    var v = (String(lang).toLowerCase().indexOf('en') === 0) ? 'en' : 'ko';
    KEYS.forEach(function(k){ try { localStorage.setItem(k, v); } catch (e) {} });
    return v;
  };
})();

// ── 이 파일 전용 사전 ──
const _AC_CAMERA_I18N = {
  ko: {
    opening: '카메라를 여는 중…',
    cannotOpen: '카메라를 열 수 없어요. 권한을 확인해주세요.',
    cancel: '취소',
    shutter: '촬영',
    flip: '전후면 전환',
    retake: '다시 찍기',
    send: '보내기',
  },
  en: {
    opening: 'Opening the camera…',
    cannotOpen: "Couldn't open the camera. Please check your permissions.",
    cancel: 'Cancel',
    shutter: 'Take photo',
    flip: 'Switch camera',
    retake: 'Retake',
    send: 'Send',
  },
};
function _acCameraT(key){
  const lang = window.getAliascallLang();
  const d = _AC_CAMERA_I18N[lang] || _AC_CAMERA_I18N.ko;
  return d[key] !== undefined ? d[key] : _AC_CAMERA_I18N.ko[key];
}

(function(){
  if (document.getElementById('aliascallCameraStyle')) return;
  const style = document.createElement('style');
  style.id = 'aliascallCameraStyle';
  style.textContent = `
    .acc-overlay{ display:none; position:fixed; inset:0; background:#000; z-index:500; flex-direction:column; align-items:center; justify-content:center; }
    .acc-overlay.show{ display:flex; }
    .acc-video, .acc-preview{ max-width:100%; max-height:80vh; }
    .acc-status{ color:#fff; font-size:13px; margin-bottom:12px; }
    .acc-controls{ display:flex; align-items:center; gap:28px; padding:22px 0; }
    .acc-shutter{ width:64px; height:64px; border-radius:50%; background:#fff; border:4px solid rgba(255,255,255,.4); cursor:pointer; }
    .acc-cancel, .acc-switch{ width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,.15); color:#fff; border:none; font-size:18px; cursor:pointer; }
    .acc-confirm-controls{ display:none; gap:14px; padding:18px 0; }
    .acc-confirm-controls button{ padding:12px 22px; border-radius:10px; border:none; font-weight:700; font-size:13px; cursor:pointer; }
    .acc-retake{ background:rgba(255,255,255,.15); color:#fff; }
    .acc-send{ background:#1F6F6B; color:#fff; }
  `;
  document.head.appendChild(style);
})();

function _aliascallEnsureCameraOverlay(){
  if (document.getElementById('aliascallCameraOverlay')) return; // 이미 만들어져 있으면 중복 생성 안 함
  const overlay = document.createElement('div');
  overlay.className = 'acc-overlay';
  overlay.id = 'aliascallCameraOverlay';
  overlay.innerHTML = `
    <div class="acc-status" id="aliascallCameraStatus"></div>
    <video class="acc-video" id="aliascallCameraVideo" autoplay playsinline muted></video>
    <img class="acc-preview" id="aliascallCameraPreview" style="display:none;" alt="">
    <canvas id="aliascallCameraCanvas" style="display:none;"></canvas>
    <div class="acc-controls" id="aliascallCameraLiveControls">
      <button class="acc-cancel" id="aliascallCameraCancel">✕</button>
      <button class="acc-shutter" id="aliascallCameraShutter"></button>
      <button class="acc-switch" id="aliascallCameraSwitch">🔄</button>
    </div>
    <div class="acc-confirm-controls" id="aliascallCameraConfirmControls">
      <button class="acc-retake" id="aliascallCameraRetake"></button>
      <button class="acc-send" id="aliascallCameraSend"></button>
    </div>
  `;
  document.body.appendChild(overlay);

  // 버튼 이벤트는 여기서 딱 한 번만 연결(오버레이가 방금 새로 만들어졌을 때만)
  document.getElementById('aliascallCameraCancel').addEventListener('click', _aliascallCloseCameraCapture);
  document.getElementById('aliascallCameraSwitch').addEventListener('click', async () => {
    _aliascallCameraFacing = _aliascallCameraFacing === 'environment' ? 'user' : 'environment';
    await _aliascallStartCameraStream();
  });
  document.getElementById('aliascallCameraShutter').addEventListener('click', () => {
    const video = document.getElementById('aliascallCameraVideo');
    const canvas = document.getElementById('aliascallCameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const preview = document.getElementById('aliascallCameraPreview');
    preview.src = canvas.toDataURL('image/jpeg', 0.92);
    video.style.display = 'none';
    preview.style.display = 'block';
    document.getElementById('aliascallCameraLiveControls').style.display = 'none';
    document.getElementById('aliascallCameraConfirmControls').style.display = 'flex';
  });
  document.getElementById('aliascallCameraRetake').addEventListener('click', () => {
    const video = document.getElementById('aliascallCameraVideo');
    const preview = document.getElementById('aliascallCameraPreview');
    video.style.display = 'block';
    preview.style.display = 'none';
    document.getElementById('aliascallCameraLiveControls').style.display = 'flex';
    document.getElementById('aliascallCameraConfirmControls').style.display = 'none';
  });
  document.getElementById('aliascallCameraSend').addEventListener('click', () => {
    const canvas = document.getElementById('aliascallCameraCanvas');
    canvas.toBlob((blob) => {
      if (blob && _aliascallCameraOnCapture) {
        const file = new File([blob], 'camera_' + Date.now() + '.jpg', { type: 'image/jpeg' });
        _aliascallCameraOnCapture(file);
      }
      _aliascallCloseCameraCapture();
    }, 'image/jpeg', 0.92);
  });
}

// ⚠ 2026-08-25: 오버레이는 딱 한 번만 만들어지고 계속 재사용되므로, 문구는 만들 때가 아니라
// "열 때마다" 다시 넣어줘야 함. 그래야 언어를 바꾼 뒤에도 항상 맞는 문구가 나옴.
function _aliascallApplyCameraI18n(){
  const set = (id, prop, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (prop === 'text') el.textContent = _acCameraT(key);
    else { el.title = _acCameraT(key); el.setAttribute('aria-label', _acCameraT(key)); }
  };
  set('aliascallCameraCancel', 'title', 'cancel');
  set('aliascallCameraShutter', 'title', 'shutter');
  set('aliascallCameraSwitch', 'title', 'flip');
  set('aliascallCameraRetake', 'text', 'retake');
  set('aliascallCameraSend', 'text', 'send');
}

let _aliascallCameraStream = null;
let _aliascallCameraFacing = 'environment';
let _aliascallCameraOnCapture = null;

async function _aliascallStartCameraStream(){
  const statusEl = document.getElementById('aliascallCameraStatus');
  const video = document.getElementById('aliascallCameraVideo');
  statusEl.textContent = _acCameraT('opening');
  if (_aliascallCameraStream) { _aliascallCameraStream.getTracks().forEach((t) => t.stop()); }
  try {
    _aliascallCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _aliascallCameraFacing }, audio: false });
  } catch (e) {
    try {
      // 일부 노트북은 facingMode 자체를 지원 안 해서 실패할 수 있음 — 그냥 아무 카메라나 요청
      _aliascallCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      statusEl.textContent = _acCameraT('cannotOpen');
      return false;
    }
  }
  video.srcObject = _aliascallCameraStream;
  statusEl.textContent = '';
  return true;
}

function _aliascallStopCameraStream(){
  if (_aliascallCameraStream) { _aliascallCameraStream.getTracks().forEach((t) => t.stop()); _aliascallCameraStream = null; }
}

// onCapture(file)가 호출되면 촬영된 사진(File 객체, image/jpeg)을 넘겨줌
async function aliascallOpenCameraCapture(onCapture){
  _aliascallEnsureCameraOverlay(); // 처음 쓰는 순간에 오버레이를 만듦(body가 준비된 뒤에 호출되니 안전함)
  _aliascallApplyCameraI18n();     // 2026-08-25: 열 때마다 현재 언어로 문구 갱신
  _aliascallCameraOnCapture = onCapture;
  const overlay = document.getElementById('aliascallCameraOverlay');
  const video = document.getElementById('aliascallCameraVideo');
  const preview = document.getElementById('aliascallCameraPreview');
  overlay.classList.add('show');
  video.style.display = 'block';
  preview.style.display = 'none';
  document.getElementById('aliascallCameraLiveControls').style.display = 'flex';
  document.getElementById('aliascallCameraConfirmControls').style.display = 'none';
  await _aliascallStartCameraStream();
}

function _aliascallCloseCameraCapture(){
  _aliascallStopCameraStream();
  document.getElementById('aliascallCameraOverlay').classList.remove('show');
}
