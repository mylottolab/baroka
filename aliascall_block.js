/* =====================================================================
   Aliascall — 발견자 차단 (2026-10-14 신설)
   서버 쪽: sql/finder_block.sql (먼저 Run 해야 합니다)

   이 파일 하나를 두 화면 맨 끝(</body> 바로 위)에 불러옵니다.
     • aliascall_incoming_calls.html (주인이 받은 연락 화면)
         → 🚩 신고 단추 옆에 [🚫 차단] 단추가 생깁니다. 차단한 대화에서는 [차단 해제] 로 바뀝니다.
     • aliascall_connect.html (발견자가 QR 을 찍고 들어오는 화면)
         → 차단된 발견자가 문자 · 사진 · 통화를 보내려 하면
           "이 연락처로는 더 이상 연락할 수 없습니다" 만 보입니다(차단했다는 말은 하지 않습니다).

   ⚠ 기존 화면 코드는 한 줄도 고치지 않습니다. 화면에 이미 있는 currentCaseId · sb · tempGate 를
     그대로 빌려 씁니다(같은 페이지의 전역 이름).
   ===================================================================== */
(function () {
  function lang() { try { return localStorage.getItem('aliascall_lang') === 'en' ? 'en' : 'ko'; } catch (e) { return 'ko'; } }
  var TXT = {
    ko: {
      block: '🚫 차단', unblock: '차단 해제',
      needChat: '대화를 연 뒤에 차단할 수 있어요.',
      askBlock: '이 발견자를 차단할까요?\n\n차단하면 이 분은 내 모든 QR · 번호판으로 문자 · 사진 · 통화를 보낼 수 없습니다.\n상대에게는 차단했다는 사실을 알리지 않습니다.\n이 화면에서 언제든 [차단 해제] 할 수 있습니다.',
      askUnblock: '차단을 풀까요? 이 분이 다시 연락할 수 있게 됩니다.',
      blocked: '차단했습니다. 이 분은 더 이상 연락할 수 없습니다.',
      unblocked: '차단을 풀었습니다.',
      fail: '처리하지 못했습니다: ',
      finderMsg: '이 연락처로는 더 이상 연락할 수 없습니다.',
    },
    en: {
      block: '🚫 Block', unblock: 'Unblock',
      needChat: 'Open the conversation first to block.',
      askBlock: 'Block this person?\n\nThey will no longer be able to send messages, photos or calls through any of your QR codes or plates.\nThey are not told that they were blocked.\nYou can unblock here at any time.',
      askUnblock: 'Unblock? This person will be able to contact you again.',
      blocked: 'Blocked. This person can no longer contact you.',
      unblocked: 'Unblocked.',
      fail: 'Could not complete: ',
      finderMsg: 'This contact can no longer be reached.',
    },
  };
  function T(k) { return TXT[lang()][k]; }
  function caseId() { try { return (typeof currentCaseId !== 'undefined') ? currentCaseId : null; } catch (e) { return null; } }
  function client() { try { return (typeof sb !== 'undefined') ? sb : null; } catch (e) { return null; } }

  /* ── 주인 화면: 받은 연락 ─────────────────────────────────────────── */
  function setupOwner(reportBtn) {
    // 🔴 2026-10-14 — 단추가 하나 늘어 아이폰(좁은 화면)에서 머리줄이 화면보다 넓어지고
    //   대화 전체가 오른쪽으로 잘렸습니다. 머리줄을 두 줄로 접히게 하고 단추를 조금 줄입니다.
    var st = document.createElement('style');
    st.textContent =
      '.chat-only-header{flex-wrap:wrap;gap:8px;padding:10px 12px !important;max-width:100vw;box-sizing:border-box}' +
      '.chat-only-header > b{flex:1 1 140px;min-width:0}' +
      '.chat-only-header > div{flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;gap:6px !important;min-width:0;max-width:100%}' +
      '.chat-only-header button{padding:6px 10px !important;font-size:12px !important;white-space:nowrap}' +
      '.session-chat,.chat-messages{min-width:0;max-width:100vw;box-sizing:border-box}';
    document.head.appendChild(st);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'acBlockBtn';
    btn.setAttribute('style', 'background:none !important; color:var(--danger) !important; font-size:12.5px; font-weight:700; padding:4px 8px !important; border:1px solid currentColor !important; border-radius:8px; white-space:nowrap;');
    btn.textContent = T('block');
    reportBtn.parentNode.insertBefore(btn, reportBtn.nextSibling);

    var state = { id: null, blocked: false };
    function paint() { btn.textContent = state.blocked ? T('unblock') : T('block'); }

    async function refresh() {
      var id = caseId(), c = client();
      if (id === state.id) return;
      state.id = id; state.blocked = false; paint();
      if (!id || !c) return;
      try {
        var r = await c.rpc('is_finder_blocked', { p_case_id: id });
        if (!r.error && state.id === id) { state.blocked = !!r.data; paint(); }
      } catch (e) { /* 조용히 — 단추는 "차단"으로 둡니다 */ }
    }
    setInterval(refresh, 800);
    refresh();

    btn.addEventListener('click', async function () {
      var id = caseId(), c = client();
      if (!id || !c) { alert(T('needChat')); return; }
      var undo = state.blocked;
      if (!confirm(undo ? T('askUnblock') : T('askBlock'))) return;
      btn.disabled = true;
      try {
        var r = await c.rpc(undo ? 'unblock_finder' : 'block_finder', { p_case_id: id });
        if (r.error) throw r.error;
        state.blocked = !undo; paint();
        alert(undo ? T('unblocked') : T('blocked'));
      } catch (e) {
        alert(T('fail') + (e.message || e));
      } finally { btn.disabled = false; }
    });
  }

  /* ── 발견자 화면: 차단된 경우 안내만 ──────────────────────────────── */
  function setupFinder() {
    var isBlocked = function (m) { return String(m || '').indexOf('finder_blocked') >= 0; };
    var until = 0;                       // 안내를 띄운 뒤 잠깐은 화면의 다른 실패 알림을 숨깁니다
    var nativeAlert = window.alert;
    function notice() {
      var first = Date.now() > until;
      until = Date.now() + 4000;
      try {
        var ov = document.getElementById('callingOverlay');
        var inp = document.getElementById('chatInput'), sbtn = document.getElementById('chatSendBtn');
        if (inp) inp.disabled = true; if (sbtn) sbtn.disabled = true;
        var note = document.getElementById('chatClosedNote');
        if (note) { var sp = note.querySelector('span'); if (sp) sp.textContent = '🔒 ' + T('finderMsg'); note.classList.add('show'); }
        var rb = document.getElementById('reopenCaseBtn'); if (rb) rb.style.display = 'none';
        if (ov && !note) ov.classList.remove('show');
      } catch (e) {}
      if (first) nativeAlert.call(window, T('finderMsg'));
    }
    // ① 서버 응답에 차단 오류가 있으면 바로 안내 (대화 열기 · 문자 · 사진 · 통화 모두 fetch 를 거칩니다)
    var nativeFetch = window.fetch;
    window.fetch = function () {
      return nativeFetch.apply(this, arguments).then(function (res) {
        if (res.ok) return res;
        // 화면이 응답을 읽기 전에 먼저 확인합니다(그래야 화면의 "실패" 알림보다 안내가 먼저 뜹니다)
        return res.clone().text().then(function (t) { if (isBlocked(t)) notice(); return res; }, function () { return res; });
      });
    };
    // ② 그 직후 화면이 띄우는 "전송 실패" 같은 알림은 숨깁니다
    window.alert = function (msg) {
      if (isBlocked(msg) || Date.now() < until) { notice(); return; }
      return nativeAlert.apply(window, arguments);
    };
    // ③ 대화 열기 · 통화 시작에서 쓰는 tempGate 도 차단 오류면 거기서 멈추게
    if (typeof window.tempGate === 'function') {
      var orig = window.tempGate;
      window.tempGate = function (msg) {
        if (isBlocked(msg)) { notice(); return true; }
        return orig.apply(this, arguments);
      };
    }
  }

  function start() {
    var report = document.getElementById('acReportBtn');
    if (report && !document.getElementById('acBlockBtn')) { setupOwner(report); return; }
    if (/aliascall_connect/.test(location.pathname) || typeof window.tempGate === 'function') setupFinder();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
