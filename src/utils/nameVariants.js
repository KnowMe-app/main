/**
 * Варіанти імені для пошуку: та сама людина записана в базі різними
 * абетками й мовами.
 *
 * Анкети в базі заведені українською, російською й латиницею впереміш —
 * «Ольга», «Olga», «Olha», «Наталья», «Наталія». Ключ `searchId` — саме
 * значення, тож запит «Olga» знаходив лише тих, хто записав себе рівно так, а
 * «Наталія» не знаходила «Наталью». Тижневий звіт «Без результату» (15.11)
 * ловить саме такі запити.
 *
 * Варіантів два роди:
 * - **словник** поширених імен (групи рівнозначних написань): транслітерація
 *   сама «Ольгу» з «Olga» не відновить — мʼякого знака в латиниці немає;
 * - **транслітерація** туди й назад для решти (прізвища, рідкісні імена):
 *   «Коваленко» ↔ «Kovalenko».
 *
 * Варіант — лише ще один точковий ключ `searchId`, тож ціна — кілька
 * паралельних читань на запит-слово, а не сканування індексу. Стеля —
 * `NAME_VARIANT_LIMIT`.
 */

export const NAME_VARIANT_LIMIT = 8;

// Групи рівнозначних написань. Порядок усередині групи неважливий; усе в
// нижньому регістрі, як і ключі `searchId`.
const NAME_GROUPS = [
  ['ольга', 'olga', 'olha', 'олга'],
  ['олена', 'елена', 'алена', 'olena', 'elena', 'alena'],
  ['наталія', 'наталья', 'наталия', 'natalia', 'nataliia', 'natalya', 'natalja'],
  ['юлія', 'юлия', 'yulia', 'yuliia', 'julia', 'iuliia', 'yuliya'],
  ['анна', 'ганна', 'anna', 'hanna', 'ania'],
  ['марія', 'мария', 'maria', 'mariia', 'mariya'],
  ['катерина', 'екатерина', 'kateryna', 'katerina', 'ekaterina', 'yekaterina'],
  ['вікторія', 'виктория', 'viktoriia', 'viktoria', 'victoria', 'viktoriya'],
  ['тетяна', 'татьяна', 'tetiana', 'tetyana', 'tatiana', 'tatyana'],
  ['ірина', 'ирина', 'iryna', 'irina'],
  ['світлана', 'светлана', 'svitlana', 'svetlana'],
  ['оксана', 'oksana'],
  ['людмила', 'liudmyla', 'lyudmila', 'ludmila', 'lyudmyla'],
  ['дарина', 'дарья', 'дарія', 'daryna', 'daria', 'darya', 'dariia'],
  ['анастасія', 'анастасия', 'anastasiia', 'anastasia', 'anastasiya'],
  ['аліна', 'алина', 'alina'],
  ['яна', 'yana', 'iana'],
  ['христина', 'кристина', 'khrystyna', 'kristina', 'christina', 'krystyna'],
  ['валентина', 'valentyna', 'valentina'],
  ['галина', 'halyna', 'galina'],
  ['надія', 'надежда', 'nadiia', 'nadia', 'nadiya', 'nadezhda'],
  ['любов', 'любовь', 'liubov', 'lyubov'],
  ['віра', 'вера', 'vira', 'vera'],
  ['інна', 'инна', 'inna'],
  ['алла', 'alla'],
  ['софія', 'софия', 'sofiia', 'sofia', 'sofiya', 'sophia'],
  ['діана', 'диана', 'diana'],
  ['вероніка', 'вероника', 'veronika', 'veronica'],
  ['лілія', 'лилия', 'liliia', 'lilia', 'liliya'],
  ['євгенія', 'евгения', 'yevheniia', 'evgenia', 'evgeniya', 'ievgeniia'],
  ['ксенія', 'ксения', 'kseniia', 'ksenia', 'kseniya'],
  ['майя', 'maya', 'maia'],
  ['марина', 'maryna', 'marina'],
  ['олександра', 'александра', 'oleksandra', 'alexandra', 'aleksandra'],
  ['ольга', 'olya', 'оля'],
  ['інесса', 'инесса', 'inessa'],
  ['кіра', 'кира', 'kira'],
  ['поліна', 'полина', 'polina'],
  ['єлизавета', 'елизавета', 'yelyzaveta', 'elizaveta', 'yelizaveta'],
  ['антоніна', 'антонина', 'antonina'],
  ['лариса', 'larysa', 'larisa'],
  ['вікторія', 'vika', 'віка', 'вика'],
  ['каріна', 'карина', 'karina'],
  ['ангеліна', 'ангелина', 'anhelina', 'angelina'],
  ['мілана', 'милана', 'milana'],
];

const NAME_INDEX = (() => {
  const index = new Map();
  NAME_GROUPS.forEach(group => {
    group.forEach(name => {
      const known = index.get(name) || new Set();
      group.forEach(variant => known.add(variant));
      index.set(name, known);
    });
  });
  return index;
})();

// Офіційна транслітерація (КМУ 2010) з поправкою: на початку слова
// «є/ї/й/ю/я» дають «ye/yi/y/yu/ya», усередині — «ie/i/i/iu/ia».
const UK_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: ['ye', 'ie'], ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: ['yi', 'i'], й: ['y', 'i'], к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: ['yu', 'iu'], я: ['ya', 'ia'], 'ʼ': '', "'": '', '’': '',
};

