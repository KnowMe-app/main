import fs from 'fs';
import path from 'path';

describe('myComment moves off the card into comments/{ownerId}/{cardId} (per-admin)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  it('strips myComment from every users/newUsers write and actively deletes it on updates', () => {
    const transientKeysBody = source.slice(
      source.indexOf('const transientUserDataKeys = ['),
      source.indexOf('const stripTransientUserDataFields')
    );
    expect(transientKeysBody).toContain("'myComment',");
  });

  it('writes comments directly to comments/{ownerId}/{cardId} without push() or a commentId', () => {
    const fnBody = source.slice(
      source.indexOf('export const setUserComment'),
      source.indexOf('export const updateCommentByOwner')
    );
    expect(fnBody).toContain('comments/${commentsOwnerId}/${cardId}');
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

  it('reads a single comment straight from comments/{ownerId}/{cardId}, without orderByChild/equalTo', () => {
    const fnBody = source.slice(
      source.indexOf('export const fetchUserComment '),
      source.indexOf('export const saveMyCardComment')
    );
    expect(fnBody).toContain('comments/${ownerId}/${cardId}');
    expect(fnBody).not.toContain('orderByChild');
    expect(fnBody).not.toContain('equalTo');
  });
});
