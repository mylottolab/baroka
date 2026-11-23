/* =====================================================================
   🆕 최근 업데이트 (2026-11-23) — 모든 앱 첫 화면 공용 · 원본은 wafa/whatsnew.js (다른 앱에는 같은 파일을 복사)
   쓰는 법(첫 화면): <script src="whatsnew.js?v=…" data-app="baronu" data-after=".nu-top" defer></script>
     · data-app: wafa · burum · nureum · baronu · aliascall · baroka · dangol · dantok · mylottolab · paperlotto
     · data-after: 이 요소 바로 아래에 띠를 넣습니다(없으면 data-before → 화면 맨 위)
   새 소식을 더할 때: 아래 NEWS 의 그 앱 목록 맨 앞에 { d:'날짜', ko:[…], en:[…] } 하나를 넣으면 됩니다.
   아직 안 본 새 소식이 있으면 띠에 반짝이는 NEW 가 붙고, 한 번 열어 보면 꺼집니다(이 휴대폰에 기억).
   ===================================================================== */
(function(){
  'use strict';
  var NEWS = {};
  var DIAL_KO = '☎ 다이얼 첫 화면 — 숫자를 돌리거나 콕 눌러 바로 열기 · 가운데를 누르면 원래 화면',
      DIAL_EN = '☎ Dial home screen: turn or tap a number to open it; tap the center for the classic screen',
      LANG_KO = '🌐 첫 화면에 한/EN 전환 단추',
      LANG_EN = '🌐 Korean/English switch on the first screen',
      REPLY_KO = '🔔 알림에서 바로 답장 · 읽음 표시',
      REPLY_EN = '🔔 Reply and mark as read right from the notification';
  var NU_23_KO = [
    '🎬 인사 영상 — 상대가 나를 열면 맨 위에 나오는 20초 영상(소리 · 보는 횟수는 보는 사람이 골라요)',
    '📷 처음 이름 넣을 때 아이콘 사진 · 인사 영상 · 🙂 내 사진도 같이 넣기 (선택)',
    '🙂 상대에게 보낼 내 사진 — 상대가 아이콘 사진을 안 넣었을 때 상대 휴대폰의 내 아이콘에',
    '🖨 QR 카드 [인쇄하기]가 앱 안에서도 돼요 · QR 찍기 창이 안 보이던 문제 고침',
    '👉 바탕화면 아이콘은 꾸욱 눌러 첫 화면 원하는 자리로 옮기세요 (안내 추가)'
  ], NU_23_EN = [
    '🎬 Greeting video: a 20-second clip at the top when they open you (the viewer picks sound and how often)',
    '📷 Add an icon photo, greeting video and 🙂 my photo when you first enter the name (optional)',
    '🙂 My photo for them: used on my icon on their phone if they haven’t added one',
    '🖨 QR card [Print] now works in the app · fixed the QR scanner not showing',
    '👉 Tip added: long-press a home-screen icon to move it where you want'
  ];
  NEWS.wafa = [
    { d: '2026.11.23', ko: ['📵 없는 번호를 누르면 「현재 개통되지 않은 번호」 안내가 누른 번호 바로 위에 노란 글씨로',
                            '📱 별칭 번호판을 한 화면에 — 위쪽 이용권 띠는 얇게, ⌫ 지움은 번호 옆으로(꾸욱 = 모두 지움)'],
                       en: ['📵 Unknown numbers: a yellow “number not in service” note right above the number you dialed',
                            '📱 Alias keypad fits on one screen: thinner plan bar, ⌫ next to the number (hold = clear all)'] },
    { d: '2026.11.22', ko: ['⭐ 와파 번호판 단축다이얼 — 1~9를 꾸욱 누르면 바로 전화 · 번호로 넣은 칸은 🔢 표시', DIAL_KO, LANG_KO],
                       en: ['⭐ Speed dial on the WAFA keypad: hold 1–9 to call · number slots show 🔢', DIAL_EN, LANG_EN] }
  ];
  NEWS.burum = [
    { d: '2026.11.23', ko: ['📱 전화 번호판을 한 화면에 — 위쪽 이용권 띠는 얇게, ⌫ 지움은 번호 옆으로(꾸욱 = 모두 지움)',
                            '📵 없는 번호를 누르면 「현재 개통되지 않았거나 받을 수 없는 번호」 안내를 번호 바로 위에 노란 글씨로',
                            '🔐 가입 없이 누름만 쓰던 분이 부름 화면을 열면 아이디 만들기 · 로그인을 먼저 안내'],
                       en: ['📱 Keypad fits on one screen: thinner plan bar, ⌫ next to the number (hold = clear all)',
                            '📵 Unknown numbers: a yellow note right above the number you dialed',
                            '🔐 Nureum-only users are asked to create an ID or log in before opening Burum screens'] },
    { d: '2026.11.22', ko: ['🔢 단축다이얼에 별칭과 일반 번호를 함께 · 번호로 넣은 칸은 🔢 표시', DIAL_KO, LANG_KO, REPLY_KO],
                       en: ['🔢 Speed dial holds aliases and plain numbers · number slots show 🔢', DIAL_EN, LANG_EN, REPLY_EN] }
  ];
  NEWS.nureum = [
    { d: '2026.11.23', ko: NU_23_KO, en: NU_23_EN },
    { d: '2026.11.22', ko: ['🌐 누름 영어 화면 새로 · 위쪽 EN/KO 단추', '☎ 누름 다이얼 첫 화면 · 목록 화면 위 [☎ 다이얼]로 돌아가기'],
                       en: ['🌐 Nureum now in English · EN/KO button at the top', '☎ Nureum dial home · [☎ Dial] at the top of the list to go back'] }
  ];
  NEWS.baronu = [
    { d: '2026.11.23', ko: NU_23_KO.concat(['🏠 안드로이드에서 바탕화면 아이콘 놓기가 안 되던 문제 고침']),
                       en: NU_23_EN.concat(['🏠 Fixed adding the home-screen icon on Android']) },
    { d: '2026.11.22', ko: [DIAL_KO, LANG_KO, REPLY_KO], en: [DIAL_EN, LANG_EN, REPLY_EN] }
  ];
  NEWS.aliascall = [
    { d: '2026.11.23', ko: ['📞 다이얼 가운데 위쪽 반원 = 전화 걸기(큰 번호판) · 아래 반원 = 수신 대기',
                            '⚡ 단축회선/단축번호 — 일반 번호도 1~9 칸에 넣어 꾸욱 누르면 바로 전화(🔢 표시)',
                            '🔢 작은 번호판도 바로 누르기 · 두 번 톡(또는 ⤢)하면 큰 번호판',
                            '📵 없는 번호 안내를 「현재 개통되지 않은 회선번호」로 알기 쉽게'],
                       en: ['📞 Dial center: top half = call (big keypad) · bottom half = standby',
                            '⚡ Speed lines/numbers: put plain numbers in slots 1–9 and hold to call (🔢)',
                            '🔢 Use the small keypad directly · double-tap (or ⤢) for the big one',
                            '📵 Clearer message for numbers not in service'] },
    { d: '2026.11.22', ko: [DIAL_KO, '↩ 원래 첫 화면에서 다이얼로 돌아오는 링크', LANG_KO, REPLY_KO],
                       en: [DIAL_EN, '↩ Link back to the dial from the classic screen', LANG_EN, REPLY_EN] }
  ];
  NEWS.baroka = [
    { d: '2026.11.22', ko: ['🚗 새 첫 화면 — 「차 주인에게 연락」 · 「내 차」 두 갈래, 내 차 번호판 카드, 처음 설정 3단계(시험 연락)',
                            '↩ 예전 화면에서 [새 첫 화면으로 보기]', LANG_KO, REPLY_KO],
                       en: ['🚗 New first screen: “Contact an owner” or “My car”, your plate card, 3-step setup with a test contact',
                            '↩ [See the new first screen] from the old one', LANG_EN, REPLY_EN] }
  ];
  NEWS.dangol = [
    { d: '2026.11.22', ko: ['🏪 새 첫 화면 — 「가게에 묻기」 · 「내 가게」 두 갈래, 가게 간판 카드, 처음 설정 3단계(시험 문의)',
                            '🌐 사장님 화면 영어 전환 · 첫 화면 한/EN 단추',
                            '↩ 손님 화면 [‹ 뒤로] · [🏠 처음으로], 문의 칸 안내 글을 알기 쉽게', REPLY_KO],
                       en: ['🏪 New first screen: “Ask a shop” or “My shop”, your shop sign card, 3-step setup with a test question',
                            '🌐 Owner screens in English · KO/EN button on the first screen',
                            '↩ [‹ Back] · [🏠 Home] on customer screens, clearer question box hints', REPLY_EN] }
  ];
  NEWS.dantok = [
    { d: '2026.11.23', ko: ['🙋 자기소개 · 인사 코너 — 방 안 ☰ → 「자기소개 · 인사 보기」. 사진이나 20초 영상 + 인사 글을 카톡처럼 줄지어 보고, 들어온 순 · 최근 · 이름 · 방장 먼저로 줄 세우기',
                            '🎞 목록에서는 영상이 움직이지 않고 첫 장면 + ▶ 만 — 눌렀을 때만 재생'],
                       en: ['🙋 Introductions corner: in a room tap ☰ → “See introductions”. A photo or 20-second video plus a greeting for each member, sorted by joined, recent, name or host first',
                            '🎞 Videos stay still in the list (first frame + ▶) and play only when tapped'] },
    { d: '2026.11.22', ko: ['🚪 새 첫 화면 — 내 방 문(새 글이면 불이 켜져요) · 처음 설정 2단계', '🌐 영어 전환 · 첫 화면 한/EN 단추', REPLY_KO],
                       en: ['🚪 New first screen: your room doors light up for new posts · 2-step setup', '🌐 English screens · KO/EN button on the first screen', REPLY_EN] }
  ];
  var FEAT_KO = '📘 전체 기능 소개 화면 · PDF 내려받기 (화면 아래 「기능 소개」)', FEAT_EN = '📘 Full feature guide with PDF download (“Features” at the bottom)';
  var HELP_KO = '▶ 사용법 영상(유튜브) · SNS 링크를 카카오톡 문의 옆에', HELP_EN = '▶ How-to video (YouTube) and SNS links next to the KakaoTalk contact';
  var KAKAO_KO = '💬 카카오톡 채널로 문의하기 연결', KAKAO_EN = '💬 Ask us through our KakaoTalk channel';
  NEWS.mylottolab = [
    { d: '2026.11.21', ko: [FEAT_KO], en: [FEAT_EN] },
    { d: '2026.11.09', ko: [HELP_KO, KAKAO_KO + ' (11월 8일)'], en: [HELP_EN, KAKAO_EN + ' (Nov 8)'] },
    { d: '2026.11.06', ko: ['🔞 이용 나이를 만 18세 이상으로 (가입 동의 · 약관 제7조)'], en: ['🔞 Minimum age is now 18 (sign-up consent · Terms §7)'] }
  ];
  NEWS.paperlotto = [
    { d: '2026.11.21', ko: ['📘 전체 기능 소개 화면 · PDF 내려받기 (위 메뉴 「기능 소개」)'], en: ['📘 Full feature guide with PDF download (“Features” in the top menu)'] },
    { d: '2026.11.09', ko: [HELP_KO, KAKAO_KO + ' (11월 8일)'], en: [HELP_EN, KAKAO_EN + ' (Nov 8)'] },
    { d: '2026.10.27', ko: ['📱 휴대폰 첫 화면 정리 — 로그인을 언어 · 주간/야간 옆으로, 메뉴는 한 줄(옆으로 밀기)',
                            '🔔 메뉴 순서: 당첨확인 예약등록 · 통계 · 경마장 · 무제한 대결 · 공지 · 사용법',
                            '📲 첫 화면에 앱 받기 단추 (안드로이드는 Google Play)'],
                       en: ['📱 Tidier phone first screen: login next to language and day/night, one-line swipeable menu',
                            '🔔 Menu order: result-check alerts · stats · race · unlimited battle · notices · how-to',
                            '📲 Get-the-app buttons on the first screen (Google Play on Android)'] }
  ];
  var NAMES = { wafa: ['와파', 'WAFA'], burum: ['부름', 'Burum'], nureum: ['누름', 'Nureum'], baronu: ['바로너', 'Baronu'],
    aliascall: ['가림콜', 'AliasCall'], baroka: ['바로카', 'Baroka'], dangol: ['단골창구', 'Dangol'], dantok: ['단톡방', 'DanTok'],
    mylottolab: ['알림로또', 'My Lotto Lab'], paperlotto: ['페이퍼로또', 'PaperLotto'] };
  var LANGKEY = { wafa: 'wafa_lang', burum: 'alias_lang_v1', nureum: 'alias_lang_v1', baronu: 'alias_lang_v1',
    aliascall: 'aliascall_lang', baroka: 'baroka_lang', dangol: 'dangol_lang', dantok: 'dantok_lang', mylottolab: 'mll_lang', paperlotto: 'paperlotto_lang' };

  var me = document.currentScript;
  var APP = (me && me.getAttribute('data-app')) || 'wafa';
  if (!NEWS[APP]) return;
  function isEn(){
    var v = null; try { v = localStorage.getItem(LANGKEY[APP]); } catch (e) {}
    if (v === 'en') return true;
    if (v === 'ko' || v === 'kr') return false;
    if (v) return true;   // ja 등 다른 언어 → 영어로
    return !/^ko/i.test(navigator.language || 'ko');
  }
  var EN = isEn(), T = function(k, e){ return EN ? e : k; };
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var list = NEWS[APP], LATEST = list[0].d, SEEN_K = 'wn_seen_' + APP;
  function seen(){ try { return localStorage.getItem(SEEN_K) === LATEST; } catch (e) { return false; } }
  function markSeen(){ try { localStorage.setItem(SEEN_K, LATEST); } catch (e) {} }
  function md(d){ var p = d.split('.'); return EN ? (+p[1]) + '/' + (+p[2]) : (+p[1]) + '월 ' + (+p[2]) + '일'; }
  function short(s){ return String(s).replace(/^[^\wㄱ-힣]+\s*/, '').split(/ — | - |: /)[0]; }

  var FONT = "font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','Segoe UI',Roboto,sans-serif;";
  var css = '.wn-bar{' + FONT + 'display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;margin:8px 0;padding:11px 14px;border:none;border-radius:16px;' +
    'background:linear-gradient(100deg,#FF2E63 0%,#FF6A3D 55%,#FF9F1C 100%);color:#fff;font:inherit;text-align:left;cursor:pointer;' +
    'box-shadow:0 6px 18px rgba(255,46,99,.35);-webkit-tap-highlight-color:transparent;position:relative;z-index:2}' +
    '.wn-bar:active{transform:scale(.985)}' +
    '.wn-bar .wn-i{flex:none;font-size:22px;line-height:1}' +
    '.wn-bar .wn-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
    '.wn-bar .wn-t b{font-size:15.5px;font-weight:900;letter-spacing:-.2px;white-space:nowrap}' +
    '.wn-bar .wn-t small{font-size:12.5px;font-weight:700;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.wn-bar .wn-new{flex:none;background:#FFE600;color:#3A1C00;font-size:11.5px;font-weight:900;border-radius:999px;padding:3px 8px;animation:wnP 1.4s ease-in-out infinite}' +
    '.wn-bar .wn-go{flex:none;font-size:22px;font-weight:900;opacity:.9}' +
    '@keyframes wnP{0%,100%{box-shadow:0 0 0 0 rgba(255,230,0,.7)}50%{box-shadow:0 0 0 7px rgba(255,230,0,0)}}' +
    '.wn-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(10,12,20,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '.wn-sh{width:100%;max-width:560px;max-height:86vh;overflow:auto;background:#fff;color:#1B1D28;border-radius:24px 24px 0 0;' +
    'padding:18px max(18px,env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom,0px)) max(18px,env(safe-area-inset-left));box-sizing:border-box;' +
    FONT + 'animation:wnU .22s ease-out}' +
    '.wn-sh *{' + FONT + '}' +
    '@keyframes wnU{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}' +
    '.wn-hd{display:flex;align-items:center;gap:10px;margin-bottom:6px}.wn-hd h2{flex:1;margin:0;font-size:20px;font-weight:900}' +
    '.wn-x{width:42px;height:42px;border:none;border-radius:50%;background:#F1F2F6;color:#1B1D28;font-size:18px;cursor:pointer}' +
    '.wn-d{display:inline-block;margin:14px 0 6px;padding:4px 10px;border-radius:999px;background:linear-gradient(100deg,#FF2E63,#FF9F1C);color:#fff;font-size:13px;font-weight:900}' +
    '.wn-d.old{background:#E8EAF0;color:#4A4F60}' +
    '.wn-ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}' +
    '.wn-ul li{background:#FFF6F0;border:1px solid #FFE1D0;border-radius:14px;padding:10px 12px;font-size:15px;line-height:1.55;font-weight:600}' +
    '.wn-ul.old li{background:#F6F7FA;border-color:#ECEEF3;color:#3A3F50;font-weight:500}' +
    '.wn-ok{display:block;width:100%;margin-top:16px;height:52px;border:none;border-radius:16px;background:#1B1D28;color:#fff;font:inherit;font-size:16px;font-weight:800;cursor:pointer}';
  function addCss(){ if (document.getElementById('wnCss')) return; var s = document.createElement('style'); s.id = 'wnCss'; s.textContent = css; document.head.appendChild(s); }

  function open(){
    addCss(); markSeen(); paintBar();
    var ov = document.createElement('div'); ov.className = 'wn-ov'; ov.setAttribute('data-noi18n', ''); ov.setAttribute('role', 'dialog');
    ov.innerHTML = '<div class="wn-sh"><div class="wn-hd"><h2>🆕 ' + esc(T('최근 업데이트', 'What’s new')) + ' · ' + esc(NAMES[APP][EN ? 1 : 0]) + '</h2>' +
      '<button class="wn-x" type="button" aria-label="' + esc(T('닫기', 'Close')) + '">✕</button></div>' +
      list.map(function(n, i){
        return '<span class="wn-d' + (i ? ' old' : '') + '">' + esc(md(n.d)) + (i ? '' : ' · NEW') + '</span><ul class="wn-ul' + (i ? ' old' : '') + '">' +
          (EN ? n.en : n.ko).map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }).join('') +
      '<button class="wn-ok" type="button">' + esc(T('확인', 'OK')) + '</button></div>';
    function close(){ ov.remove(); document.removeEventListener('keydown', key); }
    function key(e){ if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function(e){ if (e.target === ov || e.target.closest('.wn-x,.wn-ok')) close(); });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
  }

  var bar = null;
  function paintBar(){
    if (!bar) return;
    var n = list[0], first = (EN ? n.en : n.ko)[0];
    bar.innerHTML = '<span class="wn-i">🆕</span><span class="wn-t"><b>' + esc(T('최근 업데이트', 'What’s new')) + ' · ' + esc(md(n.d)) + '</b><small>' + esc(short(first)) + (((EN ? n.en : n.ko).length > 1) ? esc(T(' 외 ' + ((EN ? n.en : n.ko).length - 1) + '가지', ' +' + ((EN ? n.en : n.ko).length - 1) + ' more')) : '') + '</small></span>' +
      (seen() ? '' : '<span class="wn-new">NEW</span>') + '<span class="wn-go">›</span>';
  }
  function mount(tries){
    if (document.getElementById('wnBar')) return;
    var after = me && me.getAttribute('data-after'), before = me && me.getAttribute('data-before');
    var a = after && document.querySelector(after), b = !a && before && document.querySelector(before);
    if (!a && !b && (tries || 0) < 20) { setTimeout(function(){ mount((tries || 0) + 1); }, 150); return; }
    addCss();
    bar = document.createElement('button'); bar.type = 'button'; bar.id = 'wnBar'; bar.className = 'wn-bar'; bar.setAttribute('data-noi18n', '');
    bar.setAttribute('aria-label', T('최근 업데이트 보기', 'See what’s new'));
    bar.onclick = open;
    if (me && me.getAttribute('data-inset')) { bar.style.width = 'calc(100% - 32px)'; bar.style.margin = '10px 16px'; }
    paintBar();
    if (a) a.parentNode.insertBefore(bar, a.nextSibling);
    else if (b) b.parentNode.insertBefore(bar, b);
    else document.body.insertBefore(bar, document.body.firstChild);
    /* 다른 안내(예: 아이폰 안내)가 같은 자리에 끼어들면 띠를 다시 제목 줄 바로 아래로 */
    if (a) [400, 1500, 3500].forEach(function(ms){ setTimeout(function(){ if (a.parentNode && a.nextSibling !== bar) a.parentNode.insertBefore(bar, a.nextSibling); }, ms); });
  }
  window.WN = { open: open, news: NEWS, app: APP };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ mount(0); }); else mount(0);
})();
