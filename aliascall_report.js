// =====================================================
// Aliascall — 신고 기능 공용 스크립트
// 2026-08-24 신설. 2026-08-25 다국어(한국어/영어) 적용.
//
// 사건함 / 핫라인 대화방 / 찾습니다 게시판 세 곳에서 공용으로 씀.
// 각 화면에서 <script src="aliascall_report.js"></script> 로 불러온 뒤,
// 신고 버튼을 만들 자리에 아래처럼 호출하면 됨:
//
//   aliascallReportButton({ context: 'case',    targetId: caseId })
//   aliascallReportButton({ context: 'hotline', targetId: hotlineId })
//   aliascallReportButton({ context: 'board',   targetId: postId })
//
// 반환값은 <button> 엘리먼트. appendChild로 원하는 곳에 붙이면 됨.
// 또는 이미 만들어둔 버튼의 클릭 핸들러에서 직접 열 수도 있음:
//
//   myButton.onclick = () => aliascallOpenReport({ context:'case', targetId: caseId });
//
// ⚠ 신고 사유는 'sexual', 'violence' 같은 영문 코드로 DB에 저장됨.
//   화면에 보이는 문구만 번역하므로 관리자 대시보드는 영향 없음.
// =====================================================

// ─────────────────────────────────────────────────────
// 공용 언어 감지 블록 (4개 공용 스크립트에 똑같이 들어있음 — 먼저 불려온 파일이 한 번만 정의)
// ─────────────────────────────────────────────────────
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

const REPORT_FN_URL = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1/aliascall-report-submit';

// ── 이 파일 전용 사전 ──
const _AC_REPORT_I18N = {
  ko: {
    btnLabel: '🚩 신고',
    title: '🚩 신고하기',
    desc: '부적절한 내용을 발견하셨나요? 확인 후 조치하겠습니다.',
    descPrivate: '신고 내용은 신고당한 상대에게 알려지지 않습니다.',
    detailPlaceholder: '어떤 점이 문제였는지 적어주세요 (선택)',
    cancel: '취소',
    submit: '신고 접수',
    submitting: '접수 중…',
    doneTitle: '신고가 접수되었습니다',
    doneDesc: '확인 후 조치하겠습니다.',
    doneClose: '확인',
    failAlert: '신고 접수 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.',
    dialogLabel: '신고하기',
    // 신고 사유 (value는 DB 저장값이라 절대 바뀌지 않음)
    sexual: '음란물 · 성적인 콘텐츠',
    violence: '폭력 · 위협',
    abuse: '욕설 · 괴롭힘',
    spam: '스팸 · 광고',
    fraud: '사기 · 금전 요구',
    privacy: '개인정보 노출',
    other: '기타',
  },
  en: {
    btnLabel: '🚩 Report',
    title: '🚩 Report',
    desc: 'Found something inappropriate? We will review it and take action.',
    descPrivate: 'The person you report will not be told about this report.',
    detailPlaceholder: 'Tell us what the problem was (optional)',
    cancel: 'Cancel',
    submit: 'Submit report',
    submitting: 'Submitting…',
    doneTitle: 'Your report has been received',
    doneDesc: 'We will review it and take action.',
    doneClose: 'OK',
    failAlert: 'Something went wrong while submitting your report. Please try again in a moment.',
    dialogLabel: 'Report',
    sexual: 'Sexual or explicit content',
    violence: 'Violence or threats',
    abuse: 'Abusive language or harassment',
    spam: 'Spam or advertising',
    fraud: 'Fraud or requests for money',
    privacy: 'Exposure of personal information',
    other: 'Other',
  },
};
function _acReportT(key){
  const lang = window.getAliascallLang();
  const d = _AC_REPORT_I18N[lang] || _AC_REPORT_I18N.ko;
  return d[key] !== undefined ? d[key] : _AC_REPORT_I18N.ko[key];
}

