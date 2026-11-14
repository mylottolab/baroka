/* =====================================================================
   💬 고객센터 — 자동 답변 + 1:1 문의 (다섯 앱 공통) · 2026-11-15
   카카오톡 채널 대신 씁니다.

   쓰는 법 (support.html 이 부릅니다)
     SUP.start({ sb: <supabase 연결>, app: 'burum' | 'nureum' | 'baronu' | 'garim' | 'baroka',
                 login: '로그인 화면 주소', home: '처음 화면 주소' })
   주소 뒤에 붙일 수 있는 것
     ?app=nureum   누름에서 들어왔을 때 (부름 서버 화면)
     ?t=<문의 번호> 답장 알림을 눌러 들어왔을 때 → 그 문의를 엽니다
     ?q=<낱말>      찾을 말을 미리 넣어 둡니다
     ?ask=1         「직접 물어보기」를 바로 엽니다

   1단계(지금): 자동 답변은 support_faq.js 의 설명서 내용에서 낱말로 찾습니다(비용 없음).
                못 찾으면 [상담원에게 보내기] → 종합관리자 「💬 고객문의」에서 사람이 답합니다.
   ===================================================================== */
(function(){
'use strict';
var SUP = window.SUP = window.SUP || {};
var MAIL = 'weapps.kr@gmail.com';
var NAMES = { burum: '부름', nureum: '누름', baronu: '바로너', garim: '가림콜', baroka: '바로카' };
var C = {}, S = { faq: [], me: null, tickets: [], open: null, server: true, lastQ: '' };

function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function $(id){ return document.getElementById(id); }
function when(t){
  var d = new Date(t); if (isNaN(d)) return '';
  var k = new Date(d.getTime() + 9 * 3600e3), n = new Date(Date.now() + 9 * 3600e3);
  var hm = String(k.getUTCHours()).padStart(2, '0') + ':' + String(k.getUTCMinutes()).padStart(2, '0');
  if (k.toISOString().slice(0, 10) === n.toISOString().slice(0, 10)) return '오늘 ' + hm;
  return (k.getUTCMonth() + 1) + '월 ' + k.getUTCDate() + '일 ' + hm;
}
function toast(msg, bad){
  var t = $('supToast'); if (!t) return;
  t.textContent = msg; t.className = 'sup-toast on' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.className = 'sup-toast'; }, 3200);
}
function errText(e){
  var m = String((e && (e.message || e.details || e.hint)) || e || '');
  if (/not_logged_in|JWT|auth/i.test(m)) return '로그인이 필요합니다.';
  if (/too_many_open/.test(m)) return '답을 기다리는 문의가 5개 있습니다. 기존 문의에 이어서 적어 주세요.';
  if (/too_many/.test(m)) return '잠시 뒤에 다시 보내 주세요. (한 시간에 10개까지)';
  if (/too_short/.test(m)) return '조금 더 자세히 적어 주세요.';
  if (/too_long/.test(m)) return '2,000자까지 보낼 수 있습니다.';
  if (/support_|function|schema cache|does not exist/i.test(m)) { S.server = false; return '지금은 앱 안 문의를 받을 수 없습니다. 이메일 ' + MAIL + ' 으로 보내 주세요.'; }
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  return '보내지 못했습니다. 잠시 뒤 다시 해 주세요.';
}

/* ── 자동 답변: 낱말 찾기 ─────────────────────────────────────────────
   한국어는 띄어쓰기 · 조사가 제각각이라 두 글자씩 잘라(바이그램) 겹치는 정도로 찾습니다.
   「어떻게 · 하나요 · 궁금」 같은 말은 빼고, 비슷한 말(환불 = 돈 돌려받기)은 함께 찾습니다. */
var STOP = ['어떻', '떻게', '하나', '나요', '해요', '하는', '어요', '세요', '니다', '습니', '궁금', '있나', '는데', '은데', '되나',
            '할수', '수있', '있어', '싶어', '싶은', '좀알', '알려', '려주', '주세', '해주', '요요', '그런', '이거', '저기', '제가', '혹시', '문의'];
