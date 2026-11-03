/* =====================================================================
   🔴 2026-11-01 — 아이폰 앱 심사 중 잠시 숨기기 스위치
   · 애플 심사 중인 아이폰 앱(에일리어스콜)에서만 새 화면을 숨기고 예전 화면을 보여 줍니다.
   · 안드로이드 앱 · 웹 브라우저(아이폰 사파리 포함)는 새 화면 그대로.
   · 애플 승인이 나면 아래 true 를 false 로 바꾸고 올리면 끝 (그 뒤 *_ios.html 파일은 지워도 됨)
   ===================================================================== */
window.AC_IOS_HOLD = false;   // 🔴 애플 승인 뒤 스위치 끔 — 아이폰도 새 화면 · 번호 사기 · 좋은번호
window.acHeld = function(){
  try { return !!(window.AC_IOS_HOLD && window.AliasNative && typeof AliasNative.isIOS === 'function' && AliasNative.isIOS()); }
  catch (e) { return false; }
};
