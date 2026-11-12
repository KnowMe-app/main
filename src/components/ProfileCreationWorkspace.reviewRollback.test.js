const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

/**
 * Відмова бази на правку чи видалення відгуку приходить пізно. Людина могла
 * вже відкрити іншу картку — і відкат не мусить вставити відгук про одну
 * людину під іншою.
 */
describe('відкат відгуку у формі — лише на тій самій картці', () => {
  it('памʼятає, чиї відгуки на екрані, і звіряє її перед відкатом', () => {
    expect(source).toContain('publicCommentsCardIdRef.current = cardId || null;');
    const rollback = slice('const rollBackPublicCommentOnRejection = useCallback(', '  const handleUpdatePublicComment');
    expect(rollback).toContain('if (publicCommentsCardIdRef.current === profileId) {');
  });

  it('правка й видалення передають картку відкату', () => {
    expect(source.match(/rollBackPublicCommentOnRejection\(delivered, previousComment, profileId\);/g)).toHaveLength(2);
  });
});
