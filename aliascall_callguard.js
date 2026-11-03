/* =====================================================================
   에일리어스콜 — 통화 중 [뒤로] 막이  (2026-10-27)
   부름에서 손님 제보: 통화 중 [뒤로] 를 누르면 통화 화면이 닫혀 통화가 끊겼습니다.
   에일리어스콜도 같은 구조라 함께 고칩니다.
     · 통화가 붙으면(callOngoing) 뒤로 가기 기록을 한 칸 넣어 [뒤로] 를 이 화면이 받습니다.
     · 새 안드로이드 앱(버전 23~)은 앱만 뒤로 숨기고(moveToBack), 그 밖(옛 앱 · 아이폰 · 브라우저)은
       화면에 남은 채 "통화는 계속됩니다" 안내를 띄웁니다.
     · 통화가 끝나면(callEnded) 막이를 풉니다.
   ===================================================================== */
(function(){
  if (window.acHeld && acHeld()) return;   // 🔴 2026-11-01 아이폰 앱 심사 중에는 예전처럼(aliascall_hold.js)
  var on = false;
  function en(){ return /^en/i.test(document.documentElement.lang || ''); }
  function tip(){
    var d = document.getElementById('acCallTip');
    if (!d) {
      d = document.createElement('div'); d.id = 'acCallTip';
      d.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(110px + env(safe-area-inset-bottom,0px));z-index:99999;background:rgba(20,24,36,.94);color:#fff;font-size:14px;line-height:1.55;padding:12px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);text-align:center';
      document.body.appendChild(d);
    }
    d.textContent = en()
      ? 'You are on a call. To use another app, go to your home screen — the call keeps going. To hang up, tap End.'
      : '통화 중입니다. 다른 앱을 보려면 홈 화면으로 나가세요(통화는 계속됩니다). 통화를 끝내려면 [끊기]를 누르세요.';
    d.style.display = '';
    clearTimeout(tip._t); tip._t = setTimeout(function(){ d.style.display = 'none'; }, 5000);
  }
  function onPop(){
    if (!on) return;
    try { history.pushState({ acCallGuard: 1 }, '', location.href); } catch (e) {}
    if (window.AliasNative && typeof AliasNative.moveToBack === 'function') { try { AliasNative.moveToBack(); return; } catch (e) {} }
    tip();
  }
  window.ACG = {
    on: function(){
      if (on) return; on = true;
      try { history.pushState({ acCallGuard: 1 }, '', location.href); } catch (e) {}
      window.addEventListener('popstate', onPop);
    },
    off: function(){
      if (!on) return; on = false;
      window.removeEventListener('popstate', onPop);
    }
  };
})();
