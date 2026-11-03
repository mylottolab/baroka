// =====================================================
// Aliascall — 사진 업로드 전 압축 공용 함수
// 2026-08-22 신설.
//
// 카톡과 비슷한 방식: 긴 변을 최대 1600px로 줄이고, JPEG 85% 화질로 재인코딩함.
// 화면(폰/PC 어디서 봐도)에서는 원본과 차이가 거의 안 느껴지면서, 용량은 훨씬 작아져서
// 업로드가 빠르고 8MB 제한에도 잘 안 걸림.
//
// ⚠ GIF는 애니메이션이 깨질 수 있어 압축을 건너뛰고 원본 그대로 보냄.
// ⚠ 브라우저에서 처리가 안 되는 예외 상황이면, 안전하게 원본 파일을 그대로 반환함
//    (압축 실패했다고 사진 전송 자체가 막히면 안 되니까).
// =====================================================

function aliascallCompressImage(file, maxDimension = 1600, quality = 0.85){
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      resolve(file); // GIF나 이미지가 아닌 파일은 그대로
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file); // 이미 충분히 작으면 굳이 재인코딩 안 함(화질 손실 최소화)
        return;
      }
      if (width > height) { height = Math.round(height * maxDimension / width); width = maxDimension; }
      else { width = Math.round(width * maxDimension / height); height = maxDimension; }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], newName, { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file); // 뭔가 실패하면 안전하게 원본 그대로
    img.src = url;
  });
}
