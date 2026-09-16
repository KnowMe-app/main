import fs from 'fs';
import path from 'path';

import { applyOverlayToCard } from 'utils/multiAccountEdits';

// Доповнена картка мусить показувати доповнене — тому, хто його зробив.
//
// Читач знаходив людину, дописував їй прізвище чи номер у формі доповнення,
// шукав ту саму людину вдруге — і бачив ту саму картку без жодного свого слова:
// оверлей лежав у `multiData/edits`, а видача малювала саму лише картку. Звідси
// й друге: набране в пошуку значення не знаходило картку взагалі, бо дописане
// не потрапляло в `searchId`.
describe('список показує власне доповнення читача', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('питає про доповнення лише показані картки й лише того, хто їх пише', () => {
    expect(source).toContain("if (isAdmin || !access.canCreateProfiles || !editorUserId) return undefined;");
    // Читач — це `ownerId`, а не `auth.currentUser`: на першому рендері того
    // ще немає, а перезапустити ефект нема на що, тож перелік не читався б
    // узагалі.
    expect(source).toContain('const editorUserId = ownerId;');
    expect(source).toContain('remotelyIndexedCardUserIds: currentRemoteOverlayCardIds,');
    // Памʼять запитаних id: перемальовування видачі не коштує другого круга.
    expect(source).toContain('const requested = requestedOwnOverlayIdsRef.current;');
    expect(source).toContain('cardUserIds.forEach(userId => requested.add(userId));');
  });

  // Стрічка — це сотні рядків, і читання «на кожну картку» тут коштує рівно
  // те, від чого її відмивали. Тож вона питає лише про ті картки, які перелік
  // власних доповнень (`multiData/editsByEditor` плюс памʼять браузера) уже
  // назвав, а видача пошуку чекає на цей перелік, щоб не переписувати вже
  // наявні позначки під час ледачої міграції.
  it('у стрічці питає лише про картки з переліку власних доповнень', () => {
    expect(source).toContain('if (!currentOwnerOverlayCardIds || !currentRemoteOverlayCardIds) return undefined;');
    expect(source).toContain('.filter(userId => isSearching || currentOwnerOverlayCardIds.has(userId));');
    expect(source).toContain('getOwnOverlayCardIndex(editorUserId)');
  });

  it('не приймає приватний стан або відповідь від попереднього власника', () => {
    expect(source).toContain('requestedOwnOverlayIdsRef.current = new Set();');
    expect(source).toContain('setOwnOverlayFieldsByCardId({});');
    expect(source).toContain('setOwnOverlayCardIds(null);');
    expect(source).toContain('ownOverlayOwnerIdRef.current !== editorUserId');
    expect(source).toContain('if (ownOverlayStateOwnerId !== ownerId) return user;');
  });

  // Повна анкета приїжджає такою, якою її бачать усі, і накриває собою картку
  // (`{ ...user, ...fullProfile }`). Тож шар кладеться ще раз — уже поверх неї,
  // — інакше дописаний телефон зникав би рівно тоді, коли контакти й читають.
  it('кладе шар і поверх догідратованої анкети', () => {
    expect(source).toContain('() => feedSource.map(user => withOwnEdits(withLazyPhotos(user))),');
    expect(source).toContain('const activeProfileWithLazyPhotos = withOwnEdits(withLazyPhotos(activeProfile));');
  });

  // Перелік власних доповнень не всезнаючий: у базі він лежить під
  // `multiData/editsByEditor`, правила на який викочуються руками, а поза базою
  // — у памʼяті цього браузера. Тож на іншому пристрої (і всюди, поки правила
  // не викотили) дописане було видно рівно в одному місці — у самій формі
  // доповнення. Дотик до картки знімає це питання й не платить за стрічку.
  it('питає про доповнення й тоді, коли читач відкрив саме цю картку', () => {
    expect(source).toContain('ensureOwnOverlayRef.current(userId);');
    expect(source).toContain('getOwnOverlayFieldsForCards({ editorUserId, cardUserIds: [cardUserId] })');
    // Питання ставиться до перевірки «це проєкція?»: дотик означає «покажи цю
    // анкету» незалежно від того, чи треба ще дочитувати вузли.
    const ensureFullProfile = source.slice(
      source.indexOf('const ensureFullProfile = React.useCallback(user => {'),
      source.indexOf('const withLazyPhotos = React.useCallback(user => {'),
    );
    expect(ensureFullProfile.indexOf('ensureOwnOverlayRef.current(userId);'))
      .toBeLessThan(ensureFullProfile.indexOf('if (!isMatchingSummaryCard(user)) return Promise.resolve();'));
    // Памʼять дотиків окрема від памʼяті стрічки: та лишається поставленою й
    // після порожньої відповіді, а дотик мусить мати право спитати про картку,
    // якої перелік не називав. Відмова знімає позначку — читання, яке впало,
    // повторюється наступним дотиком.
    expect(source).toContain('touchedOwnOverlayIdsRef.current.has(cardUserId)');
    expect(source).toContain('touchedOwnOverlayIdsRef.current.delete(cardUserId);');
    expect(source).toContain('touchedOwnOverlayIdsRef.current = new Set();');
  });

  it('накладає доповнення на картку, а не переписує кеш', () => {
    expect(source).toContain('return applyOverlayToCard(user, fields);');
    // Кеш карток лишається кешем карток: оверлей лягає на показ, а не в
    // `updateCard` — інакше він поїхав би в чужу видачу і в стрічку.
    const overlayMemo = source.slice(
      source.indexOf('const feedSource = useMemo(() => {'),
      source.indexOf('const renderedCards = filteredUsers;'),
    );
    expect(overlayMemo).not.toContain('updateCard(');
    expect(source).toContain('userData: canonicalUser ? withLazyPhotos(canonicalUser) : { userId: user.userId },');
  });

  it('передає канонічну картку реакціям у відкритих деталях', () => {
    expect(source).toContain('canonicalUserData={canonicalUserData}');
    expect(source).toContain('<BtnDislike userId={user.userId} userData={canonicalUserData}');
    expect(source).toContain('<BtnFavorite userId={user.userId} userData={canonicalUserData}');
  });

  // Стрічка з ініціалом прізвища — це те, що видно поза стрічкою; дописане
  // читачем прізвище лягає поверх нього як наступна версія поля.
  it('дописане стає поточною версією поля картки', () => {
    const card = { userId: 'TG0014', name: 'Виолетта', surname: 'Б.' };
    const enriched = applyOverlayToCard(card, { surname: { added: ['Бугаренко'] } });

    expect(enriched.surname).toEqual(['Б.', 'Бугаренко']);
  });
});

