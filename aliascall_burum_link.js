/* =====================================================================
   Aliascall ↔ 부름 잇기 (aliascall_burum_link.js)
   2026-10-01 신설 — 두 앱 잇기 1 · 2단계

   왜
     에일리어스콜은 "잠깐" 연결입니다(QR · 임시연락처). 대화가 잘 되어
     "계속 연락하고 싶다" 가 되는 순간이 부름이 이어받을 자리입니다.
     번호는 끝까지 서로 모릅니다.

   🔴 2026-10-01 (2판) — 한 번만 누르면 됩니다
     [💬 부름으로 이어가기] → 확인 한 번 → 추측할 수 없는 1회용 번호가 담긴
     "부름 연결 카드"(burum.kr/alias_bridge.html?b=번호)가 양쪽 대화에 올라갑니다.
     두 분이 각자 카드를 누르고 부름에 로그인하면, 부름이 저절로 두 분을 잇고
     **같은 대화창**을 열어 줍니다(맨 위 "부름으로 연결되었습니다. 사용하세요.").
     복사 · 붙여넣기도, 부름에서 초대장을 만드는 일도 없습니다.

   ACBurum.card(text)         글에 부름 연결 · 초대 링크가 있으면 카드(요소)를, 없으면 null
   ACBurum.openSheet(sendFn)  [💬 부름으로 이어가기] 확인창 — sendFn(text) 로 보냅니다
   ===================================================================== */
