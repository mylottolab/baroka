// =====================================================
// Aliascall — 푸시 구독 공용 헬퍼
// 2026-08-19 신설. "60초 무응답시 긴급 알림"을 전화번호 없이 웹푸시로 구현.
// aliascall_my_account.html / aliascall_registration_mockup.html / aliascall_incoming_calls.html
// 에서 <script src="aliascall_push.js">로 불러다 씀.
//
// ⚠ 2026-08-23 수정 (안드로이드 앱 대응)
// 안드로이드 WebView는 Push API(웹푸시)를 지원하지 않음. 브라우저에서는 되는데
// 앱 안에서는 오류도 없이 조용히 알림이 안 오는 상태가 됨.
// 그래서 앱 안에서는 FCM 네이티브 푸시를, 브라우저에서는 기존 웹푸시(VAPID)를 쓰도록
// _subscribeCore / _unsubscribeCore 안에서 분기함.
// UI 함수(renderPushOptIn / renderNotifySettings)는 이 두 함수를 공유하므로
// 카드형·토글형 UI 모두 자동으로 앱에서도 동작함.
// =====================================================

const PUSH_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

// =====================================================
// 2026-08-25 신설: 다국어(한/영)
// 이 파일은 index.html / my_account.html / registration_mockup.html /
// incoming_calls.html 등 여러 화면이 공유함. 각 화면마다 I18N 사전이 따로 있고
// 키 이름도 제각각이라, 화면 쪽 사전에 의존하면 한 곳만 고쳐도 다른 화면이 깨짐.
// 그래서 이 파일 안에 자체 사전을 두고, 언어 선택값(localStorage)만 공유함.
// =====================================================
const PUSH_I18N = {
  ko: {
    notSupported: '이 브라우저는 알림 기능을 지원하지 않아요.',
    moduleFail: '알림 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    iosGuideTitle: '📲 긴급 알림을 받으시려면',
    iosGuideBody: '아이폰(사파리)은 <b>홈 화면에 추가</b>한 뒤에만 알림을 받을 수 있어요.<br><br>'
      + '1. 하단의 <b>공유 버튼(⬆️)</b>을 눌러주세요<br>'
      + '2. <b>"홈 화면에 추가"</b>를 선택해주세요<br>'
      + '3. 홈 화면의 Aliascall 아이콘으로 다시 접속한 뒤, 이 화면에서 "긴급 알림 켜기"를 눌러주세요',
    optInOnTitle: '🔔 긴급 알림이 켜져 있어요',
    optInOnDesc: '앱을 안 보고 있어도, 15초 안에 응답이 없으면 알림으로 알려드려요.',
    optOutBtn: '알림 끄기',
    optInOffTitle: '🔔 긴급 알림을 켜두시면 좋아요',
    optInOffDesc: '누군가 연결을 시도했는데 15초간 응답이 없으면, 앱을 안 보고 있어도 알림으로 알려드려요.',
    optInBtn: '긴급 알림 켜기',
    optInBtnBusy: '설정 중…',
    soundLabel: '🔔 통화·문자 알림음',
    soundSub: '전화벨, 문자 도착음이 울려요',
    pushLabel: '🚨 긴급 알림 (푸시)',
    pushSubDefault: '화면을 안 보고 있어도 알림이 와요',
    pushSubUnsupported: '이 브라우저는 긴급 알림을 지원하지 않아요.',
    pushSubAppModuleFail: '알림 모듈을 불러오지 못했어요. 앱을 다시 실행해주세요.',
    pushSubIos: '아이폰은 홈 화면에 추가한 뒤 켤 수 있어요 (공유 버튼 → "홈 화면에 추가")',
    pcNote: '💻 PC에서도 확실히 알림통지를 받으시려면 크롬의 백그라운드 실행 옵션을 켜두세요.',
    alertModuleFail: '알림 모듈을 불러오지 못했어요.',
    alertDeniedApp: '알림을 허용해주셔야 긴급 알림을 받을 수 있어요. 휴대폰 설정 → 앱 → Aliascall → 알림에서 다시 허용할 수 있어요.',
    alertDeniedWeb: '알림을 허용해주셔야 긴급 알림을 받을 수 있어요. 브라우저 설정에서 다시 허용할 수 있어요.',
    alertLoginNeeded: '로그인이 필요합니다.',
    alertSetupFail: '긴급 알림 설정 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.',
  },
  en: {
    notSupported: 'This browser does not support notifications.',
    moduleFail: 'Could not load the notification module. Please try again shortly.',
    iosGuideTitle: '📲 To receive urgent alerts',
    iosGuideBody: 'On iPhone (Safari), alerts work only after you <b>add this to your Home Screen</b>.<br><br>'
      + '1. Tap the <b>Share button (⬆️)</b> at the bottom<br>'
      + '2. Choose <b>"Add to Home Screen"</b><br>'
      + '3. Open Aliascall from the Home Screen icon, then tap "Turn on urgent alerts" here',
    optInOnTitle: '🔔 Urgent alerts are on',
    optInOnDesc: 'Even when the app is closed, we\u2019ll notify you if there\u2019s no reply within 15 seconds.',
    optOutBtn: 'Turn off alerts',
    optInOffTitle: '🔔 We recommend turning on urgent alerts',
    optInOffDesc: 'If someone tries to reach you and there\u2019s no reply for 15 seconds, we\u2019ll notify you even when the app is closed.',
    optInBtn: 'Turn on urgent alerts',
    optInBtnBusy: 'Setting up…',
    soundLabel: '🔔 Call & message sounds',
    soundSub: 'Ringtone and message alert sounds will play',
    pushLabel: '🚨 Urgent alerts (push)',
    pushSubDefault: 'You\u2019ll be notified even when you\u2019re not looking at the screen',
    pushSubUnsupported: 'This browser does not support urgent alerts.',
    pushSubAppModuleFail: 'Could not load the notification module. Please restart the app.',
    pushSubIos: 'On iPhone, add this to your Home Screen first (Share → "Add to Home Screen")',
    pcNote: '💻 On a PC, turn on Chrome\u2019s background-run option to receive alerts reliably.',
    alertModuleFail: 'Could not load the notification module.',
    alertDeniedApp: 'You need to allow notifications to receive urgent alerts. You can allow them again in Settings → Apps → Aliascall → Notifications.',
    alertDeniedWeb: 'You need to allow notifications to receive urgent alerts. You can allow them again in your browser settings.',
    alertLoginNeeded: 'Please log in.',
    alertSetupFail: 'Something went wrong while setting up urgent alerts. Please try again shortly.',
  },
};

