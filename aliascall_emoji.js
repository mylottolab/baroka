// =====================================================
// Aliascall — 이모지 선택기 공용 데이터/함수
// 2026-08-22 신설. 2026-08-25 다국어(한국어/영어) 적용.
//
// 애니메이션 이모지는 구글의 "Noto Animated Emoji" 프로젝트를 씀 (무료, CC BY 4.0 —
// 출처 표시 필요해서 패널 안에 작게 넣어둠). 공식 사이트: googlefonts.github.io/noto-emoji-animation
// 구글이 직접 운영하는 CDN(fonts.gstatic.com)에서 애니메이션 GIF를 그대로 가져다 씀.
//
// 동작 방식:
//   1) 선택 패널엔 움직이는 GIF로 보여줌(고르는 재미)
//   2) 실제로 채팅창에 입력될 때는 평범한 유니코드 문자로 들어감(기존 문자 저장/암호화
//      방식이 전혀 안 바뀌어도 됨 — 그냥 "그 이모지 하나만 있는 문자"일 뿐)
//   3) 메시지 내용이 "이모지 1~3개로만" 이루어져 있으면, 받는 쪽 화면에서 큰 애니메이션
//      스티커처럼 다시 보여줌 (카톡 이모티콘 전용 메시지처럼)
// =====================================================

// ───────────────────────────────────────────────────
// 공용 언어 감지 블록 (4개 공용 스크립트에 똑같이 들어있음 — 먼저 불려온 파일이 한 번만 정의)
// ───────────────────────────────────────────────────
(function(){
  if (typeof window.getAliascallLang === 'function') return;
  var KEYS = ['aliascall_lang', 'aliascall_language', 'ac_lang', 'lang'];
  window.ALIASCALL_LANG_KEYS = KEYS;
  window.getAliascallLang = function(){
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (q) return q.toLowerCase().indexOf('en') === 0 ? 'en' : 'ko';
    } catch (e) {}
    for (var i = 0; i < KEYS.length; i++) {
      try {
        var v = localStorage.getItem(KEYS[i]);
        if (v) return String(v).toLowerCase().indexOf('en') === 0 ? 'en' : 'ko';
      } catch (e) {}
    }
    return (navigator.language || 'ko').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  };
  window.setAliascallLang = function(lang){
    var v = (String(lang).toLowerCase().indexOf('en') === 0) ? 'en' : 'ko';
    KEYS.forEach(function(k){ try { localStorage.setItem(k, v); } catch (e) {} });
    return v;
  };
})();

// ── 이 파일 전용 사전 ──
// ⚠ 카테고리 이름은 지금까지 화면에 전혀 안 나오고 있었음(탭에 아이콘만 표시).
// 2026-08-25: 탭에 title/aria-label을 붙이면서 비로소 쓰이게 됨.
const _AC_EMOJI_I18N = {
  ko: {
    catPopular: '인기', catFaces: '표정', catHands: '손·사람', catHearts: '마음',
    catAnimals: '동물', catNature: '자연', catFood: '음식', catActivity: '활동', catObjects: '사물',
    credit: '이모지: Google Noto Emoji · CC BY 4.0',
  },
  en: {
    catPopular: 'Popular', catFaces: 'Faces', catHands: 'People', catHearts: 'Hearts',
    catAnimals: 'Animals', catNature: 'Nature', catFood: 'Food', catActivity: 'Activity', catObjects: 'Objects',
    credit: 'Emoji: Google Noto Emoji · CC BY 4.0',
  },
};
function _acEmojiT(key){
  const lang = window.getAliascallLang();
  const d = _AC_EMOJI_I18N[lang] || _AC_EMOJI_I18N.ko;
  return d[key] !== undefined ? d[key] : _AC_EMOJI_I18N.ko[key];
}

