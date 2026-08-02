import fs from 'fs';
import path from 'path';

describe('smallCard comment UI fixes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'renderTopBlock.js'), 'utf8');

  it('portals the multiData comment edit/delete modals to document.body so they render above ProfileForm inputs', () => {
    const commentModalIndex = source.indexOf('isCommentModalOpen && typeof document');
    const deleteModalIndex = source.indexOf('commentToDelete && typeof document');
    expect(commentModalIndex).toBeGreaterThan(-1);
    expect(deleteModalIndex).toBeGreaterThan(-1);

    const commentModalBody = source.slice(commentModalIndex, deleteModalIndex);
    expect(commentModalBody).toContain('createPortal(');
    expect(commentModalBody).toContain('document.body');

    const deleteModalBody = source.slice(deleteModalIndex, deleteModalIndex + 1500);
    expect(deleteModalBody).toContain('createPortal(');
    expect(deleteModalBody).toContain('document.body');
  });

  it('excludes the current admin\'s own comment from the read-only multiData list, since FieldComment already edits it', () => {
    expect(source).toContain('const otherAdminsComments = React.useMemo(');
    expect(source).toContain(
      "return multiDataComments.filter(comment => (comment.ownerId || comment.authorId || '') !== currentUid);"
    );
    expect(source).toContain('{otherAdminsComments.map(comment => (');
    expect(source).not.toContain('{multiDataComments.map(comment => (');
  });

  it('loads shared comments only for the current card and reuses the cached viewer profile', () => {
    expect(source).toContain('getCard(viewerId) || await fetchUserById(viewerId)');
    expect(source).toContain('fetchAllCommentsByCardId(cardData.userId, ownerIds)');
    expect(source).not.toContain('fetchAllCommentsByCardId(cardData.userId);');
  });
});
