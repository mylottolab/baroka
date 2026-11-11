/* =====================================================================
   🔴 2026-10-29 — 🚗 주차 알림판 인쇄 (전화번호 대신 QR)
     ParkingPlate.print({ token, label })   ← 내 차량 등록물의 QR 로 A4 한 장
       위: 접어 세우는 알림판(앞 · 뒤)  /  아래: 대시보드에 눕혀 두는 납작한 판
     ParkingPlate.print({ blank:true })     ← 무료 배포용: QR 자리를 비워 둔 판(QR 스티커를 붙임)
   ⚠ 앱 안에서는 window.print 가 안 되어 AliasNative.printPage 를 씁니다(QR 인쇄와 같은 방식).
   ⚠ 햇빛에 바래지 않게 두꺼운 종이 · 코팅을 권합니다. QR 은 흰 바탕 · 검정으로만 찍습니다.
   ===================================================================== */
(function(){
  'use strict';
  var CONNECT = (window.BK && BK.SITE ? BK.SITE : 'https://baroka.kr') + '/connect.html?t=';   // 🔴 바로카
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function en(){ try { return (localStorage.getItem('aliascall_lang') || '').indexOf('en') === 0; } catch (e) { return false; } }
  function qr(text, px){
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(box);
    try { new QRCode(box, { text: text, width: px, height: px, colorDark:'#000000', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { box.remove(); return ''; }
    var c = box.querySelector('canvas'), u = '';
    try { u = c ? c.toDataURL('image/png') : ((box.querySelector('img') || {}).src || ''); } catch (e) {}
    box.remove(); return u;
  }
  var CSS = [
    '@page{size:A4;margin:0}',
    '#plArea{display:none}',
    '@media print{body.pl-printing>*:not(#plArea){display:none!important}body.pl-printing #plArea{display:block!important}body.pl-printing{background:#fff!important;margin:0!important;padding:0!important}}',
    '#plArea *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '#plArea{font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#0B1220;word-break:keep-all}',
    '.pl-page{width:210mm;height:297mm;position:relative;background:#fff;overflow:hidden}',
    '.pl-guide{position:absolute;left:10mm;right:10mm;font-size:8.5pt;color:#55615F;text-align:center;font-weight:600}',
    /* 접는 판: 190 × 88mm 두 면 */
    '.pl-tent{position:absolute;left:10mm;top:12mm;width:190mm;height:176mm;border:.3mm dashed #999}',
    '.pl-face{height:88mm;display:flex;align-items:stretch;overflow:hidden;background:#fff}',
    '.pl-face.back{transform:rotate(180deg);background:#0B1220;color:#fff;justify-content:center;align-items:center;text-align:center;flex-direction:column;padding:0 10mm}',
    '.pl-fold{position:absolute;left:0;right:0;top:88mm;border-top:.3mm dashed #999}',
    '.pl-band{width:12mm;background:#1B2D6B;color:#fff;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;font-weight:900;font-size:12pt;letter-spacing:.25em}',
    '.pl-txt{flex:1;min-width:0;padding:6mm 3mm 5mm 6mm;display:flex;flex-direction:column;justify-content:space-between}',
    '.pl-h{font-size:25pt;font-weight:900;line-height:1.18;color:#0B1220;letter-spacing:-.01em}',
    '.pl-h em{font-style:normal;color:#1B2D6B}',
    '.pl-s{font-size:12pt;line-height:1.4;color:#0B1220;font-weight:800;margin-top:2.5mm}',
    '.pl-fb{border:.7mm solid #0B1220;border-radius:3mm;padding:2.2mm 3mm;margin-top:3mm;background:#FFF6D6}',
    '.pl-fb .q{font-size:13.5pt;font-weight:900;color:#C81E1E;line-height:1.25}',
    '.pl-fb .a{font-size:13.5pt;font-weight:900;color:#0B1220;line-height:1.3}',
    '.pl-fb .a u{text-decoration:none;color:#C81E1E}',
    '.pl-fb .tip{font-size:9.5pt;font-weight:800;color:#0B1220;margin-top:1mm;line-height:1.35}',
    '.pl-b{font-size:10pt;color:#0B1220;font-weight:800;margin-top:2mm}',
    '.pl-qr{width:74mm;padding:4mm 4mm 3mm 1mm;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.pl-qr .qw{background:#fff;padding:3mm;border-radius:2mm}',
    '.pl-qr img{width:64mm;height:64mm;display:block;image-rendering:pixelated}',
    '.pl-qr .t{font-size:11pt;font-weight:900;margin-top:1mm;color:#0B1220}',
    '.pl-slot{width:64mm;height:64mm;border:.7mm dashed #0B1220;border-radius:3mm;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11pt;color:#0B1220;font-weight:900;line-height:1.5;background:#fff}',
    '.pl-face.back .k{font-size:11pt;color:#FFC400;font-weight:900;letter-spacing:.12em}',
    '.pl-face.back .h{font-size:22pt;font-weight:900;margin:3mm 0;line-height:1.3}',
    '.pl-face.back .d{font-size:12pt;color:#fff;font-weight:700;line-height:1.55}',
    /* 납작한 판 170 × 80mm */
    '.pl-flat{position:absolute;left:20mm;top:202mm;width:170mm;height:80mm;border:.3mm dashed #999;display:flex;overflow:hidden;background:#fff}',
    '.pl-flat .pl-txt{padding:4.5mm 2mm 4mm 5mm}',
    '.pl-flat .pl-h{font-size:19pt}',
    '.pl-flat .pl-s{font-size:10pt;margin-top:1.5mm}',
    '.pl-flat .pl-fb{margin-top:2mm;padding:1.6mm 2.5mm}',
    '.pl-flat .pl-fb .q, .pl-flat .pl-fb .a{font-size:12pt}',
    '.pl-flat .pl-fb .tip{font-size:8.5pt}',
    '.pl-flat .pl-b{font-size:8.5pt;margin-top:1.5mm}',
    '.pl-flat .pl-qr{width:62mm;padding:3mm 3mm 2mm 0}',
    '.pl-flat .pl-qr .qw{padding:2.5mm}',
    '.pl-flat .pl-qr img, .pl-flat .pl-slot{width:52mm;height:52mm}',
    '.pl-qr.st{width:84mm;padding:3mm 3mm 3mm 1mm}',
    '.pl-qr.st img{width:80mm;height:80mm;image-rendering:auto}',
    '.pl-flat .pl-qr.st{width:76mm;padding:3mm 3mm 3mm 0}',
    '.pl-flat .pl-qr.st img{width:72mm;height:72mm}',
    '.pl-flat .pl-qr .t{font-size:9.5pt}'
  ].join('\n');

  function texts(){
    return en() ? {
      band:'PARKING', h:'Need me to<br><em>move my car?</em>', s:'Scan the QR to reach the owner — no number, no app.',
      fq:'QR not scanning?', fa:'Install <u>Garimcall</u> and search this car number<br>or enter it at <u>garimcall.com</u>', tip:'Glare? Hold your phone close to the glass, slightly tilted.',
      b:'<b>Baroka</b> · baroka.kr', scan:'📷 Scan with your camera',
      bk:'BAROKA', bh:'My number stays private', bd:'Calls and messages come through the QR.<br>baroka.kr',
      slot:'Stick your<br>QR sticker here', g1:'✂ Cut along the dashed line, fold in the middle and stand it on the dashboard (front faces out)',
      g2:'✂ Or lay this flat card on the dashboard', g3:'Tip: thick paper and a matte (non-glossy) lamination keep the QR easy to scan.'
    } : {
      band:'주차 알림', h:'차를 빼 드릴까요?<br><em>QR을 찍어 주세요</em>', s:'번호 없이 차주에게 바로 연락 · 앱 필요 없음',
      fq:'QR로 인식이 안 되면?', fa:'앱스토어에서 <u>가림콜</u> 설치 후 차량번호로 검색<br>또는 <u>garimcall.com</u>에서 차번호 입력', tip:'빛이 반사되면 폰을 유리에 가까이 대고 살짝 비스듬히 찍어 보세요.',
      b:'<b>바로카</b> · 내 차도 등록하기 baroka.kr', scan:'📷 카메라로 찍어 주세요',
      bk:'바로카', bh:'제 전화번호는 안전하게 숨겨져 있어요', bd:'연락은 QR로 받습니다. 낯선 사람에게 번호가 퍼지지 않아요.<br>내 차도 등록하기 · baroka.kr',
      slot:'QR 스티커를<br>여기에 붙이세요', g1:'✂ 점선을 따라 자르고 가운데 선을 접어 대시보드에 세우세요 (파란 띠가 있는 면이 바깥 · 앞유리에 바짝)',
      g2:'✂ 또는 이 납작한 판을 대시보드에 눕혀 두세요', g3:'두꺼운 종이에 찍고, 코팅은 반사가 적은 무광으로 하면 QR이 더 잘 찍힙니다. QR 스티커는 투명 보호필름(6.5 × 6.5cm, 쿠팡에서 「표준형6.0x6.0cm」 검색)을 덧붙이면 좋습니다.'
    };
  }
  var ST = false;
  function front(t, q, flat){
    return '<div class="pl-band">' + t.band + '</div>' +
      '<div class="pl-txt"><div><div class="pl-h">' + t.h + '</div><div class="pl-s">' + t.s + '</div>' +
        '<div class="pl-fb"><div class="q">' + t.fq + '</div><div class="a">' + t.fa + '</div><div class="tip">' + t.tip + '</div></div></div>' +
        '<div class="pl-b">' + t.b + '</div></div>' +
      (ST ? '<div class="pl-qr st"><img src="' + q + '" alt=""></div>' : '<div class="pl-qr">' + (q ? '<div class="qw"><img src="' + q + '" alt=""></div>' : '<div class="pl-slot">' + t.slot + '<br>(' + (flat ? '4.5 × 4.5' : '6 × 6') + 'cm)</div>') + '<div class="t">' + t.scan + '</div></div>');
  }
  function page(q){
    var t = texts();
    return '<div class="pl-page">' +
      '<div class="pl-guide" style="top:5mm">' + t.g1 + '</div>' +
      '<div class="pl-tent"><div class="pl-face back"><div class="k">' + t.bk + '</div><div class="h">' + t.bh + '</div><div class="d">' + t.bd + '</div></div>' +
      '<div class="pl-fold"></div><div class="pl-face">' + front(t, q) + '</div></div>' +
      '<div class="pl-guide" style="top:193mm">' + t.g2 + '</div>' +
      '<div class="pl-flat">' + front(t, q, true) + '</div>' +
      '<div class="pl-guide" style="top:286mm">' + t.g3 + '</div>' +
    '</div>';
  }
  function print(o){
    o = o || {};
    if (!o.blank && typeof QRCode === 'undefined') { alert(en() ? 'Could not make the QR. Please try again.' : 'QR을 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); return; }
    /* 🔴 2026-11-11 — 차량 QR 은 「통화를 원하시면 QR코드를 스캔하세요」 스티커 그림으로(QRSticker 가 있을 때) */
    ST = !o.blank && !!(window.QRSticker && QRSticker.make);
    var q = o.blank ? '' : (ST ? QRSticker.make(CONNECT + o.token) : qr(CONNECT + o.token, 700));
    if (ST && !q) { ST = false; q = qr(CONNECT + o.token, 700); }
    var st = document.getElementById('plCss');
    if (!st) { st = document.createElement('style'); st.id = 'plCss'; st.textContent = CSS; document.head.appendChild(st); }
    var area = document.getElementById('plArea');
    if (!area) { area = document.createElement('div'); area.id = 'plArea'; document.body.appendChild(area); }
    area.innerHTML = page(q);
    /* 🔴 2026-11-12 — 휴대폰 브라우저(삼성 인터넷 · 크롬)는 인쇄 미리보기를 만들기 전에 afterprint 가 먼저 와서
       표시를 지우면 빈 PDF 가 나왔습니다. 이제는 인쇄 화면에서 돌아와 화면을 다시 누를 때만 지웁니다(@media print 에서만 쓰여 화면엔 영향 없음). */
    document.body.classList.remove('st-printing');
    document.body.classList.add('pl-printing');
    var done = function(){ document.body.classList.remove('pl-printing'); };
    // 앱 인쇄는 afterprint 가 안 올 수 있어, 다음에 화면을 누를 때 원래대로 돌립니다(다른 QR 인쇄가 이 판으로 찍히지 않게)
    setTimeout(function(){ document.addEventListener('pointerdown', done, { once: true }); }, 4000);
    setTimeout(function(){
      try { window.ACTheme && ACTheme.printLight && ACTheme.printLight(); } catch (e) {}
      if (window.AliasNative && typeof AliasNative.printPage === 'function') AliasNative.printPage('Baroka parking plate');
      else window.print();
    }, 200);
  }
  window.ParkingPlate = { print: print };
})();
