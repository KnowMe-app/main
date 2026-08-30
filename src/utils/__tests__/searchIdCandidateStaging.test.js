import { MATCHING_SEARCH_ID_PREFIXES } from '../matchingSearchPrefixes';
import {
  buildSearchIdCandidateKeys,
  resolveSearchIdValueShape,
  splitSearchIdCandidateKeys,
} from '../searchKeyUtils';
import { encodeKey } from '../searchIndexCandidates';

// Те, з чим matching кличе індекс: усі префікси плюс варіант «УК СМ».
// Те, з чим індекс кличе адмін: варіант «УК СМ» будується лише для нього.
const ADMIN_OPTIONS = { includeVariants: true, includePrefixMatches: true, includeUkSmVariant: true };
// І те, з чим його кличуть усі інші: набране — звичайний текст.
const OPTIONS = { includeVariants: true, includePrefixMatches: true };

const keysFor = (rawValue, options = OPTIONS) => buildSearchIdCandidateKeys(
  encodeKey(rawValue).toLowerCase(),
  rawValue,
  MATCHING_SEARCH_ID_PREFIXES,
  options,
);

const stageFor = rawValue => splitSearchIdCandidateKeys(keysFor(rawValue), rawValue);

/**
 * Пошук читає індекс точковими `get` — по одному на кандидата. Кандидатів
 * будується стільки, скільки в індексі полів, ще й подвоєних варіантом
 * «УК СМ»: три десятки читань на запит, з яких влучає одне.
 *
 * Черга не викидає жодного ключа — вона лише відкладає ті, яких не може бути
 * за формою запиту. Тому «не знайшов» коштує рівно стільки ж, скільки коштував
 * раніше, а влучний пошук — на порядок менше.
 */
describe('черга кандидатів searchId', () => {
  it('розпізнає форму запиту', () => {
    expect(resolveSearchIdValueShape('Sm.kiev.ukr@gmail.com')).toBe('email');
    expect(resolveSearchIdValueShape('0505990799')).toBe('phone');
    expect(resolveSearchIdValueShape('+38 (050) 599-07-99')).toBe('phone');
    expect(resolveSearchIdValueShape('Дорошенко')).toBe('text');
    expect(resolveSearchIdValueShape('')).toBe('text');
  });

  it('пошту шукає в пошті — одним читанням замість півтора десятка', () => {
    const all = keysFor('Sm.kiev.ukr@gmail.com');
    const { primary, fallback } = stageFor('Sm.kiev.ukr@gmail.com');

    expect(primary).toEqual(['email_sm_dot_kiev_dot_ukr_at_gmail_dot_com']);
    expect(all.length).toBeGreaterThan(10);
    // Жоден ключ не загублено: відкладені читаються, коли перша черга порожня.
    expect([...primary, ...fallback].sort()).toEqual([...new Set(all)].sort());
  });

  it('телефон шукає в телефоні', () => {
    const { primary } = stageFor('0505990799');

    expect(primary.length).toBeGreaterThan(0);
    expect(primary.every(key => key.startsWith('phone_'))).toBe(true);
  });

  it('текст не питає ані пошти, ані телефону — там його бути не може', () => {
    const { primary, fallback } = stageFor('Дорошенко');

    expect(primary).toContain('name_дорошенко');
    expect(primary).toContain('surname_дорошенко');
    expect(primary.some(key => key.startsWith('email_'))).toBe(false);
    expect(fallback.some(key => key.startsWith('email_'))).toBe(true);
  });

  // «УК СМ» — робоча приставка адміна: тільки він заводить анкети, підписані
  // нею, і тільки йому має сенс шукати те саме без неї (і навпаки). Для решти
  // набране — звичайний текст, і додумувати до нього приставку означало б
  // подвоїти читання індексу заради ключів, яких у цього читача не буває.
  it('приставку «УК СМ» додумує лише адмінові', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();

    expect(keysFor('Дорошенко').some(key => key.includes(ukSm))).toBe(false);
    expect(keysFor('Дорошенко', ADMIN_OPTIONS)).toContain(`name_${ukSm}дорошенко`);
  });

  it('в адмінській черзі варіант лишається там, де він буває — в імені та прізвищі', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();
    const { primary } = splitSearchIdCandidateKeys(keysFor('Дорошенко', ADMIN_OPTIONS), 'Дорошенко');

    expect(primary).toContain(`name_${ukSm}дорошенко`);
    expect(primary).toContain(`surname_${ukSm}дорошенко`);
    // В інстаграмі чи телеграмі імені з позначкою агентства не буває — такі
    // ключі йдуть у другу чергу, а не в кожен пошук.
    expect(primary.some(key => key.startsWith(`instagram_${ukSm}`))).toBe(false);
  });

  it('запит, що сам починається з «УК СМ», шукається як є', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();
    const keys = keysFor('УК СМ Дорошенко');

    expect(keys).toContain(`name_${ukSm}дорошенко`);
    // Приставку не зрізають: набране — це значення, а не інструкція.
    expect(keys).not.toContain('name_дорошенко');
  });

  it('не лишає першу чергу порожньою — інакше пошук нічого б не спитав', () => {
    const keys = ['email_щось'];
    const { primary, fallback } = splitSearchIdCandidateKeys(keys, 'Дорошенко');

    expect(primary).toEqual(keys);
    expect(fallback).toEqual([]);
  });
});
