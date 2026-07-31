import fs from 'fs';
import path from 'path';

describe('myComment moves off the card into multiData/comments/{ownerId}/{cardId} (per-admin)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  it('strips myComment from every users/newUsers write and actively deletes it on updates', () => {
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

  it('falls back to the legacy comments root and migrates legacy values on read', () => {
    expect(source).toContain("const LEGACY_COMMENTS_ROOT_PATH = 'comments';");
    expect(source).toContain('getLegacyCommentPath(ownerId, cardId)');
    expect(source).toContain('migrateLegacyComment(ownerId, cardId, snap.val())');
    expect(source).toContain('const ownerComments = { ...legacyComments, ...currentComments };');
  });
});
