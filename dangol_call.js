/* =====================================================================
   🏪 단골창구 번호 없는 통화 (2026-11-17 · 22_dangol_plans.sql)
   실용형 = 음성 통화 · 프리미엄형 = 영상 통화.  손님(웹 · 앱 없이) ↔ 사장님(단골창구 · 가림콜 앱이나 웹).
   · 신호: Supabase 방송 채널 'dgc-<통화 번호>' (통화 번호는 아무도 짐작 못 하는 긴 번호)
   · 소리 · 영상: 기기끼리 직접(WebRTC). 막히면 중계(TURN) — 열쇠는 aliascall-ice 가 통화마다 1시간짜리로 줍니다.
   · 가림콜 통화(aliascall_hotline_room · alias_call.js)에서 겪은 교훈을 그대로 씁니다:
       ① 상대 설명(SDP)보다 먼저 온 후보(ICE)는 담아 뒀다가 나중에 넣습니다.
       ② 방송은 「들어오기 전에 보낸 말」을 잃어버립니다 → 받는 쪽은 'ready' 를, 거는 쪽은 'offer' 를 답이 올 때까지 되풀이합니다.
       ③ 중계 없이도 쉬운 조합은 붙으므로, 중계를 못 받으면 콘솔에 크게 남깁니다.
   쓰는 곳:  DGCall.guest({...})  — 손님이 걸기 (dangol.html)
             DGCall.owner({...})  — 사장님이 받기 (dangol_owner.html)
   ===================================================================== */
