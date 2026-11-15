import {
  SEARCH_ROLE_INTENT_DICTIONARY,
  SEARCH_ROLE_INTENT_ROLES,
  buildRoleIntentRoleFilter,
  detectSearchRoleIntent,
  isRoleFilterNarrowedToIntent,
  normalizeSearchRoleIntentText,
  resolveRoleIntentFlow,
  roleIntentFilterKey,
} from '../searchRoleIntent';

describe('detectSearchRoleIntent', () => {
  test.each(
    SEARCH_ROLE_INTENT_ROLES.flatMap(role => SEARCH_ROLE_INTENT_DICTIONARY[role].map(phrase => [phrase, role])),
  )('«%s» → %s', (phrase, role) => {
    expect(detectSearchRoleIntent(phrase)).toBe(role);
  });

  test('реальний кейс 14.11: «Сурогатна мати» — намір СМ, а не імʼя', () => {
    expect(detectSearchRoleIntent('Сурогатна мати')).toBe('sm');
  });

  test('регістр, зайві пробіли, лапки й апостроф не важать', () => {
    expect(detectSearchRoleIntent('  СУРОГАТНА   МАТИ ')).toBe('sm');
    expect(detectSearchRoleIntent('«сурмама»')).toBe('sm');
    expect(detectSearchRoleIntent('"Egg Donor"')).toBe('ed');
    expect(detectSearchRoleIntent('СМ')).toBe('sm');
    expect(detectSearchRoleIntent('Surrogate')).toBe('sm');
    expect(detectSearchRoleIntent('сурогатна мати?')).toBe('sm');
    expect(normalizeSearchRoleIntentText('Мар’яна ʼ')).toBe("мар'яна '");
  });

  test('одне-два загальні слова довкола фрази не заважають', () => {
    expect(detectSearchRoleIntent('шукаю сурмама')).toBe('sm');
    expect(detectSearchRoleIntent('шукаю сурогатну маму')).toBe('sm');
    expect(detectSearchRoleIntent('потрібна донорка')).toBe('ed');
    expect(detectSearchRoleIntent('сурогатна мати для нас')).toBe('sm');
    expect(detectSearchRoleIntent('послуги сурогатного материнства')).toBeNull();
    expect(detectSearchRoleIntent('пошук агенція')).toBe('ag');
    expect(detectSearchRoleIntent('looking for egg donor')).toBe('ed');
  });

  test('понад два загальні слова — уже не категорія', () => {
    expect(detectSearchRoleIntent('шукаю потрібна сурмама для нас')).toBeNull();
  });

  test('імʼя з прізвищем шукається як раніше', () => {
    expect(detectSearchRoleIntent('Олена Сурогатна')).toBeNull();
    expect(detectSearchRoleIntent('Донор Іван')).toBeNull();
    expect(detectSearchRoleIntent('Олена')).toBeNull();
  });

  test('контакти, ID і посилання — не намір', () => {
    expect(detectSearchRoleIntent('+380501234567')).toBeNull();
    expect(detectSearchRoleIntent('0501234567')).toBeNull();
    expect(detectSearchRoleIntent('AB1234')).toBeNull();
    expect(detectSearchRoleIntent('https://instagram.com/surrogate')).toBeNull();
    expect(detectSearchRoleIntent('instagram.com/surrogate')).toBeNull();
    expect(detectSearchRoleIntent('@surrogate')).toBeNull();
    expect(detectSearchRoleIntent('donor@example.com')).toBeNull();
  });

  test('порожнє — не намір', () => {
    expect(detectSearchRoleIntent('')).toBeNull();
    expect(detectSearchRoleIntent('   ')).toBeNull();
    expect(detectSearchRoleIntent(null)).toBeNull();
  });

  test('клініки звужують «Інші» — окремого чіпа клінік немає', () => {
    expect(roleIntentFilterKey('cl')).toBe('other');
    expect(roleIntentFilterKey('sm')).toBe('sm');
    expect(roleIntentFilterKey('xx')).toBeNull();
  });
});

describe('resolveRoleIntentFlow', () => {
  test('новий акаунт без ролі, донорка й СМ на «СМ»/«донорку» — картка вибору', () => {
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: '' })).toBe('choice');
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: 'ed' })).toBe('choice');
    expect(resolveRoleIntentFlow({ intent: 'ed', viewerRole: ['sm'] })).toBe('choice');
  });

  test('батьки, агенція, клініка й адмін — одразу стрічка', () => {
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: 'ip' })).toBe('filter');
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: 'ag' })).toBe('filter');
    expect(resolveRoleIntentFlow({ intent: 'ed', viewerRole: 'ed,ag' })).toBe('filter');
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: 'cl' })).toBe('filter');
    expect(resolveRoleIntentFlow({ intent: 'sm', viewerRole: '', isAdmin: true })).toBe('filter');
  });

  test('агенція, клініка чи батьки в запиті — стрічка для будь-кого', () => {
    expect(resolveRoleIntentFlow({ intent: 'ag', viewerRole: 'ed' })).toBe('filter');
    expect(resolveRoleIntentFlow({ intent: 'ip', viewerRole: '' })).toBe('filter');
  });

  test('без наміру — нічого', () => {
    expect(resolveRoleIntentFlow({ intent: null, viewerRole: 'ip' })).toBeNull();
  });
});

describe('фільтр ролі наміру', () => {
  const ALL = ['ed', 'sm', 'ag', 'ip', 'other'];

  test('увімкнена рівно роль наміру', () => {
    expect(buildRoleIntentRoleFilter({ ed: true, sm: true, ag: false, ip: false, other: true }, 'sm', ALL))
      .toEqual({ ed: false, sm: true, ag: false, ip: false, other: false });
    expect(buildRoleIntentRoleFilter(undefined, 'cl', ALL))
      .toEqual({ ed: false, sm: false, ag: false, ip: false, other: true });
  });

  test('плашка впізнає звужену стрічку й гасне, щойно фільтр змінили', () => {
    const narrowed = buildRoleIntentRoleFilter({}, 'sm', ALL);
    expect(isRoleFilterNarrowedToIntent(narrowed, 'sm', ALL)).toBe(true);
    expect(isRoleFilterNarrowedToIntent({ ...narrowed, ag: true }, 'sm', ALL)).toBe(false);
    expect(isRoleFilterNarrowedToIntent({ ed: true, sm: true, ag: true, ip: true, other: true }, 'sm', ALL)).toBe(false);
  });
});
