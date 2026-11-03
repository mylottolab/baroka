/* =====================================================================
   Aliascall — 🚨 긴급 경광등 (2026-11-01 · 결정 2026-10-28 「에일리어스콜 승인 후 할 일」)
   · 단축회선 바로 위에 빨간 단추 두 개
       🚨 긴급 수신 — 누가 내 차 · 물건 · 가족 일로 나에게 연락해 온 건 (내 등록물의 소통함)
       🚨 긴급 발신 — 내가 차량 · 분실 · 발견 건으로 연락한 건 (이 폰에서 연락한 기록)
   · 단추: 진행 중 건수 · 걸려 있는 건(무엇 · 마지막 메시지 · 몇 분 전) · [목록 ▾]
     누르면 그 건 대화로 바로. 새 메시지면 깜빡임, 진행 중 건이 없으면 회색.
   · 걸기 규칙: 기본은 가장 최근 건. 목록에서 다른 건을 고를 수 있고, 새 건이 들어오면 새 건으로 바꾸되 목록에 '새 건 도착'.
   · 끝나는 시점: [해결됨]을 누르거나 7일 동안 대화가 없으면 경광등에서 내림(소통함 · 긴급 연락 목록에는 그대로 남음).
   쓰는 법:  <div data-beacon></div> + <script src="aliascall_beacon.js"></script>
             화면이 sb 를 만든 뒤 AliasBeacon.mount()
             연락 화면(aliascall_connect.html)은 건을 열 때 AliasBeacon.remember(caseId, regId, title, category)
   ===================================================================== */
