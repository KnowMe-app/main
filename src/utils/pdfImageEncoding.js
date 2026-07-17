const canvasContainsTransparency = (ctx, width, height) => {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
};

// @react-pdf/renderer only reliably embeds baseline JPEG/PNG; re-encoding an uploaded image
// through a canvas normalizes progressive JPEGs, unusual PNG color modes, and EXIF-rotated
// photos that would otherwise render as a blank page (or not render at all) in the PDF, with
// no error surfaced. This is the same fix the surrogate mother profile PDF export uses for
// uploaded user photos (see smallCard/renderTopBlock.js) - shared here so any other data-URL
// image about to be embedded in a PDF (e.g. the Documents Builder clinic logo) gets it too.
export const reencodePdfImageDataUrl = (src, { preserveTransparency = false } = {}) => new Promise(resolve => {
  if (typeof window === 'undefined' || typeof window.Image !== 'function' || typeof document === 'undefined') {
    resolve(src);
    return;
  }

  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(src);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const hasTransparency = preserveTransparency && canvasContainsTransparency(ctx, width, height);
      resolve(hasTransparency ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92));
    } catch (error) {
      console.error('Unable to re-encode PDF image', error);
      resolve(src);
    }
  };
  img.onerror = () => resolve(src);
  img.src = src;
});