var SYN = [
  ['환불', '취소', '돌려', '청약', '해지', '위약'],
  ['결제', '구매', '샀는', '샀어', '이용권', '충전', '돈이', '빠져'],
  ['요금', '가격', '얼마', '비용', '유료', '무료'],
  ['알림', '푸시', '울려', '울리', '벨소', '소리', '진동', '수신'],
  ['탈퇴', '삭제', '지우'],
  ['비밀번호', '비번', '암호', '잊었', '까먹'],
  ['휴대폰', '핸드폰', '폰을', '기기', '새폰', '바꿨', '바꾼', '재설치'],
  ['연결', '짝맺', '짝을', '초대', '코드', 'qr', '큐알'],
  ['긴급', 'sos', '보호자', '응급', '위급', '위험'],
  ['영상통화', '화상', '영상'],
  ['아이콘', '바탕화면', '위젯', '홈화면'],
  ['차번호', '번호판', '차량', '주차', '차주'],
  ['번호변경', '번호를바꿨', '바꿨어요']
];
function grams(s){
  s = String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^0-9a-z가-힣]+/g, ' ');
  var out = {}, words = s.split(' ');
  words.forEach(function(w){
    if (!w) return;
    if (w.length === 1) { out[w] = 1; return; }
    for (var i = 0; i < w.length - 1; i++) out[w.substr(i, 2)] = 1;
  });
  return out;
}
function expand(q){
  var s = String(q || '').toLowerCase().replace(/\s+/g, '');
  var add = [];
  SYN.forEach(function(g){ if (g.some(function(w){ return s.indexOf(w) >= 0; })) add.push(g.join(' ')); });
  return add.join(' ');
}
function prep(){
  S.faq.forEach(function(f){
    f._q = grams(f.q); f._k = grams(f.k + ' ' + f.cat + ' ' + expand(f.q + ' ' + f.k)); f._a = grams(f.a);
  });
}
function search(q){
  var g = grams(q), syn = grams(expand(q));
  var keys = Object.keys(g).filter(function(k){ return STOP.indexOf(k) < 0 && k.length > 1; });
  var skeys = Object.keys(syn).filter(function(k){ return !g[k]; });
  if (!keys.length) return [];
  return S.faq.map(function(f){
    var sc = 0;
    keys.forEach(function(k){ sc += f._q[k] ? 3 : f._k[k] ? 2 : f._a[k] ? 0.7 : 0; });
    skeys.forEach(function(k){ sc += f._q[k] ? 1.2 : f._k[k] ? 0.5 : 0; });
    return { f: f, s: sc / Math.max(3, keys.length) };
  }).filter(function(x){ return x.s >= 0.55; })
    .sort(function(a, b){ return b.s - a.s; }).slice(0, 4);
}

/* ── 서버 ─────────────────────────────────────────────────────────── */
async function rpc(name, args){
  var r = await C.sb.rpc(name, args || {});
  if (r.error) throw r.error;
  return r.data;
}
function log(q, id, ok){
  if (!S.me || !S.server || !q) return;
  C.sb.rpc('support_log', { p_app: C.app, p_q: q, p_faq: id || null, p_ok: ok }).then(function(){}, function(){});
}
async function loadMine(){
  if (!S.me) return;
  try { S.tickets = await rpc('support_my') || []; }
  catch (e) { S.tickets = []; errText(e); }
  paintMine();
}

