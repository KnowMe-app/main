import { countryNameUk, foldLocationKey, listCountryNames, resolveCountryCode } from './profileNormalization';

/*
 * Пошук програм за країною: «Грузія», «програми в Грузії», «Кіпр» (16.11).
 *
 * Донорка шукає не людину, а умови — і насамперед де програма. Місце
 * програми (`program.location`) агенція пише сама вільним текстом («Тбілісі,
 * Грузія; Київ»), і жоден індекс його не знає, тож пошук за ним — це звірка
 * програм опублікованих власників (`matchingFeedIndex`, ролі
 * `PROGRAMS_OWNER_ROLES`) з назвами країни. Запит упізнається лише як
 * країна з довідника (`resolveCountryCode`), з необовʼязковим «програми»
 * й прийменником і у відмінку («Грузії», «Польщі», «Мексиці»): імʼя людини
 * сюди не потрапляє, тож дорогого читання програм на звичайному пошуку немає.
 */

const FILLER_WORDS = new Set([
  'програма', 'програми', 'програм', 'програмою', 'програмах', 'program', 'programs',
  'в', 'у', 'на', 'з', 'із', 'зі', 'до', 'для', 'in', 'to',
]);

// Відмінок → називний: «Грузії» → «Грузія», «Польщі» → «Польща», «Мексиці» →
// «Мексика», «Кіпрі» → «Кіпр». Кандидатів кілька, вирішує довідник.
const NOMINATIVE_REPLACEMENTS = [
  ['ії', 'ія'], ['ї', 'я'], ['щі', 'ща'], ['ці', 'ка'], ['зі', 'га'], ['ці', 'ця'],
  ['і', 'а'], ['і', 'я'], ['і', ''], ['и', 'а'], ['у', ''], ['ом', ''], ['ою', 'а'],
];

const resolveInflectedCountry = text => {
  const direct = resolveCountryCode(text);
  if (direct) return direct;
  const lower = text.toLowerCase();
  for (let index = 0; index < NOMINATIVE_REPLACEMENTS.length; index += 1) {
    const [ending, nominative] = NOMINATIVE_REPLACEMENTS[index];
    if (lower.length > ending.length + 2 && lower.endsWith(ending)) {
      const code = resolveCountryCode(`${lower.slice(0, lower.length - ending.length)}${nominative}`);
      if (code) return code;
    }
  }
  return '';
};

/** Країна, яку питає запит, — `{ code, uk }` — або `null`. */
export const detectProgramCountryQuery = query => {
  const raw = String(query ?? '').trim();
  if (!raw || /\d|@|\//.test(raw)) return null;
  const words = raw.split(/\s+/).filter(word => !FILLER_WORDS.has(word.toLowerCase()));
  if (!words.length || words.length > 3) return null;
  const code = resolveInflectedCountry(words.join(' '));
  return code ? { code, uk: countryNameUk(code) } : null;
};

// Основа назви для звірки з вільним текстом: «грузия» (після згортання
// `foldLocationKey` «Грузія» й «Грузия» однакові) без закінчення ловить і
// «Грузії», і «Грузією».
const countryStems = code => [...new Set(listCountryNames(code)
  .map(name => foldLocationKey(name))
  // Двобуквені аліаси («UK», «US», «РФ») у вільному тексті ловили б що
  // завгодно: «uk» сидить в «ukraine», «us» — в «cyprus».
  .filter(name => name.length >= 3)
  .map(name => (name.length > 5 ? name.slice(0, -1) : name)))];

/** Чи програма — у цій країні (місце програми чи коментар організатора). */
export const programMentionsCountry = (program, code) => {
  if (!program || !code) return false;
  const stems = countryStems(code);
  if (!stems.length) return false;
  const texts = [program.location, program.note]
    .filter(text => typeof text === 'string' && text.trim())
    .map(text => foldLocationKey(text));
  return texts.some(text => stems.some(stem => text.includes(stem)));
};
