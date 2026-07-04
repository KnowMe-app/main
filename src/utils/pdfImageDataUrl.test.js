import { fetchImageUrlAsDataUrl, isPdfImageDataUrl, loadFirebasePhotoAsDataUrl } from './pdfImageDataUrl';

describe('PDF image data URL helpers', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not treat Firebase download URLs as printable PDF images', () => {
    expect(isPdfImageDataUrl('https://firebasestorage.googleapis.com/v0/b/demo/o/avatar%2Fu1%2Fphoto.jpg?alt=media')).toBe(false);
  });

  it('treats JPEG data URLs as printable PDF images', () => {
    expect(isPdfImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
  });

  it('adds a fallback URL only after converting it to a data URL', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    }));

    const dataUrl = await fetchImageUrlAsDataUrl('https://example.test/photo.jpg');

    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(isPdfImageDataUrl(dataUrl)).toBe(true);
  });

  it('skips fallback URLs that cannot be converted and reports the reason', async () => {
    const debug = jest.fn();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const dataUrl = await loadFirebasePhotoAsDataUrl('https://example.test/cors-blocked.jpg', { onDebug: debug });

    expect(dataUrl).toBe('');
    expect(debug).toHaveBeenCalledWith('photo skipped: could not convert to data URL', expect.objectContaining({ message: 'Failed to fetch' }));
  });
});