// Пошук відповідає на два питання, і друге — «такої ще немає». Відповідь на
// нього стояла чіпом над видачею, а набране, яке вона несе в нову картку, читач
// бачив аж у формі.
describe('заготовка нової картки першим рядком видачі', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('розкладає набране тим самим розпізнавачем, що й пошук', () => {
    expect(source).toContain('const detected = detectSearchParams(trimmed);');
    // Нерозпізнане — це імʼя: так каже сам розпізнавач, і заготовка не вигадує
    // власного правила.
    expect(source).toContain("const field = detected?.key || 'name';");
    expect(source).toContain("const label = getFieldLabel(pickerFields.find(item => item?.name === field), language) || uiText('Запит', language);");
  });

  it('називає зайняте значення зайнятим, а не мовчить про нього', () => {
    expect(source).toContain("const claimsIdentity = field !== 'name' && field !== 'surname' && field !== 'userId';");
    expect(source).toContain('const taken = claimsIdentity && visibleUsers.length > 0;');
    expect(source).toContain('Це значення вже стоїть у знайденій картці — нова відкриється без нього');
  });

  it('веде тим самим шляхом, що й чіп «Створити нову»', () => {
    expect(source).toContain('<QueryDraftCard data-testid="query-draft-card">');
    expect(source).toContain('onClick={handleCreateFromQuery}');
    expect(source).toContain('onSelect: handleCreateFromQuery,');
    expect(source).toContain('createFromQuery: searchQuery.trim(),');
  });
});