(function(){
  var BURUM = 'https://burum.kr/';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.weaveapp.alias';
  var RE = /https?:\/\/(?:www\.)?burum\.kr\/alias_join\.html\?c=([A-Za-z0-9_-]{4,40})/;
  var RE_BR = /https?:\/\/(?:www\.)?burum\.kr\/alias_bridge\.html\?b=([A-Za-z0-9_-]{16,64})/;
  /* 추측할 수 없는 1회용 번호(24자) */
  function newToken(){
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', a = new Uint8Array(24), t = '';
    crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) t += A[a[i] % A.length]; return t;
  }
  function en(){ try { return (localStorage.getItem('aliascall_lang') || document.documentElement.lang || '').indexOf('en') === 0; } catch (e) { return false; } }
  function L(ko, e){ return en() ? e : ko; }

  /* 모양 — 한 번만 넣습니다 */
  function css(){
    if (document.getElementById('acBurumCss')) return;
    var s = document.createElement('style'); s.id = 'acBurumCss';
    s.textContent =
      '.acb-card{display:block;margin-top:8px;border-radius:12px;padding:11px 12px;background:#0E1621;color:#DDE5F0;text-decoration:none;max-width:260px}' +
      '.acb-card b{display:block;font-size:13.5px;margin-bottom:3px}' +
      '.acb-card small{display:block;font-size:11.5px;opacity:.75;line-height:1.5}' +
      '.acb-card .go{display:inline-block;margin-top:8px;background:#5B8FC7;color:#fff;border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:800}' +
      '.acb-card .inst{display:block;margin-top:6px;font-size:11px;opacity:.7;color:#DDE5F0;text-decoration:underline}' +
      '.acb-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998}' +
      '.acb-sh{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#fff;color:#12302E;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));max-height:85vh;overflow:auto;font-family:inherit}' +
      '.acb-sh h3{margin:0 0 6px;font-size:17px}' +
      '.acb-sh p{margin:0 0 12px;font-size:12.5px;color:#3E5654;line-height:1.6}' +
      '.acb-st{display:flex;gap:10px;align-items:flex-start;margin:10px 0;font-size:13px;line-height:1.55}' +
      '.acb-st .n{flex:0 0 22px;height:22px;border-radius:50%;background:#123F3D;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
      '.acb-st a{color:#1F6F6B;font-weight:800}' +
      '.acb-row{display:flex;gap:7px;margin-top:6px}' +
      '.acb-row input{flex:1;min-width:0;border:1.5px solid #DCE3DE;border-radius:10px;padding:10px 11px;font-size:13px}' +
      '.acb-row button,.acb-send{border:none;border-radius:10px;padding:10px 13px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}' +
      '.acb-row button{background:#E4EFEE;color:#123F3D}' +
      '.acb-send{display:block;width:100%;margin-top:12px;background:#123F3D;color:#fff;padding:13px}' +
      '.acb-send:disabled{opacity:.45}' +
      '.acb-x{display:block;width:100%;margin-top:8px;background:none;border:none;color:#3E5654;font-size:13px;padding:8px;cursor:pointer}' +
      '.acb-err{font-size:12px;color:#C1483A;margin-top:6px;min-height:1em}';
    document.head.appendChild(s);
  }

  /* ── 받는 쪽 · 보낸 쪽 모두: 부름 초대 링크를 카드로 ── */
  function card(text){
    var mb = RE_BR.exec(String(text || ''));
    if (mb) {
      css();
      var c = document.createElement('div');
      c.className = 'acb-card';
      c.innerHTML = '<b>💬 ' + L('부름 연결 카드', 'Burum connection card') + '</b>' +
        '<small>' + L('두 분 모두 이 카드를 누르면 부름에 같은 대화창이 열립니다. 번호는 서로 보이지 않습니다.',
                      'When you both tap this card, the same Burum chat opens for you. Numbers stay hidden.') + '</small>';
      var g = document.createElement('a');
      g.className = 'go'; g.href = 'https://burum.kr/alias_bridge.html?b=' + mb[1]; g.target = '_blank'; g.rel = 'noopener';
      g.textContent = L('부름에서 잇기 ›', 'Connect on Burum ›');
      var ii = document.createElement('a');
      ii.className = 'inst'; ii.href = PLAY; ii.target = '_blank'; ii.rel = 'noopener';
      ii.textContent = L('부름이 없으면 먼저 설치하기', 'No Burum yet? Install it first');
      c.appendChild(g); c.appendChild(ii);
      return c;
    }
    var m = RE.exec(String(text || ''));
    if (!m) return null;
    css();
    var url = BURUM + 'alias_join.html?c=' + encodeURIComponent(m[1]);
    var a = document.createElement('div');
    a.className = 'acb-card';
    a.innerHTML = '<b>💬 ' + L('부름 초대장', 'Burum invitation') + '</b>' +
      '<small>' + L('번호를 몰라도 계속 대화할 수 있어요. 누르면 부름에서 열립니다.',
                    'Keep talking without sharing numbers. Tap to open in Burum.') + '</small>';
    var go = document.createElement('a');
    go.className = 'go'; go.href = url; go.target = '_blank'; go.rel = 'noopener';
    go.textContent = L('부름에서 열기 ›', 'Open in Burum ›');
    var ins = document.createElement('a');
    ins.className = 'inst'; ins.href = PLAY; ins.target = '_blank'; ins.rel = 'noopener';
    ins.textContent = L('부름이 없으면 먼저 설치하기', 'No Burum yet? Install it first');
    a.appendChild(go); a.appendChild(ins);
    return a;
  }

  /* ── [💬 부름으로 이어가기] — 확인 한 번이면 연결 카드가 양쪽 대화에 올라갑니다 ── */
  function openSheet(sendFn){
    css();
    var bg = document.createElement('div'); bg.className = 'acb-bg';
    var sh = document.createElement('div'); sh.className = 'acb-sh';
    sh.innerHTML =
      '<h3>💬 ' + L('부름으로 이어가기', 'Continue on Burum') + '</h3>' +
      '<p>' + L('이 대화에 "부름 연결 카드" 를 보냅니다. 두 분이 각자 카드를 누르고 부름에 로그인하면, 부름에 같은 대화창이 바로 열립니다. 서로의 번호는 계속 보이지 않습니다.',
                'This sends a "Burum connection card" to this chat. When you both tap it and sign in to Burum, the same chat opens for you there. Your numbers stay hidden.') + '</p>' +
      '<div class="acb-st"><span class="n">1</span><span>' + L('[연결 카드 보내기] 를 누릅니다.', 'Tap [Send connection card].') + '</span></div>' +
      '<div class="acb-st"><span class="n">2</span><span>' + L('두 분 모두 카드의 <b>[부름에서 잇기]</b> 를 누릅니다.', 'You both tap <b>[Connect on Burum]</b> on the card.') + '</span></div>' +
      '<div class="acb-st"><span class="n">3</span><span>' + L('부름에 로그인(처음이면 가입)하면 끝 — 같은 대화창이 열립니다.', 'Sign in to Burum (or sign up) — the same chat opens.') + '</span></div>' +
      '<div class="acb-err" id="acbErr"></div>' +
      '<button type="button" class="acb-send" id="acbSend">' + L('연결 카드 보내기', 'Send connection card') + '</button>' +
      /* 🔴 2026-10-07 — 상대의 부름 닉네임을 이미 알면, 부름에서 바로 연결 요청 */
      '<div style="margin:16px 0 4px;padding-top:14px;border-top:1px solid #DCE3DE;font-size:13px;line-height:1.6">' +
        '<b>' + L('상대의 부름 닉네임을 알고 있다면', 'Already know their Burum nickname?') + '</b><br>' +
        L('부름에서 바로 연결 요청을 보낼 수 있어요. 번호는 드러나지 않습니다.', 'Send a connection request straight from Burum. No number is shown.') +
        '<input id="acbNick" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' +
          L('부름 닉네임', 'Burum nickname') + '" style="display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:10px 12px;' +
          'border:1.5px solid #DCE3DE;border-radius:10px;font-size:14px;font-family:inherit">' +
        '<button type="button" class="acb-x" id="acbNickGo" style="margin-top:0">' + L('📨 부름에서 연결 요청 보내기', '📨 Send request on Burum') + '</button>' +
      '</div>' +
      '<button type="button" class="acb-x" id="acbClose">' + L('닫기', 'Close') + '</button>';
    document.body.appendChild(bg); document.body.appendChild(sh);
    var btn = sh.querySelector('#acbSend'), err = sh.querySelector('#acbErr');
    function close(){ bg.remove(); sh.remove(); }
    bg.addEventListener('click', close);
    sh.querySelector('#acbClose').addEventListener('click', close);
    sh.querySelector('#acbNickGo').addEventListener('click', function(){ openNickRequest(sh.querySelector('#acbNick').value); });
    btn.addEventListener('click', async function(){
      btn.disabled = true;
      try {
        await sendFn(L('부름에서 계속 이야기해요 💬 ', 'Let’s keep talking on Burum 💬 ') +
                     'https://burum.kr/alias_bridge.html?b=' + newToken());
        close();
      } catch (e) { btn.disabled = false; err.textContent = L('보내지 못했습니다. 다시 눌러 주세요.', 'Could not send. Please try again.'); }
    });
  }

  /* 🔴 2026-10-07 — 부름의 "닉네임으로 연결하기" 화면을 엽니다(닉네임이 미리 채워짐).
     ⚠ 요청은 **부름 계정**으로 나갑니다. 부름에 로그인(처음이면 가입)하면 바로 보낼 수 있습니다. */
  function openNickRequest(nick){
    var url = BURUM + 'alias_requests.html?src=aliascall' + (nick && String(nick).trim() ? '&to=' + encodeURIComponent(String(nick).trim().slice(0, 30)) : '');
    try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; }
  }

  window.ACBurum = { card: card, openSheet: openSheet, openNickRequest: openNickRequest };
})();
