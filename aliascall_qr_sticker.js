/* 🔴 2026-11-11 — 차량 등록 QR 스티커(바로카와 같은 양식)
   「통화를 원하시면 QR코드를 스캔하세요」 + 보라 테두리 + 아래 안내 3줄.
   차량(vehicle) 등록의 QR 다운로드 · QR 인쇄에서만 씁니다. 다른 등록은 예전 그대로. */
(function(){
  /* 「통화를 원하시면 QR코드를 스캔하세요」 스티커 — 보라 테두리 · 아래 안내 3줄 */
  var ST_TOP = '통화를 원하시면 QR코드를 스캔하세요';
  var ST_BOT = ['QR인식이 안될 경우 앱스토어에서 가림콜을 다운받아', '설치후 차량번호로 검색하시면 바로 통화가 됩니다.', '(또는  garimcall.com에 접속 후 차번호를 입력하세요)'];
  function qrSticker(link){
    if (typeof QRCode === 'undefined') { alert('QR을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return ''; }
    var tmp = document.createElement('div'); tmp.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(tmp);
    new QRCode(tmp, { text: link, width: 800, height: 800, correctLevel: QRCode.CorrectLevel.M });
    var qc = tmp.querySelector('canvas'); document.body.removeChild(tmp);
    if (!qc) return '';
    var W = 1200, H = 1200, P = '#6a3d9a', c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), F = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    function rr(x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function fit(t, size, max, w){ g.font = w + ' ' + size + 'px ' + F; while (g.measureText(t).width > max && size > 10) { size -= 1; g.font = w + ' ' + size + 'px ' + F; } }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    rr(20, 20, W - 40, H - 40, 40); g.fillStyle = '#ecebe7'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#d6d4cf'; g.stroke();
    g.fillStyle = P; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(ST_TOP, 66, W - 160, '900'); g.fillText(ST_TOP, W / 2, 100);
    // 보라 테두리: 위 · 양옆은 이어지고, 아래는 양 끝만(글자 자리 비움)
    var L = 120, R = W - 120, T = 160, B = 1072, gapL = 165, gapR = W - 165;
    g.lineWidth = 20; g.strokeStyle = P; g.lineJoin = 'miter'; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(gapL, B); g.lineTo(L, B); g.lineTo(L, T); g.lineTo(R, T); g.lineTo(R, B); g.lineTo(gapR, B); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(215, 195, W - 430, W - 430);
    g.imageSmoothingEnabled = false; g.drawImage(qc, 240, 220, W - 480, W - 480);
    g.fillStyle = P;
    for (var i = 0; i < ST_BOT.length; i++) { fit(ST_BOT[i], 44, W - 350, '800'); g.fillText(ST_BOT[i], W / 2, 1014 + i * 58); }
    return c.toDataURL('image/png');
  }
  function printSticker(url){
    var st = document.getElementById('stCss');
    if (!st) { st = document.createElement('style'); st.id = 'stCss';
      st.textContent = '#stArea{display:none}@media print{@page{size:A4;margin:12mm}body.st-printing>*,body.st-printing #printSheet{display:none!important}html body.st-printing>#stArea#stArea{display:block!important}#stArea .g{display:grid;grid-template-columns:60mm 60mm;gap:14mm;justify-content:center;margin-top:20mm}#stArea img{width:60mm;height:60mm;display:block;outline:0.2mm dashed #bbb;outline-offset:2mm}#stArea p{font:12px sans-serif;text-align:center;color:#666;margin-top:12mm}}';
      document.head.appendChild(st); }
    var area = document.getElementById('stArea');
    if (!area) { area = document.createElement('div'); area.id = 'stArea'; document.body.appendChild(area); }
    area.innerHTML = '<div class="g">' + new Array(5).join('<img src="' + url + '">') + '</div><p>6 × 6cm 스티커 4장입니다. 점선을 따라 잘라 차 앞유리 안쪽에 붙이세요.<br>※ 투명 보호필름(6.5 × 6.5cm, 쿠팡에서 「표준형6.0x6.0cm」 검색)을 덧붙이면 비에 젖지 않고 유리창에 붙이기 쉽습니다.</p>';
    document.body.classList.add('st-printing');
    var done = function(){ document.body.classList.remove('st-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function(){ document.addEventListener('pointerdown', done, { once: true }); }, 1500);
    setTimeout(function(){
      try { window.ACTheme && ACTheme.printLight && ACTheme.printLight(); } catch (e) {}
      if (window.AliasNative && typeof AliasNative.printPage === 'function') AliasNative.printPage('Aliascall QR sticker');
      else window.print();
    }, 300);
  }  function save(url, name){ var a = document.createElement('a'); a.href = url; a.download = name || 'garimcall-qr-sticker.png'; a.click(); }
  window.QRSticker = { make: qrSticker, print: printSticker, save: save };
})();
