import { get, ref, update } from 'firebase/database';
import { deleteObject, getBytes, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  PROFILE_SHARE_ERRORS,
  createProfileShare,
  readSharedProfileCard,
  refreshProfileShare,
  revokeProfileShare,
} from './profileShareRemote';
import { buildProfileShareCard } from '../utils/profileShare';

// Реалізації моків ставляться в `beforeEach`: CRA скидає їх перед кожним
// тестом (`resetMocks`).
jest.mock('firebase/database', () => ({
  get: jest.fn(),
  ref: jest.fn(),
  update: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  deleteObject: jest.fn(),
  getBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
}));

jest.mock('./config', () => ({
  database: {},
  storage: {},
  isReactionPermissionDeniedError: error => String(error?.message || '').includes('PERMISSION_DENIED'),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/b/o/avatar%2Fu%2F1.jpg?alt=media';
const PROFILE = { name: 'Оксана', birth: '1999-05-12', city: 'Київ', photos: [PHOTO], phone: '+380501112233' };

beforeAll(() => {
  // У jsdom цього Jest немає `crypto` — береться той самий Web Crypto з Node.
  Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });
});

beforeEach(() => {
  ref.mockImplementation((db, path = '') => ({ path }));
  storageRef.mockImplementation((storage, path) => ({ path }));
  get.mockResolvedValue({ exists: () => false, val: () => null });
  getBytes.mockResolvedValue(JPEG);
  uploadBytes.mockResolvedValue({});
  getDownloadURL.mockImplementation(async target => `https://firebasestorage.googleapis.com/v0/b/b/o/${encodeURIComponent(target.path)}?alt=media`);
  update.mockResolvedValue();
  deleteObject.mockResolvedValue();
});

afterEach(() => jest.clearAllMocks());

describe('створення посилання', () => {
  it('пише знімок і слот одним записом, а фото — копією в теці знімка', async () => {
    const { share } = await createProfileShare({
      uid: 'owner', profile: PROFILE, role: 'ed', options: { contacts: false }, expiryDays: 30, slots: [], now: 1000,
    });

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][1];
    const node = written[`profileShares/${share.token}`];
    expect(node).toEqual(expect.objectContaining({ owner: 'owner', slot: '0', createdAt: 1000, expiresAt: 1000 + 30 * 86400000 }));
    expect(written[`multiData/profileShareSlots/owner/0`]).toEqual(expect.objectContaining({ token: share.token, role: 'ed', photoSources: [PHOTO] }));
    // У знімку — копія, не оригінал, і без контактів.
    expect(node.card.photos[0]).toContain(`profileShares%2F${share.token}%2F`);
    expect(node.card).not.toHaveProperty('phone');
    expect(uploadBytes.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg', customMetadata: { owner: 'owner' } });
  });

  it('без вільного слоту нічого не копіює й не пише', async () => {
    const slots = ['0', '1', '2', '3', '4'].map(slot => ({ slot, token: `t${slot}` }));
    await expect(createProfileShare({ uid: 'owner', profile: PROFILE, role: 'ed', slots }))
      .rejects.toMatchObject({ code: PROFILE_SHARE_ERRORS.slotsFull });
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('відмова правил прибирає вже скопійовані фото й каже, що правила не викочено', async () => {
    update.mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));
    await expect(createProfileShare({ uid: 'owner', profile: PROFILE, role: 'ed', slots: [] }))
      .rejects.toMatchObject({ code: PROFILE_SHARE_ERRORS.rulesMissing });
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });

  it('фото, яке не скопіювалось, у знімок не йде — і посилання однаково створюється', async () => {
    getBytes.mockRejectedValue(new Error('storage/unauthorized'));
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    const result = await createProfileShare({ uid: 'owner', profile: PROFILE, role: 'ed', slots: [] });
    expect(result.photosSkipped).toBe(1);
    const node = update.mock.calls[0][1][`profileShares/${result.share.token}`];
    expect(node.card).not.toHaveProperty('photos');
  });
});

describe('оновлення посилання', () => {
  const share = {
    slot: '2',
    token: 'shareTokenAAAAAAAAAAAAAA',
    role: 'ed',
    createdAt: 500,
    options: { photos: 'none', surname: 'initial', location: true, body: true, family: true, about: true, contacts: false },
  };

  it('нічого не пише, коли знімок не змінився', async () => {
    const stored = buildProfileShareCard(PROFILE, { role: 'ed', options: share.options });
    get.mockResolvedValue({ exists: () => true, val: () => stored });

    const result = await refreshProfileShare({ uid: 'owner', profile: PROFILE, share: { ...share, token: 'shareTokenCCCCCCCCCCCCCC' }, now: 3000 });
    expect(result.changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('переписує знімок, коли анкета змінилась, і не чіпає дати створення', async () => {
    const stored = buildProfileShareCard(PROFILE, { role: 'ed', options: share.options });
    get.mockResolvedValue({ exists: () => true, val: () => stored });
    const result = await refreshProfileShare({ uid: 'owner', profile: { ...PROFILE, city: 'Львів' }, share, now: 4000 });
    expect(result.changed).toBe(true);
    const node = update.mock.calls[0][1][`profileShares/${share.token}`];
    expect(node).toEqual(expect.objectContaining({ createdAt: 500, updatedAt: 4000, slot: '2' }));
    expect(node.card.city).toBe('Львів');
  });

  it('стерте імʼя відкликає посилання, а не лишає стару анкету', async () => {
    const result = await refreshProfileShare({ uid: 'owner', profile: { ...PROFILE, name: '' }, share: { ...share, token: 'shareTokenDDDDDDDDDDDDDD' }, now: 5000 });
    expect(result.removed).toBe(true);
    expect(update.mock.calls[0][1]).toEqual({
      'profileShares/shareTokenDDDDDDDDDDDDDD': null,
      'multiData/profileShareSlots/owner/2': null,
    });
  });

  it('знімок, знятий адміном, не відновлюється — прибирається слот', async () => {
    get.mockResolvedValue({ exists: () => false, val: () => null });
    const result = await refreshProfileShare({ uid: 'owner', profile: PROFILE, share: { ...share, token: 'shareTokenEEEEEEEEEEEEEE' }, now: 6000 });
    expect(result.removed).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1]['profileShares/shareTokenEEEEEEEEEEEEEE']).toBeNull();
  });

  it('прострочене посилання не оновлює', async () => {
    const result = await refreshProfileShare({ uid: 'owner', profile: PROFILE, share: { ...share, expiresAt: 10 }, now: 20 });
    expect(result.changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('відкликання й читання', () => {
  it('знімає знімок і слот разом, а тоді видаляє копії фото', async () => {
    await revokeProfileShare({ uid: 'owner', share: { slot: '1', token: 'tok', photoCopies: ['https://copy/0'] } });
    expect(update.mock.calls[0][1]).toEqual({ 'profileShares/tok': null, 'multiData/profileShareSlots/owner/1': null });
    expect(deleteObject).toHaveBeenCalledWith({ path: 'https://copy/0' });
  });

  it('гість читає лише картку знімка; відмова правил — це «посилання недійсне»', async () => {
    get.mockResolvedValueOnce({ exists: () => true, val: () => ({ name: 'А' }) });
    await expect(readSharedProfileCard('tok')).resolves.toEqual({ status: 'ok', card: { name: 'А' } });
    expect(get.mock.calls[0][0]).toEqual({ path: 'profileShares/tok/card' });

    get.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(readSharedProfileCard('tok')).resolves.toEqual({ status: 'missing' });

    get.mockRejectedValueOnce(new Error('offline'));
    await expect(readSharedProfileCard('tok')).resolves.toMatchObject({ status: 'error' });
  });
});
