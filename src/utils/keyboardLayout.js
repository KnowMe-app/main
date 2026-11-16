/**
 * Текст, набраний не в тій розкладці: «Jkmuf» замість «Ольга», «щдпф» замість
 * «olga».
 *
 * Найчастіша причина порожньої видачі на телефоні з двома мовами клавіатури —
 * людина набрала імʼя, не перемкнувши мову. Пошук чесно не знаходить «Jkmuf»,
 * і екран каже «Немає доступних профілів» там, де анкети є. Порожня видача
 * пропонує той самий запит в іншій розкладці (`suggestLayoutFix`), а не
 * перемикає мовчки: «Jkmuf» буває й справжнім ніком.
 *
 * Розкладки — українська ЙЦУКЕН і англійська QWERTY (стандартні в Android і
 * iOS). Російська відрізняється кількома клавішами (ы/і, э/є, ъ/ї) — їх
 * перетворення теж ловить як українські літери, а варіанти імені
 * (`utils/nameVariants`) доведуть решту.
 */

const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const UK_KEYS = 'йцукенгшщзхїфівапролджєячсмитьбюʼ';

const EN_TO_UK = new Map();
const UK_TO_EN = new Map();
[...EN_KEYS].forEach((enChar, index) => {
  const ukChar = UK_KEYS[index];
  EN_TO_UK.set(enChar, ukChar);
  UK_TO_EN.set(ukChar, enChar);
});
// Російські клавіші на тих самих місцях.
[['ы', 's'], ['э', "'"], ['ъ', ']'], ['ё', '`']].forEach(([ruChar, enChar]) => UK_TO_EN.set(ruChar, enChar));

const convertWith = (text, table) => [...String(text || '')].map(char => {
  const lower = char.toLowerCase();
  const mapped = table.get(lower);
  if (mapped === undefined) return char;
  return char === lower ? mapped : mapped.toUpperCase();
}).join('');

const CYRILLIC_RE = /[а-яґєіїёыэъ]/i;
const LATIN_RE = /[a-z]/i;
const CYRILLIC_LETTER_RE = /[а-яґєіїёыэъʼ'-]/i;

const LATIN_VOWELS = /[aeiouy]/gi;
const CYRILLIC_VOWELS = /[аеєиіїоуюяыэё]/gi;
const vowelShare = (text, pattern) => {
  const letters = text.replace(/[\s'ʼ-]/g, '');
  if (!letters.length) return 0;
  return (letters.match(pattern) || []).length / letters.length;
};

// Справжнє слово набране мовою свого письма має голосні; набране не в тій
// розкладці — майже ні («Jkmuf», «щдпф»), а після перетворення — має. Без
// цієї проби «Smith» без результату пропонував би шукати «іьшер».
const looksMistyped = (original, originalVowels, converted, convertedVowels) =>
  vowelShare(original, originalVowels) < 0.3 && vowelShare(converted, convertedVowels) >= 0.25;

/**
 * Той самий запит в іншій розкладці, коли він схожий на слово тієї мови, —
 * або `''`. Лише для одного-двох слів із літер: контакт, число, посилання
 * виправляти нема чого.
 */
export const suggestLayoutFix = rawValue => {
  const text = String(rawValue || '').trim();
  if (text.length < 3 || text.length > 40 || /\d|@|\/|\s{2,}/.test(text)) return '';
  if (text.split(/\s+/).length > 2) return '';
  const hasCyrillic = CYRILLIC_RE.test(text);
  const hasLatin = LATIN_RE.test(text);
  if (hasCyrillic === hasLatin) return '';

  if (hasLatin) {
    const converted = convertWith(text, EN_TO_UK);
    // Усе, крім пробілу, мусить стати кириличною літерою: «olga.k» з крапкою
    // дав би «щдпфюл» — це нік, а не імʼя в чужій розкладці.
    const letters = converted.replace(/\s/g, '');
    if (![...letters].every(char => CYRILLIC_LETTER_RE.test(char))) return '';
    // Перша літера імені не буває мʼяким знаком чи апострофом.
    if (/^[ьʼ']/i.test(letters)) return '';
    // Мʼякий знак і апостроф після голосної в слові не бувають.
    if (/[аеєиіїоуюя][ьʼ']/i.test(letters)) return '';
    return looksMistyped(text, LATIN_VOWELS, converted, CYRILLIC_VOWELS) ? converted : '';
  }

  const converted = convertWith(text, UK_TO_EN);
  if (!/^[a-z]+( [a-z]+)?$/i.test(converted)) return '';
  return looksMistyped(text, CYRILLIC_VOWELS, converted, LATIN_VOWELS) ? converted : '';
};
