/* =====================================================================
   Aliascall — 화면 설정 (주간/야간 · 색깔 · 글자 크기/굵기/글씨체)
   2026-10-07

   쓰는 법
     각 화면 <head> 맨 끝(</head> 바로 위)에 한 줄:
       <script src="aliascall_theme.js"></script>

   하는 일
     1) 고른 설정을 이 폰에 적어둡니다(localStorage).
     2) 화면이 뜨기 전에 <html> 에 표를 붙여 색을 바꿉니다. (번쩍임 없음)
     3) 언어 단추(KR/EN) 옆에 [🌙] [Aa] 단추를 붙입니다.
        🌙 = 주간/야간 바로 바꾸기, Aa = 색깔·글자 설정 창

   ⚠ 야간 모드에서 화면마다 직접 적어둔 흰 바탕·검은 글씨는
     이 파일이 알아서 어둡게/밝게 바꿉니다. 주간으로 돌아가면 원래대로.
   ⚠ 통화 화면(연결·받은 전화·핫라인 방)은 화면 전체를 키우지 않고
     대화 글씨만 키웁니다. 단추가 화면 밖으로 밀리면 전화를 못 받습니다.
   ===================================================================== */
(function(){
  'use strict';
  var KEY = 'aliascall_theme_v1';
  var DEF = { mode:'light', color:'blue', fs:'md', fw:'normal', ff:'system' };
  var root = document.documentElement;

  function en(){
    try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; }
    catch (e) { return false; }
  }
  function read(){
    try {
      var raw = localStorage.getItem(KEY);
      var t = raw ? JSON.parse(raw) : {};
      var o = {}; for (var k in DEF) o[k] = (t && t[k]) || DEF[k];
      return o;
    } catch (e) { return Object.assign({}, DEF); }
  }
  function write(t){ try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} }

  /* 통화가 들어있는 화면 — 전체 확대 대신 대화 글씨만 키웁니다. */
  var NOZOOM = /aliascall_connect|aliascall_incoming_calls|aliascall_hotline_room/.test(location.pathname);
  if (NOZOOM) root.setAttribute('data-ac-nozoom', '');

  /* ── 색 ───────────────────────────────────────────────────────────
     🔴 2026-11-01 주간 색을 더 맑고 선명하게(손님: "뿌옇다") — 진한색은 흰 글씨가 잘 읽히는 밝기로 둡니다.
     각 색: [주간 강조, 주간 진한색, 주간 옅은색, 주간 바탕,
             야간 강조, 야간 글씨용 밝은색, 야간 옅은색, 야간 머리띠 바탕] */
  var COLORS = {
    teal:   ['#0B8A80','#06655E','#D3F3EF','#9FE0D5', '#2A8C86','#8ED6CF','#1C302E','#0B2C2A'],
    blue:   ['#1450F5','#0B3BC4','#E3EBFF','#B3C8FF', '#3B7DD1','#9CC3F0','#1B2838','#0F2340'],
    purple: ['#7B3FE4','#5523B8','#EEE3FF','#CFB8F8', '#8466C9','#C8B5F0','#272038','#231A3D'],
    rose:   ['#E0397A','#B0124F','#FFE1ED','#F7B6CF', '#CC5C86','#F0B0C8','#35202A','#3A1626'],
    green:  ['#17A050','#0B7337','#D5F6E2','#A6E6C0', '#3D9A63','#9FDAB5','#1C2E23','#10291B'],
    brown:  ['#BC6A1E','#86470E','#FCE9D4','#EBC79D', '#A87440','#E3C29D','#2E261D','#2E1E10'],
    gray:   ['#4F6072','#2E3C4B','#E7EDF3','#CBD6E1', '#6B7785','#C3CCD6','#22272D','#1A1F25'],
    white:  ['#0B8A80','#06655E','#E6F7F5','#FFFFFF', '#2A8C86','#8ED6CF','#1C302E','#0B2C2A'],
  };
  var COLOR_NAMES = {
    teal:['청록','Teal'], blue:['파랑(기본)','Blue (default)'], purple:['보라','Purple'],
    rose:['분홍','Rose'], green:['초록','Green'], brown:['갈색','Brown'], gray:['회색','Gray'],
    white:['흰 바탕','White'],
  };

  function cssText(){
    var s = '';
    Object.keys(COLORS).forEach(function(k){
      var c = COLORS[k];
      s += 'html[data-ac-color="' + k + '"]:not([data-ac-mode="dark"]){' +
        '--teal:' + c[0] + ';--teal-deep:' + c[1] + ';--teal-tint:' + c[2] + ';--paper:' + c[3] +
        ';--deep:' + c[1] + ';--tint:' + c[2] + ';--ac-deep-bg:' + c[1] + ';}' +
        'html[data-ac-color="' + k + '"][data-ac-mode="dark"]{' +
        '--teal:' + c[4] + ';--teal-deep:' + c[5] + ';--teal-tint:' + c[6] +
        ';--deep:' + c[5] + ';--tint:' + c[6] + ';--ac-deep-bg:' + c[7] + ';}';
    });
    /* 야간 공통 */
    s += 'html[data-ac-mode="dark"]{color-scheme:dark;' +
      '--ink:#E3ECEA;--ink-soft:#A3B6B3;--soft:#7F9C98;--paper:#0E1716;--card:#182322;' +
      '--line:#2D3B39;--coral-tint:#3A2620;--danger-tint:#3A1F1C;--amber-tint:#3A3120;' +
      '--brass-tint:#3A331E;--found-tint:rgba(61,154,99,.18);--ok-tint:#1C2E23;--warn:#3A2620;' +
      '--danger:#E07063;--found:#4DB277;--coral:#EE8560;}' +
      'html[data-ac-mode="dark"] body{background-color:var(--paper);color:var(--ink);}' +
      'html[data-ac-mode="dark"] input:not([type=checkbox]):not([type=radio]):not([type=range]),' +
      'html[data-ac-mode="dark"] textarea,html[data-ac-mode="dark"] select{' +
        'background-color:var(--card);color:var(--ink);border-color:var(--line);}' +
      'html[data-ac-mode="dark"] ::placeholder{color:#7F9592;}' +
      'html[data-ac-mode="dark"] img.brand-mark, html[data-ac-mode="dark"] video{filter:none;}';
    /* 글자 크기 — 화면 전체 확대 (통화 화면 제외) */
    s += 'html[data-ac-fs="lg"]:not([data-ac-nozoom]) body{zoom:1.12;}' +
      'html[data-ac-fs="xl"]:not([data-ac-nozoom]) body{zoom:1.25;}' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .chat-bubble,html[data-ac-fs="lg"][data-ac-nozoom] #chatInput,' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .chat-input{font-size:15.5px !important;}' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .chat-bubble,html[data-ac-fs="xl"][data-ac-nozoom] #chatInput,' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .chat-input{font-size:18px !important;}' +
      'html[data-ac-fs="lg"][data-ac-nozoom] .msg-time-text{font-size:11.5px !important;}' +
      'html[data-ac-fs="xl"][data-ac-nozoom] .msg-time-text{font-size:12.5px !important;}';
    /* 글자 굵기 */
    s += 'html[data-ac-fw="bold"] body{font-weight:600;}' +
      'html[data-ac-fw="bold"] body p,html[data-ac-fw="bold"] body span,html[data-ac-fw="bold"] body div,' +
      'html[data-ac-fw="bold"] body li,html[data-ac-fw="bold"] body label,html[data-ac-fw="bold"] .chat-bubble{font-weight:600;}' +
      'html[data-ac-fw="bold"] b,html[data-ac-fw="bold"] strong,html[data-ac-fw="bold"] h1,' +
      'html[data-ac-fw="bold"] h2,html[data-ac-fw="bold"] h3,html[data-ac-fw="bold"] button{font-weight:800;}';
    /* 글씨체 — 폰에 있는 글꼴만 씁니다(받아오지 않음) */
    var FF = {
      gothic:   "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','Nanum Gothic','Roboto',system-ui,sans-serif",
      myeongjo: "'Noto Serif KR','Nanum Myeongjo','AppleMyungjo','Batang',serif",
      dotum:    "'Dotum','돋움','Gulim','굴림','Malgun Gothic',system-ui,sans-serif",
      hand:     "'Nanum Pen Script','Gaegu','Cute Font','Comic Sans MS',cursive,system-ui,sans-serif",
    };
    Object.keys(FF).forEach(function(k){
      s += 'html[data-ac-font="' + k + '"] body,html[data-ac-font="' + k + '"] body *:not(code):not(.mono):not(.code){font-family:' + FF[k] + ' !important;}';
    });
    /* 설정 단추·창 */
    s += '.ac-th-btn{border:1px solid var(--line,#DCE3DE);background:var(--card,#fff);color:var(--ink,#12302E);' +
      'border-radius:14px;min-width:28px;height:28px;padding:0 5px;font-size:12px;font-weight:800;cursor:pointer;' +
      'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;font-family:inherit;}' +
      '.ac-gear:not(.ac-gear-float){margin-left:auto;}' +
      'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}' +
      '.ac-gear{min-width:34px;height:34px;border-radius:17px;font-size:17px;font-weight:400;padding:0;}' +
      '.ac-gear-float{background:rgba(255,255,255,.15) !important;color:#fff !important;border:1px solid rgba(255,255,255,.25) !important;}' +
      '.ac-lang-hidden,html.ac-compact #acHelpLink{display:none !important;}' +
      '.ac-th-wrap{display:inline-flex;gap:3px;align-items:center;margin-left:4px;flex-shrink:0;}' +
      '.ac-th-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;}' +
      '.ac-th-sheet{position:fixed;left:0;right:0;bottom:0;z-index:99999;max-height:86vh;overflow:auto;' +
      'background:var(--card,#fff);color:var(--ink,#12302E);border-radius:18px 18px 0 0;padding:10px 16px 22px;' +
      'box-shadow:0 -8px 30px rgba(0,0,0,.25);max-width:560px;margin:0 auto;font-size:14px;zoom:1 !important;}' +
      '.ac-th-sheet .grip{width:40px;height:4px;border-radius:2px;background:var(--line,#ccc);margin:2px auto 10px;}' +
      '.ac-th-sheet h3{margin:0 0 4px;font-size:17px;}' +
      '.ac-th-sheet .lab{margin:14px 0 7px;font-size:12.5px;font-weight:800;color:var(--ink-soft,#3E5654);}' +
      '.ac-th-sheet .row{display:flex;flex-wrap:wrap;gap:7px;}' +
      '.ac-th-sheet .opt{border:1.5px solid var(--line,#DCE3DE);background:transparent;color:inherit;border-radius:12px;' +
      'padding:9px 12px;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;}' +
      '.ac-th-sheet .opt.on{border-color:var(--teal,#1F6F6B);background:var(--teal-tint,#E4EFEE);color:var(--ink);}' +
      '.ac-th-sheet .dot{width:16px;height:16px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.15);}' +
      '.ac-th-sheet .done{display:block;width:100%;margin-top:18px;border:none;border-radius:12px;padding:13px;' +
      'background:var(--teal,#1F6F6B);color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.ac-th-sheet .note{font-size:12px;color:var(--ink-soft,#3E5654);margin:2px 0 0;line-height:1.5;}';
    return s;
  }

  var st = document.createElement('style');
  st.id = 'acThemeCss';
  st.textContent = cssText();
  (document.head || root).appendChild(st);

  /* ── 야간: 화면마다 직접 적어둔 색을 바꿉니다 ─────────────────────
     흰 바탕 → 카드색, 아주 밝은 바탕 → 어두운 칸, 짙은 글씨 → 밝은 글씨,
     머리띠의 진한 청록 바탕(var(--teal-deep)) → 어두운 머리띠.
     바꾼 것은 적어두었다가 주간으로 돌아가면 그대로 되돌립니다. */
  var NAMED = { white:[255,255,255], black:[0,0,0] };
  function parseColor(v){
    v = String(v || '').trim().toLowerCase();
    if (NAMED[v]) return { r:NAMED[v][0], g:NAMED[v][1], b:NAMED[v][2], a:1 };
    var m = v.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function(x){ return x + x; }).join('');
      return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16),
               a: h.length === 8 ? parseInt(h.slice(6,8),16) / 255 : 1 };
    }
    m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      var a = m[4] === undefined ? 1 : (m[4].indexOf('%') > 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r:+m[1], g:+m[2], b:+m[3], a:a };
    }
    return null;
  }
  function lum(c){ return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
  function sat(c){ var mx = Math.max(c.r,c.g,c.b), mn = Math.min(c.r,c.g,c.b); return mx ? (mx - mn) / mx : 0; }

  /* 바탕색 하나를 야간용으로 */
  function darkBg(v){
    if (/var\(--teal-deep\)/.test(v)) return v.replace(/var\(--teal-deep\)/g, 'var(--ac-deep-bg)');
    if (/var\(--ink\)/.test(v)) return v.replace(/var\(--ink\)/g, 'var(--card)');
    var c = parseColor(v);
    if (!c) {
      // 밝은 색만으로 된 그라데이션 → 바탕색
      if (/gradient/.test(v)) {
        var cols = v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/gi) || [];
        if (cols.length && cols.every(function(x){ var p = parseColor(x); return p && (lum(p) > 0.78 || p.a < 0.2); }))
          return 'var(--paper)';
      }
      return null;
    }
    if (c.a < 0.35) return null;                     // 옅게 비치는 것은 그대로
    var L = lum(c);
    if (L > 0.93 && sat(c) < 0.12) return 'var(--card)';
    if (L > 0.80) {                                  // 연한 색 바탕(노랑 안내칸 등)
      // 색감은 남기고 아주 어둡게
      return 'rgb(' + Math.round(c.r * 0.22) + ',' + Math.round(c.g * 0.22) + ',' + Math.round(c.b * 0.22) + ')';
    }
    return null;
  }
  /* 글씨색 하나를 야간용으로 */
  function darkFg(v){
    var c = parseColor(v);
    if (!c) return null;
    var L = lum(c);
    if (L < 0.30) {
      if (sat(c) < 0.35) return 'var(--ink)';
      // 짙은 색 글씨(진한 빨강 등) → 같은 색감의 밝은 글씨
      var k = 0.62;
      return 'rgb(' + Math.round(c.r + (255 - c.r) * k) + ',' + Math.round(c.g + (255 - c.g) * k) + ',' + Math.round(c.b + (255 - c.b) * k) + ')';
    }
    return null;
  }
  function darkBorder(v){
    var c = parseColor(v);
    if (c && lum(c) > 0.80 && c.a >= 0.35) return 'var(--line)';
    return null;
  }

  var changed = [];          // [target(style decl), prop, old, oldPrio]
  function setProp(decl, prop, val){
    var old = decl.getPropertyValue(prop), pr = decl.getPropertyPriority(prop);
    if (!old || old === val) return;
    changed.push([decl, prop, old, pr]);
    decl.setProperty(prop, val, pr);
  }
  function fixDecl(decl){
    if (!decl) return;
    var bg = decl.getPropertyValue('background-color');
    var b2 = decl.getPropertyValue('background');
    var nb;
    if (bg && (nb = darkBg(bg))) setProp(decl, 'background-color', nb);
    else if (b2 && (nb = darkBg(b2))) {
      // background 한 줄짜리에서 색만 바꿉니다
      if (parseColor(b2) || /^var\(/.test(b2.trim()) || nb === 'var(--paper)') setProp(decl, 'background', nb);
      else if (/var\(--teal-deep\)|var\(--ink\)/.test(b2)) setProp(decl, 'background', nb);
    }
    var bi = decl.getPropertyValue('background-image');
    if (bi && /gradient/.test(bi) && (nb = darkBg(bi)) === 'var(--paper)') setProp(decl, 'background-image', 'none');
    var fg = decl.getPropertyValue('color'), nf;
    if (fg && (nf = darkFg(fg))) setProp(decl, 'color', nf);
    ['border-color','border-bottom-color','border-top-color','border-left-color','border-right-color'].forEach(function(p){
      var v = decl.getPropertyValue(p), nv;
      if (v && (nv = darkBorder(v))) setProp(decl, p, nv);
    });
  }
  function walkRules(rules){
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && !r.style) { walkRules(r.cssRules); continue; }
      if (!r.style || !r.selectorText) continue;
      if (/^:root$|^html$/.test(r.selectorText.trim())) continue;
      if (/\.ac-th-/.test(r.selectorText)) continue;
      if (/\.ac-keep|\.sd-good/.test(r.selectorText)) continue;   // 🔴 2026-11-03 야간에도 색을 그대로 두는 것(💎 좋은번호 단추 등)
      fixDecl(r.style);
    }
  }
  function fixSheets(){
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i];
      if (sh.ownerNode && sh.ownerNode.id === 'acThemeCss') continue;
      if (sh.__acDone) continue;
      try { walkRules(sh.cssRules); sh.__acDone = true; } catch (e) { /* 다른 곳 파일은 못 읽습니다 */ }
    }
  }
  function fixInline(scope){
    var list = (scope.querySelectorAll ? scope.querySelectorAll('[style]') : []);
    if (scope.getAttribute && scope.getAttribute('style')) fixDecl(scope.style);
    for (var i = 0; i < list.length; i++) {
      if (list[i].closest && list[i].closest('.ac-th-sheet')) continue;
      fixDecl(list[i].style);
    }
  }
  var obs = null;
  function startDark(){
    fixSheets();
    if (document.body) fixInline(document.body);
    if (!obs && window.MutationObserver) {
      obs = new MutationObserver(function(muts){
        if (root.getAttribute('data-ac-mode') !== 'dark') return;
        muts.forEach(function(m){
          if (m.type === 'attributes') { if (m.target.style) fixDecl(m.target.style); return; }
          m.addedNodes && m.addedNodes.forEach(function(n){
            if (n.nodeType !== 1) return;
            if (n.tagName === 'STYLE' || n.tagName === 'LINK') { setTimeout(fixSheets, 0); return; }
            fixInline(n);
          });
        });
      });
      obs.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
    }
  }
  function stopDark(){
    if (obs) { obs.disconnect(); obs = null; }
    for (var i = changed.length - 1; i >= 0; i--) {
      var c = changed[i];
      try { c[0].setProperty(c[1], c[2], c[3]); } catch (e) {}
    }
    changed = [];
    for (var j = 0; j < document.styleSheets.length; j++) {
      try { document.styleSheets[j].__acDone = false; } catch (e) {}
    }
  }

  /* ── 적용 ──────────────────────────────────────────────────────── */
  var cur = read();
  function effMode(t){
    if (t.mode === 'auto') {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    return t.mode;
  }
  function apply(t){
    cur = t;
    var mode = effMode(t);
    var was = root.getAttribute('data-ac-mode');
    root.setAttribute('data-ac-mode', mode);
    root.setAttribute('data-ac-color', t.color);
    root.setAttribute('data-ac-fs', t.fs);
    root.setAttribute('data-ac-fw', t.fw);
    if (t.ff && t.ff !== 'system') root.setAttribute('data-ac-font', t.ff); else root.removeAttribute('data-ac-font');
    if (mode === 'dark' && was !== 'dark') startDark();
    if (mode !== 'dark' && was === 'dark') stopDark();
    var mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', mode === 'dark' ? '#0E1716' : (COLORS[t.color] || COLORS.teal)[1]);
    paintButtons();
  }

  /* 화면 첫 칠 — 본문이 그려지기 전에 */
  root.setAttribute('data-ac-mode', 'light');
  apply(cur);
  if (effMode(cur) === 'dark') {
    // <body> 안에 직접 적힌 색은 본문이 다 읽힌 뒤에 고칩니다.
    document.addEventListener('DOMContentLoaded', function(){ fixSheets(); fixInline(document.body); });
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
        if (cur.mode === 'auto') apply(cur);
      });
    } catch (e) {}
  }

  /* ── 단추 ──────────────────────────────────────────────────────── */
  function paintButtons(){
    var dark = effMode(cur) === 'dark';
    document.querySelectorAll('.ac-th-mode').forEach(function(b){
      b.textContent = dark ? '☀️' : '🌙';
      b.title = dark ? (en() ? 'Day mode' : '주간으로') : (en() ? 'Night mode' : '야간으로');
      b.setAttribute('aria-label', b.title);
    });
  }
  function toggleMode(){
    var t = Object.assign({}, cur);
    t.mode = effMode(cur) === 'dark' ? 'light' : 'dark';
    write(t); apply(t);
  }

  /* 🔴 2026-10-28 — 머리글 정리 (애플 심사 4 "화면이 복잡함" 대응)
     예전: [KR][EN] [🌙] [Aa] [❓ 사용법] 이 머리글에 따로따로 → 좁은 폰·iPad 에서 겹치고 빽빽함
     지금: [⚙] 단추 하나. 누르면 아래에서 창이 올라와 언어 · 사용법 · 주간/야간 · 색깔 · 글자를 한곳에서 고릅니다.
     ⚠ 원래 언어 단추는 지우지 않고 숨겨만 둡니다. 창에서 언어를 고르면 그 단추를 대신 눌러 줍니다(화면마다 번역 코드가 그 단추에 붙어 있음).
     ⚠ 통화방(핫라인 방)처럼 언어 단추가 "더보기" 메뉴 안에 있는 화면은 건드리지 않습니다. */
  var LANG_SEL = '.lang-toggle, #langToggle, #langToggleBtn, .lang';
  function findLangAnchor(){
    var list = document.querySelectorAll(LANG_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.closest && el.closest('.more-menu, [role="menu"], .ac-th-sheet')) continue;
      if (el.closest && el.closest('.lang-toggle, .lang') && el.closest('.lang-toggle, .lang') !== el) continue;
      return el;
    }
    return null;
  }
  function setLang(want){            // want: 'ko' | 'en'
    var a = findLangAnchor() || document.querySelector(LANG_SEL);
    if (!a) return;
    var b = a.querySelector && a.querySelector('[data-lang="' + want + '"]');
    if (b) { b.click(); }
    else if ((en() ? 'en' : 'ko') !== want) { a.click(); }      // 한 단추로 바꾸는 화면
    try { localStorage.setItem('aliascall_lang', want); } catch (e) {}
    var h = document.getElementById('acHelpLink');
    if (h) { h.href = 'aliascall_help.html?lang=' + want; h.textContent = want === 'en' ? '❓ Guide' : '❓ 사용법'; }
    paintGear();
  }
  function paintGear(){
    document.querySelectorAll('.ac-gear').forEach(function(g){
      g.title = en() ? 'Settings · Language · Guide' : '설정 · 언어 · 사용법';
      g.setAttribute('aria-label', g.title);
    });
  }
  function addButtons(){
    if (document.querySelector('.ac-gear')) return;
    var anchor = findLangAnchor();
    if (!anchor) return;
    root.classList.add('ac-compact');
    var g = document.createElement('button');
    g.type = 'button'; g.className = 'ac-th-btn ac-gear';
    g.textContent = '⚙︎';
    g.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openSheet(); });
    var cs = window.getComputedStyle(anchor);
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      g.style.cssText = 'position:' + cs.position + ';top:' + cs.top + ';right:' + cs.right + ';z-index:5;';
      g.classList.add('ac-gear-float');
    }
    anchor.parentNode.insertBefore(g, anchor);
    anchor.classList.add('ac-lang-hidden');
    paintGear();
  }

  /* ── 설정 창 ───────────────────────────────────────────────────── */
  function openSheet(){
    var E = en();
    var L = function(k, e){ return E ? e : k; };
    var bg = document.createElement('div'); bg.className = 'ac-th-bg';
    var sh = document.createElement('div'); sh.className = 'ac-th-sheet';
    sh.setAttribute('role', 'dialog');
    document.body.appendChild(bg); document.body.appendChild(sh);
    function close(){ bg.remove(); sh.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', close);

    var GROUPS = [
      ['mode', L('화면','Screen'), [['light', L('☀️ 주간','☀️ Day')], ['dark', L('🌙 야간','🌙 Night')], ['auto', L('📱 폰 설정 따라','📱 Follow phone')]]],
      ['color', L('색깔','Color'), Object.keys(COLORS).map(function(k){ return [k, COLOR_NAMES[k][E ? 1 : 0]]; })],
      ['fs', L('글자 크기','Text size'), [['md', L('보통','Normal')], ['lg', L('크게','Large')], ['xl', L('아주 크게','Extra large')]]],
      ['fw', L('글자 굵기','Text weight'), [['normal', L('보통','Normal')], ['bold', L('굵게','Bold')]]],
      ['ff', L('글씨체','Font'), [['system', L('폰 기본','Phone default')], ['gothic', L('고딕','Gothic')],
        ['myeongjo', L('명조','Serif')], ['dotum', L('돋움','Dotum')], ['hand', L('손글씨','Handwriting')]]],
    ];

    function draw(){
      sh.innerHTML = '<div class="grip"></div><h3>' + (root.classList.contains('ac-compact') ? L('⚙︎ 설정','⚙︎ Settings') : L('🎨 화면 설정','🎨 Display settings')) + '</h3>' +
        '<p class="note">' + L('고르는 즉시 바뀝니다. 이 폰에만 적용됩니다.', 'Changes apply right away, on this phone only.') + '</p>';
      if (root.classList.contains('ac-compact')) {
        var ll = document.createElement('p'); ll.className = 'lab'; ll.textContent = L('언어','Language'); sh.appendChild(ll);
        var lr = document.createElement('div'); lr.className = 'row';
        [['ko','한국어'],['en','English']].forEach(function(o){
          var b = document.createElement('button'); b.type = 'button';
          b.className = 'opt' + ((E ? 'en' : 'ko') === o[0] ? ' on' : '');
          b.textContent = o[1];
          b.addEventListener('click', function(){ close(); setLang(o[0]); });
          lr.appendChild(b);
        });
        sh.appendChild(lr);
        var hl = document.createElement('p'); hl.className = 'lab'; hl.textContent = L('도움말','Help'); sh.appendChild(hl);
        var hr = document.createElement('div'); hr.className = 'row';
        var ha = document.createElement('a'); ha.className = 'opt';
        ha.href = 'aliascall_help.html?lang=' + (E ? 'en' : 'ko');
        ha.style.textDecoration = 'none';
        ha.textContent = L('❓ 사용법 보기','❓ How to use');
        hr.appendChild(ha); sh.appendChild(hr);
      }
      GROUPS.forEach(function(g){
        var lab = document.createElement('p'); lab.className = 'lab'; lab.textContent = g[1]; sh.appendChild(lab);
        var row = document.createElement('div'); row.className = 'row';
        g[2].forEach(function(o){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'opt' + (cur[g[0]] === o[0] ? ' on' : '');
          if (g[0] === 'color') {
            var d = document.createElement('span'); d.className = 'dot';
            var c = COLORS[o[0]];
            d.style.background = o[0] === 'white' ? '#FFFFFF' : c[0];
            d.style.boxShadow = 'inset 0 0 0 3px ' + c[3];
            b.appendChild(d);
          }
          b.appendChild(document.createTextNode(o[1]));
          b.addEventListener('click', function(){
            var t = Object.assign({}, cur); t[g[0]] = o[0];
            write(t); apply(t); draw();
          });
          row.appendChild(b);
        });
        sh.appendChild(row);
        if (g[0] === 'fs' && NOZOOM) {
          var n = document.createElement('p'); n.className = 'note';
          n.textContent = L('통화 화면에서는 대화 글씨만 커집니다. (단추가 밀려나지 않게)',
                            'On call screens only chat text grows, so buttons stay in reach.');
          sh.appendChild(n);
        }
      });
      var done = document.createElement('button'); done.type = 'button'; done.className = 'done';
      done.textContent = L('확인', 'Done');
      done.addEventListener('click', close);
      sh.appendChild(done);
    }
    draw();
  }

  /* 🔴 2026-10-29 — 인쇄할 때는 늘 주간(흰 바탕)으로. QR 은 흰 바탕 · 검정이어야만 읽힙니다.
     야간은 화면의 색을 직접 바꿔 두기 때문에, 인쇄 직전에 잠깐 주간으로 돌렸다가 끝나면 되돌립니다.
     ⚠ 앱(안드로이드) 인쇄는 끝났다는 신호가 없어서, 다음에 화면을 누를 때 되돌립니다. */
  var printingLight = false;
  function printLight(){
    if (printingLight || root.getAttribute('data-ac-mode') !== 'dark') return;
    printingLight = true;
    stopDark();
    root.setAttribute('data-ac-mode', 'light');
    window.addEventListener('afterprint', printRestore, { once: true });
    setTimeout(function(){ document.addEventListener('pointerdown', printRestore, { once: true }); }, 1500);
  }
  function printRestore(){
    if (!printingLight) return;
    printingLight = false;
    root.setAttribute('data-ac-mode', 'light');
    apply(cur);
  }
  window.addEventListener('beforeprint', printLight);
  (function(){
    var op = window.print;
    if (op && !op.__acLight) {
      var wrapped = function(){ printLight(); return op.apply(window, arguments); };
      wrapped.__acLight = true;
      window.print = wrapped;
    }
  })();

  window.ACTheme = { printLight: printLight, open: openSheet, toggle: toggleMode, get: function(){ return Object.assign({}, cur); }, apply: function(t){ write(t); apply(t); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButtons);
  else addButtons();

  /* 🔴 2026-10-08 — 영어 보충(남은 한글을 영어로). 화면마다 따로 넣지 않으려고 여기서 부릅니다. */
  try {
    if (!document.querySelector('script[src*="aliascall_en.js"]')) {
      var se = document.createElement('script');
      se.src = 'aliascall_en.js?v=20261009';
      (document.head || document.documentElement).appendChild(se);
    }
  } catch (e) {}
})();

