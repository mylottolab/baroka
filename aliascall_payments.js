// =====================================================
// Aliascall — 결제 공용 헬퍼 (구독 결제 + 포인트 충전에서 공용으로 사용)
// aliascall_recharge_mockup.html / aliascall_my_account.html /
// aliascall_registration_mockup.html 세 곳에서 <script src="aliascall_payments.js">
// 로 불러다 씀. sb(supabase 클라이언트)는 각 페이지에서 이미 만들어둔 걸 그대로 전달.
// =====================================================

// ─────────────────────────────────────────────────────
// 공용 언어 감지 블록 (report/emoji/camera/zoom/hotline_payments 파일과 동일 —
// 먼저 불려온 파일이 한 번만 정의)
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
const _AC_PAY2_I18N = {
  ko: {
    loginRequired: '로그인이 필요합니다.',
    prepareFail: '결제 준비에 실패했어요.',
    serverFail: '결제 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.',
    sdkFail: '결제 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    paypalLoadFail: 'PayPal을 불러오지 못했어요.',
    orderFail: '주문 생성에 실패했어요.',
    captureFail: '결제 승인에 실패했어요.',
    captureError: '결제 승인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    paypalError: 'PayPal 결제 중 오류가 발생했어요.',
  },
  en: {
    loginRequired: 'Please sign in.',
    prepareFail: "Couldn't prepare the payment.",
    serverFail: "Couldn't reach the payment server. Please try again in a moment.",
    sdkFail: "Couldn't load the payment module. Please try again in a moment.",
    paypalLoadFail: "Couldn't load PayPal.",
    orderFail: "Couldn't create the order.",
    captureFail: "Couldn't approve the payment.",
    captureError: 'Something went wrong while approving the payment. Please try again in a moment.',
    paypalError: 'Something went wrong during PayPal checkout.',
  },
};
function _acPay2T(key){
  const lang = window.getAliascallLang();
  const d = _AC_PAY2_I18N[lang] || _AC_PAY2_I18N.ko;
  return d[key] !== undefined ? d[key] : _AC_PAY2_I18N.ko[key];
}
// 서버(Edge Function) 오류 문구는 한국어라, 영어 화면에서는 이 파일 문구를 씀
function _acPay2Err(serverMsg, key){
  return (window.getAliascallLang() === 'ko' && serverMsg) ? serverMsg : _acPay2T(key);
}

const PAYMENTS_FN_BASE = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';

async function _getAuthToken(sb){
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

// ── 이니시스 결제 시작 (INIpay PRO 공식 SDK 방식) ──
// ⚠ 2026-08-19 수정: 처음엔 이니시스 공식 SDK 코드를 못 받아서 "모바일표준결제 P_ 파라미터를
// 수동으로 폼에 담아 mobile.inicis.com에 직접 POST하는" 방식으로 추측 구현했었는데, 이게 실제
// 이니시스 스펙과 안 맞아서 결제창 자체가 안 뜨고 바로 실패했음. PaperLotto의 실제 작동 코드를
// 받아서 확인해보니, INIPayPro_v2.js라는 공식 SDK를 로드해서 INIPayPro.requestPayment(...) 함수를
// 직접 호출하는 방식이었음 — 이제 그 방식 그대로 이식함.
let _iniPaySdkLoaded = false;
let _iniPaySdkLoading = null;

function _loadIniPaySdk(){
  if (_iniPaySdkLoaded) return Promise.resolve();
  if (_iniPaySdkLoading) return _iniPaySdkLoading;
  _iniPaySdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js';
    script.charset = 'UTF-8';
    script.onload = () => { _iniPaySdkLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _iniPaySdkLoading;
}

async function startInicisPayment(sb, opts){
  const { purpose, price, goodname, buyername, buyertel, buyeremail, months, returnPage } = opts;
  const token = await _getAuthToken(sb);
  if (!token) { alert(_acPay2T('loginRequired')); return; }

  // ⚠ SDK를 여기서(클릭 시점에) 처음 불러오면, 그 로딩 시간(+ 결제준비 API 응답 대기시간)
  // 때문에 실제 requestPayment() 호출이 "클릭"과 너무 멀어져서 브라우저가 이걸 팝업 차단
  // 대상으로 오인하고 조용히 막아버림 — "결제하기를 한 번 누르면 반응 없다가, 한 번 더
  // 눌러야 결제창이 뜨는" 버그의 원인이었음. 그래서 SDK는 페이지 로드 시점에 미리
  // 백그라운드로 불러와두고(_preloadIniPaySdk, 파일 맨 아래), 여기서는 이미 준비된 SDK를
  // 재사용하기만 함.
  let data;
  try {
    const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-inicis-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ purpose, price, goodname, buyername, buyertel, buyeremail, months, returnPage }),
    });
    data = await res.json();
    if (!res.ok) { alert(_acPay2Err(data.error, 'prepareFail')); return; }
  } catch (e) {
    console.error('[payments] 이니시스 준비 요청 실패', e);
    alert(_acPay2T('serverFail'));
    return;
  }

  try {
    await _loadIniPaySdk(); // 이미 불러와져 있으면 즉시 반환됨(위 preload 덕분에 보통 여기서 지연 없음)
  } catch (e) {
    console.error('[payments] 이니시스 SDK 로드 실패', e);
    alert(_acPay2T('sdkFail'));
    return;
  }

  // PC/모바일 자동 감지 (INIpay PRO는 이 값 하나로 PC/모바일 결제창을 구분함)
  const deviceType = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'MOBILE' : 'WEB';

  window.INIPayPro.requestPayment({
    P_MID: data.mid,
    P_OID: data.oid,
    P_PAY_TYPE: 'CARD',
    P_DEVICE_TYPE: deviceType,
    P_IDCCODE: 'Y',
    P_AMT: data.amt,
    P_GOODS: data.goodname,
    P_UNAME: data.buyername,
    P_MOBILE: data.buyertel || '',
    P_EMAIL: data.buyeremail || '',
    P_NEXT_URL: data.nextUrl,
    P_NOTI_URL: data.notiUrl,
    P_CLOSE_URL: data.closeUrl,
    P_CHARSET: 'UTF-8',
    P_TIMESTAMP: data.timestamp,
    P_CHKFAKE: data.chkfake,
  });
}

