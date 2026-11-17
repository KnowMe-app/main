import { PRIMARY_RECHECK_STORAGE_PREFIX, settlePrimaryAccount, shouldRecheckPrimaryAccount } from './accountLinks';

const mockCall = jest.fn();
jest.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => (...args) => mockCall(...args),
}));
const mockSignIn = jest.fn();
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: (...args) => mockSignIn(...args),
}));

// Вхід у другорядний акаунт перемикає сесію на головний; збій перевірки вхід
// не тримає, а перевірку сесії, що вже була, повторюємо раз на добу.
describe('settlePrimaryAccount', () => {
  const auth = { app: {}, currentUser: { uid: 'secondary' } };

  beforeEach(() => {
    localStorage.clear();
    mockCall.mockReset();
    mockSignIn.mockReset();
    mockSignIn.mockImplementation(async (auth, token) => ({ user: { uid: `primary-of-${token}` } }));
  });

  it('другорядний акаунт перемикається на головний', async () => {
    mockCall.mockResolvedValue({ data: { status: 'redirect', token: 'T' } });
    await expect(settlePrimaryAccount(auth)).resolves.toBe('redirect');
    expect(mockSignIn).toHaveBeenCalledWith(auth, 'T');
    expect(shouldRecheckPrimaryAccount('secondary')).toBe(false);
  });

  it('злиття на вході перебудовує анкету', async () => {
    mockCall.mockResolvedValue({ data: { status: 'merged', merged: 1 } });
    const onMerged = jest.fn();
    await expect(settlePrimaryAccount(auth, { onMerged })).resolves.toBe('merged');
    expect(onMerged).toHaveBeenCalledWith('secondary');
  });

  it('збій функції лишає сесію й перевіряє знову', async () => {
    mockCall.mockRejectedValue(new Error('offline'));
    await expect(settlePrimaryAccount(auth)).resolves.toBe('skipped');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(shouldRecheckPrimaryAccount('secondary')).toBe(true);
  });

  it('перевірка раз на добу', () => {
    localStorage.setItem(`${PRIMARY_RECHECK_STORAGE_PREFIX}u`, String(Date.now()));
    expect(shouldRecheckPrimaryAccount('u')).toBe(false);
    expect(shouldRecheckPrimaryAccount('u', Date.now() + 25 * 60 * 60 * 1000)).toBe(true);
  });
});