/* 🔴 2026-10-29 유치대리점: 어느 화면에서든 ?ref= 링크를 기억하고, 로그인되어 있으면 조용히 연결합니다(aliascall_partner_ref.js). */
(function(){
  try {
    if (document.querySelector('script[src*="aliascall_partner_ref.js"]')) return;
    return;   // 바로카에는 유치대리점이 없습니다
    var s = document.createElement('script'); s.src = 'aliascall_partner_ref.js?v=20261103'; s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();

/* 🔴 2026-10-29 — 서버 함수(Edge Function)가 401(로그인 확인 실패)을 주면, 로그인 정보를 한 번 새로 받아 다시 보냅니다.
   증상: 화면에는 "로그인됨"인데 긴급 알림 켜기 · 소통함 불러오기만 실패(오래 켜 둔 앱에서 로그인 표가 낡음).
   ⚠ 화면마다 따로 고치지 않으려고 여기서 fetch 를 한 번 감쌉니다. 함수 주소(/functions/v1/)에만 적용합니다. */
(function(){
  if (window.__acFnRetry) return; window.__acFnRetry = true;
  var orig = window.fetch && window.fetch.bind(window);
  if (!orig) return;
  function client(){ try { return (typeof sb !== 'undefined' && sb && sb.auth) ? sb : null; } catch (e) { return null; } }
  window.fetch = async function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var res = await orig(input, init);
    if (res.status !== 401 || url.indexOf('/functions/v1/') < 0 || !init || !init.headers) return res;
    var c = client(); if (!c) return res;
    try {
      var h = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : Object.assign({}, init.headers);
      var authKey = Object.keys(h).find(function(k){ return k.toLowerCase() === 'authorization'; });
      if (!authKey) return res;
      var r = await c.auth.refreshSession();
      var s = r && r.data && r.data.session;
      if (!s) { console.warn('[auth] 로그인 정보를 새로 받지 못했습니다 — 다시 로그인이 필요합니다'); return res; }
      h[authKey] = 'Bearer ' + s.access_token;
      return await orig(input, Object.assign({}, init, { headers: h }));
    } catch (e) { return res; }
  };
})();
