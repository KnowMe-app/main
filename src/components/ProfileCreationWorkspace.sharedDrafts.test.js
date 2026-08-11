import fs from 'fs';
import path from 'path';

// Drafts are no longer single-author: any editor may open one, and what they
// see is every editor's overlay stacked onto the author's data. These
// assertions pin the wiring that keeps each editor's changes in their own
// overlay and the review of those changes admin-only.
describe('ProfileCreationWorkspace shared drafts', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('loads drafts created by other users, tolerating a rules denial', () => {
    expect(source).toContain("loadSharedProfileMutations,");
    expect(source).toContain('setSharedMutations(sortByRecency(await loadSharedProfileMutations(userId)))');
    expect(source).toContain("console.warn('[ProfileCreationWorkspace] shared drafts unavailable', error)");
    expect(source).toContain('setSharedMutations([]);');
  });

  it('offers a shared draft from search instead of a duplicate card', () => {
    expect(source).toContain('findMatchingProfileMutation(sharedMutations, detectSearchParams(search))');
    expect(source).toContain('Цей контакт уже є у спільній чернетці. Відкрийте її та додайте свої правки.');
    expect(source).toContain('Boolean(matchingOwnDraft) || Boolean(matchingSharedDraft)');
    expect(source).toContain('Спільні чернетки');
  });

  it('renders the draft as every editor overlay stacked onto the author data', () => {
    expect(source).toContain('const stacked = applyOverlaysToCard(base, overlays);');
    expect(source).toContain('stackedDraftRef.current = stacked;');
    expect(source).toContain('setDraft(stacked);');
  });

  it('stores another editor changes as that editor own overlay, never in the author draft', () => {
    expect(source).toContain('if (isSharedDraft(current, uid, accessRef.current?.isAdmin)) {');
    expect(source).toContain('const baseWithoutOwnOverlay = applyOverlaysToCard(base, overlays, { excludeEditorUserId: uid });');
    expect(source).toContain('fields: buildOverlayFromDraft(baseWithoutOwnOverlay, nextDraft),');
    expect(source).toContain('editorUserId: uid,');
    expect(source).toContain('cardUserId: current.cardId,');
  });

  it('never lets an author save promote somebody else pending overlay into the draft', () => {
    expect(source).toContain('const hasPendingOverlays = Object.keys(overlays).length > 0;');
    expect(source).toContain('? applyOverlayToCard(base, buildOverlayFromDraft(stacked, nextDraft))');
    expect(source).toContain(': nextDraft;');
  });

  it('keeps the per-edit review and the history journal admin-only', () => {
    expect(source).toContain("if (!accessRef.current?.isAdmin) {\n      setDraftHistory([]);");
    expect(source).toContain('{!overlayTarget && access.isAdmin && (overlayReviewRows.length > 0 || draftHistory.length > 0)');
    expect(source).toContain('Правки редакторів');
    expect(source).toContain('Історія правок');
  });

  it('gives the admin accept-one, accept-all, delete-one and delete-all', () => {
    expect(source).toContain('const acceptOverlayChange = (editorUserId, fieldName, change) =>');
    expect(source).toContain('const discardOverlayChange = (editorUserId, fieldName) =>');
    expect(source).toContain('const acceptAllOverlayChanges = () =>');
    expect(source).toContain('const discardAllOverlayChanges = () =>');
    expect(source).toContain("historyAction: 'accept',");
    expect(source).toContain("historyAction: 'discard',");
    expect(source).toContain('Прийняти всі');
    expect(source).toContain('Видалити всі');
  });
});
