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
    expect(source).toContain("const visible = accessRef.current?.isAdmin ? base : stacked;");
    expect(source).toContain('setDraft(visible);');
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
    expect(source).toContain('const reviewingAsAdmin = Boolean(access?.isAdmin) && !overlayTarget;');
    expect(source).toContain('{reviewingAsAdmin && (pendingEditsCount > 0 || draftHistory.length > 0)');
    expect(source).toContain('Правки редакторів');
    expect(source).toContain('Історія правок');
    expect(source).toContain('loadProfileMutationHistory(current.cardId)');
    expect(source).toContain('setDraftHistory([...overlayHistory, ...revisionHistory]');
  });

  it('gives the admin accept, reject, delete per value plus accept-all and delete-all', () => {
    expect(source).toContain('const acceptFieldEdit = (row, editedValue, label) =>');
    expect(source).toContain('const rejectFieldEdit = (row, label) =>');
    expect(source).toContain('const removeFieldEditValue = (row, label) =>');
    expect(source).toContain('const acceptAllOverlayChanges = () =>');
    expect(source).toContain('const discardAllOverlayChanges = () =>');
    expect(source).toContain("historyAction: 'accept',");
    expect(source).toContain("historyAction: 'discard',");
    expect(source).toContain('Прийняти всі');
    expect(source).toContain('Видалити всі');
  });

  it('accepting a corrected value stores what the admin typed, not what was proposed', () => {
    expect(source).toContain('const acceptedChange = withEditedValue(settled, row, editedValue);');
    expect(source).toContain('await persistDraftData(applyOverlayToCard(draftBaseRef.current || {}, { [row.fieldName]: acceptedChange }));');
    expect(source).toContain('remainingChange: remaining,');
  });

  it('shows every edit inside the questionnaire instead of a separate review list', () => {
    const editorNavigation = ['navigate(`/edit/$', '{row.editorUserId}`)'].join('');

    expect(source).not.toContain("import { TopBlock } from './smallCard/renderTopBlock';");
    expect(source).toContain('{renderFieldVersions(fieldName, currentValues)}');
    expect(source).toContain('{renderFieldPendingEdits(fieldName, label)}');
    expect(source).toContain('const pendingFieldEdits = useMemo(');
    expect(source).toContain('const fieldVersionHistory = useMemo(');
    expect(source).toContain('Інші поля з правками');
    expect(source).toContain('fetchUsersByIds(ids)');
    expect(source).toContain(editorNavigation);
  });

  it('uses the shared dots navigation and does not claim drafts are private', () => {
    expect(source).toContain("import PageNavMenu from './PageNavMenu';");
    expect(source).toContain('<PageNavMenu />');
    expect(source).not.toContain('Картки зберігаються приватно до рішення адміністратора.');
    expect(source).not.toContain('<MatchingButton');
  });
});
