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

// Назва країни для звірки з вільним текстом — словами, а не рядком: підрядок
// ловив «usa» в «Lausanne» й «india» в «Indiana» (ревʼю #3423). Кожне слово
// згортається `foldLocationKey` («Грузія» й «Грузия» однакові). Кирилична
// назва — основа без закінчення плюс до трьох кириличних літер відмінка
// («грузи» → «Грузії», «Грузією»; «чехи» → «Чехії»; «кипр» → «Кіпрі»),
// латинська — лише цілим словом: англійських відмінків немає.
const CYRILLIC_WORD_RE = /^[а-яґєіїёыэ]+$/u;
const INFLECTION_RE = /^[а-яґєіїёыэ]{0,3}$/u;

const splitWords = text => String(text ?? '')
  .toLowerCase()
  .replace(/[’ʼ`'"«»]/g, '')
  .split(/[^\p{L}]+/u)
  .map(word => foldLocationKey(word))
  .filter(Boolean);

const stemCyrillic = word => {
  if (word.length > 5) return word.slice(0, -1);
  if (word.length === 5 && /[аеиоуяюь]$/u.test(word)) return word.slice(0, -1);
  return word;
};

const countryPatterns = code => {
  const seen = new Set();
  return listCountryNames(code)
    .map(name => splitWords(name))
    // Двобуквені аліаси («UK», «US», «РФ») — це й займенники, й частки слів.
    .filter(words => words.length && words.join('').length >= 3)
    .filter(words => {
      const key = words.join(' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const wordMatches = (textWord, nameWord, isLast) => {
  if (textWord === nameWord) return true;
  if (!isLast || !CYRILLIC_WORD_RE.test(nameWord)) return false;
  const stem = stemCyrillic(nameWord);
  return textWord.startsWith(stem) && INFLECTION_RE.test(textWord.slice(stem.length));
};

const textMentions = (textWords, pattern) => {
  for (let start = 0; start + pattern.length <= textWords.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (!wordMatches(textWords[start + offset], pattern[offset], offset === pattern.length - 1)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

/** Чи програма — у цій країні (місце програми чи коментар організатора). */
export const programMentionsCountry = (program, code) => {
  if (!program || !code) return false;
  const patterns = countryPatterns(code);
  if (!patterns.length) return false;
  return [program.location, program.note]
    .filter(text => typeof text === 'string' && text.trim())
    .map(splitWords)
    .some(words => patterns.some(pattern => textMentions(words, pattern)));
};
