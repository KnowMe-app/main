import fs from 'fs';
import path from 'path';

// A card can have pending overlays from several editors at once. Every editor
// must see them stacked (the last save wins), while the per-editor breakdown
// and the journal of superseded edits stay admin-only.
describe('EditProfile shows non-admin editors the stacked card', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  it('no longer narrows a non-admin to their own overlay', () => {
    expect(source).toContain('overlays = await getOverlaysForCard(userId, { includeAdminOnly: isAdmin });');
    expect(source).not.toContain('overlays = ownOverlay ? { [currentUid]: ownOverlay } : {};');
  });

  it('filters published admin-only overlays before stacking for a non-admin', () => {
    expect(source).toContain('getOverlaysForCard(userId, { includeAdminOnly: isAdmin })');
    expect(source).toContain('includeAdminOnly: canWriteMain,');
  });

  it('renders canonical for an admin and the stacked card for everybody else', () => {
    expect(source).toContain('const cardForEditor = isAdmin');
    expect(source).toContain(': applyOverlaysToCard(canonical, overlays);');
  });

  it('diffs a non-admin save against the card without their own overlay', () => {
    expect(source).toContain('excludeEditorUserId: editorUserId,');
    expect(source).toContain('const overlayFields = buildOverlayFromDraft(baseForOwnOverlay, updatedState);');
  });

  it('keeps the per-editor breakdown out of a non-admin session', () => {
    expect(source).toContain('if (!isAdmin) {\n      setPendingOverlays({});');
  });

  // Шар зберігає зміну поля цілком, і форма показувала її одним рядком: два
  // дописані номери зліплювались в «A, B» в одному інпуті. Розкладає
  // пропозиції одне місце на всі екрани — по рядку на значення.
  it('розкладає пропозиції редакторів по значеннях, а не по полях', () => {
    expect(source).toContain('const overlayFieldAdditions = useMemo(() => buildOverlayFieldEntries(pendingOverlays), [pendingOverlays]);');
    expect(source).not.toContain("const normalizedTo = sanitizeOverlayValue(incomingValue);");
  });
});

// «ОК» і «×» стосуються одного значення, а не всієї правки поля: шар із двома
// номерами зносився цілком від одного хрестика, а відхилений номер лишався в
// `searchId` і далі знаходився пошуком.
describe('ProfileForm settles one overlay value at a time', () => {
  const formSource = fs.readFileSync(path.join(__dirname, 'ProfileForm.jsx'), 'utf8');

  it('рішення йде через settleOverlayValueForCard із самим значенням', () => {
    expect(formSource).toContain('await settleOverlayValueForCard({');
    expect(formSource).toContain('value: entry.value,');
    expect(formSource).toContain("await enqueueOverlaySettlement(fieldName, entry, 'discard');");
    expect(formSource).toContain("await enqueueOverlaySettlement(fieldName, entry, 'accept', acceptedValue);");
    // Зняття поля цілком (`change: null`) тут більше немає — саме воно й
    // зносило друге значення разом із першим.
    expect(formSource).not.toContain('patchOverlayField({');
  });

  it('ховає відхилену пропозицію до відповіді бекенду та серіалізує запити', () => {
    const dismissBody = formSource.slice(
      formSource.indexOf('const handleOverlayDismiss = async (fieldName, entry) => {'),
      formSource.indexOf('const getOverlayEntryDraftKey =', formSource.indexOf('const handleOverlayDismiss = async (fieldName, entry) => {')),
    );
    expect(dismissBody.indexOf('dismissOverlayEntry(fieldName, entry);')).toBeLessThan(
      dismissBody.indexOf("await enqueueOverlaySettlement(fieldName, entry, 'discard');"),
    );
    expect(dismissBody).toContain('restoreOverlayEntry(fieldName, entry);');

    const queueBody = formSource.slice(
      formSource.indexOf('const enqueueOverlaySettlement = useCallback'),
      formSource.indexOf('const removeOverlayValueFromState', formSource.indexOf('const enqueueOverlaySettlement = useCallback')),
    );
    expect(queueBody).toContain('overlaySettlementQueueRef.current');
    expect(queueBody).toContain('.then(() => settleOverlayEntryInBackend(fieldName, entry, action, acceptedValue))');
    expect(queueBody).toContain('overlaySettlementQueueRef.current = queuedSettlement.catch(() => {});');
  });

  it('пропозиції будує той самий розкладач, що й форма адміна', () => {
    expect(formSource).toContain('fieldMap: buildOverlayFieldEntries(rawValue)');
  });

  it('рядок пропозиції — справжній інпут зі стрілкою на searchId', () => {
    // Пропозицію можна поправити перед «ОК» (зайвий пробіл, плюс), а стрілка
    // відкриває її запис в індексі — ключ туди завів сам шар.
    expect(formSource).toContain('onChange={e => setOverlayEntryDraftValue(field.name, entry, e.target.value)}');
    expect(formSource).not.toContain('value={entry.value}\n                      readOnly');
    expect(formSource).toContain('onClick={() => handleOpenSearchIdBackend(field.name, entry.value)}');
    // В анкету їде виправлене, а з шару й індексу знімається надіслане.
    expect(formSource).toContain('adoptOverlayValue(fieldName, acceptedValue);');
  });

  it('відхилене лишається відхиленим і після перечитування шарів', () => {
    // Скидання висіло ще й на пропсі, а пропс перебудовується щоразу, коли
    // `EditProfile` перечитує шари: прибраний хрестиком рядок повертався сам.
    expect(formSource).toContain('setDismissedOverlayEntries({});\n    setOverlayEntryDrafts({});\n  }, [state?.userId]);');
    expect(formSource).toContain('if (typeof refreshOverlayForEditor === \'function\') await refreshOverlayForEditor();');
  });

  it('підпис поля стоїть над першим рядком, а не над кожним', () => {
    // Два телефони давали два однакові «Телефон», і кожен з'їдав рядок екрана.
    expect(formSource).toContain('{idx === 0 && (\n                          <Hint fieldName={field.name} isActive={value}>');
  });
});
