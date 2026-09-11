import {
  buildSearchIdCandidateKeys,
  splitSearchIdCandidateKeys,
} from '../searchKeyUtils';
import { encodeKey } from '../searchIndexCandidates';

// Те, з чим індекс кличе адмін: варіант «УК СМ» будується лише для нього.
const ADMIN_OPTIONS = { includeVariants: true, includePrefixMatches: true, includeUkSmVariant: true };
// І те, з чим його кличуть усі інші: набране — звичайний текст.
const OPTIONS = { includeVariants: true, includePrefixMatches: true };

const exactKeyFor = rawValue => encodeKey(rawValue).toLowerCase();

const keysFor = (rawValue, options = OPTIONS) => buildSearchIdCandidateKeys(
  exactKeyFor(rawValue),
  rawValue,
  options,
);

const stageFor = (rawValue, options = OPTIONS) =>
  splitSearchIdCandidateKeys(keysFor(rawValue, options), exactKeyFor(rawValue));

/**
 * Пошук читає індекс точковими `get` — по одному на кандидата.
 *
 * Поки поле стояло в ключі (`{поле}_{значення}`), кандидатів будувалось
 * стільки, скільки в індексі полів, ще й подвоєних варіантом «УК СМ»: три
 * десятки читань на запит, з яких влучало одне. Тепер ключ — саме значення,
 * тож кандидат на запит один, а черга ділить не поля, а **написання**: точне
 * набране проти здогадок про нього.
 *
 * Друга черга не викидається — вона читається, коли перша не знайшла нічого.
 */
describe('черга кандидатів searchId', () => {
  it('на звичайний запит — один ключ, одне читання', () => {
    expect(keysFor('Sm.kiev.ukr@gmail.com')).toEqual(['sm_dot_kiev_dot_ukr_at_gmail_dot_com']);
    expect(keysFor('Дорошенко')).toEqual(['дорошенко']);
  });

  it('перша черга — точне набране, друга — здогадки про написання', () => {
    const all = keysFor('0505990799');
    const { primary, fallback } = stageFor('0505990799');

    expect(primary).toEqual(['0505990799']);
    // Номер, набраний із нуля, шукається ще й у міжнародній формі.
    expect(fallback).toContain('380505990799');
    // Жоден ключ не загублено: відкладені читаються, коли перша черга порожня.
    expect([...primary, ...fallback].sort()).toEqual([...new Set(all)].sort());
  });

  // «УК СМ» — робоча приставка адміна: тільки він заводить анкети, підписані
  // нею, і тільки йому має сенс шукати те саме без неї (і навпаки). Для решти
  // набране — звичайний текст, і додумувати до нього приставку означало б
  // зайве читання індексу заради ключа, якого в цього читача не буває.
  it('приставку «УК СМ» додумує лише адмінові', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();

    expect(keysFor('Дорошенко').some(key => key.includes(ukSm))).toBe(false);
    expect(keysFor('Дорошенко', ADMIN_OPTIONS)).toContain(`${ukSm}дорошенко`);
  });

  it('варіант «УК СМ» стоїть у другій черзі — набране важливіше за здогадку', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();
    const { primary, fallback } = stageFor('Дорошенко', ADMIN_OPTIONS);

    expect(primary).toEqual(['дорошенко']);
    expect(fallback).toContain(`${ukSm}дорошенко`);
  });

  it('запит, що сам починається з «УК СМ», шукається як є', () => {
    const ukSm = encodeKey('УК СМ ').toLowerCase();
    const { primary, fallback } = stageFor('УК СМ Дорошенко', ADMIN_OPTIONS);

    // Приставку не зрізають: набране — це значення, а не інструкція.
    expect(primary).toEqual([`${ukSm}дорошенко`]);
    // Але адмінові пропонується й те саме без приставки — другою чергою.
    expect(fallback).toContain('дорошенко');
  });

  it('не лишає першу чергу порожньою — інакше пошук нічого б не спитав', () => {
    const keys = ['щось'];
    const { primary, fallback } = splitSearchIdCandidateKeys(keys, 'інше');

    expect(primary).toEqual(keys);
    expect(fallback).toEqual([]);
  });
});