// value = DB에 저장되는 코드 (절대 번역하지 않음)
// label = 한국어 원문. 다른 화면이 .label을 읽고 있을 수 있어 하위호환용으로 남겨둠.
const ALIASCALL_REPORT_REASONS = [
  { value: 'sexual',   label: '음란물 · 성적인 콘텐츠' },
  { value: 'violence', label: '폭력 · 위협' },
  { value: 'abuse',    label: '욕설 · 괴롭힘' },
  { value: 'spam',     label: '스팸 · 광고' },
  { value: 'fraud',    label: '사기 · 금전 요구' },
  { value: 'privacy',  label: '개인정보 노출' },
  { value: 'other',    label: '기타' },
];

// ── 스타일 주입 (한 번만) ──
function _injectReportStyle(){
  if (document.getElementById('aliascall-report-style')) return;
  const style = document.createElement('style');
  style.id = 'aliascall-report-style';
  style.textContent = `
    .ac-report-btn {
      background: none; border: none; cursor: pointer;
      color: #b9483a; font-size: 13px; padding: 6px 10px;
      border-radius: 8px; opacity: .85;
    }
    .ac-report-btn:hover { background: rgba(185,72,58,.08); opacity: 1; }

    .ac-report-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 16px;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .ac-report-modal {
      background: #fff; color: #222; border-radius: 16px;
      width: 100%; max-width: 420px; max-height: 100%;
      overflow-y: auto; padding: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,.3);
    }
    .ac-report-title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .ac-report-desc  { font-size: 13px; color: #666; margin: 0 0 16px; line-height: 1.5; }
    .ac-report-reason { display: block; padding: 10px 12px; margin-bottom: 6px;
      border: 1px solid #e3e3e3; border-radius: 10px; cursor: pointer; font-size: 14px; }
    .ac-report-reason:has(input:checked) { border-color: #b9483a; background: #fdf3f1; }
    .ac-report-reason input { margin-right: 8px; }
    .ac-report-detail {
      width: 100%; box-sizing: border-box; margin-top: 10px; padding: 10px;
      border: 1px solid #e3e3e3; border-radius: 10px; font-size: 14px;
      font-family: inherit; resize: vertical; min-height: 70px;
    }
    .ac-report-actions { display: flex; gap: 8px; margin-top: 16px; }
    .ac-report-actions button {
      flex: 1; padding: 12px; border-radius: 10px; font-size: 15px;
      font-weight: 600; cursor: pointer; border: none;
    }
    .ac-report-cancel  { background: #f0f0f0; color: #444; }
    .ac-report-submit  { background: #b9483a; color: #fff; }
    .ac-report-submit:disabled { opacity: .55; cursor: default; }
    .ac-report-done { text-align: center; padding: 24px 8px; }
    .ac-report-done .ac-emoji { font-size: 40px; }
  `;
  document.head.appendChild(style);
}

