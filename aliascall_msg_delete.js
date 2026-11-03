/* =====================================================================
   Aliascall — 대화 메시지 메뉴 (꾹 누르기) · 파일 보내기
   2026-10-08 (2판)

   쓰는 화면: aliascall_connect.html (발견자) · aliascall_incoming_calls.html (주인)
              aliascall_hotline_room.html (핫라인 방 — 메뉴만)

   꾹 누르면(PC는 오른쪽 클릭)
     내가 보낸 것    ⬇ 저장 · 📋 복사 · 🗑 삭제(상대 화면에서도 사라짐)
     내가 받은 것    ⬇ 저장 · 📋 복사 · 🙈 내 화면에서 지우기(보낸 사람 것은 그대로)
     사진 묶음       이 사진 / 묶음 전체 를 골라서

   파일 보내기 (발견자 ↔ 주인 대화창)
     동영상 · 음성 · PDF · 문서 · 압축 등 무엇이든 50MB 까지.
     사진은 예전처럼 줄여서(압축) 보내고 묶음(타일)으로 보입니다.
     서버 함수 aliascall-case-file 이 있어야 합니다.

   ⚠ "내 화면에서 지우기" 는 이 폰에만 적어둡니다(카톡의 "나에게서 삭제"와 같음).
   ===================================================================== */
