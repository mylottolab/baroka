/* =====================================================================
   Aliascall — 통화 녹음 · 녹화 (상대가 허락해야만)            2026-10-09
   부름(alias_call.js · alias_call.html)의 방식을 그대로 옮겼습니다.

   약속
     ① 몰래 시작할 수 없습니다. 상대(여럿이면 **모두**)가 허락해야 담습니다.
     ② 담는 동안 모든 사람 화면에 "🔴 녹음 중" 이 떠 있고, **누구든** 멈춥니다.
     ③ 보관은 15 · 30 · 90일. 받는 쪽은 **더 짧게만** 고칠 수 있습니다.
     ④ 파일은 비공개 저장소에 두고, 그 대화 사람만 듣고 지웁니다.
     ⑤ 여럿이 통화 중에 새 사람이 들어오면(그 사람은 허락하지 않았으니) 멈추고 저장합니다.

   쓰는 곳
     aliascall_connect.html          발견자 ↔ 주인 (발견자 쪽)
     aliascall_incoming_calls.html   발견자 ↔ 주인 (주인 쪽)
     aliascall_hotline_room.html     보안회선 (2~4명)

   화면이 할 일 (자세한 것은 각 화면의 "🔴 녹음" 표시를 보세요)
     • 통화 신호 길(channel)에  .on('broadcast', { event:'rec' }, ({payload}) => ACRec.signal(payload))
       를 subscribe() **전에** 붙입니다.
     • 통화가 이어지면 ACRec.begin({...}), 끊을 때 **맨 먼저** ACRec.end().
     • 대화창 어딘가에 ACRec.listButton(자리, {...}) 로 "🔴 녹음함" 단추를 둡니다.

   신호 (broadcast event 'rec', payload.k)
     ask  "녹음합시다. ○일"        yes  "좋습니다"         cut  "○일이면 좋습니다"(1:1)
     go   "그렇게 합시다"          no   "거절합니다"       on   "담기 시작했습니다"
     stop "멈춥시다"(누구든)       off  "멈추고 저장했습니다"
   ===================================================================== */