// 각 화면이 언어를 localStorage에 저장하므로 그 값을 그대로 따라감.
// ⚠ 2026-08-25: 공용 스크립트(report/emoji/camera/zoom/payments)가 window.getAliascallLang을
//    먼저 정의해 뒀으면 그것을 씀. 없으면 쓰일 수 있는 키를 전부 확인함 —
//    화면마다 언어가 따로 노는 것을 막기 위함.
function pushLang(){
  try {
    if (typeof window.getAliascallLang === 'function') {
      return window.getAliascallLang() === 'en' ? 'en' : 'ko';
    }
  } catch (e) {}
  var KEYS = ['aliascall_lang', 'aliascall_language', 'ac_lang', 'lang'];
  for (var i = 0; i < KEYS.length; i++) {
    try {
      var v = localStorage.getItem(KEYS[i]);
      if (v) return String(v).toLowerCase().indexOf('en') === 0 ? 'en' : 'ko';
    } catch (e) {}
  }
  return (navigator.language || 'ko').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
}
function PT(){ return PUSH_I18N[pushLang()]; }

// VAPID 공개키 (비밀키 아님 — 클라이언트에 노출돼도 안전. 서버의 VAPID_PRIVATE_KEY와 짝을 이룸)
const VAPID_PUBLIC_KEY = 'BJxWgI0hDS1z_PoTu5T5VRkHl5Rti38Dih4Vx4vHryduNlgeuBCRQP1-Y8LiyeV9k4mOLCbZyMn3I_Ac-HnkpGA';