(function(){
  'use strict';
  var cfg = null;
  var seen = new Map();           // id → created_at
  var gone = new Set();           // 지운 것
  var HKEY = 'ac_hidden_msgs_v1';
  var hidden = (function(){
    try { return new Set(JSON.parse(localStorage.getItem(HKEY) || '[]')); } catch (e) { return new Set(); }
  })();
  function saveHidden(){
    try {
      var arr = Array.from(hidden);
      if (arr.length > 3000) arr = arr.slice(arr.length - 3000);
      localStorage.setItem(HKEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  function L(k, e){ return en() ? e : k; }

  /* ── 파일 정보 ───────────────────────────────────────────────────
     파일 메시지는 사진 칸(photo)에 주소#n=이름&m=종류&s=크기 로 담깁니다. */
  function info(msg){
    if (!msg || msg.message_type !== 'photo' || !msg.content) return null;
    var c = String(msg.content), i = c.indexOf('#');
    if (i < 0) return null;
    var q = {};
    c.slice(i + 1).split('&').forEach(function(kv){
      var j = kv.indexOf('='); if (j > 0) { try { q[kv.slice(0, j)] = decodeURIComponent(kv.slice(j + 1)); } catch (e) {} }
    });
    if (!q.m && !q.n) return null;
    var mime = q.m || '';
    if (/^image\//.test(mime)) return null;
    var kind = /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'doc';
    return { url: c.slice(0, i), name: q.n || 'file', mime: mime, size: +q.s || 0, kind: kind };
  }
  function fmtBytes(n){
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function icon(fi){
    var n = (fi.name || '').toLowerCase();
    if (fi.kind === 'video') return '🎬';
    if (fi.kind === 'audio') return '🎵';
    if (/\.pdf$/.test(n)) return '📕';
    if (/\.(xlsx?|csv)$/.test(n)) return '📊';
    if (/\.(pptx?|key)$/.test(n)) return '📽';
    if (/\.(zip|rar|7z)$/.test(n)) return '🗜';
    if (/\.(docx?|hwp|txt|rtf)$/.test(n)) return '📄';
    return '📎';
  }
  /* 말풍선 안을 파일 모양으로 채웁니다 */
  function render(el, fi){
    el.classList.add('file-bubble');
    el.dataset.fileUrl = fi.url;
    el.dataset.fileName = fi.name;
    if (fi.kind === 'video') {
      var v = document.createElement('video');
      v.src = fi.url; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
      v.style.cssText = 'display:block;max-width:230px;width:100%;border-radius:10px;background:#000;';
      el.appendChild(v);
    } else if (fi.kind === 'audio') {
      var a = document.createElement('audio');
      a.src = fi.url; a.controls = true; a.preload = 'metadata';
      a.style.cssText = 'display:block;width:230px;max-width:100%;';
      el.appendChild(a);
    }
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'acf-card';
    card.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%;min-width:180px;max-width:240px;margin-top:' +
      (fi.kind === 'doc' ? '0' : '6px') + ';padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.3);' +
      'background:rgba(128,128,128,.10);color:inherit;font:inherit;text-align:left;cursor:pointer;';
    card.innerHTML = '<span style="font-size:22px;flex:0 0 auto">' + icon(fi) + '</span>' +
      '<span style="min-width:0;flex:1"><b style="display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></b>' +
      '<span style="font-size:11px;opacity:.75"></span></span><span style="font-size:15px;opacity:.8">⬇</span>';
    card.querySelector('b').textContent = fi.name;
    card.querySelector('span span').textContent = fmtBytes(fi.size) + ' · ' + L('눌러서 저장', 'Tap to save');
    card.addEventListener('click', function(e){ e.stopPropagation(); download(fi.url, fi.name); });
    el.appendChild(card);
  }

  /* ── 내려받기 ────────────────────────────────────────────────────
     • 부름처럼 앱에 내려받기 창구가 있으면 그것을 씁니다.
     • 없으면 ?download=이름 을 붙여 엽니다. 저장소가 "내려받기" 로 응답해
       폰의 다운로드 폴더에 저장됩니다(화면은 그대로 있습니다). */
  function download(url, name){
    if (!url) return;
    name = name || ('aliascall_' + Date.now());
    try {
      if (window.AliasNative && typeof AliasNative.download === 'function' && /^https?:/.test(url)) {
        AliasNative.download(url, name); toast(L('내려받기를 시작했습니다', 'Download started')); return;
      }
    } catch (e) {}
    var u = url;
    if (/^https?:/.test(url) && /\/storage\/v1\/object\//.test(url)) {
      try { var x = new URL(url); x.searchParams.set('download', name); u = x.toString(); } catch (e) {}
    }
    var a = document.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener';
    if (!/^blob:|^data:/.test(u)) a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
    toast(L('내려받기를 시작했습니다', 'Download started'));
  }

  var toastEl = null, toastTm = null;
  function toast(t, keep){
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:99995;max-width:86%;' +
        'background:rgba(20,30,30,.92);color:#fff;padding:9px 14px;border-radius:18px;font-size:13px;font-weight:600;text-align:center;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = t; toastEl.style.display = t ? '' : 'none';
    clearTimeout(toastTm);
    if (t && !keep) toastTm = setTimeout(function(){ toastEl.style.display = 'none'; }, 2200);
  }

  /* ── 파일 보내기 ─────────────────────────────────────────────────
     ctx = { sb, caseId, finderAnonId?, token?:async()=>jwt,
             sendPhoto:async(file), post:async(content)=>{messageId}, append:(msg)=>{} } */
  var FN = '/functions/v1/aliascall-case-file';
  async function callFile(ctx, body){
    var h = { 'Content-Type': 'application/json' };
    if (!ctx.finderAnonId && ctx.token) { var t = await ctx.token(); if (t) h.Authorization = 'Bearer ' + t; }
    if (ctx.finderAnonId) body.finderAnonId = ctx.finderAnonId;
    body.caseId = ctx.caseId;
    var res = await fetch(ctx.url + FN, { method: 'POST', headers: h, body: JSON.stringify(body) });
    var data = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  async function sendFiles(files, ctx){
    files = Array.prototype.slice.call(files || []);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var label = files.length > 1 ? ' (' + (i + 1) + '/' + files.length + ')' : '';
      try {
        if (/^image\//.test(f.type) && !/svg/.test(f.type)) { toast(L('사진 보내는 중', 'Sending photo') + label, true); await ctx.sendPhoto(f); continue; }
        if (f.size > 50 * 1024 * 1024) { alert(L('50MB 이하 파일만 보낼 수 있습니다: ', 'Files must be 50MB or smaller: ') + f.name); continue; }
        toast(L('파일 올리는 중', 'Uploading') + label + ' · ' + f.name, true);
        var mime = f.type || 'application/octet-stream';
        var prep = await callFile(ctx, { action: 'prepare', name: f.name, mime: mime, size: f.size });
        var up = await ctx.sb.storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, f, { contentType: mime });
        if (up.error) throw up.error;
        var content = prep.publicUrl + '#n=' + encodeURIComponent(f.name) + '&m=' + encodeURIComponent(mime) + '&s=' + f.size;
        var out = null;
        try { out = await ctx.post(content); }               // 보통 길: 알림까지 갑니다
        catch (e1) {
          console.warn('[file] 보통 길이 안 됩니다. 예비 길로 남깁니다', e1);
          var c = await callFile(ctx, { action: 'commit', content: content });
          out = { messageId: c.messageId, createdAt: c.createdAt };
        }
        ctx.append({ id: out && out.messageId, message_type: 'photo', content: content,
                     created_at: (out && out.createdAt) || new Date().toISOString() });
      } catch (e) {
        console.error('[file] 보내기 실패', e);
        toast('');
        var net = /Failed to fetch|NetworkError|Load failed/i.test((e && e.message) || '');
        alert(L('파일을 보내지 못했습니다: ', 'Could not send the file: ') + f.name + '\n' +
              (net ? L('서버에 닿지 못했습니다. (관리자: aliascall-case-file 배포 · Verify JWT 끄기 확인)', 'Could not reach the server.')
                   : (e && e.message ? e.message : '')));
        break;
      }
    }
    toast('');
  }

  /* ── 지우기 · 숨기기를 화면에 반영 ─────────────────────────────── */
  function track(msg){
    if (msg && msg.id && msg.message_type !== 'call_log') seen.set(msg.id, msg.created_at || null);
  }
  function isHidden(id){ return !!id && hidden.has(id); }

  function groups(){ return Array.prototype.slice.call(document.querySelectorAll('.chat-bubble.photo-group')); }
  function groupOf(id){
    var gs = groups();
    for (var i = 0; i < gs.length; i++) {
      var st = gs[i]._pg;
      if (st && st.items.some(function(x){ return x.id === id; })) return gs[i];
    }
    return null;
  }

  function applyDeleted(id){
    if (!id || gone.has(id)) return;
    gone.add(id); seen.delete(id);
    var g = groupOf(id);
    if (g) {
      var st = g._pg;
      st.items = st.items.filter(function(x){ return x.id !== id; });
      if (st.items.length && cfg && cfg.renderGroup) { cfg.renderGroup(st); return; }
      g.className = g.className.replace(/\bphoto(-group)?\b/g, '').trim() + ' deleted';
      g.innerHTML = '';
      g.textContent = L('🗑 삭제된 사진입니다', '🗑 Photo deleted');
      g._pg = null;
      return;
    }
    var el = document.querySelector('.chat-bubble[data-message-id="' + id + '"]');
    if (el) {
      el.classList.remove('emoji-sticker-bubble', 'file-bubble');
      el.style.background = '';
      el.classList.add('deleted');
      el.innerHTML = '';
      el.textContent = L('🗑 삭제된 메시지입니다', '🗑 Message deleted');
    }
  }

  /* 내 화면에서만 치웁니다 (보낸 사람 화면은 그대로) */
  function applyHidden(id){
    if (!id) return;
    hidden.add(id); saveHidden(); seen.delete(id);
    var g = groupOf(id);
    if (g) {
      var st = g._pg;
      st.items = st.items.filter(function(x){ return x.id !== id; });
      if (st.items.length && cfg && cfg.renderGroup) { cfg.renderGroup(st); return; }
      removeWithTime(g, st.lastMessageId || id);
      return;
    }
    var el = document.querySelector('.chat-bubble[data-message-id="' + id + '"]');
    if (el) removeWithTime(el, id);
  }
  function removeWithTime(el, id){
    var prev = el.previousElementSibling;
    var tr = document.querySelector('.msg-time-row[data-message-id="' + id + '"]');
    if (tr) tr.remove();
    el.remove();
    // 핫라인 방: 보낸 사람 이름표만 덩그러니 남지 않게
    if (prev && prev.classList && prev.classList.contains('sender-label')) prev.remove();
  }

  function syncFromList(list){
    if (!Array.isArray(list) || !list.length) return;
    var ids = new Set(), oldest = null;
    list.forEach(function(m){
      ids.add(m.id);
      if (m.created_at && (!oldest || m.created_at < oldest)) oldest = m.created_at;
    });
    seen.forEach(function(created, id){
      if (ids.has(id)) return;
      if (oldest && created && created < oldest) return;
      var onScreen = document.querySelector('.chat-bubble[data-message-id="' + id + '"]') || groupOf(id);
      if (!onScreen) return;
      applyDeleted(id);
    });
  }

  /* ── 메뉴 ──────────────────────────────────────────────────────── */
  function sheet(title, items){
    if (document.querySelector('.acdel-sheet')) return;
    var bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99990;';
    var sh = document.createElement('div');
    sh.className = 'acdel-sheet';
    sh.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99991;background:var(--card,#fff);color:var(--ink,#12302E);' +
      'border-radius:18px 18px 0 0;padding:14px 16px 20px;max-width:520px;margin:0 auto;box-shadow:0 -8px 30px rgba(0,0,0,.25);';
    var h = document.createElement('div');
    h.style.cssText = 'font-size:13px;color:var(--ink-soft,#3E5654);margin:0 2px 10px;line-height:1.5;';
    h.textContent = title; sh.appendChild(h);
    function close(){ bg.remove(); sh.remove(); }
    bg.addEventListener('click', close);
    items.concat([[L('취소', 'Cancel'), null, 'plain']]).forEach(function(it){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it[0];
      var danger = it[2] === 'danger';
      b.style.cssText = 'display:block;width:100%;margin:6px 0 0;padding:13px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;' +
        (danger ? 'border:none;background:var(--danger,#C1483A);color:#fff;'
                : 'border:1.5px solid var(--line,#DCE3DE);background:transparent;color:inherit;');
      b.addEventListener('click', function(){ close(); if (it[1]) it[1](); });
      sh.appendChild(b);
    });
    document.body.appendChild(bg); document.body.appendChild(sh);
  }

  var busy = false;
  async function runDelete(ids){
    if (busy || !cfg || !cfg.del) return;
    if (!confirm(ids.length > 1
        ? L(ids.length + '개를 모두 지울까요? 상대 화면에서도 사라집니다.', 'Delete all ' + ids.length + '? They disappear for the other person too.')
        : L('지울까요? 상대 화면에서도 사라집니다.', 'Delete? It disappears for the other person too.'))) return;
    busy = true;
    try {
      for (var i = 0; i < ids.length; i++) {
        await cfg.del(ids[i]);
        if (cfg.apply) cfg.apply(ids[i]); else applyDeleted(ids[i]);
      }
    } catch (e) {
      console.error('[delete] 실패', e);
      var net = e && /Failed to fetch|NetworkError|Load failed/i.test(e.message || '');
      alert(net
        ? L('지우지 못했습니다.\n서버에 닿지 못했습니다. 인터넷이 되는지 확인해 주세요.\n(관리자: 삭제 서버 함수가 배포되어 있고 Verify JWT 가 꺼져 있는지 확인)',
            'Could not delete.\nCould not reach the server. Check your connection.')
        : L('지우지 못했습니다. ', 'Could not delete. ') + (e && e.message ? e.message : ''));
    } finally { busy = false; }
  }
  function runHide(ids){
    if (!confirm(L('내 화면에서만 지웁니다. 보낸 사람 화면에는 그대로 남습니다.', 'Remove from your screen only? The sender still sees it.'))) return;
    ids.forEach(function(id){ if (cfg && cfg.hideApply) cfg.hideApply(id); else applyHidden(id); hidden.add(id); });
    saveHidden();
  }
  function copyText(t){
    try { navigator.clipboard.writeText(t); toast(L('복사했습니다', 'Copied')); return; } catch (e) {}
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(L('복사했습니다', 'Copied')); } catch (e) {}
    ta.remove();
  }

  function openFor(target){
    var bub = target.closest('.chat-bubble');
    if (!bub || bub.classList.contains('deleted')) return;
    var mine = bub.classList.contains('me');
    var items = [];
    var title = mine ? L('보낸 것을 지우면 상대 화면에서도 사라집니다.', 'Deleting removes it for the other person too.')
                     : L('받은 것을 내 화면에서 지워도 보낸 사람 화면에는 남습니다.', 'Removing only affects your screen.');

    if (bub._pg) {
      var st = bub._pg;
      var thumb = target.closest('[data-mid]');
      var one = thumb ? thumb.getAttribute('data-mid') : null;
      var it1 = one ? st.items.filter(function(x){ return x.id === one; })[0] : null;
      var all = st.items.filter(function(x){ return x.id; });
      var n = all.length;
      if (it1) items.push([L('⬇ 이 사진 저장', '⬇ Save this photo'), function(){ download(it1.url, it1.filename || ('photo_' + Date.now() + '.jpg')); }]);
      if (n > 1) items.push([L('⬇ 사진 ' + n + '장 모두 저장', '⬇ Save all ' + n + ' photos'), function(){
        all.forEach(function(x, k){ setTimeout(function(){ download(x.url, x.filename || ('photo_' + Date.now() + '_' + (k + 1) + '.jpg')); }, k * 700); });
      }]);
      var ids = all.map(function(x){ return x.id; });
      if (mine) {
        if (one) items.push([L('🗑 이 사진 삭제', '🗑 Delete this photo'), function(){ runDelete([one]); }, 'danger']);
        if (n > 1 || !one) items.push([L('🗑 사진 ' + n + '장 모두 삭제', '🗑 Delete all ' + n + ' photos'), function(){ runDelete(ids); }, 'danger']);
      } else {
        if (one) items.push([L('🙈 이 사진 내 화면에서 지우기', '🙈 Remove this photo for me'), function(){ runHide([one]); }]);
        if (n > 1 || !one) items.push([L('🙈 사진 ' + n + '장 내 화면에서 지우기', '🙈 Remove all ' + n + ' for me'), function(){ runHide(ids); }]);
      }
      sheet(title, items);
      return;
    }

    var id = bub.getAttribute('data-message-id');
    var furl = bub.dataset.fileUrl;
    if (!furl) {      // 핫라인 방의 사진·영상·음성·문서
      var med = bub.querySelector('video[src], audio[src], img:not(.emoji-sticker)[src]');
      if (med) furl = med.getAttribute('src');
    }
    if (furl) items.push([L('⬇ 저장', '⬇ Save'), function(){ download(furl, bub.dataset.fileName || ''); }]);
    else if (cfg && cfg.saveDoc && bub.querySelector('.chat-doc')) items.push([L('⬇ 저장', '⬇ Save'), function(){ bub.querySelector('.chat-doc').click(); }]);
    if (!furl && !bub.classList.contains('emoji-sticker-bubble')) {
      var txt = (bub.querySelector('span') && bub.classList.contains('text')) ? bub.querySelector('span').textContent : bub.textContent;
      txt = String(txt || '').replace(/⋯$/, '').trim();
      if (txt) items.push([L('📋 복사', '📋 Copy'), function(){ copyText(txt); }]);
    }
    if (id) {
      if (mine) items.push([L('🗑 삭제', '🗑 Delete'), function(){ runDelete([id]); }, 'danger']);
      else items.push([L('🙈 내 화면에서 지우기', '🙈 Remove for me'), function(){ runHide([id]); }]);
    }
    if (items.length) sheet(title, items);
  }

  /* 꾹 누르기 · 오른쪽 클릭 */
  function bind(list){
    var tm = null, sx = 0, sy = 0, held = false, pressed = null;
    function unpress(){ if (pressed) { pressed.classList.remove('acdel-pressing'); pressed = null; } }
    if (!document.getElementById('acdelCss')) {
      var st = document.createElement('style'); st.id = 'acdelCss';
      st.textContent = '.chat-bubble{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:transform .12s,filter .12s;}' +
        '.chat-bubble.acdel-pressing{transform:scale(.97);filter:brightness(.82);}' +
        '.chat-bubble.file-bubble{padding:6px !important;}';
      document.head.appendChild(st);
    }
    function ok(t){ return t.closest && t.closest('.chat-bubble') && !t.closest('.chat-bubble.deleted') && !t.closest('button.bubble-action-trigger'); }
    list.addEventListener('touchstart', function(e){
      var t = e.target; if (!ok(t)) return;
      var p = e.touches[0]; sx = p.clientX; sy = p.clientY; held = false;
      pressed = t.closest('.chat-bubble'); pressed.classList.add('acdel-pressing');
      tm = setTimeout(function(){ tm = null; held = true; unpress(); openFor(t); }, 450);
    }, { passive: true });
    list.addEventListener('touchmove', function(e){
      if (!tm) return; var p = e.touches[0];
      if (Math.abs(p.clientX - sx) > 10 || Math.abs(p.clientY - sy) > 10) { clearTimeout(tm); tm = null; unpress(); }
    }, { passive: true });
    list.addEventListener('touchend', function(){ if (tm) { clearTimeout(tm); tm = null; } unpress(); });
    list.addEventListener('touchcancel', function(){ if (tm) { clearTimeout(tm); tm = null; } unpress(); });
    list.addEventListener('click', function(e){ if (held) { held = false; e.stopPropagation(); e.preventDefault(); } }, true);
    list.addEventListener('contextmenu', function(e){
      var t = e.target; if (!ok(t)) return;
      e.preventDefault(); openFor(t);
    });
  }

  function init(c){
    cfg = c;
    if (c.list && !c.list.__acDel) { c.list.__acDel = true; bind(c.list); }
  }

  window.ACMsgDel = { init: init, track: track, applyDeleted: applyDeleted, applyHidden: applyHidden,
                      isHidden: isHidden, syncFromList: syncFromList, download: download };
  window.ACFiles = { info: info, render: render, send: sendFiles, download: download, toast: toast };
})();
