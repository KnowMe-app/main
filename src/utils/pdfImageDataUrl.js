export const isPdfImageDataUrl = value => /^data:image\/(?:jpeg|jpg|png);base64,[a-z0-9+/=\s]+$/i.test(String(value || '').trim());

export const blobToDataUrl = blob =>
  new Promise((resolve, reject) => {
    if (!blob) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Unable to read blob as data URL'));
    reader.readAsDataURL(blob);
  });

const bytesToBlob = (bytes, contentType) => new Blob([bytes], { type: contentType || 'application/octet-stream' });

export const fetchImageUrlAsDataUrl = async url => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Photo request failed with status ${response.status}`);
  }
  const blob = await response.blob();
  if (
    !String(blob?.type || '')
      .toLowerCase()
      .startsWith('image/')
  ) {
    throw new Error(`Photo response is not an image blob (${blob?.type || 'unknown type'})`);
  }

  const dataUrl = await blobToDataUrl(blob);
  if (!isPdfImageDataUrl(dataUrl)) {
    throw new Error('Photo blob did not convert to a supported PDF image data URL');
  }
  return dataUrl;
};

export const loadFirebasePhotoAsDataUrl = async (refOrUrl, { getBytes, getDownloadURL, resolveContentType, onDebug } = {}) => {
  const debug = (message, payload) => {
    if (typeof onDebug === 'function') onDebug(message, payload);
  };

  if (isPdfImageDataUrl(refOrUrl)) return refOrUrl;

  if (typeof refOrUrl === 'string') {
    try {
      const dataUrl = await fetchImageUrlAsDataUrl(refOrUrl);
      debug('Storage photo download URL fallback converted to data URL for PDF', { url: refOrUrl });
      return dataUrl;
    } catch (error) {
      debug('photo skipped: could not convert to data URL', {
        url: refOrUrl,
        message: error?.message || String(error),
      });
      return '';
    }
  }

  if (typeof getBytes !== 'function') return '';

  try {
    const bytes = await getBytes(refOrUrl);
    const contentType = typeof resolveContentType === 'function' ? await resolveContentType(refOrUrl, bytes) : 'image/jpeg';
    if (
      !String(contentType || '')
        .toLowerCase()
        .startsWith('image/')
    ) {
      throw new Error(`Unsupported image content type (${contentType || 'unknown'})`);
    }
    const dataUrl = await blobToDataUrl(bytesToBlob(bytes, contentType));
    if (!isPdfImageDataUrl(dataUrl)) {
      throw new Error('Storage bytes did not convert to a supported PDF image data URL');
    }
    return dataUrl;
  } catch (bytesError) {
    debug('Storage photo bytes load failed; trying download URL fallback for PDF', {
      fullPath: refOrUrl?.fullPath || null,
      message: bytesError?.message || String(bytesError),
      code: bytesError?.code || null,
    });

    if (typeof getDownloadURL !== 'function') {
      debug('photo skipped: could not convert to data URL', {
        fullPath: refOrUrl?.fullPath || null,
        message: bytesError?.message || String(bytesError),
      });
      return '';
    }

    try {
      const downloadUrl = await getDownloadURL(refOrUrl);
      debug('Storage photo using download URL fallback for data URL conversion', {
        fullPath: refOrUrl?.fullPath || null,
      });
      return loadFirebasePhotoAsDataUrl(downloadUrl, { onDebug });
    } catch (downloadUrlError) {
      debug('photo skipped: could not convert to data URL', {
        fullPath: refOrUrl?.fullPath || null,
        message: downloadUrlError?.message || String(downloadUrlError),
      });
      return '';
    }
  }
};