(function(){
  'use strict';
  if (window.DGCall) return;
  var STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

  function ice(url, key){
    var p = fetch(url + '/functions/v1/aliascall-ice', { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key }, body: '{}' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.turn === false) console.error('[dgcall] 🔴 중계(TURN) 없이 STUN 만 받았습니다. 통신사가 다른 이동통신끼리는 안 붙을 수 있어요.');
        return (d && Array.isArray(d.iceServers) && d.iceServers.length) ? d.iceServers : STUN;
      })
      .catch(function(e){ console.error('[dgcall] 🔴 중계 열쇠를 못 받았습니다. STUN 만 씁니다.', e); return STUN; });
    return Promise.race([p, new Promise(function(r){ setTimeout(function(){ r(STUN); }, 3500); })]);
  }

  /* ── 화면: 통화 창 하나 ─────────────────────────────── */
  var CSS = '.dgc{position:fixed;inset:0;z-index:9999;background:#0E2423;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;' +
    'padding:max(28px,env(safe-area-inset-top,0px)) 20px max(28px,env(safe-area-inset-bottom,0px));font-family:inherit;text-align:center}' +
    '.dgc .who{font-size:24px;font-weight:900;margin-top:24px}.dgc .st{font-size:16px;opacity:.85;margin-top:8px;min-height:22px}' +
    '.dgc .av{width:120px;height:120px;border-radius:50%;background:#1F6F6B;display:flex;align-items:center;justify-content:center;font-size:56px;margin:26px auto 0;box-shadow:0 0 0 0 rgba(232,115,74,.6)}' +
    '.dgc.ringing .av{animation:dgcP 1.4s infinite}@keyframes dgcP{0%{box-shadow:0 0 0 0 rgba(232,115,74,.55)}100%{box-shadow:0 0 0 34px rgba(232,115,74,0)}}' +
    '.dgc video.rv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:-1}' +
    '.dgc video.lv{position:absolute;right:14px;top:max(14px,env(safe-area-inset-top,0px));width:28vw;max-width:150px;aspect-ratio:3/4;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,.5);background:#000;transform:scaleX(-1)}' +
    '.dgc.vid .av{display:none}.dgc.vid .top{background:rgba(0,0,0,.35);border-radius:16px;padding:8px 16px}' +
    '.dgc .bar{display:flex;gap:22px;justify-content:center;align-items:center}' +
    '.dgc .bar button{width:68px;height:68px;border-radius:50%;border:none;font-size:26px;cursor:pointer;background:rgba(255,255,255,.18);color:#fff}' +
    '.dgc .bar button.off{background:#fff;color:#0E2423}.dgc .bar .end{background:#E5484D;width:76px;height:76px;font-size:30px}.dgc .bar .ok{background:#2FB36B;width:76px;height:76px;font-size:30px}' +
    '.dgc .bar small{display:block;font-size:12px;margin-top:6px;opacity:.85}.dgc .lab{display:flex;flex-direction:column;align-items:center}';
  function ui(o){
    if (!document.getElementById('dgcCss')) { var s = document.createElement('style'); s.id = 'dgcCss'; s.textContent = CSS; document.head.appendChild(s); }
    var T = o.t || function(k){ return k; };
    var el = document.createElement('div'); el.className = 'dgc ringing' + (o.video ? ' vid' : '');
    el.innerHTML = (o.video ? '<video class="rv" autoplay playsinline></video><video class="lv" autoplay playsinline muted></video>' : '') +
      '<audio class="ra" autoplay playsinline></audio>' +
      '<div class="top"><div class="who"></div><div class="st"></div></div><div class="av">' + (o.icon || '📞') + '</div>' +
      '<div class="bar"></div>';
    el.querySelector('.who').textContent = o.who || '';
    document.body.appendChild(el);
    var api = {
      el: el,
      state: function(s){ el.querySelector('.st').textContent = s; },
      live: function(){ el.classList.remove('ringing'); },
      buttons: function(list){
        var bar = el.querySelector('.bar'); bar.innerHTML = '';
        list.forEach(function(b){ var w = document.createElement('div'); w.className = 'lab';
          var x = document.createElement('button'); x.type = 'button'; x.className = b.cls || ''; x.textContent = b.icon; x.setAttribute('aria-label', b.label);
          x.onclick = function(){ b.on(x); }; w.appendChild(x); var sm = document.createElement('small'); sm.textContent = b.label; w.appendChild(sm); bar.appendChild(w); });
      },
      close: function(){ try { el.remove(); } catch (e) {} }
    };
    return api;
  }
  function fmt(s){ s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* ── 공통 엔진 ─────────────────────────────────────── */
  function Engine(o){
    var E = { pc: null, local: null, ch: null, ended: false, queue: [], remoteSet: false, timers: [], startAt: 0, gotRemote: false };
    E.media = async function(){
      E.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: o.video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 20 } } : false });
      if (o.video) { var lv = o.view.el.querySelector('.lv'); if (lv) lv.srcObject = E.local; }
      return E.local;
    };
    E.join = function(onMsg){
      return new Promise(function(res){
        E.ch = o.sb.channel('dgc-' + o.call, { config: { broadcast: { self: false } } });
        E.ch.on('broadcast', { event: 'sig' }, function(p){ try { onMsg(p.payload || {}); } catch (e) { console.warn('[dgcall]', e); } });
        E.ch.subscribe(function(st){ if (st === 'SUBSCRIBED') res(); });
        setTimeout(res, 4000);
      });
    };
    E.send = function(m){ try { if (E.ch) E.ch.send({ type: 'broadcast', event: 'sig', payload: m }); } catch (e) {} };
    E.peer = async function(){
      var servers = await ice(o.url, o.key);
      var pc = E.pc = new RTCPeerConnection({ iceServers: servers });
      E.local.getTracks().forEach(function(t){ pc.addTrack(t, E.local); });
      pc.onicecandidate = function(ev){ if (ev.candidate) E.send({ t: 'ice', c: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate }); };
      pc.ontrack = function(ev){
        var st = ev.streams && ev.streams[0]; if (!st) return;
        var ra = o.view.el.querySelector('.ra'); if (ra && ra.srcObject !== st) { ra.srcObject = st; ra.play && ra.play().catch(function(){}); }
        if (o.video) { var rv = o.view.el.querySelector('.rv'); if (rv && rv.srcObject !== st) { rv.srcObject = st; rv.muted = true; rv.play && rv.play().catch(function(){}); } }
      };
      var lost = null;
      pc.onconnectionstatechange = function(){
        var s = pc.connectionState;
        if (s === 'connected') { clearTimeout(lost); lost = null; if (!E.startAt) { E.startAt = Date.now(); o.view.live(); E.tick(); } }
        if (s === 'disconnected') { o.view.state(o.t('연결이 불안정해요…', 'Connection is unstable…')); clearTimeout(lost); lost = setTimeout(function(){ E.end('lost'); }, 12000); }
        if (s === 'failed') E.end('lost');
      };
      return pc;
    };
    E.addIce = async function(c){
      if (!E.pc || !E.remoteSet) { E.queue.push(c); return; }
      try { await E.pc.addIceCandidate(c); } catch (e) {}
    };
    E.flushIce = async function(){ var q = E.queue; E.queue = []; for (var i = 0; i < q.length; i++) { try { await E.pc.addIceCandidate(q[i]); } catch (e) {} } };
    E.tick = function(){
      var iv = setInterval(function(){ if (E.ended) return clearInterval(iv); o.view.state(fmt((Date.now() - E.startAt) / 1000)); }, 1000);
      E.timers.push(iv);
      if (o.maxMin) E.timers.push(setTimeout(function(){ E.end('limit'); }, o.maxMin * 60e3));
    };
    E.end = function(why){
      if (E.ended) return; E.ended = true;
      E.send({ t: 'bye' });
      /* 어느 쪽이 어떻게 끝나든 서버에 「끝」을 남깁니다(안 그러면 다음 손님이 「통화 중」에 걸림) */
      if (o.call && o.finish && why !== 'declined') { try { o.finish(); } catch (e) {} }
      E.timers.forEach(function(x){ clearInterval(x); clearTimeout(x); });
      try { if (E.pc) E.pc.close(); } catch (e) {}
      try { if (E.local) E.local.getTracks().forEach(function(t){ t.stop(); }); } catch (e) {}
      setTimeout(function(){ try { if (E.ch) o.sb.removeChannel(E.ch); } catch (e) {} }, 600);
      var secs = E.startAt ? (Date.now() - E.startAt) / 1000 : 0;
      o.onEnd && o.onEnd(why, secs);
      var msg = why === 'declined' ? o.t('사장님이 지금은 받기 어려워요. 글로 남겨 주세요.', 'The owner can’t take calls right now. Please leave a message.')
              : why === 'missed' ? o.t('사장님이 받지 않았어요. 글로 남기시면 답해 드려요.', 'No answer. Leave a message and the owner will reply.')
              : why === 'lost' ? o.t('연결이 끊겼어요.', 'The call was disconnected.')
              : why === 'limit' ? o.t('통화 시간(30분)이 다 되어 끊었어요.', 'The call ended (30-minute limit).')
              : secs ? o.t('통화를 마쳤어요 · ', 'Call ended · ') + fmt(secs) : o.t('통화를 끝냈어요.', 'Call ended.');
      o.view.state(msg); o.view.buttons([]);
      setTimeout(function(){ o.view.close(); }, 1800);
    };
    E.controls = function(hang){
      var list = [
        { icon: '🔇', label: o.t('소리 끄기', 'Mute'), on: function(b){ var a = E.local && E.local.getAudioTracks()[0]; if (!a) return; a.enabled = !a.enabled; b.classList.toggle('off', !a.enabled); } },
        { icon: '✕', label: o.t('끊기', 'End'), cls: 'end', on: hang }
      ];
      if (o.video) {
        list.unshift({ icon: '📷', label: o.t('카메라', 'Camera'), on: function(b){ var v = E.local && E.local.getVideoTracks()[0]; if (!v) return; v.enabled = !v.enabled; b.classList.toggle('off', !v.enabled); } });
        list.push({ icon: '🔄', label: o.t('앞뒤', 'Flip'), on: async function(){
          try { var cur = E.local.getVideoTracks()[0]; var face = (cur.getSettings().facingMode === 'environment') ? 'user' : 'environment';
            var ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 640 }, height: { ideal: 480 } } });
            var nt = ns.getVideoTracks()[0]; var sd = E.pc.getSenders().filter(function(s){ return s.track && s.track.kind === 'video'; })[0];
            if (sd) await sd.replaceTrack(nt); cur.stop(); E.local.removeTrack(cur); E.local.addTrack(nt);
            var lv = o.view.el.querySelector('.lv'); if (lv) { lv.srcObject = E.local; lv.style.transform = face === 'user' ? 'scaleX(-1)' : 'none'; }
          } catch (e) {} } });
      }
      o.view.buttons(list);
    };
    return E;
  }
  function micError(o, e){
    var n = (e && e.name) || '';
    return n === 'NotAllowedError' || n === 'SecurityError'
      ? o.t('마이크' + (o.video ? ' · 카메라' : '') + ' 사용을 허락해야 통화할 수 있어요. 휴대폰 · 브라우저 설정에서 허락해 주세요.', 'Please allow microphone' + (o.video ? ' and camera' : '') + ' access to call.')
      : n === 'NotFoundError' ? o.t('마이크' + (o.video ? ' · 카메라' : '') + '를 찾지 못했어요.', 'No microphone' + (o.video ? ' or camera' : '') + ' found.')
      : o.t('통화를 시작하지 못했어요. 다시 해 주세요.', 'Could not start the call. Please try again.');
  }

  /* ── 손님: 걸기 ────────────────────────────────────── */
  async function guest(o){
    o.t = o.t || function(k){ return k; };
    if (!navigator.mediaDevices || !window.RTCPeerConnection) { o.toast(o.t('이 브라우저에서는 통화가 안 돼요. 크롬 · 사파리 최신 버전에서 열어 주세요.', 'Calls are not supported in this browser. Please use the latest Chrome or Safari.')); return; }
    o.view = ui({ video: o.video, who: o.who, t: o.t, icon: o.video ? '🎥' : '📞' });
    o.view.state(o.t('마이크를 준비하는 중…', 'Getting your microphone ready…'));
    var E = Engine(o), ring = null, gotReady = false, offerSdp = null, offerIv = null;
    o.view.buttons([{ icon: '✕', label: o.t('취소', 'Cancel'), cls: 'end', on: function(){ hang(); } }]);
    try { await E.media(); } catch (e) { o.view.close(); o.toast(micError(o, e)); return; }
    var r;
    try { r = await o.rpc('dg_call_start', { p_code: o.code, p_token: o.token, p_video: !!o.video, p_name: o.name || null, p_thread: o.thread || null }); }
    catch (e) { r = { ok: false, error: (e && e.message) || 'x' }; }
    if (!r || !r.ok) {
      E.local.getTracks().forEach(function(t){ t.stop(); }); o.view.close();
      var c = r && r.error;
      o.toast(c === 'line_busy' ? o.t('사장님이 다른 손님과 통화 중이에요. 잠시 뒤 다시 걸어 주세요.', 'The owner is on another call. Please try again shortly.')
            : c === 'away' ? o.t('지금은 영업시간이 아니라 통화가 어려워요. 글로 남겨 주세요.', 'The shop is closed now. Please leave a message.')
            : c === 'call_off' ? o.t('지금은 사장님이 통화를 받지 않아요. 글로 남겨 주세요.', 'The owner is not taking calls now. Please leave a message.')
            : c === 'quota' ? o.t('이번 달 통화 시간을 다 써서 지금은 통화가 어려워요. 글로 남겨 주세요.', 'Calls are not available right now. Please leave a message.')
            : c === 'too_many' ? o.t('잠시 뒤에 다시 걸어 주세요.', 'Please try again in a little while.')
            : o.t('통화를 걸지 못했어요. 글로 남겨 주세요.', 'Could not place the call. Please leave a message.'));
      return;
    }
    o.call = r.call; o.onThread && o.onThread(r.thread);
    fetch(o.url + '/functions/v1/dangol-notify', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: o.key, Authorization: 'Bearer ' + o.key },
      body: JSON.stringify({ call: r.call, token: o.token }) }).catch(function(){});
    o.view.state(o.t('사장님을 부르는 중…', 'Calling the owner…'));
    o.finish = function(){ o.rpc('dg_call_set', { p_call: o.call, p_state: 'done', p_token: o.token }).catch(function(){}); };
    function hang(){ if (E.ended) return; E.end('me'); }
    o.view.buttons([{ icon: '✕', label: o.t('취소', 'Cancel'), cls: 'end', on: hang }]);
    await E.join(async function(m){
      if (E.ended) return;
      if (m.t === 'ready' && !gotReady) {
        gotReady = true; clearInterval(ring); o.view.state(o.t('연결하는 중…', 'Connecting…')); E.controls(hang);
        var pc = await E.peer();
        var off = await pc.createOffer(); await pc.setLocalDescription(off); offerSdp = { type: pc.localDescription.type, sdp: pc.localDescription.sdp };   // 보통 객체로(복사 · JSON 모두 안전)
        E.send({ t: 'offer', sdp: offerSdp });
        offerIv = setInterval(function(){ if (E.ended || E.remoteSet) return clearInterval(offerIv); E.send({ t: 'offer', sdp: offerSdp }); }, 2000);
        E.timers.push(offerIv);
      } else if (m.t === 'answer' && E.pc && !E.remoteSet) {
        await E.pc.setRemoteDescription(m.sdp); E.remoteSet = true; await E.flushIce();
      } else if (m.t === 'ice' && m.c) { E.addIce(m.c); }
      else if (m.t === 'bye') { E.end('peer'); }
    });
    /* 울리는 동안: 사장님이 거절했는지 · 45초가 지났는지 */
    var t0 = Date.now();
    ring = setInterval(async function(){
      if (E.ended || gotReady) return clearInterval(ring);
      if (Date.now() - t0 > 46000) { clearInterval(ring); o.rpc('dg_call_set', { p_call: o.call, p_state: 'done', p_token: o.token }).catch(function(){}); E.end('missed'); return; }
      try { var s = await o.rpc('dg_call_state', { p_call: o.call, p_token: o.token }); if (s && (s.state === 'declined' || s.state === 'missed' || s.state === 'done')) { clearInterval(ring); E.end(s.state === 'declined' ? 'declined' : 'missed'); } } catch (e) {}
    }, 2500);
    E.timers.push(ring);
  }

  /* ── 사장님: 울림 → 받기 ───────────────────────────── */
  function owner(o){
    o.t = o.t || function(k){ return k; };
    o.view = ui({ video: o.video, who: o.who, t: o.t, icon: o.video ? '🎥' : '📞' });
    o.view.state(o.video ? '영상 통화가 왔어요' : '전화가 왔어요');
    var E = Engine(o), readyIv = null, answered = null;
    o.finish = function(){ o.rpc('dg_call_set', { p_call: o.call, p_state: 'done' }).catch(function(){}); };
    function hang(){ if (E.ended) return; E.end('me'); }
    var gone = setInterval(async function(){   // 손님이 먼저 끊었나
      if (E.ended || E.remoteSet) return clearInterval(gone);
      try { var r = await o.rpc('dg_owner_ring', { p_desk: o.desk }); if (!r || r.call !== o.call) { if (!answered) { clearInterval(gone); E.ended = true; o.view.state('손님이 전화를 끊었어요.'); o.view.buttons([]); setTimeout(o.view.close, 1500); o.onEnd && o.onEnd('gone', 0); } } } catch (e) {}
    }, 3000);
    E.timers.push(gone);
    o.view.buttons([
      { icon: '✕', label: '거절', cls: 'end', on: function(){ clearInterval(gone); o.rpc('dg_call_set', { p_call: o.call, p_state: 'declined' }).catch(function(){}); E.ended = true; o.view.close(); o.onEnd && o.onEnd('declined', 0); } },
      { icon: o.video ? '🎥' : '📞', label: '받기', cls: 'ok', on: async function(){
        clearInterval(gone);
        o.view.state('연결하는 중…');
        try { await E.media(); } catch (e) { o.toast(micError(o, e)); o.rpc('dg_call_set', { p_call: o.call, p_state: 'declined' }).catch(function(){}); E.ended = true; o.view.close(); return; }
        var r = await o.rpc('dg_call_set', { p_call: o.call, p_state: 'live' }).catch(function(){ return null; });
        if (!r || !r.ok) { E.local.getTracks().forEach(function(t){ t.stop(); }); o.view.state('손님이 이미 끊었어요.'); o.view.buttons([]); setTimeout(o.view.close, 1500); return; }
        answered = Date.now(); E.controls(hang);
        var pc = await E.peer(), lastOffer = null, myAnswer = null;
        await E.join(async function(m){
          if (E.ended) return;
          if (m.t === 'offer') {
            if (lastOffer === m.sdp.sdp && myAnswer) { E.send({ t: 'answer', sdp: myAnswer }); return; }
            lastOffer = m.sdp.sdp;
            await pc.setRemoteDescription(m.sdp); E.remoteSet = true; await E.flushIce();
            var ans = await pc.createAnswer(); await pc.setLocalDescription(ans); myAnswer = { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
            E.send({ t: 'answer', sdp: myAnswer });
          } else if (m.t === 'ice' && m.c) { E.addIce(m.c); }
          else if (m.t === 'bye') { E.end('peer'); }
        });
        E.send({ t: 'ready' });
        readyIv = setInterval(function(){ if (E.ended || E.remoteSet) return clearInterval(readyIv); E.send({ t: 'ready' });
          if (Date.now() - answered > 25000) { clearInterval(readyIv); hang(); } }, 1200);
        E.timers.push(readyIv);
      } }
    ]);
    /* 받지 않으면 45초 뒤 저절로 닫힘 (서버가 부재중으로 남김) */
    E.timers.push(setTimeout(function(){ if (!answered && !E.ended) { E.ended = true; clearInterval(gone); o.view.close(); o.onEnd && o.onEnd('missed', 0); } }, 45000));
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
    return E;
  }

  window.DGCall = { guest: guest, owner: owner };
})();