// ── PayPal 버튼 렌더링 (충전/구독 공용) ──
// containerId: 버튼을 그릴 <div id="..."> / opts: { purpose, usdAmount, months }
// onSuccess(data): 결제 성공 후 호출할 콜백
async function renderPayPalButtons(sb, containerId, opts, onSuccess){
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  let idData;
  try {
    const idRes = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-client-id`);
    idData = await idRes.json();
    if (!idRes.ok) throw new Error(idData.error || 'client-id 조회 실패');
  } catch (e) {
    console.error('[payments] PayPal client-id 조회 실패', e);
    el.innerHTML = '<div style="font-size:12px;color:#C1483A;text-align:center;padding:10px;">' + _acPay2T('paypalLoadFail') + '</div>';
    return;
  }

  if (!window.paypal || window.__aliascallPaypalClientId !== idData.clientId) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(idData.clientId)}&currency=USD`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.__aliascallPaypalClientId = idData.clientId;
  }

  window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
    createOrder: async () => {
      const token = await _getAuthToken(sb);
      if (!token) { alert(_acPay2T('loginRequired')); throw new Error('no session'); }
      const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) { alert(_acPay2Err(data.error, 'orderFail')); throw new Error(data.error || 'create-order failed'); }
      return data.id;
    },
    onApprove: async (dataApprove) => {
      try {
        const res = await fetch(`${PAYMENTS_FN_BASE}/aliascall-paypal-capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: dataApprove.orderID }),
        });
        const data = await res.json();
        if (!res.ok) { alert(_acPay2Err(data.error, 'captureFail')); return; }
        if (onSuccess) onSuccess(data);
      } catch (e) {
        console.error('[payments] PayPal capture 실패', e);
        alert(_acPay2T('captureError'));
      }
    },
    onError: (err) => {
      console.error('[payments] PayPal 버튼 오류', err);
      alert(_acPay2T('paypalError'));
    },
  }).render('#' + containerId);
}

// ── 이니시스 SDK를 페이지가 열리는 즉시(백그라운드로) 미리 불러와둠 ──
// PayPal은 어차피 버튼을 실제 렌더링해야 쓸 수 있어서 지연이 눈에 안 띄지만, 이니시스는
// "클릭 → 즉시 결제창"이 자연스러워야 해서 미리 준비해둠 (위 startInicisPayment 참고).
// aliascall_payments.js를 불러오는 3개 화면(충전소/마이페이지/등록화면) 전부에서 이 파일
// 로드 즉시 실행되므로, 사용자가 KRW를 선택하지 않고 그냥 페이지를 열기만 해도 준비됨.
_loadIniPaySdk().catch((e) => console.warn('[payments] 이니시스 SDK 사전로드 실패(결제 시도 시 재시도됨)', e));