(function(){
  'use strict';
  var URL0 = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1/';
  var OUT_KEY = 'aliascall_out_cases', SEEN_KEY = 'aliascall_beacon_seen', KNOWN_KEY = 'aliascall_beacon_known', PICK_KEY = 'aliascall_beacon_pick';
  var DAY7 = 7 * 24 * 3600 * 1000;
  var EMOJI = { vehicle: '🚗', lost_item: '🎒', pet: '🐾', vulnerable_person: '🧒', absence: '🚪', temp_contact: '🎫', other: '📦' };

  var css = '' +
    '.bc-wrap{max-width:420px;margin:10px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
    '.bc{position:relative;display:flex;flex-direction:column;gap:3px;min-height:96px;padding:9px 10px 8px;border-radius:14px;border:1.5px solid rgba(255,255,255,.18);' +
      'background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);text-align:left;font-family:inherit;cursor:pointer;overflow:hidden}' +
    '.bc.on{background:linear-gradient(160deg,#D7263D,#9E1328);border-color:#FF5A6E;color:#fff;box-shadow:0 0 0 0 rgba(255,60,80,.6)}' +
    '.bc.blink{animation:bcBlink 1.1s ease-in-out infinite}' +
    '@keyframes bcBlink{0%,100%{box-shadow:0 0 0 0 rgba(255,60,80,.7)}50%{box-shadow:0 0 0 7px rgba(255,60,80,0);filter:brightness(1.25)}}' +
    '.bc .h{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:900}' +
    '.bc .h .cnt{margin-left:auto;font-size:12px;font-weight:800;background:rgba(0,0,0,.25);border-radius:999px;padding:1px 7px}' +
    '.bc .ttl{font-size:13.5px;font-weight:800;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bc .pv{font-size:11.5px;line-height:1.35;opacity:.9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all}' +
    '.bc .ft{display:flex;align-items:center;gap:6px;margin-top:auto;font-size:11px;opacity:.85}' +
    '.bc .ft .ls{margin-left:auto;border:1px solid currentColor;border-radius:999px;padding:1px 8px;font-weight:800}' +
    '.bc .nw{position:absolute;top:6px;right:8px;width:9px;height:9px;border-radius:50%;background:#FFE14D;box-shadow:0 0 6px #FFE14D}' +
    '#bcSheetBg{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.55);display:none}' +
    '#bcSheet{position:fixed;left:0;right:0;bottom:0;z-index:9101;max-height:80vh;overflow:auto;background:#fff;color:#16302E;border-radius:18px 18px 0 0;padding:16px 16px 22px;display:none}' +
    '#bcSheet h3{margin:0 0 4px;font-size:16px}' +
    '#bcSheet .sub{font-size:12px;color:#5b6f6d;margin-bottom:8px;line-height:1.5}' +
    '#bcSheet .it{display:flex;align-items:flex-start;gap:10px;padding:11px 4px;border-bottom:1px solid #e6ecec}' +
    '#bcSheet .it .e{font-size:20px;line-height:1.2}' +
    '#bcSheet .it .n{flex:1;min-width:0}' +
    '#bcSheet .it .n b{display:block;font-size:14px}' +
    '#bcSheet .it .n small{display:block;font-size:12px;color:#5b6f6d;margin-top:2px;line-height:1.4}' +
    '#bcSheet .it .bt{display:flex;flex-direction:column;gap:5px}' +
    '#bcSheet .it .bt button{min-height:34px;padding:0 10px;border-radius:9px;border:1px solid #cdd8d7;background:#f3f6f6;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;color:#16302E}' +
    '#bcSheet .it .bt .go{background:#D7263D;border-color:#D7263D;color:#fff}' +
    '#bcSheet .tag{display:inline-block;margin-left:5px;font-size:10.5px;font-weight:800;color:#fff;background:#E8734A;border-radius:999px;padding:1px 6px;vertical-align:middle}' +
    '#bcSheet .tag.cur{background:#1F6F6B}' +
    '#bcSheet .none{padding:16px 4px;font-size:13px;color:#5b6f6d;line-height:1.6}' +
    '#bcSheet .close{width:100%;margin-top:12px;min-height:46px;border-radius:12px;border:1px solid #cdd8d7;background:#f3f6f6;font:inherit;font-weight:700;cursor:pointer}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  var TX = {
    ko: { inT: '긴급 수신', outT: '긴급 발신', none: '진행 중인 건 없음', list: '목록', newArr: '새 건 도착', cur: '지금 걸린 건',
          inSub: '누가 내 차 · 물건 · 가족 일로 연락해 온 건입니다.', outSub: '내가 차량 · 분실 · 발견 건으로 연락한 건입니다(이 폰에서 연락한 것).',
          open: '열기', pick: '이걸로', done: '해결됨', doneAsk: '이 건을 해결됨으로 할까요? 대화가 끝나 더는 메시지를 주고받을 수 없어요.',
          close: '닫기', noMsg: '아직 메시지 없음', me: '나: ', empty: '진행 중인 긴급 건이 없어요. 끝난 건은 아래 [🚨 긴급 연락]에서 볼 수 있어요.',
          now: '방금', min: '분 전', hour: '시간 전', day: '일 전', item: '등록물' },
    en: { inT: 'Incoming', outT: 'Outgoing', none: 'Nothing open', list: 'List', newArr: 'New', cur: 'Current',
          inSub: 'People who contacted you about your car, things or family.', outSub: 'Cases you contacted about a car, lost or found item (from this phone).',
          open: 'Open', pick: 'Use', done: 'Resolved', doneAsk: 'Mark this case as resolved? The chat will end.',
          close: 'Close', noMsg: 'No messages yet', me: 'Me: ', empty: 'No open emergency cases. Ended cases are under [🚨 Emergency] below.',
          now: 'just now', min: 'm ago', hour: 'h ago', day: 'd ago', item: 'Item' }
  };
  function T(){ return en() ? TX.en : TX.ko; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function rd(k, d){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ago(iso){
    if (!iso) return '';
    var t = T(), s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return t.now; if (s < 3600) return Math.floor(s / 60) + t.min;
    if (s < 86400) return Math.floor(s / 3600) + t.hour; return Math.floor(s / 86400) + t.day;
  }
  function anonId(){ try { return localStorage.getItem('aliascall_finder_anon_id') || ''; } catch (e) { return ''; } }

  /* ── 이 폰에서 연락한 건 적어 두기 (연락 화면이 부름) ── */
  function remember(caseId, regId, title, category){
    if (!caseId) return;
    var a = rd(OUT_KEY, []).filter(function(x){ return x && x.id !== caseId && Date.now() - (x.at || 0) < 30 * 86400000; });
    a.unshift({ id: caseId, reg: regId || null, title: title || '', cat: category || '', at: Date.now() });
    wr(OUT_KEY, a.slice(0, 30));
  }

  /* ── 읽기 ── */
  var data = { inc: [], out: [] }, firstLoad = true;
  async function loadInc(){
    var sb = window.sb, s = null;
    try { s = sb ? (await sb.auth.getSession()).data.session : null; } catch (e) {}
    if (!s) return [];
    try {
      var r = await fetch(URL0 + 'aliascall-case-list', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify({ includeClosed: false }) });
      var d = await r.json();
      if (!r.ok) return [];
      return (d.cases || []).filter(function(c){ return c && c.status !== 'closed'; }).map(function(c){
        var m = c.lastMessage;
        return { id: c.caseId, kind: 'in', title: c.registrationTitle || T().item, emoji: EMOJI[c.category] || '🚨',
                 at: c.lastActivityAt || (m && m.createdAt) || null,
                 pv: !m ? '' : (m.type === 'call_log' ? m.preview : ((m.sender === 'owner' ? T().me : '') + (m.preview || ''))),
                 lastOther: m && m.sender !== 'owner' && m.type !== 'call_log' ? m.createdAt : null,
                 href: 'aliascall_incoming_calls.html?case=' + encodeURIComponent(c.caseId) };
      });
    } catch (e) { return []; }
  }
  async function loadOut(){
    var list = rd(OUT_KEY, []), fid = anonId();
    if (!list.length || !fid) return [];
    var res = await Promise.all(list.slice(0, 15).map(async function(x){
      try {
        var r = await fetch(URL0 + 'aliascall-case-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: x.id, finderAnonId: fid }) });
        if (!r.ok) return null;
        var d = await r.json();
        if (!d || d.status === 'closed') return null;
        var ms = (d.messages || []), m = ms[ms.length - 1], lastOther = null;
        for (var i = ms.length - 1; i >= 0; i--) { if (ms[i].sender !== 'finder' && ms[i].message_type !== 'call_log') { lastOther = ms[i].created_at; break; } }
        var txt = !m ? '' : (m.message_type === 'call_log' ? m.content : ((m.sender === 'finder' ? T().me : '') + (m.message_type === 'photo' ? '📷' : (m.content || ''))));
        return { id: x.id, kind: 'out', title: x.title || T().item, emoji: EMOJI[x.cat] || '🚨',
                 at: (m && m.created_at) || new Date(x.at).toISOString(), pv: txt, lastOther: lastOther,
                 href: 'aliascall_connect.html?case=' + encodeURIComponent(x.id) };
      } catch (e) { return null; }
    }));
    return res.filter(Boolean);
  }
  function alive(list){
    return list.filter(function(c){ return !c.at || Date.now() - new Date(c.at).getTime() < DAY7; })
               .sort(function(a, b){ return new Date(b.at || 0) - new Date(a.at || 0); });
  }
  async function refresh(){
    var both = await Promise.all([loadInc(), loadOut()]);
    data.inc = alive(both[0]); data.out = alive(both[1]);
    /* 새 건 도착 — 처음 보는 건이면 그 건으로 바꾸고 표시 */
    var known = rd(KNOWN_KEY, {}), pick = rd(PICK_KEY, {});
    var had = Object.keys(known).length > 0;   // 처음 쓰는 폰이면 '새 건' 표시 없이 가장 최근 건부터
    ['inc', 'out'].forEach(function(k){
      var newest = null;
      data[k].forEach(function(c){
        if (!known[c.id]) {
          c.isNew = had || !firstLoad; known[c.id] = Date.now();
          if (c.isNew && (!newest || new Date(c.at || 0) > new Date(newest.at || 0))) newest = c;
        }
      });
      if (newest) pick[k] = newest.id;   // 새 건이 들어오면 그 건으로 바꿈
    });
    wr(KNOWN_KEY, known); wr(PICK_KEY, pick);
    firstLoad = false;
    paintAll();
  }
  function current(k){
    var pick = rd(PICK_KEY, {})[k], list = data[k];
    for (var i = 0; i < list.length; i++) if (list[i].id === pick) return list[i];
    return list[0] || null;
  }
  function unseen(c){ var s = rd(SEEN_KEY, {}); return !!(c && c.lastOther && (!s[c.id] || new Date(c.lastOther) > new Date(s[c.id]))); }
  function markSeen(c){ var s = rd(SEEN_KEY, {}); s[c.id] = c.lastOther || new Date().toISOString(); wr(SEEN_KEY, s); }
  function go(c){ markSeen(c); location.href = c.href; }

  /* ── 그리기 ── */
  function card(k){
    var t = T(), list = data[k], c = current(k), on = list.length > 0;
    var blink = list.some(unseen), anyNew = list.some(function(x){ return x.isNew; });
    return '<button type="button" class="bc' + (on ? ' on' : '') + (blink ? ' blink' : '') + '" data-bc="' + k + '">' +
      (anyNew || blink ? '<span class="nw"></span>' : '') +
      '<span class="h">🚨 ' + esc(k === 'inc' ? t.inT : t.outT) + (on ? '<span class="cnt">' + list.length + '</span>' : '') + '</span>' +
      (c ? '<span class="ttl">' + esc(c.emoji + ' ' + c.title) + '</span><span class="pv">' + esc(c.pv || t.noMsg) + '</span>'
         : '<span class="pv">' + esc(t.none) + '</span>') +
      '<span class="ft">' + (c ? esc(ago(c.at)) : '') + '<span class="ls" data-bc-list="' + k + '">' + esc(t.list) + ' ▾</span></span>' +
      '</button>';
  }
  function paint(box){
    box.innerHTML = '<div class="bc-wrap">' + card('inc') + card('out') + '</div>';
    box.querySelectorAll('[data-bc]').forEach(function(b){
      b.onclick = function(e){
        var k = b.dataset.bc;
        if (e.target.closest('[data-bc-list]') || !data[k].length) { openList(k); return; }
        var c = current(k); if (c) go(c);
      };
    });
  }
  function boxes(){ return document.querySelectorAll('[data-beacon]'); }
  function paintAll(){ boxes().forEach(paint); }

  /* ── 목록 ── */
  function els(){
    var bg = document.getElementById('bcSheetBg'), sh = document.getElementById('bcSheet');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'bcSheetBg'; document.body.appendChild(bg);
      sh = document.createElement('div'); sh.id = 'bcSheet'; document.body.appendChild(sh);
      bg.onclick = closeList;
    }
    return { bg: bg, sh: sh };
  }
  function closeList(){ var e = els(); e.bg.style.display = e.sh.style.display = 'none'; }
  function openList(k){
    var t = T(), e = els(), list = data[k], cur = current(k);
    e.sh.innerHTML = '<h3>🚨 ' + esc(k === 'inc' ? t.inT : t.outT) + '</h3><div class="sub">' + esc(k === 'inc' ? t.inSub : t.outSub) + '</div>' +
      (list.length ? list.map(function(c, i){
        return '<div class="it"><span class="e">' + esc(c.emoji) + '</span><span class="n"><b>' + esc(c.title) +
          (c.isNew ? '<span class="tag">' + esc(t.newArr) + '</span>' : '') + (cur && cur.id === c.id ? '<span class="tag cur">' + esc(t.cur) + '</span>' : '') + '</b>' +
          '<small>' + esc((c.pv || t.noMsg)) + ' · ' + esc(ago(c.at)) + '</small></span>' +
          '<span class="bt"><button type="button" class="go" data-o="' + i + '">' + esc(t.open) + '</button>' +
          (cur && cur.id === c.id ? '' : '<button type="button" data-p="' + i + '">' + esc(t.pick) + '</button>') +
          '<button type="button" data-d="' + i + '">' + esc(t.done) + '</button></span></div>';
      }).join('') : '<div class="none">' + esc(t.empty) + '</div>') +
      '<button type="button" class="close">' + esc(t.close) + '</button>';
    e.bg.style.display = e.sh.style.display = 'block';
    /* 목록을 봤으니 '새 건' 표시는 내립니다 */
    list.forEach(function(c){ c.isNew = false; });
    e.sh.querySelectorAll('[data-o]').forEach(function(b){ b.onclick = function(){ go(list[+b.dataset.o]); }; });
    e.sh.querySelectorAll('[data-p]').forEach(function(b){ b.onclick = function(){ var p = rd(PICK_KEY, {}); p[k] = list[+b.dataset.p].id; wr(PICK_KEY, p); closeList(); paintAll(); }; });
    e.sh.querySelectorAll('[data-d]').forEach(function(b){ b.onclick = function(){ resolve(k, list[+b.dataset.d]); }; });
    e.sh.querySelector('.close').onclick = function(){ closeList(); paintAll(); };
  }
  async function resolve(k, c){
    if (!confirm(T().doneAsk)) return;
    try {
      var body = { caseId: c.id }, headers = { 'Content-Type': 'application/json' };
      if (k === 'inc') {
        var s = (await window.sb.auth.getSession()).data.session;
        if (s) headers.Authorization = 'Bearer ' + s.access_token;
      } else body.finderAnonId = anonId();
      await fetch(URL0 + 'aliascall-case-close', { method: 'POST', headers: headers, body: JSON.stringify(body) });
    } catch (e) { console.warn('[beacon] 해결됨 실패', e); }
    data[k] = data[k].filter(function(x){ return x.id !== c.id; });
    closeList(); paintAll();
  }

  var timer = null;
  window.AliasBeacon = {
    remember: remember,
    mount: function(){
      paintAll(); refresh();
      clearInterval(timer);
      timer = setInterval(function(){ if (document.visibilityState === 'visible') refresh(); }, 30000);
      document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') refresh(); });
    },
    refresh: refresh
  };
})();