// 앱에서 발급받은 FCM 토큰을 기억해둠 (알림 켜짐/꺼짐 상태 판별 + 해제 시 사용)
const FCM_TOKEN_KEY = 'aliascall_fcm_token';
const FCM_OWNER_KEY = 'aliascall_fcm_owner';   // 🔴 2026-10-05 — 이 폰 주소가 어느 계정에 등록됐는지
const FCM_SYNC_KEY  = 'aliascall_fcm_synced';  // 🔴 2026-10-05 — 마지막으로 서버에 알린 때

/* =====================================================================
   🔴🔴 2026-10-05 — 폰 주소(FCM 토큰)를 "조용히 자동으로" 등록 · 옮기기

   무슨 일이 있었나
     폰 주소는 마이페이지의 [긴급 알림 켜기] 를 눌러야만 서버에 올라갔습니다.
     "데이터 삭제" · 다시 설치 · 다른 계정으로 로그인하면 주소가 사라지거나 옛 계정에 남아,
     **전화가 와도 아무것도 안 울렸습니다**(서버는 보낼 곳이 없어 조용히 끝남).

   이제
     앱이고 · 로그인돼 있고 · 알림 허락이 이미 있으면 → 화면을 열 때 버튼 없이 주소를 올립니다.
       · 주소가 없거나 · 계정이 바뀌었거나 · 하루가 지났으면 다시 올립니다(서버가 같은 주소를 새 계정으로 옮김).
     알림 허락이 없으면 아무것도 묻지 않습니다(지금처럼 [긴급 알림 켜기] 로 묻습니다).
   ===================================================================== */
