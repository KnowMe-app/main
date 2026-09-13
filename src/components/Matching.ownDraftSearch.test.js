import fs from 'fs';
import path from 'path';

import { findMatchingProfileMutations } from 'utils/profileCreationSearch';

/**
 * Власна чернетка, яку щойно завели з видачі пошуку, мусить у цій видачі й
 * зʼявитись.
 *
 * Чернетки немає в `searchId` — індекс знає лише опубліковані картки, — тож
 * запит її не знаходив узагалі: людина заводила картку просто з рядка «Бугаренко
 * не знайдено», закривала форму й поверталась у ту саму видачу без неї. Виглядало
 * це так, ніби картка не збереглась.
 *
 * Доливати ж у видачу **всі** власні чернетки не можна: це показало б читачеві
 * його ж картки замість тієї людини, яку він шукав, і порахувало б їх у
 * «Знайдено N». Тож сюди потрапляють лише ті, що збіглися з набраним, — тим
 * самим розпізнавачем поля, що й сам пошук.
 */
describe('Matching: власні чернетки у видачі пошуку', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('доливає у видачу лише ті власні чернетки, що збіглися із запитом', () => {
    expect(source).toContain("import { findMatchingProfileMutations } from 'utils/profileCreationSearch';");
    expect(source).toContain('const personalDraftSearchMatches = useMemo(() => {');
    expect(source).toContain("if (viewMode !== 'search') return EMPTY_USERS;");
    expect(source).toContain('const detected = detectSearchParams(searchQuery.trim());');
    expect(source).toContain('personalCreateProfiles.map(profile => ({ cardId: profile.userId, data: profile })),');
  });

  it('ставить збіглі чернетки у видачу, а всю їх пачку лишає самій деці', () => {
    expect(source).toContain("users: viewMode === 'search'\n      ? [...personalDraftSearchMatches, ...users]");
    // Дека за замовчуванням і далі бере всю пачку власних чернеток — але лише
    // після першого вікна публічних карток.
    expect(source).toContain('      : [...(initialPublicWindowComplete ? personalCreateProfiles : EMPTY_USERS), ...users],');
  });

  it('збігом вважає те саме, що й пошук: значення поля, яке розпізнав рядок', () => {
    const drafts = [
      { cardId: 'draft-1', data: { userId: 'draft-1', surname: 'Бугаренко' } },
      { cardId: 'draft-2', data: { userId: 'draft-2', surname: 'Марчук' } },
    ];

    expect(findMatchingProfileMutations(drafts, { key: 'surname', value: 'бугаренко' }))
      .toEqual([drafts[0]]);
    expect(findMatchingProfileMutations(drafts, { key: 'surname', value: 'Коваленко' })).toEqual([]);
  });
});