// Російська — як її пишуть у паспортах і соцмережах: «г» — g, «и» — i.
const RU_TO_LATIN = {
  ...UK_TO_LATIN,
  г: 'g', е: 'e', и: 'i', й: 'y', ы: 'y', э: 'e', ё: 'e', ъ: '', щ: 'shch', ю: 'yu', я: 'ya',
};

const toLatin = (word, table) => {
  let result = '';
  [...word].forEach((char, position) => {
    const mapped = table[char];
    if (mapped === undefined) {
      result += char;
      return;
    }
    if (Array.isArray(mapped)) {
      result += position === 0 ? mapped[0] : mapped[1];
      return;
    }
    result += mapped;
  });
  return result;
};

// Латиниця → кирилиця: найдовші сполуки першими. Двозначне («h» — г чи х,
// «i» — і чи и) дає дві версії: українську й російську.
const LATIN_DIGRAPHS = [
  ['shch', 'щ', 'щ'], ['sch', 'щ', 'щ'], ['zh', 'ж', 'ж'], ['kh', 'х', 'х'], ['ch', 'ч', 'ч'],
  ['sh', 'ш', 'ш'], ['ts', 'ц', 'ц'], ['ya', 'я', 'я'], ['ia', 'я', 'я'], ['yu', 'ю', 'ю'],
  ['iu', 'ю', 'ю'], ['ye', 'є', 'е'], ['ie', 'є', 'е'], ['yi', 'ї', 'и'],
];
const LATIN_LETTERS = {
  a: ['а', 'а'], b: ['б', 'б'], c: ['к', 'к'], d: ['д', 'д'], e: ['е', 'е'], f: ['ф', 'ф'],
  g: ['г', 'г'], h: ['г', 'х'], i: ['і', 'и'], j: ['й', 'й'], k: ['к', 'к'], l: ['л', 'л'],
  m: ['м', 'м'], n: ['н', 'н'], o: ['о', 'о'], p: ['п', 'п'], q: ['к', 'к'], r: ['р', 'р'],
  s: ['с', 'с'], t: ['т', 'т'], u: ['у', 'у'], v: ['в', 'в'], w: ['в', 'в'], x: ['кс', 'кс'],
  y: ['и', 'и'], z: ['з', 'з'],
};

const toCyrillic = (word, variant) => {
  const column = variant === 'ru' ? 2 : 1;
  let result = '';
  let position = 0;
  while (position < word.length) {
    let digraph = null;
    for (let index = 0; index < LATIN_DIGRAPHS.length; index += 1) {
      if (word.startsWith(LATIN_DIGRAPHS[index][0], position)) {
        digraph = LATIN_DIGRAPHS[index];
        break;
      }
    }
    if (digraph) {
      result += digraph[column];
      position += digraph[0].length;
      continue;
    }
    const char = word[position];
    const letter = LATIN_LETTERS[char];
    // «y» у кінці слова — це «й» («Andriy»), а не «и».
    if (char === 'y' && position === word.length - 1 && position > 0) {
      result += 'й';
    } else {
      result += letter ? letter[column - 1] : char;
    }
    position += 1;
  }
  return result;
};

const CYRILLIC_RE = /[а-яґєіїёыэъ]/;
const LATIN_RE = /[a-z]/;
// Одне слово з літер (з апострофом чи дефісом усередині): «Ольга»,
// «Анна-Марія», «Dar'ya». Цифри, «@», крапка — це вже контакт, не імʼя.
const NAME_WORD_RE = /^[\p{L}][\p{L}'ʼ’-]{1,29}$/u;

/** Чи схожий запит на одне слово-імʼя, для якого має сенс шукати варіанти. */
export const isNameLikeQuery = rawValue => NAME_WORD_RE.test(String(rawValue || '').trim());

/**
 * Інші написання того самого імені — без самого набраного, у нижньому
 * регістрі, не більше `limit`. Порожньо, коли запит не схожий на імʼя.
 */
export const listNameVariants = (rawValue, { limit = NAME_VARIANT_LIMIT } = {}) => {
  const word = String(rawValue || '').trim().toLowerCase();
  if (!isNameLikeQuery(word)) return [];
  const isCyrillic = CYRILLIC_RE.test(word);
  const isLatin = LATIN_RE.test(word);
  // Змішане письмо («Оlga» з кириличною «О») — одруківка розкладки, а не
  // імʼя; варіантів не вигадуємо.
  if (isCyrillic === isLatin) return [];

  const variants = [];
  const push = value => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized && normalized !== word && !variants.includes(normalized)) variants.push(normalized);
  };

  // Словник першим: він знає мʼякі знаки й усталені написання.
  (NAME_INDEX.get(word) || []).forEach(push);
  if (isCyrillic) {
    push(toLatin(word, UK_TO_LATIN));
    push(toLatin(word, RU_TO_LATIN));
  } else {
    push(toCyrillic(word, 'uk'));
    push(toCyrillic(word, 'ru'));
  }
  return variants.slice(0, Math.max(0, limit));
};
