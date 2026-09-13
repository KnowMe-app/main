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

  it('offers every matching shared draft from search instead of a duplicate card', () => {
    expect(source).toContain('findMatchingProfileMutations(sharedMutations, detectSearchParams(search))');
    expect(source).toContain('Спільна чернетка, можна додати правки');
    // Спільна чернетка рахується знайденим нарівні з карткою: від цього
    // залежить підпис кнопки створення й те, чи підставляти в нову картку
    // набраний контакт (він уже стоїть у знайденій чернетці).
    expect(source).toContain('const hasExistingMatches = searchResults.length > 0');
    expect(source).toContain('|| matchingSharedDrafts.length > 0;');
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

  it('gives the admin save and delete per value without bulk settlement', () => {
    expect(source).toContain('const saveFieldEdit = (row, editedValue, label) =>');
    expect(source).toContain('const deleteFieldEdit = (row, label) =>');
    expect(source).not.toContain('const acceptAllOverlayChanges = () =>');
    expect(source).not.toContain('const discardAllOverlayChanges = () =>');
    expect(source).not.toContain('Прийняти всі');
    expect(source).not.toContain('Видалити всі');
  });

  it('settles an edit by clearing it from the backend instead of journalling it', () => {
    expect(source).toContain('purgeHistory: true,');
  });

  it('keeps only the publish step under the questionnaire, named after what it does', () => {
    expect(source).not.toContain('rejectCreateProfileMutation');
    expect(source).toContain('const saveDraftAsCard = async () =>');
    expect(source).toContain('await acceptCreateProfileMutation({');
    expect(source).toContain('Зберегти чернетку');
    // Під анкетою лишилась рівно одна дія — публікація чернетки, і лише в
    // адміна. «Закрити» переїхало у стрілку в шапці: вихід — це жест «назад»,
    // а не кнопка серед дій анкети, і тепер його роблять однаково стрілка,
    // «назад» браузера й апаратна кнопка телефона.
    expect(source).not.toContain('Закрити</CloseButton>');
    expect(source).toContain('{!overlayTarget && access.isAdmin && activeMutation.revision > 0 && <Card>');
  });

  it('waits for blur autosave and publishes the accepted base at its latest revision', () => {
    expect(source).toContain('await saveQueueRef.current;');
    expect(source).toContain('const current = activeMutationRef.current;');
    expect(source).toContain('expectedRevision: current.revision,');
    expect(source).toContain('finalData: draftBaseRef.current || current.data,');
  });

  it('accepting a corrected value stores what the admin typed, not what was proposed', () => {
    expect(source).toContain('const acceptedChange = withEditedValue(settled, row, editedValue);');
    expect(source).toContain('applyOverlayToCard(draftBaseRef.current || {}, { [row.fieldName]: acceptedChange }),');
    expect(source).toContain('{ skipRevisionHistory: true },');
    expect(source).toContain('remainingChange: remaining,');
  });

  it('shows every edit inside the questionnaire instead of a separate review list', () => {
    const editorNavigation = ['navigate(`/edit/$', '{row.editorUserId}`)'].join('');

    expect(source).not.toContain("import { TopBlock } from './smallCard/renderTopBlock';");
    expect(source).toContain('{renderFieldTimeline(fieldName, currentValues, label)}');
    expect(source).toContain('const pendingFieldEdits = useMemo(');
    expect(source).toContain('const fieldVersionHistory = useMemo(');
    expect(source).toContain('Інші поля з правками');
    expect(source).toContain('fetchUsersByIds(ids)');
    expect(source).toContain(editorNavigation);
  });

  // Меню тут те саме, що й на решті сторінок анкет (`ProfileDotsMenu`), і саме
  // тому, що воно знає права читача. `PageNavMenu` їх не питав: не-адмін бачив
  // Budget/Invoice/Documents/Parties, натискав — і лишався на місці, бо
  // маршруту в `App` для нього немає.
  it('uses the access-aware profile menu and does not claim drafts are private', () => {
    expect(source).not.toContain("import PageNavMenu from './PageNavMenu';");
    expect(source).toContain("import { ProfileDotsMenu } from './ProfileDotsMenu';");
    // Стрілка ліворуч, заголовок, «⋮» праворуч — один рядок шапки.
    expect(source).toContain('<HeaderCopy><Title>{heading}</Title></HeaderCopy>');
    expect(source).toContain('<BackButton onClick={draft || overlayLoading ? requestCloseEditor : () => goBackOrTo(navigate, MATCHING_PATH)} />');
    expect(source).not.toContain('Картки зберігаються приватно до рішення адміністратора.');
    expect(source).not.toContain('<MatchingButton');
  });
});
