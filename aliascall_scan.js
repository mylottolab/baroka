/* =====================================================================
   Aliascall — QR 읽기 · 번호판 글자 읽기                         2026-10-09

   QR
     ① 앱이면 구글 코드 스캐너(AliasNative.scanQr) — 폰 카메라 앱 수준으로 빠르고 잘 읽습니다.
     ② 아니면 웹 카메라를 **고화질 · 계속 초점**으로 켜고,
        폰에 들어 있는 판독기(BarcodeDetector)를 먼저, 없으면 jsQR 을
        가운데 네모 칸 → 화면 전체 순서로 1초에 8번쯤 돌립니다.
        🔦 손전등 · 🔍 확대 · 🖼 사진에서 읽기.

   번호판
     📷 찍거나 🖼 사진(블랙박스 캡처 등)을 고르면 →
       앱(ML Kit, 폰 안에서 · 무료) 또는 서버(구글 Vision) 가 글자를 읽고 →
       "12가3456" 모양을 골라 → 고칠 수 있게 보여 준 뒤 → 그 번호로 찾습니다.
     하루 10번(2026-11-02 5→10, 서버가 셉니다 · ML Kit 로 읽어도 셉니다).

   화면이 할 일
     ACScan.init({ sb, url, lang: () => 'ko'|'en' })
     ACScan.qr().then((raw) => …)          취소하면 null
     ACScan.plate().then((plate) => …)     취소하면 null
   ===================================================================== */