/* ── 화면 ─────────────────────────────────────────────────────────── */
function cats(){
  var seen = {}, out = [];
  S.faq.forEach(function(f){ if (!seen[f.cat]) { seen[f.cat] = 1; out.push(f.cat); } });
  var order = ['🆘 안심 긴급', '자주 묻는 질문', '사용법', '요금 · 결제', '알림 · 전화', '계정', '기타'];
  return out.sort(function(a, b){ return (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99; });
}
function card(f, q){
  return '<details class="sup-a" data-id="' + esc(f.id) + '"' + (q != null ? ' data-q="' + esc(q) + '"' : '') + '>' +
    '<summary>' + esc(f.q) + '</summary><div class="sup-ans">' + f.a +
    '<div class="sup-fb"><span>도움이 됐나요?</span>' +
    '<button type="button" data-ok="1">👍 해결됐어요</button>' +
    '<button type="button" data-ok="0">아직 모르겠어요</button></div></div></details>';
}
function paintResults(list, q, title){
  var box = $('supRes');
  if (q != null && !list.length) {
    box.innerHTML = '<div class="sup-miss"><b>딱 맞는 답을 찾지 못했어요.</b><span>상담원에게 보내 주시면 차례대로 답을 드립니다.</span>' +
      '<button type="button" class="sup-btn" data-ask="1">✉️ 상담원에게 보내기</button></div>';
    log(q, null, false);
    return;
  }
  box.innerHTML = (title ? '<h3 class="sup-h3">' + esc(title) + '</h3>' : '') + list.map(function(f){ return card(f, q); }).join('') +
    (q != null ? '<p class="sup-more">찾는 답이 없나요? <button type="button" class="sup-link" data-ask="1">상담원에게 보내기</button></p>' : '');
  if (list.length === 1 || (q != null && list.length)) { var d = box.querySelector('details'); if (d) d.open = true; }
}
function doSearch(){
  var q = $('supQ').value.trim();
  S.lastQ = q;
  if (q.length < 2) { $('supQ').focus(); return; }
  paintResults(search(q).map(function(x){ return x.f; }), q);
}

function paintAsk(prefill){
  var box = $('supAsk');
  if (!S.server) {
    box.innerHTML = '<div class="sup-card"><b>이메일로 보내 주세요</b><p>지금은 앱 안 문의를 준비 중입니다.</p>' + mailRow() + '</div>';
  } else if (!S.me) {
    box.innerHTML = '<div class="sup-card"><b>문의를 보내려면 로그인이 필요해요</b>' +
      '<p>답이 오면 앱 알림으로 알려 드리려고 계정이 필요합니다. 로그인 없이 쓰시려면 이메일로 보내 주세요.</p>' +
      (C.login ? '<a class="sup-btn" href="' + esc(C.login) + '">로그인하기</a>' : '') + mailRow() + '</div>';
  } else {
    box.innerHTML = '<div class="sup-card" id="supForm"><b>✉️ 상담원에게 보내기</b>' +
      '<label>어떤 일인가요?<select id="supTopic">' + cats().concat(['기타']).filter(function(v, i, a){ return a.indexOf(v) === i; })
        .map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>궁금한 점<textarea id="supBody" rows="5" maxlength="2000" placeholder="예) 어제 12개월 이용권을 샀는데 아직 체험 중으로 나와요."></textarea></label>' +
      '<p class="sup-note">휴대폰 번호 · 비밀번호 · 카드 번호는 적지 마세요. 평일 낮에 차례대로 답을 드리고, 답이 오면 알림과 아래 「내 문의」에 보입니다.</p>' +
      '<button type="button" class="sup-btn" id="supSend">보내기</button></div>';
    if (prefill) $('supBody').value = prefill;
    var guess = S.lastQ ? search(S.lastQ)[0] : null;
    $('supTopic').value = guess && guess.s >= 1 ? guess.f.cat : '기타';
    $('supSend').onclick = send;
  }
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  var b = $('supBody'); if (b) setTimeout(function(){ b.focus(); }, 300);
}
function mailRow(){
  return '<div class="sup-mail"><span>' + MAIL + '</span><button type="button" class="sup-link" data-copy="' + MAIL + '">주소 복사</button></div>';
}
async function send(){
  var body = $('supBody').value.trim(), btn = $('supSend');
  if (body.length < 2) { toast('궁금한 점을 적어 주세요.', 1); return; }
  btn.disabled = true; btn.textContent = '보내는 중…';
  var meta = { from: document.referrer ? document.referrer.split('?')[0].split('/').pop() : '', q: S.lastQ || '',
               ua: navigator.userAgent.slice(0, 160), native: !!(window.Capacitor || window.AliasNative), lang: navigator.language || '' };
  try {
    var id = await rpc('support_send', { p_app: C.app, p_topic: $('supTopic').value, p_body: body, p_ticket: null, p_meta: meta });
    $('supAsk').innerHTML = '<div class="sup-card ok"><b>✅ 잘 보냈습니다</b><p>답이 오면 앱 알림으로 알려 드립니다. 아래 「내 문의」에서도 볼 수 있어요.</p></div>';
    await loadMine();
    openTicket(id);
  } catch (e) {
    toast(errText(e), 1); btn.disabled = false; btn.textContent = '보내기';
    if (!S.server) paintAsk();
  }
}

var ST = { open: ['답변 기다리는 중', 'wait'], answered: ['답변 왔어요', 'new'], closed: ['끝난 문의', 'done'] };
function paintMine(){
  var box = $('supMine');
  if (!S.me || !S.tickets.length) { box.hidden = true; return; }
  box.hidden = false;
  var unread = S.tickets.reduce(function(n, t){ return n + (t.unread || 0); }, 0);
  box.innerHTML = '<h3 class="sup-h3">📮 내 문의' + (unread ? ' <span class="sup-badge">' + unread + '</span>' : '') + '</h3>' +
    S.tickets.map(function(t){
      var last = t.msgs && t.msgs.length ? t.msgs[t.msgs.length - 1] : null, st = ST[t.status] || ST.open;
      return '<button type="button" class="sup-tk' + (t.unread ? ' unread' : '') + '" data-t="' + esc(t.id) + '">' +
        '<span class="sup-tag ' + st[1] + '">' + st[0] + '</span><b>' + esc(t.topic) + '</b>' +
        '<span class="sup-sub">' + esc(last ? (last.a ? '답장: ' : '') + last.b : '') + '</span>' +
        '<span class="sup-when">' + when(t.updated_at) + '</span></button>';
    }).join('');
}
function openTicket(id){
  var t = S.tickets.filter(function(x){ return x.id === id; })[0];
  if (!t) return;
  S.open = id;
  var st = ST[t.status] || ST.open;
  var v = $('supThread');
  v.innerHTML = '<div class="sup-card"><div class="sup-th-top"><span class="sup-tag ' + st[1] + '">' + st[0] + '</span><b>' + esc(t.topic) + '</b>' +
    '<button type="button" class="sup-x" data-close-view="1" aria-label="닫기">✕</button></div>' +
    '<div class="sup-msgs">' + t.msgs.map(function(m){
      return '<div class="sup-m ' + (m.a ? 'admin' : 'me') + '"><span class="who">' + (m.a ? '💬 위브앱 상담원' : '나') + ' · ' + when(m.t) + '</span>' +
        '<div>' + esc(m.b).replace(/\n/g, '<br>') + '</div></div>';
    }).join('') + '</div>' +
    '<label class="sup-more-l">더 적을 말이 있으면<textarea id="supReply" rows="3" maxlength="2000" placeholder="이어서 적기"></textarea></label>' +
    '<div class="sup-row"><button type="button" class="sup-btn" id="supReplyGo">이어서 보내기</button>' +
    (t.status !== 'closed' ? '<button type="button" class="sup-btn ghost" id="supDone">👍 해결됐어요 (문의 끝내기)</button>' : '') + '</div></div>';
  v.hidden = false;
  v.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('supReplyGo').onclick = async function(){
    var b = $('supReply').value.trim(); if (b.length < 2) { toast('적을 말을 넣어 주세요.', 1); return; }
    this.disabled = true;
    try { await rpc('support_send', { p_app: C.app, p_topic: t.topic, p_body: b, p_ticket: t.id, p_meta: {} }); toast('보냈습니다.'); await loadMine(); openTicket(t.id); }
    catch (e) { toast(errText(e), 1); this.disabled = false; }
  };
  var done = $('supDone');
  if (done) done.onclick = async function(){
    try { await rpc('support_close', { p_ticket: t.id }); toast('문의를 끝냈습니다. 고맙습니다.'); await loadMine(); openTicket(t.id); }
    catch (e) { toast(errText(e), 1); }
  };
  if (t.unread) { rpc('support_seen', { p_ticket: t.id }).then(function(){ t.unread = 0; paintMine(); }, function(){}); }
}

function shell(){
  var name = NAMES[C.app] || '';
  var root = C.root || document.body;
  root.innerHTML =
    '<div class="sup">' +
    '<div class="sup-top">' + (C.home ? '<a class="sup-back" href="' + esc(C.home) + '" id="supBack" aria-label="뒤로">←</a>' : '') +
      '<div><h1>💬 ' + esc(name) + ' 고객센터</h1><p>궁금한 것을 적으면 바로 답을 찾아 드려요.</p></div></div>' +
    '<form class="sup-search" id="supSearch" autocomplete="off"><input id="supQ" type="search" enterkeyhint="search" placeholder="예) 알림이 안 와요 · 환불" aria-label="무엇이 궁금하세요?">' +
      '<button type="submit">찾기</button></form>' +
    '<div class="sup-chips" id="supChips">' + cats().map(function(c){ return '<button type="button" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
    '<div id="supRes"></div>' +
    '<div id="supThread" hidden></div>' +
    '<div id="supAsk" hidden></div>' +
    '<div id="supMine" hidden></div>' +
    '<div class="sup-cta"><b>해결이 안 되셨나요?</b><span>사람이 직접 읽고 답을 드립니다.</span>' +
      '<button type="button" class="sup-btn" data-ask="1">✉️ 상담원에게 보내기</button></div>' +
    '<footer class="sup-foot">📺 사용법 영상 — 유튜브 <a href="https://www.youtube.com/@weveapp" target="_blank" rel="noopener">@weveapp</a><br>' +
      '✉️ 이메일 ' + MAIL + '<br>위브앱솔루션 · 평일 10:00–18:00 차례대로 답변' +
      (/^(burum|nureum|baronu)$/.test(C.app) ? '<br><span class="sup-119">생명이 위급하면 119, 범죄 · 위협은 112에 먼저 신고하세요.</span>' : '') +
    '</footer></div><div class="sup-toast" id="supToast" role="status"></div>';

  $('supSearch').onsubmit = function(e){ e.preventDefault(); doSearch(); };
  root.addEventListener('click', function(e){
    var b = e.target.closest('button, a'); if (!b) return;
    if (b.dataset.cat) {
      [].forEach.call(document.querySelectorAll('#supChips button'), function(x){ x.classList.toggle('on', x === b); });
      paintResults(S.faq.filter(function(f){ return f.cat === b.dataset.cat; }), null, b.dataset.cat);
    } else if (b.dataset.ask) {
      paintAsk(S.lastQ ? S.lastQ : '');
    } else if (b.dataset.ok != null) {
      var d = b.closest('details'), fb = b.closest('.sup-fb'), ok = b.dataset.ok === '1';
      log(d.dataset.q || d.querySelector('summary').textContent, d.dataset.id, ok);
      fb.innerHTML = ok ? '<span>고맙습니다! 😊</span>'
        : '<span>죄송해요. 상담원에게 보내 주시면 직접 답을 드릴게요.</span><button type="button" data-ask="1">✉️ 상담원에게 보내기</button>';
    } else if (b.dataset.t) {
      openTicket(b.dataset.t);
    } else if (b.dataset.closeView) {
      $('supThread').hidden = true; S.open = null;
    } else if (b.dataset.copy) {
      var txt = b.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function(){ toast('복사했습니다: ' + txt); }, function(){ toast(txt); });
    }
  });
  var back = $('supBack');
  if (back) back.onclick = function(e){ if (history.length > 1 && document.referrer) { e.preventDefault(); history.back(); } };
}

SUP.start = async function(cfg){
  C = cfg || {};
  var Q = new URLSearchParams(location.search);
  if (Q.get('app') && NAMES[Q.get('app')]) C.app = Q.get('app');
  if (!NAMES[C.app]) C.app = 'burum';
  var data = (window.SUPFAQ || {})[C.app];
  S.faq = data ? data.items.slice() : [];
  prep();
  document.documentElement.style.setProperty('--sup-acc', C.color || '#11805a');
  shell();
  try {
    var s = C.sb ? (await C.sb.auth.getSession()).data.session : null;
    S.me = s && s.user ? s.user : null;
  } catch (e) { S.me = null; }
  if (S.me) await loadMine();
  if (Q.get('q')) { $('supQ').value = Q.get('q'); doSearch(); }
  if (Q.get('t')) openTicket(Q.get('t'));
  else if (Q.get('ask')) paintAsk();
};
})();