let _autoPushBusy = false;
async function aliascallAutoRegisterPush(sb){
  if (_autoPushBusy || !sb || typeof aliascallIsNativeApp !== 'function' || !aliascallIsNativeApp()) return;
  _autoPushBusy = true;
  try {
    const P = _nativePush(); if (!P) return;
    const perm = await P.checkPermissions();
    if (!perm || perm.receive !== 'granted') return;            // 허락은 버튼으로만 묻습니다
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const owner = localStorage.getItem(FCM_OWNER_KEY);
    const synced = Number(localStorage.getItem(FCM_SYNC_KEY) || 0);
    const have = localStorage.getItem(FCM_TOKEN_KEY);
    if (have && owner === session.user.id && Date.now() - synced < 24 * 3600 * 1000) return;   // 이미 맞음

    const token = await new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; reject(new Error('토큰 시간 초과')); } }, 15000);
      P.addListener('registration', (x) => { if (!done) { done = true; clearTimeout(t); resolve(x.value); } });
      P.addListener('registrationError', (e) => { if (!done) { done = true; clearTimeout(t); reject(new Error(JSON.stringify(e))); } });
      P.register();
    });
    const res = await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ platform: 'android_fcm', token, user_agent: navigator.userAgent, lang: pushLang() }),
    });
    if (!res.ok) throw new Error('토큰 저장 실패 ' + res.status);
    localStorage.setItem(FCM_TOKEN_KEY, token);
    localStorage.setItem(FCM_OWNER_KEY, session.user.id);
    localStorage.setItem(FCM_SYNC_KEY, String(Date.now()));
    console.log('[push] 폰 주소를 자동으로 등록했습니다');
  } catch (e) {
    console.warn('[push] 폰 주소 자동 등록 실패(다음에 다시 시도)', e);
  } finally { _autoPushBusy = false; }
}

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── 환경 판별 ──
function _isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function _isStandalone(){
  // iOS Safari: navigator.standalone / 그 외: display-mode 미디어쿼리
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// ── 안드로이드 앱(Capacitor) 안에서 돌아가고 있는지 ──
function aliascallIsNativeApp(){
  return !!(window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());
}
function _nativePush(){
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
}

function pushIsSupported(){
  // 앱 안이면 웹푸시 지원 여부와 무관하게 FCM으로 알림을 받을 수 있음
  if (aliascallIsNativeApp()) return !!_nativePush();
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// ── 서비스워커 등록 (알림을 실제로 받아야 하는 페이지에서 호출) ──
async function registerAliascallServiceWorker(){
  if (aliascallIsNativeApp()) return null; // 앱에서는 서비스워커를 쓰지 않음
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('[push] 서비스워커 등록 실패', e);
    return null;
  }
}

// ── 앱: 현재 알림이 켜져 있는지 확인 ──
async function _nativePushIsOn(){
  try {
    const P = _nativePush();
    if (!P) return false;
    const perm = await P.checkPermissions();
    return perm.receive === 'granted' && !!localStorage.getItem(FCM_TOKEN_KEY);
  } catch (e) {
    console.warn('[push] 앱 알림 상태 확인 실패', e);
    return false;
  }
}

// ── 알림 켜기 UI 렌더링 ──
// containerId: 버튼/안내를 그릴 <div id="...">
// 상태에 따라 3가지 중 하나를 보여줌:
//   1) iOS인데 홈화면 추가(PWA) 상태가 아님 -> "홈화면에 추가해주세요" 안내
//   2) 그 외 -> "긴급 알림 켜기" 버튼
//   3) 이미 구독중 -> "긴급 알림 켜짐" 상태 + 끄기 버튼
async function renderPushOptIn(sb, containerId){
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!pushIsSupported()) {
    el.innerHTML = '<div class="push-optin-note">' + PT().notSupported + '</div>';
    return;
  }

  let isOn = false;

  if (aliascallIsNativeApp()) {
    // 앱: iOS PWA 안내와 서비스워커 과정이 필요 없음
    isOn = await _nativePushIsOn();
  } else {
    // iOS는 홈화면에 추가(PWA 설치)해야만 웹푸시가 동작함 (iOS 16.4+ 제약사항)
    if (_isIOS() && !_isStandalone()) {
      el.innerHTML = `
        <div class="push-optin-card push-optin-ios-guide">
          <div class="push-optin-title">${PT().iosGuideTitle}</div>
          <div class="push-optin-desc">${PT().iosGuideBody}</div>
        </div>`;
      return;
    }

    const reg = await registerAliascallServiceWorker();
    if (!reg) {
      el.innerHTML = '<div class="push-optin-note">' + PT().moduleFail + '</div>';
      return;
    }

    const existingSub = await reg.pushManager.getSubscription();
    isOn = !!(existingSub && Notification.permission === 'granted');
  }

  if (isOn) {
    el.innerHTML = `
      <div class="push-optin-card push-optin-active">
        <div class="push-optin-title">${PT().optInOnTitle}</div>
        <div class="push-optin-desc">${PT().optInOnDesc}</div>
        <button type="button" class="push-optin-btn push-optin-btn-off" id="pushOptOutBtn">${PT().optOutBtn}</button>
      </div>`;
    document.getElementById('pushOptOutBtn').addEventListener('click', () => unsubscribeAliascallPush(sb, containerId));
    return;
  }

  el.innerHTML = `
    <div class="push-optin-card">
      <div class="push-optin-title">${PT().optInOffTitle}</div>
      <div class="push-optin-desc">${PT().optInOffDesc}</div>
      <button type="button" class="push-optin-btn" id="pushOptInBtn">${PT().optInBtn}</button>
    </div>`;
  document.getElementById('pushOptInBtn').addEventListener('click', () => subscribeAliascallPush(sb, containerId));
}

async function subscribeAliascallPush(sb, containerId){
  const btn = document.getElementById('pushOptInBtn');
  if (btn) { btn.disabled = true; btn.textContent = PT().optInBtnBusy; }
  const ok = await _subscribeCore(sb);
  if (ok) {
    await renderPushOptIn(sb, containerId); // "켜짐" 상태로 다시 그림
  } else if (btn) {
    btn.disabled = false; btn.textContent = PT().optInBtn;
  }
}

