import { classifyAccountDeletionError, requestOwnAccountDeletion } from './accountDeletion';

const mockCall = jest.fn();
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => (...args) => mockCall(...args)),
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
});
