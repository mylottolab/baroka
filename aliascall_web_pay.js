/* =====================================================================
   Aliascall — 웹 결제 도우미 (aliascall_web_pay.js)
   2026-10-01 신설 — 이용권 화면(aliascall_plans.html)이 웹에서 쓰는 결제 창구입니다.

   결제창을 여는 방식은 검증된 aliascall_hotline_payments.js 와 **똑같습니다.**
     · 이니시스: INIPayPro_v2.js 공식 SDK → window.INIPayPro.requestPayment(...)
       ⚠ SDK 는 화면이 열릴 때 미리 불러 둡니다(누르는 순간 처음 부르면 팝업 차단으로 오인)
     · PayPal: client-id 를 서버에서 받아 SDK 를 불러 버튼을 그립니다
   다른 점은 부르는 서버 함수 하나 — aliascall-web-pay (상품 번호로 받습니다)

   ACWeb.inicis(sb, sku, opts, buyer)          국내카드 결제창 열기
   ACWeb.paypal(sb, containerId, getOrder, onDone)   PayPal 버튼 그리기 (getOrder() → {sku, opts} 를 누를 때 읽음)
   ===================================================================== */
(function(){
  var FN = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1';
  var en = function(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } };
  var M = {
    login: ['로그인이 필요합니다.', 'Please sign in.'],
    server: ['결제 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 'Could not reach the payment server. Please try again.'],
    sdk: ['결제 모듈을 불러오지 못했어요. 잠시 후 다시 시도해주세요.', 'Could not load the payment module. Please try again.'],
    pp: ['PayPal을 불러오지 못했어요.', 'Could not load PayPal.'],
    order: ['주문을 만들지 못했어요.', 'Could not create the order.'],
    cap: ['결제 승인에 실패했어요.', 'Could not approve the payment.'],
  };
  function t(k, serverMsg){ if (serverMsg && !en()) return serverMsg; return (M[k] || ['', ''])[en() ? 1 : 0]; }
  async function token(sb){ try { return (await sb.auth.getSession()).data.session?.access_token || null; } catch (e) { return null; } }

  var sdkP = null;
  function loadIni(){
    if (window.INIPayPro) return Promise.resolve();
    if (sdkP) return sdkP;
    sdkP = new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = 'https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js'; s.charset = 'UTF-8';
      s.onload = function(){ res(); }; s.onerror = function(e){ sdkP = null; rej(e); };
      document.head.appendChild(s);
    });
    return sdkP;
  }

  async function inicis(sb, sku, opts, buyer){
    var tk = await token(sb);
    if (!tk) { alert(t('login')); return false; }
    var d;
    try {
      var r = await fetch(FN + '/aliascall-web-pay', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify(Object.assign({ action: 'inicis_prepare', sku: sku, opts: opts || {} }, buyer || {})) });
      d = await r.json();
      if (!r.ok) { alert(t('server', d && d.error)); return false; }
    } catch (e) { console.error('[web-pay] 준비 실패', e); alert(t('server')); return false; }
    try { await loadIni(); } catch (e) { alert(t('sdk')); return false; }
    var device = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'MOBILE' : 'WEB';
    window.INIPayPro.requestPayment({
      P_MID: d.mid, P_OID: d.oid, P_PAY_TYPE: 'CARD', P_DEVICE_TYPE: device, P_IDCCODE: 'Y',
      P_AMT: d.amt, P_GOODS: d.goodname, P_UNAME: d.buyername, P_MOBILE: d.buyertel || '', P_EMAIL: d.buyeremail || '',
      P_NEXT_URL: d.nextUrl, P_NOTI_URL: d.notiUrl, P_CLOSE_URL: d.closeUrl,
      P_CHARSET: 'UTF-8', P_TIMESTAMP: d.timestamp, P_CHKFAKE: d.chkfake,
    });
    return true;
  }

  async function paypal(sb, containerId, getOrder, onDone){
    var box = document.getElementById(containerId); if (!box) return;
    box.innerHTML = '';
    var id;
    try {
      var ir = await fetch(FN + '/aliascall-paypal-client-id'); id = await ir.json();
      if (!ir.ok || !id.clientId) throw new Error('no client id');
    } catch (e) { box.innerHTML = '<div style="font-size:12px;color:#C1483A;text-align:center;padding:10px;">' + t('pp') + '</div>'; return; }
    if (!window.paypal || window.__aliascallPaypalClientId !== id.clientId) {
      await new Promise(function(res, rej){
        var s = document.createElement('script');
        s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(id.clientId) + '&currency=USD';
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      window.__aliascallPaypalClientId = id.clientId;
    }
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
      createOrder: async function(){
        var o = getOrder(); if (!o) throw new Error('nothing selected');
        var tk = await token(sb); if (!tk) { alert(t('login')); throw new Error('no session'); }
        var r = await fetch(FN + '/aliascall-web-pay', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
          body: JSON.stringify({ action: 'paypal_create', sku: o.sku, opts: o.opts || {} }) });
        var d = await r.json();
        if (!r.ok) { alert(t('order', d && d.error)); throw new Error(d.error || 'create failed'); }
        return d.id;
      },
      onApprove: async function(a){
        try {
          var r = await fetch(FN + '/aliascall-web-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'paypal_capture', orderID: a.orderID }) });
          var d = await r.json();
          if (!r.ok) { alert(t('cap', d && d.error)); return; }
          if (onDone) onDone(d);
        } catch (e) { console.error('[web-pay] PayPal 승인 실패', e); alert(t('cap')); }
      },
      onError: function(err){ console.error('[web-pay] PayPal 오류', err); },
    }).render('#' + containerId);
  }

  window.ACWeb = { inicis: inicis, paypal: paypal, preload: loadIni };
})();