// =====================================================
// 구독 등록/해제 핵심 로직 (DOM 렌더링과 분리 — 카드형 UI/토글형 UI 둘 다 이걸 공유해서 씀)
// 2026-08-23: 여기서 앱(FCM) / 브라우저(웹푸시)를 갈라줌
// =====================================================

async function _subscribeCore(sb){
  if (aliascallIsNativeApp()) return await _subscribeCoreNative(sb);
  return await _subscribeCoreWeb(sb);
}

async function _unsubscribeCore(sb){
  if (aliascallIsNativeApp()) return await _unsubscribeCoreNative(sb);
  return await _unsubscribeCoreWeb(sb);
}

// ── 앱: FCM 토큰 발급 후 서버에 등록 ──
async function _subscribeCoreNative(sb){
  try {
    const P = _nativePush();
    if (!P) { alert(PT().alertModuleFail); return false; }

    let perm = await P.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await P.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      alert(PT().alertDeniedApp);
      return false;
    }

    // register()를 부르면 잠시 뒤 'registration' 이벤트로 토큰이 날아옴.
    // 리스너를 먼저 걸어두고 register()를 호출해야 토큰을 놓치지 않음.
    const token = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('토큰 발급 시간 초과')); }
      }, 15000);

      P.addListener('registration', (t) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(t.value); }
      });
      P.addListener('registrationError', (err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(JSON.stringify(err))); }
      });

      P.register();
    });

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert(PT().alertLoginNeeded); return false; }

    const res = await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        platform: 'android_fcm',
        token,
        user_agent: navigator.userAgent,
        lang: pushLang(), // 2026-08-25: 알림 문구를 이 기기 언어로 보내기 위함(v49)
      }),
    });
    if (!res.ok) throw new Error('토큰 저장 실패');

    localStorage.setItem(FCM_TOKEN_KEY, token);
    try { localStorage.setItem(FCM_OWNER_KEY, session.user.id); localStorage.setItem(FCM_SYNC_KEY, String(Date.now())); } catch (e) {}
    return true;
  } catch (e) {
    console.error('[push] 앱 알림 등록 실패', e);
    alert(PT().alertSetupFail);
    return false;
  }
}

async function _unsubscribeCoreNative(sb){
  try {
    const token = localStorage.getItem(FCM_TOKEN_KEY);
    if (token) {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ platform: 'android_fcm', token }),
        });
      }
      localStorage.removeItem(FCM_TOKEN_KEY);
    }
    return true;
  } catch (e) {
    console.error('[push] 앱 알림 해제 실패', e);
    return false;
  }
}

// ── 브라우저: 기존 웹푸시(VAPID) 로직 그대로 ──
async function _subscribeCoreWeb(sb){
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert(PT().alertDeniedWeb);
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // 브라우저 정책상 필수 — 눈에 안 보이는 조용한 푸시는 금지되어 있음
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert(PT().alertLoginNeeded); return false; }

    const subJson = sub.toJSON();
    const res = await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth_key: subJson.keys.auth,
        user_agent: navigator.userAgent,
        lang: pushLang(), // 2026-08-25: 알림 문구를 이 기기 언어로 보내기 위함(v49)
      }),
    });
    if (!res.ok) throw new Error('구독 정보 저장 실패');
    return true;
  } catch (e) {
    console.error('[push] 구독 실패', e);
    alert(PT().alertSetupFail);
    return false;
  }
}