// 카테고리 구분(픽커에서 탭으로 넘나들 수 있게) — 이모지 자체는 위 ALIASCALL_EMOJI_MAP과 동일
const ALIASCALL_EMOJI_CATEGORIES = [
  // 2026-08-22 신설: 실제 이모지 사용빈도 통계(유니코드 컨소시엄/이모지피디아 등)를 참고해
  // 자주 쓰이는 상위 50개만 추린 카테고리 — 맨 앞에 둬서 기본으로 바로 보이게 함
  { key: 'catPopular', name: '인기', icon: '⭐', chars: ['😂','❤️','🤣','👍','😭','🙏','😘','🥰','😍','😊','🎉','😁','💕','🥺','😅','🔥','🤔','😢','🙄','💔','😎','👏','😉','🙂','💯','✨','😱','💪','🥳','😴','😡','🤗','👌','✌️','🙌','😆','😋','🌸','🎂','☕','🍕','💤','😳','😷','👀','💛','💙','🐶','🐱','💐'] },
  { key: 'catFaces', name: '표정', icon: '😀', chars: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😔','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😓','🤗','🤭','🤫','🤥','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😲','😳','🥺','😬','🤤','😈','👿','💀','☠️','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
  { key: 'catHands', name: '손·사람', icon: '👋', chars: ['👍','👎','👏','🙌','🙏','💪','🤝','✌️','🤞','👌','🤟','🤘','👊','✊','👋','🤙','👈','👉','👆','👇','☝️','✋','🖐️','🖖','👀','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','👮','🕵️','👷','💂','👨‍⚕️','👩‍⚕️','👨‍🏫','👩‍🏫','👨‍💻','👩‍💻','🧑‍🎓','🧑‍🍳','🤴','👸','🤵','👰','🤰','🤱'] },
  { key: 'catHearts', name: '마음', icon: '❤️', chars: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳️','💬','🗨️','🗯️','💭','💤'] },
  { key: 'catAnimals', name: '동물', icon: '🐶', chars: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦀','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐆','🦓','🦍','🐘','🦛','🦒','🐫','🦘','🐕','🐈','🐓','🦃','🦚','🦜','🐇','🐿️'] },
  { key: 'catNature', name: '자연', icon: '🌸', chars: ['🌸','💐','🌷','🌹','🌻','🌼','🌱','🌲','🌳','🌴','🌵','🌾','🍀','🍁','🍂','🍃','🌿','☘️','🌊','🔥','💧','☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','🌪️','🌈','☔','⚡','🌙','⭐','🌟','✨','☄️','🌍','🌎','🌏'] },
  { key: 'catFood', name: '음식', icon: '🍔', chars: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🍿','🧂','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🍤','🍙','🍚','🍘','🍥','🥟','🍡','🍧','🍨','🍦','🥧','🍰','🎂','🧁','🍮','🍭','🍬','🍫','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'] },
  { key: 'catActivity', name: '활동', icon: '⚽', chars: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','⛳','🏹','🎣','🥊','🥋','🎽','🛹','🛼','🎿','⛷️','🏂','🏋️','🤼','🤸','⛹️','🤾','🏄','🏊','🤽','🚣','🧗','🚴','🚵','🏆','🥇','🥈','🥉','🎖️','🏅','🎗️','🎫','🎟️','🎪','🤹','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🧩','🚗','🚕','🚙','🚌','🚓','🚑','🚒','🚚','🚲','🛵','🏍️','✈️','🚀','🛸','🚁','⛵','🚤','🛳️','⚓','🏝️','🏔️','🗽','🗼','🏰','🎡','🎢','🎠'] },
  { key: 'catObjects', name: '사물', icon: '💡', chars: ['💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','📷','📸','📹','🎥','📺','📻','⏰','⏱️','⏲️','🕰️','⌚','📚','📖','📕','📗','📘','📙','📔','📓','📒','📝','✏️','🖊️','🖋️','🖌️','📌','📍','✂️','🔒','🔓','🔑','🗝️','🔨','🛠️','🔧','⚙️','⛏️','⚗️','🧪','🔬','🔭','📡','💊','💉','🩹','🚪','🪑','🛏️','🛋️','🚿','🛁','🧴','🧼','🧻','🎁','🎈','🎀','🎊','🎉','🎄','🎃','🧧','💌','📩','📮','📦','📫','🕐','💰','💵','💳','💎','⚖️','🔔','🔕','📢','📣','📯','🚩','🏳️','🏴','🏁','🚦','⛔','🔞','📵','🚭','♻️','✅','❌','❓','❗','⚠️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪'] },
];

const ALIASCALL_EMOJI_MAP = {};
ALIASCALL_EMOJI_CATEGORIES.forEach((cat) => {
  cat.chars.forEach((e) => {
    if (ALIASCALL_EMOJI_MAP[e]) return; // 중복 방지
    const cps = Array.from(e).filter((c) => c.codePointAt(0) !== 0xFE0F && c.codePointAt(0) !== 0x200D);
    const hexcode = cps.map((c) => c.codePointAt(0).toString(16)).join('_');
    ALIASCALL_EMOJI_MAP[e] = hexcode;
  });
});
// 긴 시퀀스(변형선택자 포함)를 먼저 매칭해야 하므로 길이 내림차순으로 정렬해둠
const ALIASCALL_EMOJI_KEYS_BY_LENGTH = Object.keys(ALIASCALL_EMOJI_MAP).sort((a, b) => b.length - a.length);

function aliascallEmojiGifUrl(char){
  const code = ALIASCALL_EMOJI_MAP[char];
  return code ? `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif` : null;
}

// 선택 패널을 컨테이너에 채워 넣음 — 카테고리 탭 + 그 카테고리의 이모지 그리드.
// 이모지를 누르면 onPick(문자)를 호출함
function renderAliascallEmojiPanel(containerEl, onPick){
  let activeCategoryIdx = 0;

  function renderGrid(){
    const cat = ALIASCALL_EMOJI_CATEGORIES[activeCategoryIdx];
    const grid = containerEl.querySelector('.aliascall-emoji-grid');
    grid.innerHTML = cat.chars.map((char) => {
      const url = aliascallEmojiGifUrl(char);
      return `<button type="button" data-char="${char}" class="aliascall-emoji-btn"><img src="${url}" alt="${char}" loading="lazy"></button>`;
    }).join('');
    grid.querySelectorAll('.aliascall-emoji-btn').forEach((btn) => {
      const img = btn.querySelector('img');
      img.addEventListener('error', () => { btn.innerHTML = btn.dataset.char; }, { once: true }); // 혹시 특정 이모지 GIF가 없으면 글자로 대체
      btn.addEventListener('click', () => onPick(btn.dataset.char));
    });
  }

  // 2026-08-25: 탭에 이름을 title/aria-label로 붙임 — 전에는 아이콘뿐이라
  // 스크린리더가 무슨 탭인지 읽어줄 수 없었음
  const tabsHtml = ALIASCALL_EMOJI_CATEGORIES.map((cat, i) => {
    const label = _acEmojiT(cat.key);
    return `<button type="button" class="aliascall-emoji-tab${i === 0 ? ' active' : ''}" data-idx="${i}" title="${label}" aria-label="${label}">${cat.icon}</button>`;
  }).join('');
  containerEl.innerHTML =
    `<div class="aliascall-emoji-tabs">${tabsHtml}</div>` +
    `<div class="aliascall-emoji-grid"></div>` +
    `<div class="aliascall-emoji-credit">${_acEmojiT('credit')}</div>`;

  containerEl.querySelectorAll('.aliascall-emoji-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      containerEl.querySelectorAll('.aliascall-emoji-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeCategoryIdx = Number(tab.dataset.idx);
      renderGrid();
    });
  });

  renderGrid();
}

// 메시지가 "이모지 1~3개로만" 이루어져 있으면, 각 이모지의 { char, url } 배열을 반환하고,
// 아니면(일반 문장이거나 4개 넘게 있으면) null을 반환함 — 호출한 쪽에서 null이면 그냥
// 보통 문자로 표시하면 됨
function aliascallExtractEmojiOnly(text){
  if (!text) return null;
  let remaining = text;
  const found = [];
  while (remaining.length > 0 && found.length <= 3) {
    const match = ALIASCALL_EMOJI_KEYS_BY_LENGTH.find((k) => remaining.startsWith(k));
    if (!match) return null;
    found.push({ char: match, url: aliascallEmojiGifUrl(match) });
    remaining = remaining.slice(match.length);
  }
  if (remaining.length > 0 || found.length === 0 || found.length > 3) return null;
  return found;
}
