/* 바로카 (baroka.kr) — 공통 도우미 · 2026-11-03
   에일리어스콜 서버를 같이 씁니다(같은 계정 · 같은 차량 등록 · 같은 연락 화면).
   BK.sb            서버 연결
   BK.user()        로그인한 사람(없으면 null)
   BK.login(nick,pw) / BK.signup(nick,pw) / BK.logout()
   BK.ads(boxes)    광고 타일 그리기
   BK.plateKey(s) · BK.plateOk(s) · BK.plateNice(s)
   BK.sheet(html) · BK.toast(msg) */
(function(){
  'use strict';
  var URL_ = 'https://qmwaraittiurkynszjts.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2FyYWl0dGl1cmt5bnN6anRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODQ5OTUsImV4cCI6MjEwMjM2MDk5NX0.9Qr2vFzDCSKS54N6C5QN44BvCzIPTMQyVz7nX3GqT9Y';
  var BK = window.BK = window.BK || {};
  BK.URL = URL_; BK.ANON = ANON;
  BK.SITE = 'https://baroka.kr';   // 🔴 도메인 연결 전에는 QR이 아직 열리지 않습니다
  BK.CONTACT = 'weapps.kr@gmail.com';   // 광고 · 고객 문의 (에일리어스콜과 같은 창구)
  BK.sb = window.supabase.createClient(URL_, ANON);
  window.sb = window.sb || BK.sb;           // 에일리어스콜 도우미(스캔 · 결제)가 찾는 이름
  try { localStorage.setItem('aliascall_lang', 'ko'); } catch (e) {}

  BK.esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  BK.isApp = function(){
    try { if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true; } catch (e) {}
    return !!window.AliasNative;
  };

  /* 번호판 */
  BK.plateKey = function(s){ return String(s || '').replace(/[^0-9A-Za-z가-힣]/g, ''); };
  BK.plateOk = function(s){ return /^([가-힣]{2})?[0-9]{2,3}[가-힣][0-9]{4}$/.test(BK.plateKey(s)); };
  BK.plateNice = function(s){                 // 12가3456 → 12가 3456
    var k = BK.plateKey(s), m = k.match(/^([가-힣]{2})?([0-9]{2,3}[가-힣])([0-9]{4})$/);
    return m ? ((m[1] ? m[1] + ' ' : '') + m[2] + ' ' + m[3]) : String(s || '').trim();
  };

  /* 계정 — 에일리어스콜과 같은 방식(닉네임 + 비밀번호). 같은 닉네임이면 같은 계정입니다. */
  function email(nick){
    var n = String(nick || '').trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    return encodeURIComponent(n) + '@guest.aliascall.internal';
  }
  BK.user = async function(){
    try { var r = await BK.sb.auth.getSession(); return r.data.session ? r.data.session.user : null; } catch (e) { return null; }
  };
  BK.login = async function(nick, pw){
    var r = await BK.sb.auth.signInWithPassword({ email: email(nick), password: pw });
    if (r.error) return { ok: false, error: /invalid/i.test(r.error.message) ? '닉네임 또는 비밀번호가 맞지 않습니다.' : r.error.message };
    return { ok: true };
  };
  BK.signup = async function(nick, pw){
    nick = String(nick || '').trim();
    if (nick.length < 2) return { ok: false, error: '닉네임을 두 글자 이상 넣어 주세요.' };
    if (String(pw || '').length < 6) return { ok: false, error: '비밀번호는 6자리 이상으로 해 주세요.' };
    var r = await BK.sb.auth.signUp({ email: email(nick), password: pw });
    if (r.error) {
      if (/already/i.test(r.error.message)) {
        var l = await BK.login(nick, pw);
        return l.ok ? l : { ok: false, error: '이미 다른 분이 쓰는 닉네임입니다. 다른 닉네임으로 해 주세요.' };
      }
      return { ok: false, error: r.error.message };
    }
    if (r.data && r.data.user) {
      var p = await BK.sb.from('profiles').insert({ id: r.data.user.id, nickname: nick, country_code: 'KR', preferred_lang: 'ko', is_guest: true });
      if (p.error) console.warn('[baroka] profiles', p.error.message);
    }
    if (!r.data.session) { var l2 = await BK.login(nick, pw); if (!l2.ok) return l2; }
    return { ok: true, created: true };
  };
  BK.logout = async function(){ try { await BK.sb.auth.signOut(); } catch (e) {} };

  /* 광고 타일 — boxes 안에 그립니다. 광고가 모자라면 "광고 문의" 빈 타일 */
  var adsP = null;
  BK.ads = async function(boxes, min){
    boxes = (boxes || []).filter(Boolean);
    if (!boxes.length) return;
    if (!adsP) adsP = BK.sb.rpc('baroka_ads_list').then(function(r){ return r.data || []; }, function(){ return []; });
    var list = await adsP;
    var seen = {};
    boxes.forEach(function(box, bi){
      var want = Number(box.getAttribute('data-n') || min || 4);
      var mine = list.length ? list.slice((bi * want) % list.length).concat(list).slice(0, Math.min(want, list.length)) : [];
      var h = mine.map(function(a){
        if (!seen[a.id]) { seen[a.id] = 1; try { BK.sb.rpc('baroka_ad_hit', { p_id: a.id, p_click: false }); } catch (e) {} }
        var img = a.image ? '<img alt="" loading="lazy" src="' + BK.esc(a.image) + '">' : '';
        return '<a class="bk-ad' + (a.image ? ' img' : '') + '" data-ad="' + BK.esc(a.id) + '" href="' + BK.esc(a.link || '#') + '" target="_blank" rel="noopener sponsored"' +
          (a.image ? '' : ' style="background:' + BK.esc(a.bg || '#fff') + '"') + '>' + img +
          '<span class="ad">AD</span><span class="t">' + BK.esc(a.title) + '</span>' + (a.sub ? '<span class="s">' + BK.esc(a.sub) + '</span>' : '') + '</a>';
      }).join('');
      for (var i = mine.length; i < Math.min(want, 2); i++) {
        h += '<a class="bk-ad empty" href="' + (BK.CONTACT ? 'mailto:' + BK.CONTACT + '?subject=' + encodeURIComponent('바로카 광고 문의') : 'ad.html') + '"><span class="t">이 자리에<br>광고하세요</span><span class="s">광고 문의</span></a>';
      }
      box.innerHTML = h;
      box.querySelectorAll('[data-ad]').forEach(function(el){
        el.addEventListener('click', function(){ try { BK.sb.rpc('baroka_ad_hit', { p_id: el.getAttribute('data-ad'), p_click: true }); } catch (e) {} });
      });
    });
  };

  /* 아래에서 올라오는 시트 */
  BK.sheet = function(html){
    var bg = document.createElement('div'); bg.className = 'bk-sheet-bg';
    bg.innerHTML = '<div class="bk-sheet" role="dialog">' + html + '</div>';
    bg.addEventListener('click', function(e){ if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return { el: bg.firstChild, close: function(){ bg.remove(); } };
  };
  BK.toast = function(msg){
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);background:#0B1220;color:#fff;padding:12px 18px;border-radius:12px;font-weight:800;font-size:14.5px;z-index:9999;max-width:90vw;text-align:center';
    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600);
  };

  /* 답을 기다리는 연락 수 — 위 막대 "내 차" 단추의 빨간 점 (상대가 마지막으로 보낸 열린 연락) */
  BK.unread = async function(el){
    if (!el) return;
    try {
      var s = (await BK.sb.auth.getSession()).data.session; if (!s) return;
      var r = await fetch(URL_ + '/functions/v1/aliascall-case-list', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ includeClosed: false }) });
      var d = await r.json();
      var n = (d.cases || []).filter(function(c){ return c.status !== 'closed' && c.lastMessage && c.lastMessage.sender !== 'owner'; }).length;
      if (n) { el.textContent = n > 9 ? '9+' : n; el.classList.add('on'); }
    } catch (e) {}
  };
})();
