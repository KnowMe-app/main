import { MATCHING_SEARCH_ID_PREFIXES } from '../matchingSearchPrefixes';
import {
  buildSearchIdCandidateKeys,
  resolveSearchIdValueShape,
  splitSearchIdCandidateKeys,
} from '../searchKeyUtils';
import { encodeKey } from '../searchIndexCandidates';

// Те, з чим matching кличе індекс: усі префікси плюс варіант «УК СМ».
const OPTIONS = { includeVariants: true, includePrefixMatches: true };

const keysFor = rawValue => buildSearchIdCandidateKeys(
  encodeKey(rawValue).toLowerCase(),
  rawValue,
  MATCHING_SEARCH_ID_PREFIXES,
  OPTIONS,
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

  it('пошту шукає в пошті — одним читанням замість трьох десятків', () => {
    const all = keysFor('Sm.kiev.ukr@gmail.com');
    const { primary, fallback } = stageFor('Sm.kiev.ukr@gmail.com');

    expect(primary).toEqual(['email_sm_dot_kiev_dot_ukr_at_gmail_dot_com']);
    expect(all.length).toBeGreaterThan(20);
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

  it('варіант «УК СМ» лишає лише там, де він буває — в імені та прізвищі', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();
    const { primary } = stageFor('Дорошенко');

    expect(primary).toContain(`name_${ukSm}дорошенко`);
    expect(primary).toContain(`surname_${ukSm}дорошенко`);
    // В інстаграмі чи телеграмі імені з позначкою агентства не буває — такі
    // ключі йдуть у другу чергу, а не в кожен пошук.
    expect(primary.some(key => key.startsWith(`instagram_${ukSm}`))).toBe(false);
  });

  it('не лишає першу чергу порожньою — інакше пошук нічого б не спитав', () => {
    const keys = ['email_щось'];
    const { primary, fallback } = splitSearchIdCandidateKeys(keys, 'Дорошенко');

    expect(primary).toEqual(keys);
    expect(fallback).toEqual([]);
  });
});
