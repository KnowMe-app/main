// Адреса фото береться з поля анкети, тож перенесення між дублікатами довіряє
// лише файлам нашого бакета й не пускає `..` у шлях запису.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'admin' } }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), collection: () => ({}), doc: () => ({}),
  getDoc: jest.fn(), getDocs: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({ app: { options: { storageBucket: 'proj.appspot.com' } } }),
  ref: (_storage, path) => ({ path }),
  getDownloadURL: jest.fn(),
  uploadBytes: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(async () => ({ items: [], prefixes: [] })),
  getBytes: jest.fn(),
}));
jest.mock('firebase/database', () => ({ getDatabase: () => ({}), ref: () => ({}) }));

const storageApi = require('firebase/storage');
const { copyProfilePhotosBetweenCards, storagePathFromDownloadUrl } = require('./config');

const storageUrl = path => `https://firebasestorage.googleapis.com/v0/b/proj.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe('storagePathFromDownloadUrl', () => {
  it('reads a file path of this project bucket', () => {
    expect(storagePathFromDownloadUrl(storageUrl('avatar/A/1.jpg'))).toBe('avatar/A/1.jpg');
  });

  it.each([
    ['another host', 'https://evil.example/v0/b/proj.appspot.com/o/avatar%2FA%2F1.jpg'],
    ['another bucket', 'https://firebasestorage.googleapis.com/v0/b/other/o/avatar%2FA%2F1.jpg'],
    ['a dot-dot segment', storageUrl('avatar/A/../B/1.jpg')],
    ['an empty segment', storageUrl('avatar/A//1.jpg')],
    ['not a URL', 'avatar/A/1.jpg'],
  ])('rejects %s', (_label, url) => {
    expect(storagePathFromDownloadUrl(url)).toBe('');
  });
});

describe('copyProfilePhotosBetweenCards', () => {
  beforeEach(() => {
    storageApi.getBytes.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
    storageApi.uploadBytes.mockResolvedValue({});
    storageApi.getDownloadURL.mockImplementation(async ref => storageUrl(ref.path));
    global.fetch = jest.fn();
  });

  it('copies own files, keeps https links as they are and skips the rest', async () => {
    const copied = await copyProfilePhotosBetweenCards({
      sourceUserId: 'A',
      targetUserId: 'B',
      photoUrls: [
        storageUrl('avatar/A/1.jpg'),
        storageUrl('avatar/A/medication/pill.jpg'),
        'https://example.com/photo.jpg',
        'data:image/png;base64,AAAA',
      ],
    });
    expect(copied).toEqual([storageUrl('avatar/B/1.jpg'), 'https://example.com/photo.jpg']);
    expect(storageApi.uploadBytes).toHaveBeenCalledTimes(1);
    expect(storageApi.uploadBytes.mock.calls[0][0]).toEqual({ path: 'avatar/B/1.jpg' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
