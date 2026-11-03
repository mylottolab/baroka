/* =====================================================================
   Aliascall — 영어 보충 (English patch)
   2026-10-08

   하는 일
     영어(EN)로 볼 때, 화면에 남아 있는 한글 문구를 찾아 영어로 바꿉니다.
     • 번역표를 거치지 않고 화면에 직접 적힌 글
     • 나중에 나타나는 창 · 안내 · 알림창(alert / confirm)
     • 서버가 돌려주는 한국어 오류 문구
     한국어로 돌아가면 원래 글로 되돌립니다.

   ⚠ aliascall_theme.js 가 이 파일을 불러옵니다. 화면마다 따로 넣지 않아도 됩니다.
   ⚠ 새 문구를 더하려면 아래 MAP 에 '한글': 'English' 한 줄을 넣으면 됩니다.
   ===================================================================== */
(function(){
  'use strict';
  if (window.__acEN) return; window.__acEN = true;

  function isEN(){
    try {
      var keys = ['aliascall_lang', 'aliascall_language', 'ac_lang'];
      for (var i = 0; i < keys.length; i++) {
        var v = localStorage.getItem(keys[i]);
        if (v) return v.indexOf('en') === 0;
      }
    } catch (e) {}
    return false;
  }

  /* 한글 → 영어 (앞뒤 빈칸은 무시하고 똑같은 글만 바꿉니다) */
  var MAP = {
    /* 회사 정보 */
    '위브앱솔루션 · 대표 이미화 · 사업자등록번호 206-08-71754 · 경기도 수원시 권선구 수성로47 10동 501호 · 010-9237-9042 · 통신판매업신고 2022-수원권선-1701':
      'Weave App Solution · CEO Mihwa Lee · Business Reg. No. 206-08-71754 · 501, Bldg. 10, 47 Suseong-ro, Gwonseon-gu, Suwon-si, Gyeonggi-do, Korea · +82-10-9237-9042 · Mail-order Business Reg. 2022-Suwon Gwonseon-1701',
    /* 단추 이름(화면 읽어주기) */
    '🔴 통화 녹음함': '🔴 Call recordings', '🔴 녹음함': '🔴 Recordings',
    '뒤로': 'Back', '뒤로가기': 'Back', '닫기': 'Close', '크게 보기': 'Enlarge', '명함 인쇄': 'Print card',
    '암호화': 'Encryption', '초대 링크': 'Invite link', '최근 대화 한 줄 보기': 'Show latest message line',
    '음성으로 검색': 'Search by voice', '첫 화면으로': 'Go to home', '보내기': 'Send',
    /* 여기저기 */
    '구입 현황': 'Purchase history', '음성으로 연결 요청': 'Voice connection request',
    '응답하지 않은 요청': 'Unanswered request', '불러오는 중…': 'Loading…', '불러오는 중...': 'Loading…',
    '(제목 없음)': '(untitled)', '회원': 'Member', '방문자': 'Visitor', '상대': 'Other person',
    '수정': 'Edit', '삭제': 'Delete', '복사': 'Copy', '복사됨': 'Copied', '저장': 'Save', '확인': 'OK', '취소': 'Cancel',
    '상세 정보': 'Details', '설명': 'Description', '등록 완료': 'Registration complete',

    /* 업체 공개 등록 (aliascall_business_register) */
    '로그인이 필요합니다.': 'Please sign in.', '로그인이 필요합니다': 'Please sign in.',
    '로그인하러 가기 ›': 'Go to sign in ›',
    '전문관리용 구독이 없습니다.': 'You have no Pro subscription.',
    '상품 보러 가기 ›': 'See plans ›',
    '불러오지 못했습니다.': 'Could not load.',
    '📣 업체 공개 등록': '📣 Public business listing',
    '상호를 공개 목록에 올려, 아직 모르는 분들이 찾아와 문의하실 수 있게 합니다.':
      'List your business publicly so people who don\'t know you yet can find you and get in touch.',
    '사업자등록증 확인': 'A business registration check',
    '이 필요하며, 법률·세무·회계·의료 등은': ' is required. For legal, tax, accounting, medical and similar fields, we also verify',
    '해당 자격증까지': ' the professional license',
    '확인합니다.': '.',
    '1. 업체 정보': '1. Business info', '상호': 'Business name', '업종': 'Category', '소개': 'About',
    '지역': 'Area', '운영시간': 'Hours',
    '예: 김상익법률사무소': 'e.g. Kim Law Office', '예: 경기 수원시': 'e.g. Suwon, Gyeonggi', '예: 평일 09:00~18:00': 'e.g. Weekdays 09:00–18:00',
    '어떤 일을 하시는지, 어떤 분들이 찾으시면 좋을지 적어주세요.': 'Describe what you do and who should contact you.',
    '⚠ 사업자등록증의 상호와 같아야 합니다. 나중에 바꾸시면 확인을 다시 받으셔야 합니다.':
      '⚠ Must match the name on your business registration. Changing it later requires a new review.',
    '⚠ 상세 주소는 적지 마세요. 시·군·구까지면 충분합니다.': '⚠ Don\'t enter a full address. City and district are enough.',
    '저장하기': 'Save', '— 골라주세요 —': '— Choose —',
    '2. 서류 제출': '2. Submit documents',
    '제출하신 서류는 공개되지 않습니다.': 'Your documents are never made public.',
    '관리자만 확인하며,': ' Only administrators review them;',
    '목록에는 "확인됨" 표시만 붙습니다.': ' the listing only shows a "Verified" badge.',
    '⚠ 면허증에는 면허번호·주민등록번호가 들어 있으니,': '⚠ Licenses contain license and ID numbers, so please',
    '가리셔도 되는 부분은 가리고': ' cover the parts you can',
    '올려주세요.': ' before uploading.',
    '3. 공개하기': '3. Go public', '공개 목록에 올리기': 'Show in the public list',
    '준비가 끝났습니다. 켜시면 목록과 배너에 나타납니다.': 'All set. Turn it on to appear in the list and banner.',
    '공개 게재 이용권 보기 ›': 'See listing plan ›',
    '이 주소를 직접 알리시는 것이 가장 중요합니다.': 'Sharing this link yourself matters most.',
    '블로그 · 인스타그램 · 명함 · 가게 QR에 붙여두세요. 목록보다 이쪽으로 훨씬 많이 들어옵니다.':
      'Put it on your blog, Instagram, business card or shop QR. Far more people come this way than through the list.',
    '문의를 자동으로 받기': 'Accept inquiries automatically',
    '켜면 문의가 오는 즉시 대화가 열립니다.': 'When on, a chat opens as soon as an inquiry arrives.',
    '끄시면 확인하신 뒤에 열립니다.': ' When off, it opens after you approve.',
    '⚠ 식당·상점은 켜두시는 편이 편하고,': '⚠ Shops and restaurants usually keep it on;',
    '법률·의료는 꺼두시는 편이 안전합니다.': ' legal and medical offices are safer with it off.',
    '먼저 업체 정보를 저장해주세요.': 'Please save your business info first.',
    '공개 게재 이용권(광고형)을 먼저 사주세요. 이용권 화면의 "공개 업체 목록 게재"입니다.':
      'Please buy the public listing plan first ("Public business listing" on the Plans screen).',
    '프로 구독이 끝났습니다. 연장한 뒤 공개할 수 있습니다.': 'Your Pro subscription has ended. Renew it to go public.',
    '서류를 확인하고 있습니다. 확인이 끝나면 알려드리고 공개할 수 있습니다.': 'We\'re reviewing your documents. We\'ll let you know when you can go public.',
    '상호를 입력해주세요.': 'Please enter the business name.', '업종을 골라주세요.': 'Please choose a category.',
    '사업자등록증을 올려주세요.': 'Please upload your business registration.',
    '자격증': 'professional license', '을(를) 올려주세요.': ' — please upload it.',
    '서류를 확인하고 있습니다. 잠시만 기다려주세요.': 'We\'re reviewing your documents. Please wait.',
    '구독이 만료되었습니다.': 'Your subscription has expired.', '아직 준비가 끝나지 않았습니다.': 'Not ready yet.',
    '⚠ 이 업종은': '⚠ For this category we also verify', '까지 확인합니다.': '.',
    '사업자등록증만 확인합니다.': 'Only the business registration is checked.',
    '저장 중…': 'Saving…', '✓ 저장했습니다.': '✓ Saved.', '저장하지 못했습니다.': 'Could not save.',
    '사업자등록증': 'Business registration', '확인 중': 'Under review', '확인됨': 'Verified', '반려': 'Rejected',
    '반려 사유:': 'Reason:', '올리기': ' upload', '사진 또는 PDF · 10MB 이하': 'Photo or PDF · up to 10MB',
    '10MB 이하로 올려주세요.': 'Please upload 10MB or less.', '올리는 중…': 'Uploading…',
    '✓ 올렸습니다. 확인까지 하루 이틀 걸립니다.': '✓ Uploaded. Review takes a day or two.',
    '올리지 못했습니다. 잠시 후 다시 시도해주세요.': 'Upload failed. Please try again shortly.',
    '처리하지 못했습니다.': 'Could not complete that.',

    /* 서버가 돌려주는 말 (삭제 · 파일) */
    '메시지를 찾을 수 없습니다': 'Message not found', '통화 기록은 지울 수 없습니다': 'Call records can\'t be deleted',
    '대화를 찾을 수 없습니다': 'Conversation not found', '내가 보낸 것만 지울 수 있습니다': 'You can only delete what you sent',
    '이 대화에 올릴 수 없습니다': 'You can\'t upload to this conversation',
    '50MB 이하 파일만 올릴 수 있습니다': 'Only files up to 50MB can be uploaded', '올린 파일을 찾을 수 없습니다': 'Uploaded file not found',
    '전송 실패': 'Send failed', '업로드 실패': 'Upload failed', '대화 불러오기 실패': 'Could not load the conversation',
    '재개 실패': 'Could not reopen', '사건 생성 실패': 'Could not start the conversation', '조회 실패': 'Lookup failed',
  };

  /* 숫자가 섞인 글 */
  var RULES = [
    [/^\$([\d.]+) · ([\d,]+)원$/, function(m){ return '$' + m[1] + ' (₩' + m[2] + ')'; }],
    [/^([\d,]+)원$/, function(m){ return '₩' + m[1]; }],
  ];

  var H = /[가-힣]/;
  function tr(s){
    if (!s || !H.test(s)) return null;
    var t = s.replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(MAP, t)) {
      var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0];
      if (/^[.,;:!?)]/.test(MAP[t])) lead = '';
      return lead + MAP[t] + tail;
    }
    for (var i = 0; i < RULES.length; i++) { var m = t.match(RULES[i][0]); if (m) return RULES[i][1](m); }
    return null;
  }

  var touched = [];   // [node, kind, original]
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function doText(n){
    if (n.__acEN) return;
    var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.nodeName)) return;
    if (p.isContentEditable || (p.closest && p.closest('.chat-bubble, .bub, #chatMessages, .chat-messages'))) return;  // 대화 내용은 건드리지 않습니다
    var e = tr(n.nodeValue);
    if (e != null) { touched.push([n, 'text', n.nodeValue]); n.__acEN = true; n.nodeValue = e; }
  }
  function doEl(el){
    if (!el.getAttribute) return;
    ATTRS.forEach(function(a){
      var v = el.getAttribute(a); if (!v) return;
      var e = tr(v);
      if (e != null) { touched.push([el, a, v]); el.setAttribute(a, e); }
    });
  }
  function walk(root){
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }

  var obs = null, on = false;
  function start(){
    if (on) return; on = true;
    walk(document.body);
    obs = new MutationObserver(function(muts){
      muts.forEach(function(m){
        if (m.type === 'characterData') { m.target.__acEN = false; doText(m.target); return; }
        if (m.type === 'attributes') { doEl(m.target); return; }
        m.addedNodes.forEach(walk);
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true,
                                 attributes: true, attributeFilter: ATTRS });
  }
  function stop(){
    if (!on) return; on = false;
    if (obs) obs.disconnect();
    for (var i = touched.length - 1; i >= 0; i--) {
      var t = touched[i];
      try {
        if (t[1] === 'text') { if (t[0].__acEN) { t[0].nodeValue = t[2]; t[0].__acEN = false; } }
        else t[0].setAttribute(t[1], t[2]);
      } catch (e) {}
    }
    touched = [];
  }
  function sync(){ if (isEN()) start(); else stop(); }

  /* 알림창도 영어로 */
  var _alert = window.alert, _confirm = window.confirm;
  function trMsg(s){
    if (!isEN() || typeof s !== 'string') return s;
    return s.split('\n').map(function(line){ var e = tr(line); return e == null ? line : e; }).join('\n');
  }
  window.alert = function(s){ return _alert.call(window, trMsg(s)); };
  window.confirm = function(s){ return _confirm.call(window, trMsg(s)); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  // KR / EN 단추를 누른 뒤 다시 맞춥니다
  document.addEventListener('click', function(){ setTimeout(sync, 80); }, true);
  window.addEventListener('storage', sync);

  window.ACEn = { tr: tr, sync: sync, MAP: MAP };
})();
