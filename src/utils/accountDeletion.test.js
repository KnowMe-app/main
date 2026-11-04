import { analyzeDeletedAccount, classifyAccountDeletionError, groupPurgePlan, listPendingAccountDeletions, purgeDeletedAccount, requestOwnAccountDeletion, resolvePlanCollection } from './accountDeletion';

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

  it('аналіз іде тим самим викликом з dryRun і повертає план', async () => {
    mockCall.mockResolvedValue({ data: { dryRun: true, plan: { steps: [] }, failed: [] } });
    await expect(analyzeDeletedAccount({ auth, uid: 'abc' })).resolves.toEqual({ plan: { steps: [] }, failed: [], error: '' });
    expect(mockCall).toHaveBeenCalledWith({ uid: 'abc', dryRun: true });
  });

  it('план групується за колекціями, обрізані кроки названо окремо', () => {
    expect(resolvePlanCollection('multiData/favorites/agency/x')).toBe('multiData/favorites');
    expect(resolvePlanCollection('searchId/380/phone')).toBe('searchId');
    const grouped = groupPurgePlan({ steps: [
      { step: 'favorites', count: 1, paths: ['multiData/favorites/a/x'] },
      { step: 'searchId', count: 450, paths: ['searchId/1/phone', 'searchId/2/phone'], kept: { 'searchId/2/phone': 'AA1' } },
    ] });
    expect(grouped.total).toBe(451);
    expect(grouped.collections.map(group => [group.collection, group.count])).toEqual([['searchId', 2], ['multiData/favorites', 1]]);
    expect(grouped.collections[0].items[1]).toEqual({ path: 'searchId/2/phone', kept: 'AA1' });
    expect(grouped.truncated).toEqual([{ step: 'searchId', shown: 2, count: 450 }]);
  });
});
