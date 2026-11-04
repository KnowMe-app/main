import { classifyAccountDeletionError, listPendingAccountDeletions, purgeDeletedAccount, requestOwnAccountDeletion } from './accountDeletion';

const mockCall = jest.fn();
jest.mock('firebase/functions', () => ({
  // Звичайні функції, а не `jest.fn`: CRA скидає реалізації моків між тестами.
  getFunctions: () => ({}),
  httpsCallable: () => (...args) => mockCall(...args),
}));

describe('accountDeletion', () => {
  const auth = { app: {}, currentUser: { uid: 'u1' } };
  beforeEach(() => mockCall.mockReset());

  it('класифікує відмови сервера словами екрана', () => {
    expect(classifyAccountDeletionError({ code: 'functions/failed-precondition' })).toBe('recent-login');
    expect(classifyAccountDeletionError({ code: 'functions/permission-denied' })).toBe('protected');
    expect(classifyAccountDeletionError({ code: 'functions/internal', details: { failed: ['nodes'] } })).toBe('partial');
    // Нерозгорнута функція й мережа — запас поштою.
    expect(classifyAccountDeletionError({ code: 'functions/not-found' })).toBe('unavailable');
    expect(classifyAccountDeletionError(new Error('offline'))).toBe('unavailable');
  });

  it('передає мову й повертає, чи пішов лист', async () => {
    mockCall.mockResolvedValue({ data: { status: 'deleted', emailSent: true } });
    await expect(requestOwnAccountDeletion({ auth, language: 'uk' })).resolves.toEqual({ status: 'deleted', emailSent: true });
    expect(mockCall).toHaveBeenCalledWith({ language: 'uk' });
  });

  it('без входу сервер не кличе', async () => {
    await expect(requestOwnAccountDeletion({ auth: { app: {}, currentUser: null } })).resolves.toEqual({ status: 'unavailable' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('черга адміна: відмова — це причина, а не порожня черга', async () => {
    mockCall.mockRejectedValue({ code: 'functions/permission-denied' });
    await expect(listPendingAccountDeletions({ auth })).resolves.toEqual({ items: [], canPurge: false, error: 'functions/permission-denied' });
  });

  it('очищення передає uid і повертає перелік кроків, що впали', async () => {
    mockCall.mockResolvedValue({ data: { complete: false, failed: ['nodes'], counts: { searchId: 3 } } });
    await expect(purgeDeletedAccount({ auth, uid: 'abc' })).resolves.toEqual({ complete: false, failed: ['nodes'], counts: { searchId: 3 }, error: '' });
    expect(mockCall).toHaveBeenCalledWith({ uid: 'abc' });
  });
});
