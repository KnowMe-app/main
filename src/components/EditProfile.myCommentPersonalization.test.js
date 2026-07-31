import fs from 'fs';
import path from 'path';

describe('EditProfile treats myComment as the current admin\'s personal note', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  it('imports the comment-storage helpers instead of relying on the card field', () => {
    expect(source).toContain('fetchUserComment,');
    expect(source).toContain('saveMyCardComment,');
  });

  it('seeds state.myComment from the current admin\'s own multiData/comments/{ownerId}/{cardId} entry on load', () => {
    const seedEffectBody = source.slice(
      source.indexOf("if (!userId || !currentUid || !isAdmin || !dataSource) return;"),
      source.indexOf('}, [userId, currentUid, isAdmin, dataSource]);')
    );
    expect(seedEffectBody).toContain('fetchUserComment(currentUid, userId)');
    expect(seedEffectBody).toContain("prev && prev.userId === userId ? { ...prev, myComment } : prev");
  });

  it('remoteUpdate persists a changed myComment via saveMyCardComment instead of the card payload', () => {
    const remoteUpdateBody = source.slice(
      source.indexOf('async function remoteUpdate'),
      source.indexOf('const enqueueProfileSync')
    );
    expect(remoteUpdateBody).toContain(
      "Object.prototype.hasOwnProperty.call(updatedState, 'myComment')"
    );
    expect(remoteUpdateBody).toContain('if (nextComment !== previousComment)');
    expect(remoteUpdateBody).toContain('await saveMyCardComment(updatedState.userId, nextComment, editorUserId);');
  });
});