async function _unsubscribeCoreWeb(sb){
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        await fetch(`${PUSH_FN_BASE}/aliascall-push-subscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ endpoint }),
        });
      }
    }
    return true;
  } catch (e) {
    console.error('[push] 구독 해제 실패', e);
    return false;
  }
}

async function unsubscribeAliascallPush(sb, containerId){
  await _unsubscribeCore(sb);
  if (containerId) await renderPushOptIn(sb, containerId);
}

// =====================================================
// 2026-08-23 신설: 앱에서 알림을 눌렀을 때 해당 화면으로 이동
// 페이지 로드 시 한 번만 호출하면 됨. (브라우저에서는 아무 일도 안 함)
// =====================================================
let _nativeHandlersReady = false;

async function aliascallInitNativePush(){
  if (!aliascallIsNativeApp() || _nativeHandlersReady) return;
  const P = _nativePush();
  if (!P) return;
  _nativeHandlersReady = true;

  // 알림을 탭했을 때
  P.addListener('pushNotificationActionPerformed', (action) => {
    const d = (action && action.notification && action.notification.data) || {};
    if (d.case_id) {
      location.href = 'aliascall_incoming_calls.html?case=' + encodeURIComponent(d.case_id);
    } else if (d.url) {
      location.href = d.url;
    }
  });

  // 앱이 켜져 있는 상태에서 알림이 도착했을 때 (필요하면 화면 갱신 등에 활용)
  P.addListener('pushNotificationReceived', (notification) => {
    console.log('[push] 앱 사용 중 알림 수신', notification);
  });
}

// 페이지가 열리면 자동으로 준비
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aliascallInitNativePush);
  } else {
    aliascallInitNativePush();
  }
}

// =====================================================
// 2026-08-19 (2차 수정) 신설: "통화·문자 알림음" + "긴급 알림" 통합 토글 스위치 UI
// 메인화면 하단 / 마이페이지 상단 / 수신대기 화면 상단에 공통으로 씀.
// 기존 카드형 renderPushOptIn(등록완료 화면용)과는 별개로, 여기서는 항상 상태가 보이는
// ON/OFF 슬라이드 스위치 형태로 통일함.
// =====================================================

// ── 알림음 on/off — 통화벨/딩동/채팅핑 등 모든 소리를 한 군데서 통제 ──
// (각 화면의 playDoorbell/startRingtone/playChatPing 함수들이 재생 직전에
//  aliascallIsSoundEnabled()를 확인하도록 되어있음)
const ALIASCALL_SOUND_KEY = 'aliascall_sound_enabled';
let _aliascallSharedCtx = null;

// ⚠ 2026-08-20 수정: 예전엔 이 파일(push.js)이 "언락용" 오디오 컨텍스트를 하나 만들고,
// 각 화면(index.html/my_account.html/incoming_calls.html/connect.html)은 각자 별도의
// AudioContext(sharedAudioCtx)를 또 만들어서 실제 딩동/벨소리를 재생했음. 브라우저 정책상
// "사용자 제스처로 허가받은" 오디오 컨텍스트와, 그 이후 새로 만든 별개의 컨텍스트는 서로
// 다른 객체라 허가가 안 이어질 수 있어서, 토글은 켜졌는데 실제 소리는 하나도 안 나던 버그의
// 원인이었음. 이제 모든 화면이 이 함수 하나로 같은 컨텍스트를 공유해서 씀.
function getAliascallAudioCtx(){
  if (!_aliascallSharedCtx) _aliascallSharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_aliascallSharedCtx.state === 'suspended') _aliascallSharedCtx.resume().catch(() => {});
  return _aliascallSharedCtx;
}

function aliascallIsSoundEnabled(){
  // 기본값: 아직 한 번도 설정 안 했으면 '켜짐'으로 간주하지 않음(브라우저가 자동재생을 막고
  // 있을 가능성이 높으므로) — 사용자가 최초 1회는 명시적으로 켜야 함
  // 🔴 2026-10-09 — 단, **앱에서는 기본이 켜짐**입니다. 앱은 자동재생 제한이 없고,
  //   앱을 새로 깔거나 업데이트 뒤 스위치가 꺼진 채로 남아 "화면은 뜨는데 벨이 안 울리던" 원인이었습니다.
  //   손님이 직접 끈 경우('0')만 끕니다.
  const v = localStorage.getItem(ALIASCALL_SOUND_KEY);
  if (v === '1') return true;
  if (v === '0') return false;
  try { return aliascallIsNativeApp(); } catch (e) { return false; }
}

/* 🔴 2026-10-09 — 벨소리 예비 길
   화면을 한 번도 누르지 않은 채 전화가 오면, 소리 엔진(AudioContext)이 "잠든" 상태라
   소리가 안 날 수 있습니다. 그럴 때는 미리 만들어 둔 벨소리 파일(<audio>)로 울리고 진동도 줍니다.
   각 화면의 ringOnce() 가 맨 앞에서 aliascallRingFallback() 을 불러 봅니다(true 면 예비 길로 울림). */
let _acRingAudio = null;
function _acRingWavUrl(){
  const rate = 8000, secs = 1.8, n = Math.floor(rate * secs);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  const beeps = [[0, 0.35], [0.40, 0.75], [1.00, 1.35], [1.40, 1.75]];
  for (let i = 0; i < n; i++) {
    const tt = i / rate;
    let s = 0;
    for (const [a, b] of beeps) if (tt >= a && tt < b) {
      const env = Math.min(1, (tt - a) / 0.02, (b - tt) / 0.05);
      s = Math.sin(2 * Math.PI * 740 * tt) * 0.55 * env;
    }
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function aliascallRingFallback(){
  try {
    const ctx = getAliascallAudioCtx();
    if (ctx && ctx.state === 'running') return false;      // 엔진이 깨어 있으면 원래 길로
  } catch (e) {}
  try {
    if (!_acRingAudio) { _acRingAudio = new Audio(_acRingWavUrl()); _acRingAudio.volume = 1; }
    _acRingAudio.currentTime = 0;
    const p = _acRingAudio.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
  return true;
}
/* 🔴 2026-10-09 — 거는 쪽이 끊으면 받는 쪽 벨 · "연결 요청이 왔어요" 표시도 바로 내립니다.
   예전에는 폰의 큰 벨(알림)은 꺼졌지만, 화면 안의 작은 벨(띵띵)과 표시는 60초 동안 남았습니다.
   3초마다 그 통화 줄(webrtc_sessions)에 ended_at 이 적혔는지 봅니다. 끝났으면 onEnd() 를 부릅니다.
   돌려받은 함수를 부르면 지켜보기를 멈춥니다(받기 · 거절을 누를 때). */
function aliascallWatchCallEnd(sb, row, onEnd){
  let done = false, timer = null;
  const stop = () => { done = true; if (timer) { clearInterval(timer); timer = null; } };
  if (!sb || !row || !row.session_token) return stop;
  const check = async () => {
    if (done) return;
    try {
      const { data, error } = await sb.from('webrtc_sessions').select('ended_at')
        .eq('session_token', row.session_token).maybeSingle();
      if (done || error) return;
      if (data && data.ended_at) { stop(); try { onEnd('ended'); } catch (e) {} }
    } catch (e) { /* 다음 번에 다시 */ }
  };
  timer = setInterval(check, 3000);
  setTimeout(() => { if (!done) stop(); }, 120000);   // 2분 뒤에는 그만 봅니다
  return stop;
}

/* 화면을 처음 만질 때 소리 엔진을 깨워 둡니다(그다음부터는 원래 길로 울림) */
(function(){
  const wake = () => { try { getAliascallAudioCtx(); } catch (e) {} };
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
})();
async function aliascallEnableSound(){
  try {
    const ctx = getAliascallAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    // 아주 짧고 작은 소리를 한번 내서 오디오 재생 자체를 "허가"받아둠 (사실상 무음에 가까움) —
    // 이후 이 페이지에서 재생하는 모든 소리가 같은 컨텍스트(getAliascallAudioCtx)를 쓰므로 계속 허용됨
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) { console.warn('[sound] 오디오 언락 실패', e); }
  localStorage.setItem(ALIASCALL_SOUND_KEY, '1');
}
function aliascallDisableSound(){
  localStorage.setItem(ALIASCALL_SOUND_KEY, '0');
}

// ── 통합 토글 UI 렌더링 ──
async function renderNotifySettings(sb, containerId){
  aliascallAutoRegisterPush(sb);   // 🔴 2026-10-05 — 버튼 없이 폰 주소 자동 등록 · 계정 바뀌면 옮김
  const el = document.getElementById(containerId);
  if (!el) return;

  const soundOn = aliascallIsSoundEnabled();
  const isApp = aliascallIsNativeApp();
  let pushOn = false, pushDisabled = false, pushNote = PT().pushSubDefault;

  if (!pushIsSupported()) {
    pushDisabled = true;
    pushNote = isApp ? PT().pushSubAppModuleFail : PT().pushSubUnsupported;
  } else if (isApp) {
    // ── 앱: FCM ──
    pushOn = await _nativePushIsOn();
  } else if (_isIOS() && !_isStandalone()) {
    pushDisabled = true;
    pushNote = PT().pushSubIos;
  } else {
    const reg = await registerAliascallServiceWorker();
    if (reg) {
      const existingSub = await reg.pushManager.getSubscription();
      pushOn = !!(existingSub && Notification.permission === 'granted');
    } else {
      pushDisabled = true;
      pushNote = PT().moduleFail;
    }
  }

  // PC 안내문은 앱에서는 의미가 없으므로 숨김
  const pcNote = isApp ? '' :
    '<div class="notify-pc-note">' + PT().pcNote + '</div>';

  el.innerHTML = `
    <div class="notify-settings">
      <div class="notify-row">
        <div class="notify-label"><b>${PT().soundLabel}</b><span class="notify-sub">${PT().soundSub}</span></div>
        <button type="button" class="toggle-switch${soundOn ? ' on' : ''}" id="soundToggleBtn" role="switch" aria-checked="${soundOn}"><span class="toggle-knob"></span></button>
      </div>
      <div class="notify-row">
        <div class="notify-label"><b>${PT().pushLabel}</b><span class="notify-sub">${pushNote}</span></div>
        <button type="button" class="toggle-switch${pushOn ? ' on' : ''}" id="pushToggleBtn" role="switch" aria-checked="${pushOn}"${pushDisabled ? ' disabled' : ''}><span class="toggle-knob"></span></button>
      </div>
      ${pcNote}
    </div>`;

  document.getElementById('soundToggleBtn').addEventListener('click', async function(){
    if (this.classList.contains('on')) {
      aliascallDisableSound();
      this.classList.remove('on');
      this.setAttribute('aria-checked', 'false');
    } else {
      await aliascallEnableSound();
      this.classList.add('on');
      this.setAttribute('aria-checked', 'true');
    }
  });

  if (!pushDisabled) {
    document.getElementById('pushToggleBtn').addEventListener('click', async function(){
      this.disabled = true;
      if (this.classList.contains('on')) {
        await _unsubscribeCore(sb);
      } else {
        const ok = await _subscribeCore(sb);
        if (!ok) { this.disabled = false; return; }
      }
      await renderNotifySettings(sb, containerId); // 최신 상태로 다시 그림
    });
  }
}


/* =====================================================================
   🔴 2026-10-05 — [❓ 사용법] 단추 (사용설명서 aliascall_help.html · 한국어 · 영어)
   이 파일을 읽는 주요 화면(홈 · 마이페이지 · 수신 대기 등)의 머리글 언어 단추 옆에 붙입니다.
   ===================================================================== */
(function(){
  function addHelp(){
    try {
      if (document.getElementById('acHelpLink')) return;
      var anchor = document.querySelector('header .lang-toggle, .lang-toggle');
      if (!anchor || !anchor.parentNode) return;
      var en = false;
      try { en = (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) {}
      var a = document.createElement('a');
      a.id = 'acHelpLink';
      a.href = 'index.html';
      a.textContent = en ? '❓ Guide' : '❓ 사용법';
      a.style.cssText = 'display:inline-flex;align-items:center;margin-right:6px;padding:5px 11px;border-radius:20px;' +
        'background:#E4EFEE;color:#123F3D;border:1px solid #DCE3DE;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;';
      anchor.parentNode.insertBefore(a, anchor);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHelp);
  else addHelp();
})();