(function(){
  'use strict';

  var FN = 'aliascall-call-record';
  var DAYS = [15, 30, 90];
  var VIDEO_BPS = 400000, AUDIO_BPS = 48000, MAX_BYTES = 45 * 1024 * 1024;

  var C = { sb: null, url: '', lang: null };
  var S = null;          // 지금 통화 { o, rid, asking, askDays, yes:{}, recorder… }
  var R = null;          // 지금 담는 중 { mr, ctx, chunks, mime, video, startedAt, days, rid, consent }
  var watchTimer = null, armTimer = null;

  /* ── 말 ─────────────────────────────────────────────────────── */
  var T = {
    btn:      ['🔴 녹음', '🔴 Record'],
    askTtl:   ['이 통화를 녹음합니다', 'Record this call'],
    askVid:   ['이 영상통화를 녹화합니다', 'Record this video call'],
    askNote:  ['상대에게 알리고 허락을 받습니다. 몰래 녹음할 수 없습니다.', 'They are told and must agree. Silent recording is not possible.'],
    askGroup: ['통화 중인 모든 분이 허락해야 시작됩니다.', 'Everyone in the call must agree before it starts.'],
    askVidN:  ['상대 얼굴과 모두의 목소리가 담깁니다. 한 번에 약 14분까지.', 'Their video and everyone’s voice are recorded, up to about 14 minutes.'],
    howLong:  ['얼마나 보관할까요? 지나면 저절로 지워집니다.', 'Keep it for how long? It is deleted automatically after that.'],
    days:     ['{n}일', '{n} days'],
    send:     ['녹음 신청하기', 'Ask to record'],
    sendV:    ['녹화 신청하기', 'Ask to record video'],
    cancel:   ['그만두기', 'Cancel'],
    waiting:  ['상대의 대답을 기다리고 있습니다…', 'Waiting for their answer…'],
    gotTtl:   ['🔴 녹음 요청', '🔴 Recording request'],
    gotTtlV:  ['🔴 녹화 요청', '🔴 Video recording request'],
    gotBody:  ['{who}님이 이 통화를 녹음하려고 합니다.\n{n}일 동안 보관됩니다.', '{who} wants to record this call.\nIt will be kept for {n} days.'],
    gotVid:   ['{who}님이 이 영상통화를 녹화하려고 합니다.\n{n}일 동안 보관됩니다.', '{who} wants to record this video call.\nIt will be kept for {n} days.'],
    got1:     ['녹음은 이 대화의 모든 분이 듣고 내려받을 수 있습니다', 'Everyone in this conversation can play and download it'],
    got2:     ['누구든 언제든 멈출 수 있고, 각자 자기 녹음함에서 지울 수 있습니다', 'Anyone can stop it, and each person can delete it from their own list'],
    got3:     ['허락하지 않으면 녹음되지 않습니다', 'Nothing is recorded unless you agree'],
    gotV1:    ['내 얼굴과 목소리가 담깁니다', 'Your face and voice are recorded'],
    yes:      ['허락합니다', 'Allow'],
    yesShort: ['{n}일이면 허락', 'Allow for {n} days'],
    no:       ['거절합니다', 'Refuse'],
    cutTtl:   ['{n}일로 하자고 합니다', 'They suggest {n} days'],
    cutBody:  ['{who}님이 보관 기간을 {n}일로 줄여 허락했습니다. 그렇게 할까요?', '{who} agreed for a shorter {n} days. Go ahead?'],
    cutYes:   ['그렇게 합시다', 'Yes, start'],
    cutNo:    ['그만두겠습니다', 'No, cancel'],
    refused:  ['{who}님이 녹음을 거절했습니다.', '{who} refused the recording.'],
    refused0: ['상대가 녹음을 거절했습니다.', 'They refused the recording.'],
    noAnswer: ['대답이 없어 녹음 신청을 거두었습니다.', 'No answer, so the request was withdrawn.'],
    gaveUp:   ['녹음을 그만두었습니다.', 'Recording was called off.'],
    onMe:     ['🔴 녹음 중 · {n}일 뒤 지워집니다', '🔴 Recording · deleted after {n} days'],
    onMeVid:  ['🔴 녹화 중 · {n}일 뒤 지워집니다 · 최대 14분', '🔴 Recording video · deleted after {n} days · max 14 min'],
    onThey:   ['🔴 {who}님이 녹음 중 · {n}일 뒤 지워집니다', '🔴 {who} is recording · deleted after {n} days'],
    onTheyV:  ['🔴 {who}님이 녹화 중 · {n}일 뒤 지워집니다', '🔴 {who} is recording video · deleted after {n} days'],
    stop:     ['멈추기', 'Stop'],
    stopped:  ['녹음을 멈췄습니다.', 'Recording stopped.'],
    full:     ['녹화가 한도(약 14분)에 닿아 저장합니다.', 'Reached the limit (about 14 min). Saving.'],
    newcomer: ['새로 들어온 분이 있어 녹음을 멈추고 저장합니다.', 'Someone new joined, so the recording stopped and is being saved.'],
    saving:   ['녹음을 저장하는 중…', 'Saving the recording…'],
    saved:    ['녹음을 저장했습니다. 대화창의 🔴 녹음함에서 들을 수 있습니다.', 'Saved. Play it from 🔴 Recordings in the chat.'],
    savedThey:['{who}님이 녹음을 저장했습니다. 🔴 녹음함에서 들을 수 있습니다.', '{who} saved the recording. Play it from 🔴 Recordings.'],
    failed:   ['녹음을 저장하지 못했습니다', 'Could not save the recording'],
    noSupport:['이 폰(브라우저)에서는 녹음을 쓸 수 없습니다.', 'Recording is not supported on this phone/browser.'],
    notReady: ['통화가 이어진 뒤에 신청할 수 있습니다.', 'You can ask once the call is connected.'],
    listBtn:  ['🔴 녹음함', '🔴 Recordings'],
    listTtl:  ['🔴 통화 녹음함', '🔴 Call recordings'],
    listNote: ['허락을 받고 남긴 녹음만 있습니다. 정한 날이 지나면 저절로 지워집니다.', 'Only recordings made with consent. Each is deleted automatically on its date.'],
    listNone: ['아직 녹음이 없습니다.', 'No recordings yet.'],
    listErr:  ['녹음 목록을 읽지 못했습니다', 'Could not load recordings'],
    audio:    ['🎙 음성 녹음', '🎙 Audio'],
    video:    ['🎥 영상 녹화', '🎥 Video'],
    by:       ['{who}님 신청', 'asked by {who}'],
    left:     ['{d}일 뒤 삭제', 'deleted in {d} days'],
    play:     ['▶ 듣기', '▶ Play'],
    playV:    ['▶ 보기', '▶ Play'],
    save:     ['⬇ 저장', '⬇ Save'],
    del:      ['🗑 지우기', '🗑 Delete'],
    delAsk:   ['이 녹음을 지울까요?\n내 녹음함에서 사라지고 되돌릴 수 없습니다.', 'Delete this recording?\nIt disappears from your list and cannot be undone.'],
    close:    ['닫기', 'Close'],
    camOff:   ['📷 카메라 끄기', '📷 Camera off'],
    camOn:    ['📷 카메라 켜기', '📷 Camera on'],
    camTheyOff:['📷 {who}님이 카메라를 껐습니다 · 목소리만 들립니다', '📷 {who} turned their camera off · voice only'],
    camMeOff: ['📷 내 카메라를 껐습니다 · 상대에게 목소리만 갑니다', '📷 Your camera is off · they hear your voice only'],
    me:       ['나', 'Me'],
    other:    ['상대', 'The other person'],
  };
  function en(){
    try { if (typeof C.lang === 'function') return C.lang() === 'en'; } catch (e) {}
    try { return (localStorage.getItem('aliascall_lang') || 'ko') === 'en'; } catch (e) { return false; }
  }
  function t(k, v){
    var s = (T[k] || [k, k])[en() ? 1 : 0];
    if (v) Object.keys(v).forEach(function(x){ s = s.split('{' + x + '}').join(String(v[x])); });
    return s;
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function $(id){ return document.getElementById(id); }

  /* ── 모양 ───────────────────────────────────────────────────── */
  function css(){
    if ($('acrecCss')) return;
    var st = document.createElement('style');
    st.id = 'acrecCss';
    st.textContent =
      '#acrecBg{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.66)}' +
      '#acrecBox{display:none;position:fixed;z-index:2147483001;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 40px);max-width:380px;max-height:86vh;overflow:auto;box-sizing:border-box;background:#14302E;color:#EAF4F1;border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:22px 20px;font-family:inherit;box-shadow:0 18px 50px rgba(0,0,0,.45)}' +
      '#acrecBox h3{margin:0 0 12px;font-size:18px;font-weight:800;line-height:1.45;white-space:pre-line}' +
      '#acrecBox p{margin:0 0 12px;font-size:14.5px;line-height:1.7;word-break:keep-all;white-space:pre-line}' +
      '#acrecBox ul{margin:0 0 16px;padding-left:19px;font-size:13.5px;line-height:1.8;opacity:.9}' +
      '#acrecBox .d{display:flex;gap:8px;margin:0 0 16px}' +
      '#acrecBox .d button{flex:1;padding:12px 0;border-radius:12px;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#EAF4F1;font-size:15px;font-weight:700}' +
      '#acrecBox .d button.on{background:rgba(143,227,176,.2);color:#8FE3B0;border-color:rgba(143,227,176,.6)}' +
      '#acrecBox .s{display:flex;flex-direction:column;gap:9px}' +
      '#acrecBox .s button{width:100%;padding:14px 12px;border-radius:13px;cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#EAF4F1;font-size:15px;font-weight:700}' +
      '#acrecBox .s button.go{background:rgba(143,227,176,.2);color:#8FE3B0;border-color:rgba(143,227,176,.55)}' +
      '#acrecBox .s button.bad{background:rgba(255,120,120,.14);color:#FFB4B4;border-color:rgba(255,120,120,.45)}' +
      '#acrecBox .w{text-align:center;font-size:14.5px;opacity:.75;padding:12px 0}' +
      '#acrecBar{display:none;position:fixed;z-index:2147482990;left:50%;top:calc(env(safe-area-inset-top, 0px) + 10px);transform:translateX(-50%);width:min(440px, calc(100% - 24px));box-sizing:border-box;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px 9px 14px;border-radius:22px;background:rgba(196,55,43,.94);color:#fff;font-size:13.5px;font-weight:700;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.3)}' +
      '#acrecBar.on{display:flex}' +
      '#acrecCam{display:none;position:fixed;z-index:2147482989;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 100px);text-align:center;transform:translateX(-50%);width:max-content;max-width:calc(100% - 32px);box-sizing:border-box;padding:8px 14px;border-radius:18px;background:rgba(18,48,46,.9);color:#fff;font-size:13px;font-weight:700;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.25)}' +
      '#acrecCam.on{display:block}' +
      '.acrec-cam.cam-off{background:#E8734A !important;color:#fff !important}' +
      '#acrecBar.ok{background:rgba(31,111,107,.96)}' +
      '#acrecBar.err{background:rgba(120,40,40,.96)}' +
      '#acrecBar button{flex:0 0 auto;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.15);color:#fff;border-radius:16px;padding:5px 12px;font-size:12.5px;font-weight:700;cursor:pointer}' +
      '.acrec-btn.rec-on{background:#C4372B !important;color:#fff !important}' +
      '.acrec-list-btn{border:1px solid rgba(196,55,43,.45);background:rgba(196,55,43,.08);color:#C4372B;border-radius:16px;padding:5px 11px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}' +
      '#acrecBox .it{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,.04)}' +
      '#acrecBox .it .t1{font-size:14.5px;font-weight:800;margin-bottom:3px}' +
      '#acrecBox .it .t2{font-size:12.5px;opacity:.75;line-height:1.6}' +
      '#acrecBox .it .b{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap}' +
      '#acrecBox .it .b button{flex:1;min-width:70px;padding:9px 6px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#EAF4F1;font-size:13px;font-weight:700}' +
      '#acrecBox .it .b button.bad{color:#FFB4B4;border-color:rgba(255,120,120,.4)}' +
      '#acrecBox .it audio,#acrecBox .it video{width:100%;margin-top:9px;border-radius:10px;background:#000}';
    document.head.appendChild(st);
    var bg = document.createElement('div'); bg.id = 'acrecBg';
    var bx = document.createElement('div'); bx.id = 'acrecBox';
    var bar = document.createElement('div'); bar.id = 'acrecBar';
    bar.innerHTML = '<span></span><button type="button"></button>';
    var cam = document.createElement('div'); cam.id = 'acrecCam';
    document.body.appendChild(bg); document.body.appendChild(bx); document.body.appendChild(bar); document.body.appendChild(cam);
    bg.addEventListener('click', function(){ if (!(S && S.asking) && !boxLocked) show(false); });
    bar.querySelector('button').addEventListener('click', onBarButton);
  }
  var boxLocked = false;
  function show(on, locked){
    css();
    boxLocked = !!(on && locked);
    $('acrecBg').style.display = on ? 'block' : 'none';
    $('acrecBox').style.display = on ? 'block' : 'none';
    if (!on) {   // 재생 중인 것이 있으면 멈춥니다
      $('acrecBox').querySelectorAll('audio,video').forEach(function(m){ try { m.pause(); } catch (e) {} });
    }
  }
  function box(html, locked){ css(); $('acrecBox').innerHTML = html; show(true, locked); }

  var barTimer = null, barMode = '';
  function bar(text, mode, btn){
    css();
    var b = $('acrecBar');
    clearTimeout(barTimer);
    barMode = mode;
    b.className = 'on' + (mode === 'ok' ? ' ok' : mode === 'err' ? ' err' : '');
    b.querySelector('span').textContent = text;
    var k = b.querySelector('button');
    k.style.display = btn ? '' : 'none';
    k.textContent = btn || '';
    if (mode === 'ok' || mode === 'err' || mode === 'info') barTimer = setTimeout(function(){ b.className = ''; }, mode === 'err' ? 9000 : 6000);
  }
  function barOff(){ var b = $('acrecBar'); if (b) b.className = ''; }
  function onBarButton(){
    if (barMode === 'rec') {           // 🔴 누구든 멈춥니다
      if (R) { finish('stopped'); }
      else if (S) { send({ k: 'stop', rid: S.theirOn || S.rid }); barOff(); }
    }
  }

  /* ── 통화 신호 ───────────────────────────────────────────────── */
  function send(p){
    if (!S || !S.o.channel) return;
    try {
      p.from = S.o.myId || 'me';
      p.rid = p.rid || S.rid;
      S.o.channel.send({ type: 'broadcast', event: 'rec', payload: p });
    } catch (e) { console.warn('[rec] 신호를 못 보냈습니다', e); }
  }
  function myName(){ try { return (S && S.o.myName && S.o.myName()) || t('other'); } catch (e) { return t('other'); } }
  function nameOf(id, fallback){
    try { if (S && S.o.peerName) { var n = S.o.peerName(id); if (n) return n; } } catch (e) {}
    return fallback || t('other');
  }
  function peers(){
    try { return (S && S.o.group && S.o.peerIds) ? (S.o.peerIds() || []).filter(function(x){ return x && x !== S.o.myId; }) : ['peer']; }
    catch (e) { return ['peer']; }
  }

  function supported(){
    return !!(window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));
  }

  /* ① 내가 신청 */
  function ask(){
    if (!S) return;
    if (!supported()) { bar(t('noSupport'), 'err'); return; }
    if (R) return;
    if (!connected()) { bar(t('notReady'), 'info'); return; }
    var many = peers().length > 1;
    var vid = !!S.o.video && !many;
    S.askDays = 90;
    box(
      '<h3>' + esc(t(vid ? 'askVid' : 'askTtl')) + '</h3>' +
      '<p>' + esc(t('askNote')) + '</p>' +
      (many ? '<p style="opacity:.85;font-size:13.5px">' + esc(t('askGroup')) + '</p>' : '') +
      (vid ? '<p style="opacity:.8;font-size:13.5px">' + esc(t('askVidN')) + '</p>' : '') +
      '<p style="opacity:.75;font-size:13.5px">' + esc(t('howLong')) + '</p>' +
      '<div class="d">' + DAYS.map(function(d){
        return '<button type="button" data-d="' + d + '"' + (d === 90 ? ' class="on"' : '') + '>' + esc(t('days', { n: d })) + '</button>';
      }).join('') + '</div>' +
      '<div class="s"><button type="button" class="go" id="acrecGo">' + esc(t(vid ? 'sendV' : 'send')) + '</button>' +
      '<button type="button" id="acrecNo">' + esc(t('cancel')) + '</button></div>');
    $('acrecBox').querySelectorAll('[data-d]').forEach(function(b){
      b.addEventListener('click', function(){
        S.askDays = Number(b.getAttribute('data-d'));
        $('acrecBox').querySelectorAll('[data-d]').forEach(function(x){ x.classList.toggle('on', Number(x.getAttribute('data-d')) === S.askDays); });
      });
    });
    $('acrecNo').addEventListener('click', function(){ show(false); });
    $('acrecGo').addEventListener('click', function(){
      S.rid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      S.asking = true;
      S.yes = {};
      S.askPeers = peers();
      send({ k: 'ask', days: S.askDays, who: myName(), vid: vid ? 1 : 0, group: many ? 1 : 0 });
      box('<div class="w">' + esc(t('waiting')) + '</div><div class="s"><button type="button" id="acrecWd">' + esc(t('cancel')) + '</button></div>', true);
      $('acrecWd').addEventListener('click', function(){ withdraw(t('gaveUp')); });
      clearTimeout(S.askTimer);
      S.askTimer = setTimeout(function(){ if (S && S.asking) withdraw(t('noAnswer')); }, 60000);
    });
  }
  function withdraw(msg){
    if (!S) return;
    send({ k: 'no' });
    S.asking = false; clearTimeout(S.askTimer);
    show(false);
    if (msg) bar(msg, 'info');
  }

  /* ② 상대가 신청해 왔을 때 */
  function got(p){
    var days = DAYS.indexOf(Number(p.days)) >= 0 ? Number(p.days) : 90;
    var who = p.who || nameOf(p.from);
    var vid = !!p.vid;
    var group = !!p.group;
    S.theirRid = p.rid; S.theirFrom = p.from;
    var shorter = group ? [] : DAYS.filter(function(d){ return d < days; }).sort(function(a, b){ return b - a; });
    box(
      '<h3>' + esc(t(vid ? 'gotTtlV' : 'gotTtl')) + '</h3>' +
      '<p>' + esc(t(vid ? 'gotVid' : 'gotBody', { who: who, n: days })) + '</p>' +
      '<ul>' + (vid ? '<li>' + esc(t('gotV1')) + '</li>' : '') +
        '<li>' + esc(t('got1')) + '</li><li>' + esc(t('got2')) + '</li><li>' + esc(t('got3')) + '</li></ul>' +
      '<div class="s"><button type="button" class="go" id="acrecY">' + esc(t('yes')) + '</button>' +
        shorter.map(function(d){ return '<button type="button" data-cut="' + d + '">' + esc(t('yesShort', { n: d })) + '</button>'; }).join('') +
        '<button type="button" class="bad" id="acrecN">' + esc(t('no')) + '</button></div>', true);
    $('acrecY').addEventListener('click', function(){ send({ k: 'yes', rid: p.rid, days: days }); show(false); });
    $('acrecBox').querySelectorAll('[data-cut]').forEach(function(b){
      b.addEventListener('click', function(){
        send({ k: 'cut', rid: p.rid, days: Number(b.getAttribute('data-cut')) });
        box('<div class="w">' + esc(t('waiting')) + '</div>', true);
        setTimeout(function(){ if ($('acrecBox').querySelector('.w') && !R) show(false); }, 60000);
      });
    });
    $('acrecN').addEventListener('click', function(){ send({ k: 'no', rid: p.rid }); show(false); });
  }

  /* ③ 줄여서 왔을 때 — 신청한 쪽에 한 번 더 */
  function cut(p){
    var days = Number(p.days) || 15;
    var who = nameOf(p.from, t('other'));
    box(
      '<h3>' + esc(t('cutTtl', { n: days })) + '</h3>' +
      '<p>' + esc(t('cutBody', { who: who, n: days })) + '</p>' +
      '<div class="s"><button type="button" class="go" id="acrecCy">' + esc(t('cutYes')) + '</button>' +
      '<button type="button" class="bad" id="acrecCn">' + esc(t('cutNo')) + '</button></div>', true);
    $('acrecCy').addEventListener('click', function(){
      S.asking = false; clearTimeout(S.askTimer);
      send({ k: 'go', days: days });
      show(false);
      start(days, [p.from]);
    });
    $('acrecCn').addEventListener('click', function(){ withdraw(t('gaveUp')); });
  }

  var ACRec_signal = function(p){
    if (!p || !p.k || !S) return;
    if (p.to && S.o.myId && p.to !== S.o.myId) return;
    var k = p.k;
    if (k === 'cam') { camPill(p.off ? t('camTheyOff', { who: p.who || nameOf(p.from) }) : ''); return; }
    if (k === 'ask') { if (!R) got(p); return; }
    // 내 신청에 대한 답
    if ((k === 'yes' || k === 'cut' || k === 'no') && S.asking && p.rid === S.rid) {
      if (k === 'no') {
        S.asking = false; clearTimeout(S.askTimer); show(false);
        var manyNo = S.askPeers && S.askPeers.length > 1;
        bar(manyNo ? t('refused', { who: nameOf(p.from) }) : t('refused0'), 'info');
        if (manyNo) send({ k: 'no' });     // 다른 분들 창도 닫습니다
        return;
      }
      if (k === 'cut' && !(S.askPeers && S.askPeers.length > 1)) { cut(p); return; }
      if (k === 'yes') {
        S.yes[p.from] = true;
        var need = S.o.group ? S.askPeers : null;   // 여럿이면 모두
        if (!need || need.every(function(id){ return S.yes[id]; })) {
          S.asking = false; clearTimeout(S.askTimer); show(false);
          start(S.askDays, Object.keys(S.yes));
        }
        return;
      }
      return;
    }
    // 상대 신청이 거두어졌을 때 (내 창이 아직 떠 있으면 닫습니다)
    if (k === 'no' && S.theirRid && p.rid === S.theirRid && !R) { show(false); bar(t('gaveUp'), 'info'); return; }
    if (k === 'go' && S.theirRid && p.rid === S.theirRid) { show(false); return; }
    if (k === 'on') {
      S.theirOn = p.rid; show(false);
      bar(t(p.vid ? 'onTheyV' : 'onThey', { who: p.who || nameOf(p.from), n: p.days }), 'rec', t('stop'));
      return;
    }
    if (k === 'stop') { if (R && p.rid === R.rid) finish('stopped'); return; }
    if (k === 'off') {
      if (S.theirOn === p.rid) { S.theirOn = null; barOff(); }
      if (p.saved) bar(t('savedThey', { who: p.who || nameOf(p.from) }), 'ok');
      return;
    }
  };

  function connected(){
    try {
      return (S.o.pcs() || []).some(function(pc){
        return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
      });
    } catch (e) { return false; }
  }

  /* ── ④ 담기 ─────────────────────────────────────────────────── */
  function remoteTracks(kind){
    var out = [];
    try {
      (S.o.pcs() || []).forEach(function(pc){
        if (!pc || !pc.getReceivers) return;
        pc.getReceivers().forEach(function(r){
          if (r.track && r.track.kind === kind && r.track.readyState === 'live') out.push(r.track);
        });
      });
    } catch (e) {}
    return out;
  }

  async function start(days, consent){
    if (R || !S) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      try { if (ctx.state === 'suspended') await ctx.resume(); } catch (e) {}
      var dest = ctx.createMediaStreamDestination();
      var n = 0;
      var local = S.o.local && S.o.local();
      if (local && local.getAudioTracks().length) { ctx.createMediaStreamSource(new MediaStream(local.getAudioTracks())).connect(dest); n++; }
      remoteTracks('audio').forEach(function(tr){ ctx.createMediaStreamSource(new MediaStream([tr])).connect(dest); n++; });
      if (!n) { try { ctx.close(); } catch (e) {} throw new Error(t('noSupport')); }

      var stream = new MediaStream();
      dest.stream.getAudioTracks().forEach(function(tr){ stream.addTrack(tr); });
      var vids = (S.o.video && peers().length <= 1) ? remoteTracks('video') : [];
      var wantVideo = vids.length > 0;
      if (wantVideo) stream.addTrack(vids[0]);

      var types = wantVideo ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', '']
                            : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
      var mime = '';
      for (var i = 0; i < types.length; i++) { if (!types[i] || MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; } }
      var conf = { audioBitsPerSecond: AUDIO_BPS };
      if (mime) conf.mimeType = mime;
      if (wantVideo) conf.videoBitsPerSecond = VIDEO_BPS;
      var mr = new MediaRecorder(stream, conf);
      var chunks = [], got = 0;
      R = { mr: mr, ctx: ctx, chunks: chunks, mime: mr.mimeType || mime, video: wantVideo, startedAt: Date.now(),
            days: days, rid: S.rid, consent: consent || [], o: S.o };
      mr.ondataavailable = function(e){
        if (!e.data || !e.data.size) return;
        chunks.push(e.data); got += e.data.size;
        if (got >= MAX_BYTES && R && R.mr === mr) { bar(t('full'), 'info'); finish('full'); }
      };
      mr.start(1000);
      console.log('[rec] 시작:', R.mime || '기본', '· 소리 ' + n + '줄기', wantVideo ? '· 영상' : '');
      send({ k: 'on', days: days, who: myName(), vid: wantVideo ? 1 : 0 });
      bar(t(wantVideo ? 'onMeVid' : 'onMe', { n: days }), 'rec', t('stop'));
      paintBtn();
      if (S.o.group) {
        clearInterval(watchTimer);
        watchTimer = setInterval(function(){
          if (!R || !S) { clearInterval(watchTimer); return; }
          var now = peers();
          var stranger = now.some(function(id){ return R.consent.indexOf(id) < 0; });
          if (stranger) { bar(t('newcomer'), 'info'); finish('newcomer'); }
        }, 1500);
      }
    } catch (e) {
      console.error('[rec] 시작 실패', e);
      R = null;
      bar((e && e.message) || t('noSupport'), 'err');
      send({ k: 'off' });
    }
  }

  function stopRecorder(){
    return new Promise(function(done){
      var r = R;
      if (!r) { done(null); return; }
      R = null;
      clearInterval(watchTimer);
      r.mr.onstop = function(){
        try { r.ctx.close(); } catch (e) {}
        done({ r: r, blob: new Blob(r.chunks, { type: r.mime || (r.video ? 'video/webm' : 'audio/webm') }), ms: Date.now() - r.startedAt });
      };
      try { if (r.mr.state !== 'inactive') r.mr.stop(); else r.mr.onstop(); }
      catch (e) { try { r.ctx.close(); } catch (e2) {} done(null); }
    });
  }

  async function finish(why){
    if (!R) return;
    var o = R.o;
    var res = await stopRecorder();
    paintBtn();
    if (!res || !res.blob || res.blob.size < 2000) {
      barOff(); bar(t('stopped'), 'info');
      sendVia(o, { k: 'off', rid: res && res.r.rid, saved: 0 });
      return;
    }
    bar(t('saving'), 'info');
    try {
      await upload(o, res);
      bar(t('saved'), 'ok');
      sendVia(o, { k: 'off', rid: res.r.rid, saved: 1, who: myNameOf(o) });
      try { if (o.onSaved) o.onSaved({ days: res.r.days, video: res.r.video }); } catch (e) {}
    } catch (e) {
      console.error('[rec] 저장 실패', e);
      bar(t('failed') + ' — ' + ((e && e.message) || ''), 'err');
      sendVia(o, { k: 'off', rid: res.r.rid, saved: 0 });
    }
  }
  function myNameOf(o){ try { return (o.myName && o.myName()) || ''; } catch (e) { return ''; } }
  function sendVia(o, p){
    try {
      if (!o.channel) return;
      p.from = o.myId || 'me';
      o.channel.send({ type: 'broadcast', event: 'rec', payload: p });
    } catch (e) {}
  }

  /* ── 서버 ───────────────────────────────────────────────────── */
  async function call(ctx, action, body){
    var sc = (typeof ctx.scope === 'function') ? ctx.scope() : ctx.scope;
    if (!sc || !sc.scopeId) throw new Error(en() ? 'No conversation' : '대화를 찾지 못했습니다');
    var headers = { 'Content-Type': 'application/json' };
    var tok = null;
    try { tok = ctx.token ? await ctx.token() : null; } catch (e) {}
    if (tok) headers.Authorization = 'Bearer ' + tok;
    var res = await fetch(C.url + '/functions/v1/' + FN, {
      method: 'POST', headers: headers,
      body: JSON.stringify(Object.assign({ action: action }, sc, body || {})),
    });
    var data = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  async function upload(o, res){
    var blob = res.blob, enc = false;
    if (o.encrypt) {
      var buf = await blob.arrayBuffer();
      var e = await o.encrypt(buf);
      if (e) { blob = new Blob([e], { type: 'application/octet-stream' }); enc = true; }
    }
    var mime = res.blob.type || (res.r.video ? 'video/webm' : 'audio/webm');
    var p = await call(o, 'prepare', { kind: res.r.video ? 'video' : 'audio', mime: mime, keepDays: res.r.days,
                                       encrypted: enc, label: myNameOf(o) });
    var up = await C.sb.storage.from('call-recordings').uploadToSignedUrl(p.path, p.token, blob,
      { contentType: enc ? 'application/octet-stream' : mime });
    if (up.error) throw up.error;
    await call(o, 'done', { id: p.id, bytes: blob.size, durationMs: res.ms });
  }

  /* ── 🔴 녹음 단추 ────────────────────────────────────────────── */
  function paintBtn(){
    var b = S && S.btn;
    if (!b) return;
    b.classList.toggle('rec-on', !!R);
    b.title = t('btn');
    b.setAttribute('aria-label', t('btn'));
  }
  function mountBtn(where){
    if (!where) return null;
    var b = where.querySelector('.acrec-btn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      var ref = where.querySelector('button');
      b.className = 'acrec-btn ' + (ref ? ref.className.replace(/\b(hangup|active-off|active|on|end|danger)\b/g, '').trim() : '');
      b.textContent = '🔴';
      var hang = where.querySelector('.hangup, [id*="angup"], [id*="endCall"], .end, .danger');
      if (hang && hang.parentNode === where) where.insertBefore(b, hang); else where.appendChild(b);
    }
    b.onclick = function(){ if (R) finish('stopped'); else ask(); };
    b.style.display = '';
    return b;
  }

  /* ── 📷 카메라 끄고 켜기 (영상통화에서 누구든) ──────────────────
     내 영상 줄기만 잠시 멈춥니다(enabled=false). 통화는 그대로이고 목소리는 갑니다.
     상대 화면에는 "카메라를 껐습니다" 가 뜹니다. */
  var camTimer = null, camTheirs = '';
  function camPill(text, mine){
    css();
    var c = $('acrecCam');
    clearTimeout(camTimer);
    if (!mine) camTheirs = text || '';
    c.textContent = text || '';
    c.className = text ? 'on' : '';
    /* 내 카메라 안내는 잠깐만 — 그 뒤 상대 상태(있으면)로 돌아갑니다 */
    if (mine && text) camTimer = setTimeout(function(){ c.textContent = camTheirs; c.className = camTheirs ? 'on' : ''; }, 3500);
  }
  function mountCam(where){
    if (!where) return null;
    var b = where.querySelector('.acrec-cam');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      var ref = where.querySelector('button');
      b.className = 'acrec-cam ' + (ref ? ref.className.replace(/\b(hangup|active-off|active|on|end|danger|acrec-btn|rec-on)\b/g, '').trim() : '');
      b.textContent = '📷';
      var rec = where.querySelector('.acrec-btn');
      if (rec) where.insertBefore(b, rec); else where.appendChild(b);
    }
    b.style.display = '';
    b.classList.remove('cam-off');
    b.title = t('camOff'); b.setAttribute('aria-label', t('camOff'));
    b.onclick = function(){
      if (!S) return;
      S.camOff = !S.camOff;
      try { var l = S.o.local && S.o.local(); if (l) l.getVideoTracks().forEach(function(tr){ tr.enabled = !S.camOff; }); } catch (e) {}
      b.classList.toggle('cam-off', S.camOff);
      b.title = t(S.camOff ? 'camOn' : 'camOff'); b.setAttribute('aria-label', b.title);
      send({ k: 'cam', off: S.camOff ? 1 : 0, who: myName() });
      camPill(S.camOff ? t('camMeOff') : '', true);
    };
    return b;
  }

  /* ── 🔴 녹음함 ──────────────────────────────────────────────── */
  function fmtMs(ms){
    var s = Math.round((ms || 0) / 1000), m = Math.floor(s / 60);
    s = s % 60;
    return en() ? (m ? m + 'm ' : '') + s + 's' : (m ? m + '분 ' : '') + s + '초';
  }
  function fmtDate(iso){
    try {
      var d = new Date(iso);
      return d.toLocaleString(en() ? 'en-US' : 'ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  async function openList(ctx){
    box('<h3>' + esc(t('listTtl')) + '</h3><p style="font-size:13px;opacity:.75">' + esc(t('listNote')) + '</p><div id="acrecList"><div class="w">…</div></div>' +
        '<div class="s" style="margin-top:6px"><button type="button" id="acrecClose">' + esc(t('close')) + '</button></div>');
    $('acrecClose').addEventListener('click', function(){ show(false); });
    var wrap = $('acrecList');
    try {
      var d = await call(ctx, 'list');
      var items = d.items || [];
      if (!items.length) { wrap.innerHTML = '<div class="w">' + esc(t('listNone')) + '</div>'; return; }
      wrap.innerHTML = items.map(function(it){
        var left = Math.max(0, Math.ceil((new Date(it.purge_on).getTime() - Date.now()) / 86400000));
        return '<div class="it" data-id="' + esc(it.id) + '">' +
          '<div class="t1">' + esc(t(it.kind === 'video' ? 'video' : 'audio')) + ' · ' + esc(fmtMs(it.duration_ms)) + '</div>' +
          '<div class="t2">' + esc(fmtDate(it.created_at)) + (it.label ? ' · ' + esc(t('by', { who: it.label })) : '') +
            ' · ' + esc(t('left', { d: left })) + '</div>' +
          '<div class="b"><button type="button" data-a="play">' + esc(t(it.kind === 'video' ? 'playV' : 'play')) + '</button>' +
          '<button type="button" data-a="save">' + esc(t('save')) + '</button>' +
          '<button type="button" class="bad" data-a="del">' + esc(t('del')) + '</button></div></div>';
      }).join('');
      wrap.querySelectorAll('.it').forEach(function(row){
        var id = row.getAttribute('data-id');
        var it = items.filter(function(x){ return x.id === id; })[0];
        row.querySelectorAll('[data-a]').forEach(function(btn){
          btn.addEventListener('click', async function(){
            var a = btn.getAttribute('data-a');
            btn.disabled = true;
            try {
              if (a === 'del') {
                if (!confirm(t('delAsk'))) return;
                await call(ctx, 'delete', { id: id });
                row.remove();
                if (!wrap.querySelector('.it')) wrap.innerHTML = '<div class="w">' + esc(t('listNone')) + '</div>';
                return;
              }
              var src = await mediaUrl(ctx, id, it);
              var ext = /mp4/.test(it.mime || '') ? 'mp4' : 'webm';
              var name = 'Aliascall_' + (it.kind === 'video' ? 'video' : 'call') + '_' + String(it.created_at || '').slice(0, 10) + '.' + ext;
              if (a === 'save') {
                if (window.ACFiles && ACFiles.download) ACFiles.download(src, name);
                else { var l = document.createElement('a'); l.href = src; l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
                return;
              }
              var old = row.querySelector('audio,video'); if (old) old.remove();
              var m = document.createElement(it.kind === 'video' ? 'video' : 'audio');
              m.controls = true; m.setAttribute('playsinline', ''); m.src = src;
              row.appendChild(m);
              try { await m.play(); } catch (e) {}
            } catch (e) {
              alert(t('listErr') + ' — ' + ((e && e.message) || ''));
            } finally { btn.disabled = false; }
          });
        });
      });
    } catch (e) {
      wrap.innerHTML = '<div class="w">' + esc(t('listErr')) + ' — ' + esc((e && e.message) || '') + '</div>';
    }
  }
  async function mediaUrl(ctx, id, it){
    var d = await call(ctx, 'url', { id: id });
    if (!d.encrypted) return d.url;
    if (!ctx.decrypt) throw new Error(en() ? 'Room key missing' : '열쇠가 없어 열 수 없습니다');
    var raw = await (await fetch(d.url)).arrayBuffer();
    var plain = await ctx.decrypt(raw);
    return URL.createObjectURL(new Blob([plain], { type: d.mime || (it.kind === 'video' ? 'video/webm' : 'audio/webm') }));
  }

  /* ── 밖으로 ─────────────────────────────────────────────────── */
  window.ACRec = {
    init: function(o){ C.sb = o.sb || C.sb; C.url = o.url || C.url; if (o.lang) C.lang = o.lang; css(); },
    supported: supported,
    /* 통화가 이어졌을 때 */
    begin: function(o){
      if (S && (S.o === o || (o.channel && S.o.channel === o.channel))) return;   // 같은 통화에서 두 번 불려도 한 번만
      if (R) { /* 앞 통화 것이 남아 있으면 먼저 저장합니다 */ finish('newcall'); }
      console.log('[rec] 통화 연결됨 — 🔴 · 📷 단추를 붙입니다', !!o.controls);
      S = { o: o, rid: null, asking: false, yes: {}, btn: null };
      S.btn = mountBtn(o.controls);
      S.camOff = false;
      S.camBtn = o.video ? mountCam(o.controls) : null;
      paintBtn();
    },
    /* 🔴 2026-10-09 — 통화를 시작할 때 미리 걸어 둡니다. 연결되면(1초마다 확인) 스스로 begin 합니다.
       폰 · 브라우저마다 "연결됨" 신호가 오는 방식이 달라, 신호만 믿으면 🔴 단추가 안 생기는 일이 있었습니다. */
    arm: function(o){
      clearInterval(armTimer);
      var until = Date.now() + 180000;
      var tryIt = function(){
        if (Date.now() > until) { clearInterval(armTimer); return; }
        var ok = false;
        try { ok = (o.pcs() || []).some(function(pc){ return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'); }); } catch (e) {}
        if (ok) { clearInterval(armTimer); window.ACRec.begin(o); }
      };
      armTimer = setInterval(tryIt, 1000);
      tryIt();
    },
    signal: function(p){ try { ACRec_signal(p); } catch (e) { console.warn('[rec] 신호 처리 실패', e); } },
    /* 통화를 끊을 때 — 담는 중이면 멈추고 저장합니다 */
    end: function(){
      clearInterval(armTimer);
      var p = null;
      if (R) p = finish('hangup');
      else if (S && S.theirOn) barOff();
      if (S && S.asking) { clearTimeout(S.askTimer); }
      if (S && S.btn) S.btn.style.display = 'none';
      if (S && S.camBtn) { S.camBtn.style.display = 'none'; S.camBtn.classList.remove('cam-off'); }
      camPill('');
      if (!R) { var bx = $('acrecBox'); if (bx && bx.style.display === 'block' && !bx.querySelector('#acrecList')) show(false); }
      S = null;
      return p || Promise.resolve();
    },
    recording: function(){ return !!R; },
    openList: openList,
    /* 대화창에 "🔴 녹음함" 단추 */
    listButton: function(where, ctx, before){
      css();
      if (!where) return null;
      var b = where.querySelector('.acrec-list-btn');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'acrec-list-btn';
        if (before && before.parentNode === where) where.insertBefore(b, before); else where.appendChild(b);
      }
      b.textContent = t('listBtn');
      /* ⚠ 대화창 머리의 단추 규칙(빨간 바탕)을 덮어씁니다 */
      b.setAttribute('style', 'background:rgba(196,55,43,.08) !important;color:#C4372B !important;border:1px solid rgba(196,55,43,.45) !important;border-radius:16px !important;padding:5px 10px !important;font-size:12.5px !important;font-weight:700 !important;width:auto !important;height:auto !important;min-width:0 !important;line-height:1.3 !important;cursor:pointer;white-space:nowrap');
      b.onclick = function(e){ e.preventDefault(); e.stopPropagation(); openList(ctx); };
      return b;
    },
  };
})();
