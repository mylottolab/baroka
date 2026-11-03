/* =====================================================================
   Aliascall — 앱 안 구글 결제 (화면 쪽)
   2026-09-28 신설

   무엇을 하나
     앱(자바 BillingBridge)이 넘겨준 영수증을 서버(aliascall-google-verify)로
     보내 확인받고, 확인되면 영수증을 정리(consume)합니다.

   🔴 앱 안에서는 **구글 결제만** 팝니다. 카드 · PayPal · 계좌이체는 웹에서만.
   🔴 암호화 회선의 열쇠는 결제 **전에** 이 폰에서 만들어 둡니다(서버로 안 보냄).
     결제가 끝나면 방 번호와 합쳐 초대 링크(#k=)를 만듭니다.

   부르는 법
     <script src="aliascall_store.js"></script>
     ACStore.inApp()        새 앱(결제 창구 있음)인가
     ACStore.oldApp()       결제 창구가 없는 옛 앱인가 → 업데이트 안내
     ACStore.buy(sku, { secure, purpose })
     ACStore.onDone = function(r){ ... }   화면마다 결과를 받는 곳

   ⚠ 이 파일은 **첫 화면(index.html)에도** 넣습니다. 결제 도중 앱이 꺼졌다
     켜지면 영수증이 첫 화면으로 오기 때문입니다(부름 2026-09-27 교훈).
   ===================================================================== */
(function(){
  var FN = 'https://qmwaraittiurkynszjts.supabase.co/functions/v1/aliascall-google-verify';
  var STASH = 'ac_store_pending_';     // 상품별로 고른 것(암호화 · 용도 · 열쇠)
  var busy = {};                       // 같은 영수증을 두 번 보내지 않게

  function hasNative(){ return !!(window.AliasNative && typeof AliasNative.storeBuy === 'function'); }
  function isCapacitor(){
    try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }

  var S = window.ACStore = {
    inApp: function(){ return hasNative(); },
    /* 앱 안인데 결제 창구가 없음 = 업데이트 전의 옛 앱 */
    oldApp: function(){ return isCapacitor() && !hasNative(); },
    onDone: null,
  };

  function done(r){
    try { if (typeof S.onDone === 'function') S.onDone(r); } catch (e) { console.error(e); }
  }
  function stashGet(sku){ try { return JSON.parse(localStorage.getItem(STASH + sku) || 'null'); } catch (e) { return null; } }
  function stashDel(sku){ try { localStorage.removeItem(STASH + sku); } catch (e) {} }

  function getSb(){
    if (window.sb && window.sb.auth) return window.sb;
    if (!S._sb && window.supabase) {
      S._sb = window.supabase.createClient('https://qmwaraittiurkynszjts.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtd2FyYWl0dGl1cmt5bnN6anRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3ODQ5OTUsImV4cCI6MjEwMjM2MDk5NX0.9Qr2vFzDCSKS54N6C5QN44BvCzIPTMQyVz7nX3GqT9Y');
    }
    return S._sb;
  }

  /* ── 사기 ─────────────────────────────────────────────────────── */
  S.buy = async function(sku, opts){
    opts = opts || {};
    if (!hasNative()) { done({ ok: false, error: 'no_native' }); return; }
    var keep = { secure: !!opts.secure, purpose: opts.purpose === 'work' ? 'work' : 'personal', key: null,
                 extend: opts.extendHotlineId || null,
                 name: (opts.lineName || '').slice(0, 30),
                 /* 🔴 2026-10-01 — 추가 사용량을 붙일 곳 (회선 또는 프로 구독) */
                 uKind: opts.usageKind || null, uId: opts.usageTargetId || null };
    /* 🔴 암호화 회선이면 열쇠를 **지금** 만듭니다. 결제 뒤에 만들면 늦습니다.
       ⚠ 연장이면 만들지 않습니다 — 원래 회선의 열쇠를 그대로 씁니다. */
    if (keep.secure && !keep.extend && typeof window.e2eeGenerateKeyBase64 === 'function') {
      keep.key = await window.e2eeGenerateKeyBase64();
    }
    try { localStorage.setItem(STASH + sku, JSON.stringify(keep)); } catch (e) {}
    AliasNative.storeBuy(sku);
  };

  /* ── 앱이 부르는 곳 (BillingBridge.drain) ────────────────────── */
  window.acStoreEvent = function(ev){
    if (!ev || !ev.kind) return;
    if (ev.kind === 'storeCanceled') { done({ ok: false, canceled: true }); return; }
    if (ev.kind === 'storePending')  { done({ ok: false, pending: true }); return; }
    if (ev.kind === 'storeOwned')    { done({ ok: false, owned: true }); return; }
    if (ev.kind === 'storeError')    { done({ ok: false, error: ev.a || '', code: ev.code }); return; }
    if (ev.kind === 'storePurchase') verify(ev);
  };

  async function verify(ev){
    var sku = ev.sku, token = ev.a;
    if (!token || busy[token]) return;
    busy[token] = true;
    var keep = stashGet(sku) || { secure: false, purpose: 'personal', key: null };
    try {
      var sb = getSb();
      var s = sb ? (await sb.auth.getSession()).data.session : null;
      if (!s) {
        /* 로그인 전이면 영수증을 살려둡니다. 로그인 뒤 앱을 다시 켜면 이어집니다. */
        done({ ok: false, error: 'login' });
        return;
      }
      var res = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
        body: JSON.stringify({ productId: sku, purchaseToken: token, orderId: ev.b || '',
                               secure: keep.secure, purpose: keep.purpose,
                               extendHotlineId: keep.extend, lineName: keep.name || '',
                               usageKind: keep.uKind || null, usageTargetId: keep.uId || null }),
      });
      var out = {};
      try { out = await res.json(); } catch (e) {}

      /* 취소·환불된 영수증 — 정리만 합니다 */
      if (out && out.consume) {
        AliasNative.storeConsume(token); stashDel(sku);
        done({ ok: false, cleared: true, sku: sku });
        return;
      }
      if (!res.ok || !out.ok) {
        /* ⚠ 정리하지 않습니다. 살려둬야 다음에 다시 보낼 수 있습니다. */
        done({ ok: false, error: (out && out.error) || ('HTTP ' + res.status) });
        return;
      }

      AliasNative.storeConsume(token);
      var link = null;
      if (out.hotlineId && keep.key && !out.extended) {
        try { localStorage.setItem('aliascall_hotline_key_' + out.hotlineId, keep.key); } catch (e) {}
        link = location.origin + '/aliascall_hotline_room.html?hotline=' + out.hotlineId + '#k=' + keep.key;
      }
      stashDel(sku);
      done({ ok: true, sku: sku, kind: out.kind, months: out.months, hotlineId: out.hotlineId, extended: !!out.extended, upgraded: !!out.upgraded,
             inviteToken: out.inviteToken, ownerLink: link, already: !!out.already });
    } catch (e) {
      console.error('[store] 확인 실패', e);
      done({ ok: false, error: String(e.message || e) });
    } finally {
      delete busy[token];
    }
  }

  /* 화면이 준비됐다고 알리고, 못 끝낸 영수증을 찾게 합니다 */
  function ready(){
    if (!hasNative()) return;
    try { if (AliasNative.storeFlush) AliasNative.storeFlush(); } catch (e) {}
    try { if (AliasNative.storeRecover) AliasNative.storeRecover(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
