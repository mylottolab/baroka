/* 바로카 — 영어 · 주간/야간 (2026-11-05)
   ■ 영어: 화면의 한글 문장을 그대로 두고, 고를 때만 영어로 바꿔 보여 줍니다(화면 코드는 손대지 않음).
     처음 쓰는 폰이 한국어가 아니면 저절로 영어. 위쪽 [EN] · [한국어] 단추로 바꾸고 기억합니다.
     연락 화면 · 받은 연락 화면(에일리어스콜 것)도 같은 언어를 따릅니다(aliascall_lang).
   ■ 주간/야간: [🌙] · [☀️] 단추. 고르기 전에는 폰 설정을 따릅니다. 연락 화면도 따릅니다(aliascall_theme_v1).
   ⚠ 이 파일은 baroka.js 바로 다음에 부릅니다. */
(function(){
  'use strict';
  var BK = window.BK = window.BK || {};
  var LK = 'baroka_lang', TK = 'baroka_theme';
  function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  /* ── 언어 ── */
  BK.lang = function(){
    var v = get(LK);
    if (v === 'en' || v === 'ko') return v;
    try { return /^ko/i.test(navigator.language || 'ko') ? 'ko' : 'en'; } catch (e) { return 'ko'; }
  };
  var EN = BK.lang() === 'en';
  set('aliascall_lang', EN ? 'en' : 'ko');           // 연락 화면 · 받은 연락 화면도 같은 언어
  document.documentElement.lang = EN ? 'en' : 'ko';

  /* ── 주간 · 야간 ── */
  BK.theme = function(){ var v = get(TK); return v === 'dark' || v === 'light' ? v : null; };
  function applyTheme(){
    var t = BK.theme();
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    var dark = t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    try {   // 연락 화면(에일리어스콜 테마)도 같은 모드로
      var o = JSON.parse(get('aliascall_theme_v1') || '{}'); o.mode = dark ? 'dark' : 'light'; if (!o.color) o.color = 'blue';
      set('aliascall_theme_v1', JSON.stringify(o));
    } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0A0F1A' : '#13214A');
    return dark;
  }
  BK.isDark = applyTheme();

  /* ── 위쪽 작은 단추 두 개 ── */
  BK.controls = function(host){
    if (!host || host.querySelector('.bk-ctl')) return;
    var box = document.createElement('span'); box.className = 'bk-ctl';
    box.style.cssText = 'display:inline-flex;gap:6px;margin-left:6px;flex:none';
    function mk(txt, fn, label){ var b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label);
      b.style.cssText = 'height:40px;min-width:38px;padding:0 8px;border-radius:12px;border:2px solid var(--bk-line);background:var(--bk-card);color:var(--bk-ink);font-weight:900;font-size:13.5px;cursor:pointer';
      b.onclick = fn; return b; }
    box.appendChild(mk(BK.isDark ? '☀️' : '🌙', function(){ set(TK, BK.isDark ? 'light' : 'dark'); location.reload(); }, BK.isDark ? 'Day mode' : 'Night mode'));
    box.appendChild(mk(EN ? 'KO' : 'EN', function(){ set(LK, EN ? 'ko' : 'en'); location.reload(); }, EN ? '한국어로' : 'English'));
    var pill = host.querySelector('.bk-pill');
    if (pill) host.insertBefore(box, pill); else host.appendChild(box);
  };

  /* 위쪽 막대(.bk-top)가 있는 화면에는 저절로 단추를 붙입니다 */
  function addCtl(){ BK.controls(document.querySelector('.bk-top')); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addCtl); else addCtl();

  if (!EN) return;

  /* ── 한글 → 영어 (긴 것부터 바꿉니다) ── */
  var D = [
    ['회원 탈퇴 (계정 지우기)', 'Delete account'], ['회원 탈퇴', 'Delete account'], ['탈퇴하기', 'Delete account'],
    ['등록한 차, 차 갤러리 사진, 쓰지 않은 등록권 · 변경권이 모두 지워지고 되돌릴 수 없어요. 남은 등록권은 환불되지 않습니다.', 'Your cars, gallery photos and unused credits will be permanently deleted. Unused credits are not refunded.'],
    ['확인을 위해', 'To confirm, type'], ['라고 적어 주세요', ''], ['라고 적어 주세요.', ''], ['탈퇴하지 못했어요:', "Couldn't delete:"],
    ['탈퇴했습니다. 그동안 바로카를 써 주셔서 고맙습니다.', 'Your account has been deleted. Thank you for using Baroka.'],

    ['바로카 — 차 번호로 차주에게 바로 연락', 'Baroka — reach a car owner by plate number'],
    ['차 번호만 알면 차주에게 바로 전화 · 문자. 서로 전화번호는 보이지 않습니다. 내 차 등록 2,500원 한 번이면 끝.', 'Call or text a car owner with just the plate number. No phone numbers shared. Register your car once for ₩2,500.'],
    ['바로카 처음 화면', 'Baroka home'],
    ['차 번호만 알면', 'Just the plate number'],
    ['차주에게 바로 연락', 'reaches the owner'],
    ['전화 · 문자 · 사진까지. 서로 전화번호는 보이지 않아요.', 'Call, text and photos — no phone numbers shared.'],
    ['차주 찾기', 'Find owner'],
    ['📷 번호판 찍기', '📷 Scan plate'],
    ['▦ QR 찍기', '▦ Scan QR'],
    ['한 번 내면 끝 · 차 바꿀 때까지', 'pay once · until you change cars'],
    ['📞 전화', '📞 Call'], ['💬 문자 · 사진', '💬 Text · Photo'], ['🔒 번호 숨김', '🔒 Number hidden'], ['🖨 주차 안내판', '🖨 Parking sign'],
    ['번호판을 바꾸면 번호 변경 2,500원. 차를 팔거나 폐차하면 무료로 지울 수 있어요.', 'Changed your plate? ₩2,500 per change. Sold or scrapped the car? Remove it for free.'],
    ['내 차 자랑 · 차와 함께한 풍경 · 관리 팁', 'Show off your car · road trips · care tips'],
    ['구경 ›', 'Browse ›'],
    ['이렇게 쓰여요', 'How it helps'],
    ['차를 막았을 때', 'Blocked in'], ['번호만 넣으면 차주에게 바로', 'Enter the plate and reach the owner'],
    ['라이트 · 창문', 'Lights · windows'], ['켜져 있다고 살짝 알려 주기', 'Let them know lights are on'],
    ['접촉 · 긁힘', 'Bump · scratch'], ['사진과 함께 차주에게 전달', 'Send it with a photo'],
    ['연락하는 분은 가입이 필요 없어요. 차주는 앱으로 바로 받고, 원할 때만 대답합니다.', 'No sign-up needed to contact. Owners get it in the app and reply only if they want.'],
    ['바로카 · 위브앱솔루션 ·', 'Baroka · WeaveApp Solution ·'],
    ['개인정보처리방침', 'Privacy'], ['이용약관', 'Terms'], ['환불', 'Refunds'], ['광고 문의', 'Advertise'],
    ['차 번호를 넣어 주세요. 뒤 네 자리만 넣어도 찾아요.', 'Enter a plate number. The last 4 digits are enough.'],
    ['찾는 중…', 'Searching…'],
    ['이 번호로 등록된 차가 없어요.\n차주가 아직 바로카에 등록하지 않았을 수 있어요.', 'No car is registered with this number.\nThe owner may not use Baroka yet.'],
    ['이 번호로 등록된 차가 없어요.', 'No car is registered with this number.'],
    ['차주가 아직 바로카에 등록하지 않았을 수 있어요.', 'The owner may not use Baroka yet.'],
    ['정확히 같은 번호는 없고, 끝 네 자리가 같은 차예요. 맞는 차를 골라 주세요.', 'No exact match — these cars share the last 4 digits. Pick the right one.'],
    ['이 차 차주에게 연락', 'Contact this owner'], ['끝 번호가 같은 차', 'Same last digits'], ['연락 ›', 'Contact ›'],
    ['찾지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.', 'Search failed. Check your connection and try again.'],
    ['바로카 · 에일리어스콜 QR이 아니에요.', 'This is not a Baroka QR code.'],
    ['📨 답을 기다리는 연락이', '📨 Waiting for your reply:'], ['건 있어요 — 보기 ›', ' — View ›'],
    ['내 차 · 바로카', 'My car · Baroka'], ['처음 화면', 'Home'],
    ['차를 등록하려면 계정이 필요해요', 'You need an account to register a car'],
    ['닉네임과 비밀번호만 정하면 됩니다. 전화번호 · 이메일은 받지 않아요.', 'Just pick a nickname and password. We never ask for your phone number or email.'],
    ['에일리어스콜 계정이 있으면 그대로 들어오세요.', 'Aliascall accounts work here too.'],
    ['처음이에요', "I'm new"], ['계정이 있어요', 'I have an account'],
    ['닉네임 또는 이메일', 'Nickname or email'], ['닉네임', 'Nickname'], ['예) 하늘차주', 'e.g. skydriver'], ['비밀번호', 'Password'], ['6자리 이상', '6+ characters'],
    ['⚠ 비밀번호를 잊으면 찾을 수 없어요. 꼭 적어 두세요.', "⚠ We can't recover a lost password. Please write it down."],
    ['가입하고 시작하기', 'Sign up and start'],
    ['📨 받은 연락 보기', '📨 Received contacts'],
    ['🚘 내 갤러리 · 차 자랑하기', '🚘 My gallery'], ['4칸 무료', '4 frames free'],
    ['앱을 열면 바로 번호판 카메라', 'Open straight to the plate camera'], ['끄면 찾기 화면만 열려요', 'Off: open to the search screen'],
    ['결제가 아직 확인되지 않았어요. 잠시 뒤 다시 열어 주세요.', "Payment isn't confirmed yet. Please reopen in a moment."],
    ['번호판 모양이 아니에요. 예) 12가 3456, 123나 4567', "That doesn't look like a plate. e.g. 12가 3456, 123나 4567"],
    ['내 차가 아니에요.', 'This is not your car.'], ['지금 번호와 같아요.', "That's the current number."], ['다시 로그인해 주세요.', 'Please sign in again.'],
    ['차량 등록이 아니에요.', 'Not a car registration.'], ['불러오지 못했어요.', "Couldn't load."],
    ['님으로 로그인됨', ' (signed in)'],
    ['차 한 대 더 등록하기', 'Register another car'], ['내 차 등록하기', 'Register my car'],
    ['🎟 쓰지 않은 등록권', '🎟 Unused registration passes:'], ['장 — 결제 없이 바로 등록돼요.', ' — register without paying.'],
    ['🎟 쓰지 않은 번호 변경권', '🎟 Unused plate-change passes:'],
    ['＋ 등록권으로 바로 등록', '＋ Register with a pass'], ['＋ 차 등록하기 ·', '＋ Register car ·'], ['＋ 차 등록하기', '＋ Register car'],
    ['같은 번호로 등록한 분이 또 있어요. 차를 산 분이라면 그대로 쓰셔도 되고, 이상하면 문의해 주세요.', "Someone else registered this number too. If you bought the car, that's fine; otherwise contact us."],
    ['▦ 내 QR', '▦ My QR'], ['🔁 번호 바꿨어요', '🔁 New plate'], ['🗑 차를 팔았어요', '🗑 Sold the car'],
    ['에일리어스콜에 등록한 차', 'Cars registered on Aliascall'],
    ['바로카로 옮기면 월 요금 없이 전화 · 문자를 계속 받아요. 등록권 1장(', 'Move it to Baroka to keep getting calls and texts with no monthly fee. Needs 1 pass ('],
    [')이 필요해요.', ').'], ['— 바로카로 옮기기', '— move to Baroka'],
    ['차종 (선택)', 'Model (optional)'], ['예) 아반떼', 'e.g. Avante'], ['색 (선택)', 'Color (optional)'], ['예) 흰색', 'e.g. white'],
    ['제 차(또는 제가 쓰는 차)가 맞고,', 'This is my car (or one I use), and I agree to the'],
    ['과 ', ' and '],
    ['에 동의합니다.', '.'],
    ['등록권으로 등록하기', 'Register with a pass'], ['결제하고 등록하기', 'Pay and register'],
    ['월 요금 없음 · 차를 팔거나 폐차하면 무료로 지울 수 있어요', 'No monthly fee · remove for free when you sell or scrap the car'],
    ['월 요금 없음', 'No monthly fee'],
    ['확인란에 체크해 주세요.', 'Please tick the box.'], ['결제를 마치지 못했어요.', "Payment wasn't completed."],
    ['님의 차', "'s car"], ['등록하지 못했어요', "Couldn't register"],
    ['✅ 등록되었어요! 이제 이 번호로 연락을 받을 수 있어요.\n주차 안내판을 뽑아 앞유리에 두면 더 좋아요.', '✅ Registered! You can now be reached by this number.\nPrint the parking sign for your windshield.'],
    ['바꾸지 못했어요', "Couldn't change"], ['✅ 번호를', '✅ Changed the number to'],
    ['로 바꿨어요. 주차 안내판의 QR은 그대로 쓰시면 됩니다.', '. Your parking-sign QR still works.'],
    ['결제는 되었어요. 확인 중이니 잠시 뒤 이 화면을 다시 열어 주세요.', 'Payment received. Please reopen this screen in a moment.'],
    ['이 QR을 찍으면 번호 없이 저에게 연락이 와요. 스티커로 뽑아 붙이셔도 됩니다.', 'Scanning this QR reaches me without my number. You can print it as a sticker.'],
    ['의 QR', ' QR'], ['링크 복사', 'Copy link'], ['그림 저장', 'Save image'], ['복사했어요', 'Copied'], ['복사해 주세요', 'Please copy'],
    ['번호판을 바꾸셨나요?', 'Got a new plate?'],
    ['새 번호로 바꾸면 그 번호로 연락을 받아요. 주차 안내판의 QR은 그대로 쓰시면 돼요.', "You'll be reached at the new number. Your parking-sign QR still works."],
    ['— 변경권이 있어 결제 없이 바뀝니다.', ' — you have a pass, no payment needed.'],
    ['지금 번호', 'Current'], ['새 번호', 'New'], ['변경권으로 바꾸기', 'Change with a pass'], ['결제하고 바꾸기', 'Pay and change'],
    ['차를 팔았거나 다른 차로 바꿨다면 [🗑 차를 팔았어요] 후 새 차를 등록해 주세요.', 'Sold the car or got another one? Use [🗑 Sold the car], then register the new car.'],
    ['를 지울까요?', ' — remove?'],
    ['지우면 이 번호 · QR로 더 이상 연락이 오지 않아요. 되돌릴 수 없고, 다시 쓰려면 새로 등록(', "After removal, this number and QR won't reach you. This can't be undone; to use it again, register anew ("],
    [')해야 해요.', ').'],
    ['폐차 · 말소했어요', 'Scrapped / deregistered'], ['다른 차로 바꿨어요', 'Got another car'], ['그냥 그만 쓸래요', 'Just stop using'],
    ['차를 팔았어요', 'Sold the car'], ['취소', 'Cancel'],
    ['지우지 못했어요.', "Couldn't remove."], ['지웠어요. 그동안 바로카를 써 주셔서 고맙습니다.', 'Removed. Thank you for using Baroka.'],
    ['앱을 열면 카메라가 바로 켜져요', 'The camera will open on launch'], ['앱을 열면 찾기 화면만 열려요', 'The search screen will open on launch'],
    ['번호판을 바꾸면 번호 변경', 'Plate change'], ['· 차를 팔거나 폐차하면 무료로 지울 수 있어요.', '· remove for free when you sell or scrap the car.'],
    ['번호 변경', 'Plate change'],
    ['차 갤러리 · 바로카', 'Car gallery · Baroka'],
    ['바로카 차주들이 올린 내 차 자랑 · 차와 함께한 풍경 · 차 관리 팁. 차 번호는 보이지 않아요.', 'Cars, road trips and care tips from Baroka owners. Plate numbers are never shown.'],
    ['내 차 자랑 · 차와 함께한 풍경 · 차 관리 팁. 바로카 차주들의 갤러리', 'Cars, road trips and care tips from Baroka owners'],
    ['🚘 차 갤러리', '🚘 Car gallery'], ['차 갤러리', 'Car gallery'], ['모두의 갤러리', 'Everyone'], ['내 갤러리', 'Mine'],
    ['🏞 풍경', '🏞 Scenery'], ['🔧 팁', '🔧 Tips'], ['🚗 내 차', '🚗 My car'], ['더 보기', 'More'],
    ['아직 올라온 사진이 없어요.', 'No photos yet.'], ['첫 사진의 주인공이 되어 보세요!', 'Be the first to post!'],
    ['액자 더 사기', 'Buy more frames'], ['한 번 사면 기한 없이 계속 써요. 사진을 지우면 칸이 다시 비어요.', 'Buy once, keep forever. Deleting a photo frees its frame.'],
    ['20칸 · ', '20 frames · '], ['60칸 · ', '60 frames · '],
    ['사진은 올린 분의 것입니다. 남의 얼굴 · 번호판 · 집이 드러나는 사진은 가려 주세요.', "Photos belong to their posters. Please blur other people's faces, plates and homes."],
    ['문제 있는 사진은', 'Report problem photos with'], ['로 알려 주세요 ·', ' ·'],
    ['사진은 올린 분의 것입니다', 'Photos belong to their posters'],
    ['🚩 신고', '🚩 Report'], ['🚫 이 분 사진 안 보기', '🚫 Hide this user'], ['닫기', 'Close'],
    ['♥ 를 누르려면 로그인해 주세요. [내 차]에서 로그인할 수 있어요.', 'Sign in to like. You can sign in under [My car].'],
    ['신고하려면 로그인해 주세요.', 'Sign in to report.'], ['로그인해 주세요.', 'Please sign in.'],
    ['어떤 문제가 있나요? (예: 음란 · 남의 번호판 · 광고 · 기타)', "What's wrong? (e.g. obscene · someone's plate · spam · other)"],
    ['신고했어요. 확인 후 조치할게요.', "Reported. We'll review it."],
    ['이 분의 사진을 더 이상 보지 않을까요?', "Stop seeing this user's photos?"],
    ['사진을 올리려면 로그인해 주세요. 바로카에 차를 등록하면 액자 4칸이 무료예요.', 'Sign in to post. Registered owners get 4 free frames.'],
    ['로그인 · 내 차 등록', 'Sign in · register car'],
    ['사진은 바로카에 차를 등록한 분이 올릴 수 있어요. 차를 등록하면', 'Only registered owners can post. Register your car to get'],
    ['액자 4칸이 무료', '4 free frames'], ['님의 갤러리', "'s gallery"],
    ['🔒 표시는 나만 보는 사진이에요. 사진을 누르면 설명 · 공개 · 지우기를 바꿀 수 있어요.', '🔒 = only you can see it. Tap a photo to edit caption, visibility or delete.'],
    ['칸이 다 찼어요. 액자를 더 사 주세요.', 'All frames are full. Please buy more.'], ['칸이 다 찼어요', 'Frames full'],
    ['사진 올리기', 'Add photo'], ['🔒 나만', '🔒 Only me'], ['숨김(신고)', 'Hidden (reported)'],
    ['액자를 더 사면 계속 올릴 수 있어요', 'Buy more frames to keep posting'],
    ['올리기 전에 잠깐!', 'Before you post'],
    ['이 보이면 다음 화면에서 손가락으로 네모를 그려 가려 주세요(남의 차 번호판도요).', ' visible? Draw a box with your finger on the next screen to blur it (others\' plates too).'],
    ['가 드러나는 사진은 조심하세요.', ' — be careful with photos that show them.'],
    ['는 저절로 지워져요.', ' is removed automatically.'],
    ['예요. 끄면 나만 보는 사진이 돼요.', '. Turn it off to keep a photo private.'],
    ['촬영 장소 정보', 'Location data'], ['집 · 회사', 'Home · work'], ['모두에게 보이기', 'Visible to everyone'], ['기본은', 'Default:'],
    ['알겠어요', 'Got it'], ['이 사진은 열 수 없어요. 다른 사진을 골라 주세요.', "Can't open this photo. Please pick another."],
    ['번호판 · 얼굴이 보이면', 'Plate or face visible?'], ['손가락으로 네모를 그려', 'Draw a box with your finger'], ['가려 주세요.', 'to blur it.'],
    ['↩ 가리기 하나 취소', '↩ Undo blur'], ['한마디 (예: 첫 차 1주년! · 와이퍼 교체 팁)', 'Caption (e.g. 1 year with my first car!)'],
    ['올리는 중…', 'Uploading…'], ['차를 먼저 등록해 주세요.', 'Please register your car first.'], ['올리지 못했어요', "Couldn't upload"],
    ['올렸어요!', 'Posted!'], ['신고가 들어와 다른 분들에게는 숨겨졌어요. 운영자가 확인 중이에요.', 'Hidden from others after reports. Our staff is reviewing it.'],
    ['이 사진을 지울까요? 칸이 다시 비어요.', 'Delete this photo? Its frame will be freed.'], ['🗑 지우기', '🗑 Delete'],
    ['액자를 늘렸어요', 'Frames added'], ['올리기', 'Post'], ['저장', 'Save'],
    ['닉네임 또는 비밀번호가 맞지 않습니다.', 'Wrong nickname or password.'], ['닉네임을 두 글자 이상 넣어 주세요.', 'Nickname must be 2+ characters.'],
    ['비밀번호는 6자리 이상으로 해 주세요.', 'Password must be 6+ characters.'],
    ['이미 다른 분이 쓰는 닉네임입니다. 다른 닉네임으로 해 주세요.', 'That nickname is taken. Please choose another.'],
    ['이 자리에', 'Your ad'], ['광고하세요', 'here'], ['광고', 'Ads'],
    ['📷 사진으로', '📷 Use a photo'], ['로그아웃', 'Log out'], ['로그인', 'Sign in'], ['내 차', 'My car'], ['전체', 'All'],
    ['등록', 'Registered'], ['차 번호', 'Plate number'], ['회원', 'Member'], ['바로카', 'Baroka'],
  ];
  D.sort(function(a, b){ return b[0].length - a[0].length; });
  var HAS = /[가-힣]/;
  function tr(s){
    if (!s || !HAS.test(s)) return s;
    var o = s;
    for (var i = 0; i < D.length; i++) if (o.indexOf(D[i][0]) >= 0) o = o.split(D[i][0]).join(D[i][1]);
    o = o.replace(/([\d,]+)원/g, '₩$1').replace(/(\d+)\s*\/\s*(\d+)칸/g, '$1 / $2 frames').replace(/(\d+)칸/g, '$1 frames')
         .replace(/(\d+)번/g, '$1×').replace(/(\d+)장/g, '$1').replace(/(\d+)건/g, '$1');
    return o;
  }
  BK.tr = tr;
  function walk(root){
    if (!root) return;
    if (root.nodeType === 3) { var t = tr(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.nodeName)) return;
    if (root.classList && root.classList.contains('bk-plate')) return;   // 번호판 글자는 그대로
    ['placeholder', 'aria-label', 'title'].forEach(function(a){ var v = root.getAttribute && root.getAttribute(a); if (v && HAS.test(v)) root.setAttribute(a, tr(v)); });
    if (root.nodeName === 'INPUT' && /^(button|submit)$/i.test(root.type) && HAS.test(root.value)) root.value = tr(root.value);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  function run(){
    document.title = tr(document.title);
    walk(document.body);
    new MutationObserver(function(ms){
      ms.forEach(function(m){
        if (m.type === 'characterData') walk(m.target);
        else m.addedNodes.forEach(walk);
        if (m.type === 'attributes') walk(m.target);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder'] });
  }
  var A = window.alert, C = window.confirm, P = window.prompt;
  window.alert = function(m){ return A.call(window, tr(String(m))); };
  window.confirm = function(m){ return C.call(window, tr(String(m))); };
  window.prompt = function(m, d){ return P.call(window, tr(String(m)), d); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
