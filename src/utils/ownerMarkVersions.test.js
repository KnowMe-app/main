import {
  configureOwnerMarkVersions,
  ensureOwnerMarksChecked,
  registerOwnerMarkInvalidator,
  resetOwnerMarkChecks,
  resolveChangedOwnerMarkKinds,
  subscribeOwnerMarkChanges,
} from './ownerMarkVersions';

describe('версія позначок власника', () => {
  let forgotten;
  beforeEach(() => {
    localStorage.clear();
    resetOwnerMarkChecks();
    forgotten = [];
    ['comments', 'favorites', 'dislikes', 'getInTouch', 'likedAudience'].forEach(kind => {
      registerOwnerMarkInvalidator(kind, (viewerId, ownerId) => forgotten.push(`${kind}:${viewerId}:${ownerId}`));
    });
  });

  it('новіша версія забуває кеш виду, та сама — ні', async () => {
    let remote = { comments: 100, favorites: 50 };
    const read = jest.fn(async () => remote);
    configureOwnerMarkVersions({ read });

    // Власника ще не бачили: усе з версією — змінене (кеш міг лягти раніше).
    expect(await ensureOwnerMarksChecked('viewer', ['owner'])).toEqual({ owner: ['comments', 'favorites'] });
    expect(forgotten).toEqual(['comments:viewer:owner', 'favorites:viewer:owner']);

    // Та сама вкладка не питає вдруге.
    await ensureOwnerMarksChecked('viewer', ['owner']);
    expect(read).toHaveBeenCalledTimes(1);

    // Нова вкладка: змінились лише памʼятки.
    resetOwnerMarkChecks();
    forgotten = [];
    remote = { comments: 120, favorites: 50 };
    expect(await ensureOwnerMarksChecked('viewer', ['owner'])).toEqual({ owner: ['comments'] });
    expect(forgotten).toEqual(['comments:viewer:owner']);
  });

  it('збій читання нічого не забуває й не зсуває побаченого', async () => {
    configureOwnerMarkVersions({ read: async () => { throw new Error('offline'); } });
    expect(await ensureOwnerMarksChecked('viewer', ['owner'])).toEqual({ owner: [] });
    expect(forgotten).toEqual([]);

    resetOwnerMarkChecks();
    configureOwnerMarkVersions({ read: async () => ({ getInTouch: 7 }) });
    expect(await ensureOwnerMarksChecked('viewer', ['owner'])).toEqual({ owner: ['getInTouch'] });
  });

  it('слухачі чують зміну, а власника без версій ніщо не забуває', async () => {
    const heard = [];
    const unsubscribe = subscribeOwnerMarkChanges(event => heard.push(event));
    configureOwnerMarkVersions({ read: async ownerId => (ownerId === 'shared' ? { dislikes: 3 } : null) });
    await ensureOwnerMarksChecked('viewer', ['viewer', 'shared']);
    unsubscribe();
    expect(heard).toEqual([{ viewerId: 'viewer', ownerId: 'shared', kinds: ['dislikes'] }]);
    expect(forgotten).toEqual(['dislikes:viewer:shared']);
  });

  it('resolveChangedOwnerMarkKinds порівнює з побаченим', () => {
    expect(resolveChangedOwnerMarkKinds({ comments: 5 }, { comments: 5 })).toEqual([]);
    expect(resolveChangedOwnerMarkKinds({ comments: 6 }, { comments: 5 })).toEqual(['comments']);
    expect(resolveChangedOwnerMarkKinds(null, undefined)).toEqual([]);
  });
});