(function(){
  'use strict';
  var C = { sb: null, url: '', lang: null };
  var FN = 'aliascall-plate-ocr';

  var T = {
    qrTtl:     ['QR 스캔', 'Scan QR'],
    qrHint:    ['QR을 네모 안에 맞춰 주세요 · 15~30cm 거리', 'Fit the QR inside the square · 15–30 cm away'],
    qrSlow:    ['잘 안 되면: 조금 떨어지기 · 🔦 켜기 · 🔍 확대 · 🖼 사진으로', 'Trouble? Step back a little · 🔦 light · 🔍 zoom · 🖼 photo'],
    camErr:    ['카메라를 열 수 없습니다. 카메라 권한을 확인해 주세요.', 'Could not open the camera. Please check camera permission.'],
    photo:     ['🖼 사진에서', '🖼 From photo'],
    torch:     ['🔦 손전등', '🔦 Light'],
    zoom:      ['🔍 확대', '🔍 Zoom'],
    noQr:      ['이 사진에서 QR을 찾지 못했습니다.', 'No QR code found in this photo.'],
    plTtl:     ['번호판 · 이름표 찍어서 찾기', 'Find by plate or name tag'],
    plHint:    ['번호판이나 이름표 글자를 칸에 맞추고 📷 를 누르세요', 'Fit the plate or name tag text in the box and tap 📷'],
    shoot:     ['📷 찍기', '📷 Shoot'],
    reading:   ['글자를 읽는 중…', 'Reading…'],
    found:     ['읽은 번호 — 틀리면 고쳐 주세요', 'Plate read — fix it if needed'],
    foundW:    ['읽은 글자 — 찾을 말을 고르거나 고쳐 주세요', 'Text read — pick or fix the words to search'],
    notFound:  ['글자를 찾지 못했습니다. 더 가까이, 똑바로 찍어 주세요. 직접 입력해도 됩니다.', 'Could not find a plate. Shoot closer and straight, or type it in.'],
    search:    ['이것으로 찾기', 'Search this'],
    again:     ['다시 찍기', 'Retake'],
    left:      ['오늘 남은 횟수 {n} / {m}', '{n} of {m} left today'],
    limit:     ['오늘은 글자 인식을 다 쓰셨습니다(하루 {m}번). 번호를 직접 입력해 찾아 주세요.', 'You have used today’s {m} plate reads. Please type the plate instead.'],
    ocrErr:    ['글자를 읽지 못했습니다', 'Could not read the text'],
    typeIt:    ['예: 12가3456', 'e.g. 12가3456'],
    close:     ['닫기', 'Close'],
    rawText:   ['읽은 글자 전체:', 'All text read:'],
    proOn:     ['📷 Pro · 번호판 인식 무제한', '📷 Pro · unlimited plate reading'],
    getPro:    ['Pro 긴급 이용권으로 무제한 (5,500원 / 12개월)', 'Unlimited with Emergency Pro (KRW 5,500 / 12 months)'],
  };
  function en(){ try { if (C.lang) return C.lang() === 'en'; } catch (e) {} try { return localStorage.getItem('aliascall_lang') === 'en'; } catch (e) { return false; } }
  function t(k, v){ var s = (T[k] || [k, k])[en() ? 1 : 0]; if (v) Object.keys(v).forEach(function(x){ s = s.split('{' + x + '}').join(String(v[x])); }); return s; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function $(id){ return document.getElementById(id); }

  /* ── 앱 창구(AliasNative) — 결과는 window.__acNativeCb 로 돌아옵니다 ── */
  var cbs = {}, seq = 0;
  window.__acNativeCb = function(id, ok, val){
    var f = cbs[id]; if (!f) return; delete cbs[id];
    try { f(!!ok, val == null ? '' : String(val)); } catch (e) {}
  };
  function native(name){ try { return !!(window.AliasNative && typeof AliasNative[name] === 'function'); } catch (e) { return false; } }
  function callNative(name, args, waitMs){
    return new Promise(function(done){
      var id = 'n' + (++seq) + '_' + Date.now();
      cbs[id] = function(ok, val){ done({ ok: ok, val: val }); };
      try { AliasNative[name].apply(AliasNative, (args || []).concat([id])); }
      catch (e) { delete cbs[id]; done({ ok: false, val: String(e && e.message || e) }); }
      setTimeout(function(){ if (cbs[id]) { delete cbs[id]; done({ ok: false, val: 'timeout' }); } }, waitMs || 90000);
    });
  }

  /* ── 모양 ─────────────────────────────────────────────────── */
  function css(){
    if ($('acscanCss')) return;
    var st = document.createElement('style'); st.id = 'acscanCss';
    st.textContent =
      '.acs-ov{display:none;position:fixed;inset:0;z-index:2147482000;background:#0a0f0e;flex-direction:column;color:#fff;font-family:inherit}' +
      '.acs-ov.show{display:flex}' +
      '.acs-top{display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 12px;font-weight:700;font-size:15px}' +
      '.acs-x{width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:17px;cursor:pointer}' +
      '.acs-frame{position:relative;flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
      '.acs-frame video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
      '.acs-box{position:relative;border:3px solid #E8734A;border-radius:18px;box-shadow:0 0 0 3000px rgba(0,0,0,.45);transition:border-color .2s}' +
      '.acs-box.qr{width:min(72vw,300px);height:min(72vw,300px)}' +
      '.acs-box.pl{width:min(88vw,420px);height:min(24vw,115px);border-radius:12px}' +
      '.acs-box.hit{border-color:#3BB273}' +
      '.acs-st{padding:12px 18px 6px;text-align:center;font-size:14px;line-height:1.5;min-height:22px}' +
      '.acs-row{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;padding:8px 14px calc(env(safe-area-inset-bottom,0px) + 18px)}' +
      '.acs-row button{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;border-radius:22px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer}' +
      '.acs-row button.on{background:#E8734A;border-color:#E8734A}' +
      '.acs-row button.big{background:#E8734A;border-color:#E8734A;padding:14px 26px;font-size:16px}' +
      '.acs-row input[type=range]{width:min(60vw,240px)}' +
      '.acs-res{display:none;position:absolute;left:12px;right:12px;bottom:12px;background:#14302E;border-radius:18px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.4)}' +
      '.acs-res.show{display:block}' +
      '.acs-res .h{font-size:13px;opacity:.8;margin-bottom:8px}' +
      '.acs-res input{width:100%;box-sizing:border-box;font-size:24px;font-weight:800;letter-spacing:1px;text-align:center;border-radius:12px;border:2px solid #E8734A;padding:10px;background:#fff;color:#12302E}' +
      '.acs-res .alt{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
      '.acs-res .alt button{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:6px 10px;font-size:13px;cursor:pointer}' +
      '.acs-res .b{display:flex;gap:8px;margin-top:12px}' +
      '.acs-res .b button{flex:1;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:800;cursor:pointer}' +
      '.acs-res .b .go{background:#E8734A;color:#fff}' +
      '.acs-res .b .re{background:rgba(255,255,255,.12);color:#fff}' +
      '.acs-res .lf{font-size:12px;opacity:.7;margin-top:8px;text-align:center}';
    document.head.appendChild(st);
  }

  /* ── 카메라 ───────────────────────────────────────────────── */
  async function openCam(video){
    var tries = [
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { facingMode: 'environment' } },
      { audio: false, video: true },
    ];
    var s = null, err = null;
    for (var i = 0; i < tries.length && !s; i++) { try { s = await navigator.mediaDevices.getUserMedia(tries[i]); } catch (e) { err = e; } }
    if (!s) throw err || new Error('camera');
    video.srcObject = s;
    video.setAttribute('playsinline', ''); video.muted = true;
    try { await video.play(); } catch (e) {}
    var track = s.getVideoTracks()[0];
    try {   // 계속 초점 (되는 폰만)
      var caps = track.getCapabilities ? track.getCapabilities() : {};
      var adv = {};
      if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) adv.focusMode = 'continuous';
      if (caps.exposureMode && caps.exposureMode.indexOf('continuous') >= 0) adv.exposureMode = 'continuous';
      if (Object.keys(adv).length) await track.applyConstraints({ advanced: [adv] });
    } catch (e) {}
    return { stream: s, track: track };
  }
  function closeCam(cam){ try { cam && cam.stream.getTracks().forEach(function(x){ x.stop(); }); } catch (e) {} }

  /* 🔦 · 🔍 단추 (되는 폰에서만 보입니다) */
  function camTools(cam, row){
    var caps = {};
    try { caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {}; } catch (e) {}
    if (caps.torch) {
      var tb = document.createElement('button'); tb.type = 'button'; tb.textContent = t('torch');
      var on = false;
      tb.onclick = async function(){ on = !on; try { await cam.track.applyConstraints({ advanced: [{ torch: on }] }); tb.classList.toggle('on', on); } catch (e) { on = !on; } };
      row.appendChild(tb);
    }
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      var zr = document.createElement('input'); zr.type = 'range';
      zr.min = caps.zoom.min; zr.max = Math.min(caps.zoom.max, (caps.zoom.min || 1) * 5); zr.step = caps.zoom.step || 0.1; zr.value = caps.zoom.min;
      zr.setAttribute('aria-label', t('zoom'));
      zr.oninput = function(){ try { cam.track.applyConstraints({ advanced: [{ zoom: Number(zr.value) }] }); } catch (e) {} };
      row.appendChild(zr);
    }
  }

  /* 화면의 네모 칸 → 영상 속 실제 자리 (object-fit: cover 계산) */
  function boxInVideo(video, box, pad){
    var vw = video.videoWidth, vh = video.videoHeight;
    var r = video.getBoundingClientRect(), b = box.getBoundingClientRect();
    var sc = Math.max(r.width / vw, r.height / vh);
    var ox = (r.width - vw * sc) / 2, oy = (r.height - vh * sc) / 2;
    pad = pad || 0;
    var x = (b.left - r.left - ox) / sc - pad * b.width / sc, y = (b.top - r.top - oy) / sc - pad * b.height / sc;
    var w = b.width / sc * (1 + 2 * pad), h = b.height / sc * (1 + 2 * pad);
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    return { x: x, y: y, w: w, h: h };
  }
  function grab(src, rc, maxW){
    var w = rc ? rc.w : (src.videoWidth || src.naturalWidth || src.width), h = rc ? rc.h : (src.videoHeight || src.naturalHeight || src.height);
    var sc = Math.min(1, (maxW || 1280) / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, rc ? rc.x : 0, rc ? rc.y : 0, w, h, 0, 0, c.width, c.height);
    return c;
  }

  /* ── QR 읽기 ──────────────────────────────────────────────── */
  var detector = null;
  async function getDetector(){
    if (detector !== null) return detector;
    detector = false;
    try {
      if ('BarcodeDetector' in window) {
        var f = await window.BarcodeDetector.getSupportedFormats();
        if (f.indexOf('qr_code') >= 0) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { detector = false; }
    return detector;
  }
  var jsqrP = null;
  function loadJsQR(){
    if (window.jsQR) return Promise.resolve(true);
    if (jsqrP) return jsqrP;
    jsqrP = new Promise(function(done){
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = function(){ done(true); }; s.onerror = function(){ done(false); };
      document.head.appendChild(s);
    });
    return jsqrP;
  }
  async function decodeCanvas(c, both){
    var d = await getDetector();
    if (d) { try { var r = await d.detect(c); if (r && r[0] && r[0].rawValue) return r[0].rawValue; } catch (e) {} }
    if (!window.jsQR) await loadJsQR();
    if (!window.jsQR) return null;
    var g = c.getContext('2d', { willReadFrequently: true });
    var img = g.getImageData(0, 0, c.width, c.height);
    var q = window.jsQR(img.data, img.width, img.height, { inversionAttempts: both ? 'attemptBoth' : 'dontInvert' });
    return q && q.data ? q.data : null;
  }
  async function decodeFile(file){
    var url = URL.createObjectURL(file);
    try {
      var im = new Image(); im.src = url;
      await im.decode();
      var sizes = [1600, 1000, 640];   // 큰 사진은 여러 크기로 시도합니다
      for (var i = 0; i < sizes.length; i++) {
        var r = await decodeCanvas(grab(im, null, sizes[i]), true);
        if (r) return r;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }

  function pickFile(capture){
    return new Promise(function(done){
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      if (capture) inp.setAttribute('capture', 'environment');
      inp.onchange = function(){ done(inp.files && inp.files[0] || null); };
      inp.style.display = 'none'; document.body.appendChild(inp); inp.click();
      setTimeout(function(){ inp.remove(); }, 60000);
    });
  }

  function overlay(kind, title){
    css();
    var ov = document.createElement('div'); ov.className = 'acs-ov show';
    ov.innerHTML =
      '<div class="acs-top"><button type="button" class="acs-x" aria-label="' + esc(t('close')) + '">✕</button><span>' + esc(title) + '</span></div>' +
      '<div class="acs-frame"><video playsinline autoplay muted></video><div class="acs-box ' + kind + '"></div><div class="acs-res"></div></div>' +
      '<div class="acs-st"></div><div class="acs-row"></div>';
    document.body.appendChild(ov);
    return { ov: ov, video: ov.querySelector('video'), box: ov.querySelector('.acs-box'), st: ov.querySelector('.acs-st'),
             row: ov.querySelector('.acs-row'), res: ov.querySelector('.acs-res'), x: ov.querySelector('.acs-x') };
  }

  async function qr(){
    /* ① 앱 — 구글 코드 스캐너 */
    if (native('scanQr')) {
      var r = await callNative('scanQr', []);
      if (r.ok && r.val) return r.val;
      if (r.val === 'cancel') return null;
      console.warn('[scan] 앱 스캐너 실패, 웹으로 읽습니다:', r.val);
    }
    /* ② 웹 */
    return new Promise(async function(done){
      var u = overlay('qr', t('qrTtl'));
      var cam = null, live = true, n = 0, started = Date.now();
      function finish(v){
        if (!live) return; live = false;
        closeCam(cam); u.ov.remove(); done(v);
      }
      u.x.onclick = function(){ finish(null); };
      u.st.textContent = t('qrHint');
      var pb = document.createElement('button'); pb.type = 'button'; pb.textContent = t('photo');
      pb.onclick = async function(){
        var f = await pickFile(false); if (!f) return;
        var v = await decodeFile(f);
        if (v) finish(v); else u.st.textContent = t('noQr');
      };
      u.row.appendChild(pb);
      try { cam = await openCam(u.video); camTools(cam, u.row); }
      catch (e) { u.st.textContent = t('camErr'); return; }
      getDetector(); loadJsQR();
      (async function loop(){
        while (live) {
          if (u.video.readyState >= 2 && u.video.videoWidth) {
            n++;
            try {
              // 번갈아: 가운데 칸(여유 30%)을 크게 / 화면 전체를 작게
              var c = (n % 3 !== 0) ? grab(u.video, boxInVideo(u.video, u.box, 0.3), 900) : grab(u.video, null, 800);
              var v = await decodeCanvas(c, n % 4 === 0);
              if (v) { u.box.classList.add('hit'); if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {} setTimeout(function(){ finish(v); }, 150); return; }
            } catch (e) {}
            if (Date.now() - started > 8000 && u.st.textContent === t('qrHint')) u.st.textContent = t('qrSlow');
          }
          await new Promise(function(r2){ setTimeout(r2, 110); });
        }
      })();
    });
  }

  /* ── 번호판 ───────────────────────────────────────────────── */
  var REGION = '(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)';
  var DIG = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', T: '7', g: '9' };
  function digits(s){ return s.replace(/[OoDQIl|iZzSsBGbTg]/g, function(c){ return DIG[c] || c; }); }
  function plates(text){
    var found = [];
    function add(p){ p = p.replace(/\s+/g, ''); if (found.indexOf(p) < 0) found.push(p); }
    var lines = String(text || '').split(/\n+/);
    var chunks = lines.concat([lines.join(''), lines.join(' ')]);
    chunks.forEach(function(raw){
      var s = raw.replace(/[\s\-·.]/g, ''), m;
      var re1 = new RegExp(REGION + '([0-9OoDQIl|iZzSsBGbTg]{1,2})([가-힣])([0-9OoDQIl|iZzSsBGbTg]{4})', 'g');
      while ((m = re1.exec(s))) add(m[1] + digits(m[2]) + m[3] + digits(m[4]));
      var re2 = /([0-9OoDQIl|iZzSsBGbTg]{2,3})([가-힣])([0-9OoDQIl|iZzSsBGbTg]{4})/g;
      while ((m = re2.exec(s))) { var a = digits(m[1]), d = digits(m[3]); if (/^\d+$/.test(a) && /^\d{4}$/.test(d)) add(a + m[2] + d); }
    });
    return found.slice(0, 5);
  }
  /* 🔴 번호판이 아니면 — 이름표 · 물품 스티커 · 반려동물 목걸이 등에 적힌 말을 검색어 후보로 */
  var STOP = ['주의','경고','사용','제품','www','http','com','kr','the','and'];
  function words(text){
    var out = [];
    String(text || '').split(/\n+/).forEach(function(line){
      var l = line.replace(/[^0-9A-Za-z가-힣\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (l.length >= 2 && l.length <= 20 && out.indexOf(l) < 0) out.push(l);           // 한 줄 통째로 (예: 김민준 가방)
      l.split(' ').forEach(function(w){
        if (w.length >= 2 && !/^\d{1,3}$/.test(w) && STOP.indexOf(w.toLowerCase()) < 0 && out.indexOf(w) < 0) out.push(w);
      });
    });
    return out.slice(0, 8);
  }

  function anonId(){
    try {
      var id = localStorage.getItem('aliascall_finder_anon_id');
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem('aliascall_finder_anon_id', id); }
      return id;
    } catch (e) { return ''; }
  }
  async function fnCall(body){
    var h = { 'Content-Type': 'application/json' };
    try { if (C.sb) { var s = await C.sb.auth.getSession(); if (s && s.data && s.data.session) h.Authorization = 'Bearer ' + s.data.session.access_token; } } catch (e) {}
    var r = await fetch(C.url + '/functions/v1/' + FN, { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ anonId: anonId() }, body)) });
    var d = await r.json().catch(function(){ return {}; });
    d._status = r.status;
    return d;
  }

  /* 사진(canvas) → 글자. 앱이면 폰에서(ML Kit), 아니면 서버에서. */
  async function readText(canvas){
    if (native('ocrImage')) {
      var b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      var r = await callNative('ocrImage', [b64]);
      /* 폰이 읽어 낸 것이 있을 때만 셉니다. 아무것도 못 찾았으면 서버(구글 Vision)로 한 번 더 */
      if (r.ok && (plates(r.val).length || words(r.val).length)) {
        var cnt = await fnCall({ action: 'count' });
        if (cnt._status === 429) return { limit: true };
        return { text: r.val, plates: plates(r.val), left: cnt.left, limit_n: cnt.limit, pro: !!cnt.pro };
      }
      console.warn('[scan] 앱 글자 인식 실패, 서버로 읽습니다:', r.val);
    }
    var img = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
    var d = await fnCall({ action: 'ocr', image: img });
    if (d._status === 429) return { limit: true };
    if (d.error) return { error: d.error, left: d.left, limit_n: d.limit, pro: !!d.pro };
    return { text: d.text || '', plates: d.plates || [], left: d.left, limit_n: d.limit, pro: !!d.pro };
  }

  /* 🔴 2026-10-18 — 실시간 글자 스캐너 (앱 버전에 AliasNative.scanText 가 있을 때)
     복권 QR 처럼 카메라를 대고만 있으면 번호판(12가3456)이 잡히는 순간 바로 찾습니다.
     · 번호판이 잡히면 → 확인 없이 곧장 그 번호로 검색
     · 이름표 · 물품 글자를 눌러 고르면 → 예전처럼 확인 칸(고쳐서 찾기)
     · 하루 횟수는 "실제로 찾을 때" 한 번만 셉니다(화면이 계속 읽는 것은 세지 않음)
     · 앱이 '사진으로' 를 누르거나 이 기능이 없는 폰이면 → 예전 사진 찍기 화면 */
  async function plate(){
    if (native('scanText')) {
      try {
        var lf = await fnCall({ action: 'left' });
        if (!lf.pro && lf.left === 0) return platePhoto({ limit: true, limit_n: lf.limit });
        var r = await callNative('scanText', [en() ? 'en' : 'ko'], 15 * 60 * 1000);
        if (r.ok) {
          var text = r.val || '';
          /* 앱은 "보인 글자 전체 + 마지막 줄에 두 번 확인된 번호판" 을 돌려줍니다 — 마지막 줄을 먼저 믿습니다 */
          var lastLine = String(text).trim().split('\n').pop() || '';
          var ps = plates(lastLine); if (!ps.length) ps = plates(text);
          var cnt = {};
          try { cnt = await fnCall({ action: 'count' }); } catch (e) { cnt = {}; }   // 세기 실패해도 읽은 번호판은 살립니다
          if (cnt._status === 429) return platePhoto({ limit: true, limit_n: cnt.limit });
          if (ps.length) return ps[0];
          return platePhoto({ text: text, plates: [], left: cnt.left, limit_n: cnt.limit, pro: !!cnt.pro });
        }
        if (r.val === 'cancel') return null;
        /* 'manual'(사진으로) · 'unsupported'(오래된 폰) · 그 밖의 실패 → 아래 사진 방식 */
      } catch (e) { console.warn('[scan] 실시간 스캐너 실패, 사진 방식으로', e); }
    }
    return platePhoto(null);
  }

  async function platePhoto(initial){
    return new Promise(async function(done){
      var u = overlay('pl', t('plTtl'));
      var cam = null, live = true;
      function finish(v){ if (!live) return; live = false; closeCam(cam); u.ov.remove(); done(v); }
      u.x.onclick = function(){ finish(null); };
      u.st.textContent = t('plHint');

      function showResult(r){
        var lim = r.limit_n || 10;
        if (r.limit) {
          u.res.innerHTML = '<div class="h">' + esc(t('limit', { m: lim })) + '</div>' +
            '<input type="text" inputmode="text" placeholder="' + esc(t('typeIt')) + '">' +
            '<div class="b"><button type="button" class="go">' + esc(t('search')) + '</button></div>' +
            '<div class="alt" style="justify-content:center;margin-top:10px"><button type="button" class="pro">' + esc(t('getPro')) + '</button></div>';
        } else {
          var ps = r.plates || [];
          var isW = false;
          if (!ps.length && !r.error) { ps = words(r.text); isW = ps.length > 0; }
          u.res.innerHTML = '<div class="h">' + esc(r.error ? (t('ocrErr') + ' — ' + r.error) : (isW ? t('foundW') : (ps.length ? t('found') : t('notFound')))) + '</div>' +
            '<input type="text" inputmode="text" value="' + esc(ps[0] || '') + '" placeholder="' + esc(t('typeIt')) + '">' +
            (ps.length > 1 ? '<div class="alt">' + ps.slice(1).map(function(p){ return '<button type="button" data-p="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>' : '') +
            '<div class="b"><button type="button" class="re">' + esc(t('again')) + '</button><button type="button" class="go">' + esc(t('search')) + '</button></div>' +
            (r.text ? '<div class="lf" style="opacity:.6">' + esc(t('rawText')) + ' ' + esc(String(r.text).replace(/\s+/g, ' ').slice(0, 60)) + '</div>' : '') +
            (r.pro ? '<div class="lf">' + esc(t('proOn')) + '</div>'
                   : (typeof r.left === 'number' ? '<div class="lf">' + esc(t('left', { n: r.left, m: lim })) + '</div>' : ''));
        }
        u.res.classList.add('show');
        var inp = u.res.querySelector('input');
        u.res.querySelectorAll('[data-p]').forEach(function(b){ b.onclick = function(){ inp.value = b.getAttribute('data-p'); }; });
        var pr = u.res.querySelector('.pro'); if (pr) pr.onclick = function(){ finish(null); location.href = 'aliascall_plans.html?plan=emergency_pro'; };
        var re = u.res.querySelector('.re'); if (re) re.onclick = function(){ u.res.classList.remove('show'); u.st.textContent = t('plHint'); };
        u.res.querySelector('.go').onclick = function(){ var v = inp.value.trim(); if (v) finish(v); else inp.focus(); };
      }
      async function run(canvas){
        u.st.textContent = t('reading');
        u.res.classList.remove('show');
        try { showResult(await readText(canvas)); }
        catch (e) { showResult({ error: (e && e.message) || '', plates: [] }); }
        u.st.textContent = '';
      }

      var sb2 = document.createElement('button'); sb2.type = 'button'; sb2.className = 'big'; sb2.textContent = t('shoot');
      sb2.onclick = function(){
        if (!cam || !u.video.videoWidth) return;
        // 칸보다 넉넉히(위아래 60%) 잘라 보냅니다 — 번호판이 칸을 조금 벗어나도 읽게
        // 🔴 2026-10-09 — 이름표 · 물품 글자는 칸 밖으로 나가기 쉬워 넉넉히(칸의 3배) 보냅니다
        var rc = boxInVideo(u.video, u.box, 1.0);
        run(grab(u.video, rc, 1280));
      };
      var pb = document.createElement('button'); pb.type = 'button'; pb.textContent = t('photo');
      pb.onclick = async function(){
        var f = await pickFile(false); if (!f) return;
        var url = URL.createObjectURL(f);
        try { var im = new Image(); im.src = url; await im.decode(); run(grab(im, null, 1600)); }
        finally { setTimeout(function(){ URL.revokeObjectURL(url); }, 5000); }
      };
      u.row.appendChild(sb2); u.row.appendChild(pb);
      if (initial) { showResult(initial); u.st.textContent = ''; }
      try { cam = await openCam(u.video); camTools(cam, u.row); }
      catch (e) { if (!initial) u.st.textContent = t('camErr') + ' ' + t('photo'); sb2.style.display = 'none'; }
    });
  }

  window.ACScan = {
    init: function(o){ C.sb = o.sb || C.sb; C.url = o.url || C.url; if (o.lang) C.lang = o.lang; },
    qr: qr,
    plate: plate,
    plates: plates,
    words: words,
    left: function(){ return fnCall({ action: 'left' }); },
    hasNative: function(){ return { qr: native('scanQr'), ocr: native('ocrImage'), live: native('scanText') }; },
  };
})();
