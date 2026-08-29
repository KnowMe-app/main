import fs from 'fs';
import path from 'path';

describe('myComment moves off the card into multiData/comments/{ownerId}/{cardId} (per-admin)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  it('strips myComment from every users write and actively deletes it on updates', () => {
    const transientKeysBody = source.slice(
      source.indexOf('const transientUserDataKeys = ['),
      source.indexOf('const stripTransientUserDataFields')
    );
    expect(transientKeysBody).toContain("'myComment',");
  });

  it('writes comments directly to multiData/comments/{ownerId}/{cardId} without push() or a commentId', () => {
    const fnBody = source.slice(
      source.indexOf('export const setUserComment'),
      source.indexOf('export const updateCommentByOwner')
    );
    expect(source).toContain("export const COMMENTS_ROOT_PATH = 'multiData/comments';");
    expect(fnBody).toContain('getCommentPath(commentsOwnerId, cardId)');
    expect(fnBody).not.toContain('push(');
    expect(fnBody).not.toContain('orderByChild');
    expect(fnBody).not.toContain('authorId');
    expect(fnBody).not.toContain('getLegacyCommentPath');
  });

  it('never includes the legacy comments root in normal create, edit, or delete writes', () => {
    const fnBody = source.slice(
      source.indexOf('export const setUserComment'),
      source.indexOf('export const fetchUserComment')
    );
    expect(fnBody).not.toContain('getLegacyCommentPath');
    expect(fnBody).toContain('set(ref2(database, getCommentPath(commentsOwnerId, cardId))');
    expect(fnBody).toContain('set(ref2(database, getCommentPath(ownerId, cardId))');
    expect(fnBody).toContain('remove(ref2(database, getCommentPath(ownerId, cardId)))');
  });

  it('exposes a saveMyCardComment helper that writes via setUserComment and deletes when text is empty', () => {
    const fnBody = source.slice(
      source.indexOf('export const saveMyCardComment'),
      source.indexOf('export const fetchUserComments')
    );
    expect(fnBody).toContain('deleteCommentByOwner({ ownerId: commentsOwnerId, cardId })');
    expect(fnBody).toContain('return setUserComment(cardId, text, ownerId);');
  });

  it('reads a single comment straight from multiData/comments/{ownerId}/{cardId}, without orderByChild/equalTo', () => {
    const fnBody = source.slice(
      source.indexOf('export const fetchUserComment '),
      source.indexOf('export const saveMyCardComment')
    );
    expect(fnBody).toContain('getCommentPath(ownerId, cardId)');
    expect(fnBody).not.toContain('orderByChild');
    expect(fnBody).not.toContain('equalTo');
  });

  // Дрібна пачка й далі читається поточковими шляхами: піддерево активного
  // адміна — це тисячі записів, і тягнути його заради трьох карток дорожче за
  // три запити. Великій пачці навпаки: один запит замість N.
  it('reads a small bulk of comments by exact card paths', () => {
    const fnBody = source.slice(
      source.indexOf('export const fetchUserComments'),
      source.indexOf('export const fetchAllCommentsByCardId')
    );
    expect(fnBody).toContain('fetchUserComment(ownerId, cardId)');
    expect(fnBody).toContain('cardIds.length >= OWNER_COMMENTS_SUBTREE_THRESHOLD');
    expect(fnBody).not.toContain('get(ref2(database, getCommentPath(ownerId)))');
    expect(fnBody).not.toContain('get(ref2(database, getLegacyCommentPath(ownerId)))');
  });

  // Заборона, яка лишається безумовною: піддерево читається тільки під одного
  // названого власника. Корінь через усіх власників і легасі-корінь — ніколи.
  it('scopes the bulk subtree read to a single owner and caches it', () => {
    const readerBody = source.slice(
      source.indexOf('const getCachedOwnerCommentsSubtree'),
      source.indexOf('export const fetchUserComments')
    );

    expect(readerBody).toContain('`${COMMENTS_ROOT_PATH}/${ownerId}`');
    expect(readerBody).not.toContain('get(ref2(database, COMMENTS_ROOT_PATH))');
    expect(readerBody).toContain('OWNER_COMMENTS_SUBTREE_TTL_MS');
    expect(source).toContain('export const invalidateOwnerCommentsCache');
  });

  it('reads card comments only from explicitly allowed owner/card paths', () => {
    const fnBody = source.slice(
      source.indexOf('export const fetchAllCommentsByCardId'),
      source.indexOf('const buildFlowRef')
    );
    expect(fnBody).toContain('fetchUserComment(ownerId, cardId)');
    expect(fnBody).not.toContain('get(ref2(database, COMMENTS_ROOT_PATH))');
    expect(fnBody).not.toContain('get(ref2(database, LEGACY_COMMENTS_ROOT_PATH))');
  });

  it('does not reference the nonexistent root comments/{ownerId}/{cardId} path', () => {
    const singleReadBody = source.slice(
      source.indexOf('export const fetchUserComment '),
      source.indexOf('export const saveMyCardComment')
    );
    const bulkReadBody = source.slice(
      source.indexOf('export const fetchUserComments'),
      source.indexOf('const buildFlowRef')
    );

    expect(source).not.toContain("LEGACY_COMMENTS_ROOT_PATH");
    expect(source).not.toContain('getLegacyCommentPath');
    expect(singleReadBody).toContain('getCommentPath(ownerId, cardId)');
    expect(bulkReadBody).toContain('fetchUserComment(ownerId, cardId)');
    expect(bulkReadBody).not.toContain('getLegacyCommentPath(ownerId)');
    expect(bulkReadBody).not.toContain('get(ref2(database, COMMENTS_ROOT_PATH))');
    expect(bulkReadBody).not.toContain('await update(ref2(database), migrations)');
  });
});
