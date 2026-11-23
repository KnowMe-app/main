import fs from 'fs';
import path from 'path';
import { buildEditorProposal } from 'utils/profileProposalEditor';

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
    expect(source).toContain('{matchingSharedDrafts.map(mutation => <DraftListCard');
    // Спільна чернетка рахується знайденим нарівні з карткою: від цього
    // залежить підпис кнопки створення й те, чи підставляти в нову картку
    // набраний контакт (він уже стоїть у знайденій чернетці).
    expect(source).toContain('const hasExistingMatches = searchResults.length > 0');
    expect(source).toContain('|| matchingSharedDrafts.length > 0;');
    expect(source).toContain('Спільні чернетки');
  });

  it('renders the draft as every editor overlay stacked onto the author data', () => {
    expect(source).toContain('const stacked = applyOverlaysToCard(base, overlays);');
    expect(source).toContain("const visible = accessRef.current?.isAdmin ? base : stacked;");
    expect(source).toContain('setDraft(visible);');
  });

  it('stores shared draft edits under the contributing editor and the original target', () => {
    const proposal = buildEditorProposal({
      locator: { operation: 'update', cardId: 'draft-1', createdBy: 'editor-1' },
      base: { userId: 'draft-1', phone: ['111', '222'] },
      targetCreateProposalId: 'author-draft-1',
    }, { userId: 'draft-1', phone: ['222'] }, 1);

    expect(proposal).toMatchObject({
      operation: 'update',
      targetCardId: 'draft-1',
      createdBy: 'editor-1',
      targetCreateProposalId: 'author-draft-1',
      changes: { phone: { removed: ['111'] } },
    });
    expect(proposal).not.toHaveProperty('data');
  });

  it('keeps another proposal out of an author save', () => {
    const proposal = buildEditorProposal({
      locator: { operation: 'create', cardId: 'draft-1', createdBy: 'author-1' },
      base: { userId: 'draft-1', phone: '111', name: 'Author' },
      visible: { userId: 'draft-1', phone: ['111', '222'], name: 'Author' },
      protectContributions: true,
    }, { userId: 'draft-1', phone: ['111', '222'], name: 'Edited author' }, 1);

    expect(proposal.data).toEqual({ userId: 'draft-1', phone: '111', name: 'Edited author' });
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

  it('keeps draft publication in the admin questionnaire and closes through the back action', () => {
    expect(source).not.toContain('rejectCreateProfileMutation');
    expect(source).toContain('const saveDraftAsCard = async () =>');
    expect(source).toContain('await profileProposalService.reviewDraft({');
    expect(source).toContain('Зберегти чернетку');
    // «Закрити» працює через стрілку в шапці, «назад» браузера
    // й апаратну кнопку телефона.
    expect(source).not.toContain('Закрити</CloseButton>');
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
    // Стрілка й «⋮» стоять у рядку спільної навігації, а не окремою шапкою.
    expect(source).not.toContain('<HeaderCopy>');
    expect(source).toContain('usePrimaryNavigationSlot({');
    expect(source).toContain('omitPrimaryDestinations');
    expect(source).not.toContain('Картки зберігаються приватно до рішення адміністратора.');
    expect(source).not.toContain('<MatchingButton');
  });
});
