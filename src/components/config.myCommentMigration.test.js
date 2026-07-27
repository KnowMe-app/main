import fs from 'fs';
import path from 'path';

describe('myComment moves off the card into multiData/comments (per-admin)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  it('strips myComment from every users/newUsers write and actively deletes it on updates', () => {
    const transientKeysBody = source.slice(
      source.indexOf('const transientUserDataKeys = ['),
      source.indexOf('const stripTransientUserDataFields')
    );
    expect(transientKeysBody).toContain("'myComment',");
  });

  it('exposes a saveMyCardComment helper that writes to multiData/comments and deletes when text is empty', () => {
    const fnBody = source.slice(
      source.indexOf('export const saveMyCardComment'),
      source.indexOf('export const fetchUserComments')
    );
    expect(fnBody).toContain('fetchUserComment(ownerId, cardId)');
    expect(fnBody).toContain('deleteCommentByOwner({ ownerId, commentId })');
    expect(fnBody).toContain('return setUserComment(cardId, text, ownerId);');
  });
});