// ── 신고 모달 열기 ──
function aliascallOpenReport(opts){
  const { context, targetId, messageId } = opts || {};
  if (!context || !targetId) {
    console.error('[report] context, targetId가 필요합니다.', opts);
    return;
  }

  _injectReportStyle();

  const backdrop = document.createElement('div');
  backdrop.className = 'ac-report-backdrop';

  const reasonsHtml = ALIASCALL_REPORT_REASONS.map((r) => `
    <label class="ac-report-reason">
      <input type="radio" name="acReportReason" value="${r.value}">
      ${_acReportT(r.value)}
    </label>`).join('');

  backdrop.innerHTML = `
    <div class="ac-report-modal" role="dialog" aria-modal="true" aria-label="${_acReportT('dialogLabel')}">
      <h3 class="ac-report-title">${_acReportT('title')}</h3>
      <p class="ac-report-desc">
        ${_acReportT('desc')}<br>
        ${_acReportT('descPrivate')}
      </p>
      <div id="acReportReasons">${reasonsHtml}</div>
      <textarea class="ac-report-detail" id="acReportDetail"
        placeholder="${_acReportT('detailPlaceholder')}" maxlength="1000"></textarea>
      <div class="ac-report-actions">
        <button type="button" class="ac-report-cancel" id="acReportCancel">${_acReportT('cancel')}</button>
        <button type="button" class="ac-report-submit" id="acReportSubmit" disabled>${_acReportT('submit')}</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const submitBtn = backdrop.querySelector('#acReportSubmit');
  const cancelBtn = backdrop.querySelector('#acReportCancel');

  // 사유를 골라야 접수 버튼이 활성화됨
  backdrop.querySelector('#acReportReasons').addEventListener('change', () => {
    submitBtn.disabled = !backdrop.querySelector('input[name="acReportReason"]:checked');
  });

  // 2026-08-25 신설: ESC로도 닫히게 함 (전에는 취소 버튼/바깥 클릭 말고는 빠져나갈 길이 없었음)
  const onKeydown = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
  };
  document.addEventListener('keydown', onKeydown);

  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  submitBtn.addEventListener('click', async () => {
    const reason = backdrop.querySelector('input[name="acReportReason"]:checked')?.value;
    if (!reason) return;

    submitBtn.disabled = true;
    submitBtn.textContent = _acReportT('submitting');

    try {
      const headers = { 'Content-Type': 'application/json' };

      // 로그인 상태면 토큰을 실어 보냄 (발견자는 비로그인이라 없을 수 있음)
      try {
        if (typeof sb !== 'undefined' && sb?.auth?.getSession) {
          const { data: { session } } = await sb.auth.getSession();
          if (session) headers.Authorization = 'Bearer ' + session.access_token;
        }
      } catch (_) { /* 비로그인 — 그대로 진행 */ }

      const res = await fetch(REPORT_FN_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          context,
          targetId,
          messageId: messageId || null,
          reason,
          detail: backdrop.querySelector('#acReportDetail').value.trim() || null,
          sourceUrl: location.href,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || '접수 실패');

      // ⚠ 2026-08-25 수정 두 가지:
      //  ① 서버(aliascall-report-submit)가 돌려주는 message는 한국어라, 영어 화면에서는
      //     한국어가 튀어나오던 자리임 → 영어일 때는 이 파일의 문구를 씀.
      //     (나중에 Edge Function이 언어별 문구를 돌려주게 되면 그때 이 조건을 풀면 됨)
      //  ② 서버 응답을 innerHTML로 그대로 꽂던 것을 textContent로 바꿈.
      //     지금은 서버가 정해준 문구만 오지만, 나중에 사용자 입력이 섞여 들어오면
      //     그대로 실행돼버릴 수 있는 자리였음.
      const isKo = window.getAliascallLang() === 'ko';
      const doneMsg = (isKo && json.message) ? json.message : _acReportT('doneDesc');

      const modal = backdrop.querySelector('.ac-report-modal');
      modal.innerHTML = '';
      const done = document.createElement('div');
      done.className = 'ac-report-done';

      const emoji = document.createElement('div');
      emoji.className = 'ac-emoji';
      emoji.textContent = '✅';
      done.appendChild(emoji);

      const h3 = document.createElement('h3');
      h3.className = 'ac-report-title';
      h3.textContent = _acReportT('doneTitle');
      done.appendChild(h3);

      const p = document.createElement('p');
      p.className = 'ac-report-desc';
      p.textContent = doneMsg;
      done.appendChild(p);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ac-report-submit';
      closeBtn.style.width = '100%';
      closeBtn.textContent = _acReportT('doneClose');
      closeBtn.addEventListener('click', close);
      done.appendChild(closeBtn);

      modal.appendChild(done);

    } catch (e) {
      console.error('[report] 신고 실패', e);
      alert(_acReportT('failAlert'));
      submitBtn.disabled = false;
      submitBtn.textContent = _acReportT('submit');
    }
  });
}

// ── 신고 버튼 엘리먼트 만들기 ──
// 원하는 자리에 appendChild 해서 쓰면 됨.
function aliascallReportButton(opts){
  _injectReportStyle();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ac-report-btn';
  btn.textContent = opts?.label || _acReportT('btnLabel');
  btn.addEventListener('click', () => aliascallOpenReport(opts));
  return btn;
}
