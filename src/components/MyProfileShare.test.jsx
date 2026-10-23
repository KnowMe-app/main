import React, { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyProfileShare } from './MyProfileShare';
import {
  createProfileShare,
  readOwnProfileShareSlots,
  refreshProfileShare,
  removeExpiredProfileShares,
  revokeProfileShare,
} from './profileShareRemote';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

jest.mock('./profileShareRemote', () => ({
  PROFILE_SHARE_ERRORS: { slotsFull: 'S', incomplete: 'I', rulesMissing: 'R' },
  createProfileShare: jest.fn(),
  readOwnProfileShareSlots: jest.fn(),
  refreshProfileShare: jest.fn(),
  removeExpiredProfileShares: jest.fn(),
  revokeProfileShare: jest.fn(),
}));

jest.mock('react-hot-toast', () => {
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast };
});

applyUkrainianInterface();

const PROFILE = { name: 'Оксана', surname: 'Марчук', birth: '1999-05-12', city: 'Київ', phone: '+380501112233', userRole: 'ed' };
const SHARE = {
  slot: '0',
  token: 'shareTokenAAAAAAAAAAAAAA',
  role: 'ed',
  createdAt: Date.UTC(2026, 9, 23),
  expiresAt: Date.UTC(2026, 10, 22),
  options: { photos: 'all', surname: 'initial', location: true, body: true, family: true, about: true, contacts: false },
};

let observers = [];
beforeAll(() => {
  global.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe() {}

    disconnect() {}
  };
});

beforeEach(() => {
  observers = [];
  readOwnProfileShareSlots.mockResolvedValue([]);
  removeExpiredProfileShares.mockImplementation(async ({ shares }) => shares);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

const mountBlock = (props = {}) => {
  const ref = createRef();
  render(
    <MyProfileShare
      ref={ref}
      uid="ownerUid"
      getProfile={() => PROFILE}
      profile={PROFILE}
      roles={['ed']}
      selectedRole="ed"
      language="uk"
      {...props}
    />,
  );
  return ref;
};

const showBlock = async () => {
  await act(async () => {
    observers.forEach(observer => observer.callback([{ isIntersecting: true }]));
  });
};

describe('«Поділитися анкетою»', () => {
  it('є лише в особистої анкети — агенції поки нема чим ділитись', () => {
    mountBlock({ roles: ['ag'], selectedRole: 'ag' });
    expect(screen.queryByTestId('share-card')).toBeNull();
  });

  it('не читає перелік посилань на відкритті сторінки — лише коли блок на екрані', async () => {
    mountBlock();
    expect(readOwnProfileShareSlots).not.toHaveBeenCalled();
    await showBlock();
    expect(readOwnProfileShareSlots).toHaveBeenCalledWith('ownerUid');
  });

  it('створює посилання з контактами, вимкненими за замовчуванням', async () => {
    createProfileShare.mockResolvedValue({ share: SHARE, url: 'https://x/main/p/token', photosSkipped: 0 });
    mountBlock();
    fireEvent.click(screen.getByTestId('share-open'));

    expect(screen.getByTestId('share-group-contacts').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('share-group-body').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('share-create'));

    expect(await screen.findAllByTestId('share-row')).toHaveLength(1);
    expect(createProfileShare).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'ownerUid',
      role: 'ed',
      expiryDays: 30,
      options: expect.objectContaining({ contacts: false, surname: 'initial', photos: 'all' }),
    }));
  });

  it('вимкнену групу не передає', async () => {
    createProfileShare.mockResolvedValue({ share: SHARE, url: 'u', photosSkipped: 0 });
    mountBlock();
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-group-family'));
    fireEvent.click(screen.getByTestId('share-group-contacts'));
    fireEvent.click(screen.getByTestId('share-create'));
    await waitFor(() => expect(createProfileShare).toHaveBeenCalled());
    expect(createProfileShare.mock.calls[0][0].options).toEqual(expect.objectContaining({ family: false, contacts: true }));
  });

  it('без імені створити посилання не дає', () => {
    mountBlock({ profile: { city: 'Київ' }, getProfile: () => ({ city: 'Київ' }) });
    expect(screen.getByTestId('share-open').disabled).toBe(true);
  });

  it('відкликання питає ще раз, а тоді знімає рядок', async () => {
    readOwnProfileShareSlots.mockResolvedValue([SHARE]);
    refreshProfileShare.mockImplementation(async ({ share }) => ({ changed: false, share }));
    revokeProfileShare.mockResolvedValue();
    mountBlock();
    await showBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Відкликати' }));
    expect(revokeProfileShare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Так, відкликати' }));
    await waitFor(() => expect(screen.queryByTestId('share-row')).toBeNull());
    expect(revokeProfileShare).toHaveBeenCalledWith({ uid: 'ownerUid', share: expect.objectContaining({ token: SHARE.token }) });
  });

  it('посилання, створене в цій же вкладці, оновлюється після збереження', async () => {
    jest.useFakeTimers();
    createProfileShare.mockResolvedValue({ share: SHARE, url: 'u', photosSkipped: 0 });
    refreshProfileShare.mockImplementation(async ({ share }) => ({ changed: true, share }));
    const blockRef = mountBlock();
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-create'));
    await act(async () => { await Promise.resolve(); });
    expect(await screen.findAllByTestId('share-row')).toHaveLength(1);

    act(() => blockRef.current.profileSaved());
    await act(async () => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });
    expect(refreshProfileShare).toHaveBeenCalledWith(expect.objectContaining({ share: expect.objectContaining({ token: SHARE.token }) }));
  });

  it('«Очистити дані ролі» відкликає посилання лише цієї ролі', async () => {
    const smShare = { ...SHARE, slot: '1', token: 'shareTokenBBBBBBBBBBBBBB', role: 'sm' };
    readOwnProfileShareSlots.mockResolvedValue([SHARE, smShare]);
    refreshProfileShare.mockImplementation(async ({ share }) => ({ changed: false, share }));
    revokeProfileShare.mockResolvedValue();
    const blockRef = mountBlock({ roles: ['ed', 'sm'] });
    await act(async () => {
      await blockRef.current.revokeShares({ role: 'sm' });
    });
    expect(revokeProfileShare).toHaveBeenCalledTimes(1);
    expect(revokeProfileShare.mock.calls[0][0].share.token).toBe(smShare.token);
    expect(screen.getAllByTestId('share-row')).toHaveLength(1);
  });

  it('після збереження анкети оновлює знімки, а без прочитаного переліку фото нічого не питають', async () => {
    jest.useFakeTimers();
    readOwnProfileShareSlots.mockResolvedValue([SHARE]);
    refreshProfileShare.mockImplementation(async ({ share }) => ({ changed: true, share }));
    const blockRef = mountBlock();

    act(() => blockRef.current.profileSaved({ onlyIfLoaded: true }));
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(readOwnProfileShareSlots).not.toHaveBeenCalled();

    act(() => blockRef.current.profileSaved());
    await act(async () => { jest.advanceTimersByTime(5000); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(refreshProfileShare).toHaveBeenCalledWith(expect.objectContaining({ uid: 'ownerUid', profile: PROFILE }));
  });
});
