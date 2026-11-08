/* 🔴 2026-10-29 유치대리점 — 손님 쪽: ?ref= 링크 기억 · 로그인 뒤 자동 연결 · 마이페이지 코드 칸 (바로카 — 에일리어스콜 DB를 함께 씁니다)
   대리점 명단 · 코드 확인은 에일리어스콜 DB(partner_code_check), 연결은 이 사이트 DB(partner_link). */
(function(){
  try { var st = document.createElement('style'); st.textContent = '.pr-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--bk-line,#D8DEE8);font-size:14px}.pr-row:first-child{border-top:none}'; document.head.appendChild(st); } catch (e) {}
  var CFG = { sb: function(){ return (window.BK && BK.sb) || (typeof sb !== 'undefined' ? sb : null); }, langKey: 'baroka_lang',
    rowClass: 'pr-row', line: 'var(--bk-line,#D8DEE8)',
    btnStyle: 'border:none;border-radius:12px;padding:10px 14px;font-weight:800;font-size:14px;background:var(--bk-blue,#1B2D6B);color:#fff;cursor:pointer;font-family:inherit' };
  'use strict';
  var AC_URL = 'https://qmwaraittiurkynszjts.supabase.co';
  var AC_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2FyYWl0dGl1cmt5bnN6anRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODQ5OTUsImV4cCI6MjEwMjM2MDk5NX0.9Qr2vFzDCSKS54N6C5QN44BvCzIPTMQyVz7nX3GqT9Y';
  var KEY = 'partner_ref_v1';
  var PARTNER_PAGE = 'https://aliascall.com/aliascall_partner.html';
  // 앱(아이폰 · 안드로이드) 안에서는 "대리점 모집" 홍보를 아직 숨깁니다. 애플 승인 뒤 true 로.
  var PROMO_IN_APP = true;   // 🔴 2026-11-03 iOS 1.2 승인 → 앱에서도 보임

  function isApp(){
    try { if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true; } catch (e) {}
    return !!window.AliasNative;
  }
  function en(){ try { return (localStorage.getItem(CFG.langKey) || document.documentElement.lang || 'ko').indexOf('en') === 0; } catch (e) { return false; } }
  function T(k, e){ return en() ? e : k; }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  // ① 링크로 들어오면(?ref=123456) 이 폰에 30일 적어 둡니다
  try {
    var q = new URLSearchParams(location.search).get('ref');
    if (q && /^\d{6}$/.test(q)) localStorage.setItem(KEY, JSON.stringify({ code: q, at: Date.now() }));
  } catch (e) {}
  function saved(){
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Date.now() - s.at < 30 * 864e5) return s.code; } catch (e) {}
    return null;
  }
  function forget(){ try { localStorage.removeItem(KEY); } catch (e) {} }

  async function codeOk(code){
    try {
      var r = await fetch(AC_URL + '/rest/v1/rpc/partner_code_check', { method:'POST',
        headers:{ 'Content-Type':'application/json', apikey: AC_ANON, Authorization: 'Bearer ' + AC_ANON },
        body: JSON.stringify({ p_code: code }) });
      var j = await r.json(); return !!(j && j.ok);
    } catch (e) { return null; }      // 모르면 null
  }
  async function session(){
    var c = CFG.sb(); if (!c) return null;
    try { return (await c.auth.getSession()).data.session; } catch (e) { return null; }
  }
  async function link(code, source){
    var ok = await codeOk(code);
    if (ok === false) return { ok:false, error:'bad_code' };
    if (ok === null) return { ok:false, error:'net' };
    var r = await CFG.sb().rpc('partner_link', { p_code: code, p_source: source });
    if (r.error) return { ok:false, error:'net' };
    return r.data || { ok:false };
  }

  // ② 로그인되어 있고 적어 둔 코드가 있으면 조용히 연결
  async function autoLink(){
    var code = saved(); if (!code) return;
    var s = await session(); if (!s) return;
    var r = await link(code, 'link');
    if (r.ok || ['already','self','too_late','bad_code'].indexOf(r.error) >= 0) forget();
  }

  // ③ 마이페이지 칸: 코드 넣기 / 연결된 코드 / 대리점 모집 안내
  async function mount(box){
    if (!box) return;
    var s = await session(); if (!s) { box.innerHTML = ''; return; }
    var me = null;
    try { me = (await CFG.sb().rpc('my_partner_ref')).data; } catch (e) {}
    var html = '';
    if (me && me.code) {
      html += '<div class="' + CFG.rowClass + '"><span class="pl">' + T('추천 대리점 코드', 'Referral code') + '</span><b>' + esc(me.code) + '</b></div>';
    } else if (me && me.can_link) {
      var until = me.until ? new Date(me.until).toLocaleDateString(en() ? 'en-US' : 'ko-KR') : '';
      html += '<div style="padding:4px 0 2px"><div style="font-size:14px;font-weight:700;margin-bottom:8px">' + T('소개해 준 대리점 코드가 있으세요?', 'Have a referral code?') + '</div>' +
        '<div style="display:flex;gap:8px"><input id="prCode" inputmode="numeric" maxlength="6" placeholder="' + T('6자리 숫자', '6 digits') + '" value="' + esc(saved() || '') + '" ' +
        'style="flex:1;min-width:0;font-size:16px;padding:11px 12px;border-radius:12px;border:1.5px solid ' + CFG.line + ';background:transparent;color:inherit;font-family:inherit">' +
        '<button type="button" id="prGo" style="' + CFG.btnStyle + '">' + T('넣기', 'Apply') + '</button></div>' +
        '<div id="prMsg" style="font-size:12.5px;margin-top:6px;opacity:.8;line-height:1.5">' +
        T('가입 후 30일 안에 한 번만 넣을 수 있습니다' + (until ? ' (' + until + '까지)' : '') + '. 넣은 뒤에는 바꿀 수 없습니다.',
          'You can enter it once within 30 days of signing up' + (until ? ' (until ' + until + ')' : '') + '.') + '</div></div>';
    }
    if (!isApp() || PROMO_IN_APP) {
      html += '<a href="' + PARTNER_PAGE + '" target="_blank" rel="noopener" class="' + CFG.rowClass + '" style="text-decoration:none;color:inherit">' +
        '<span class="pl"><b>' + T('💼 유치대리점 모집', '💼 Become a partner') + '</b><span class="ps" style="display:block;font-size:12.5px;opacity:.75;margin-top:2px">' +
        T('부름 · 누름 · 가림 · 바로너 · 바로카를 소개하고, 손님이 살 때마다 10%를 받으세요', 'Introduce us and earn 10% on every purchase (Korea only)') + '</span></span>' +
        '<span style="' + CFG.btnStyle + ';white-space:nowrap">' + T('알아보기 ›', 'Learn more ›') + '</span></a>';
    }
    box.innerHTML = html;
    box.style.display = html ? '' : 'none';
    var go = box.querySelector('#prGo');
    if (go) go.onclick = async function(){
      var inp = box.querySelector('#prCode'), msg = box.querySelector('#prMsg');
      var code = (inp.value || '').replace(/\D/g, '');
      if (code.length !== 6) { msg.textContent = T('6자리 숫자를 넣어 주세요.', 'Please enter 6 digits.'); return; }
      go.disabled = true;
      var r = await link(code, saved() === code ? 'link' : 'code');
      go.disabled = false;
      var M = { bad_code: T('없는 코드입니다. 숫자를 다시 확인해 주세요.', 'That code does not exist.'),
                already: T('이미 코드가 연결되어 있습니다.', 'A code is already linked.'),
                self: T('내 코드는 넣을 수 없습니다.', 'You cannot use your own code.'),
                too_late: T('가입 후 30일이 지나 넣을 수 없습니다.', 'More than 30 days since sign-up.'),
                net: T('연결하지 못했습니다. 잠시 뒤 다시 눌러 주세요.', 'Could not connect. Please try again.') };
      if (r.ok) { forget(); mount(box); return; }
      msg.textContent = M[r.error] || M.net;
    };
  }

  window.PartnerRef = { mount: mount, autoLink: autoLink, saved: saved };
  function start(){ setTimeout(autoLink, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
