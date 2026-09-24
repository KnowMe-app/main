// Normalize each item before deduplication; never stringify an entire array.
export const comparisonValues = value => {
  if (Array.isArray(value)) return value.flatMap(comparisonValues);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
};

export const mergeComparisonValues = (source, target) => (
  [...new Set([...comparisonValues(target), ...comparisonValues(source)])]
);

// The personal record supersedes the old embedded comment, including an empty edit.
export const currentPersonalComment = (legacy, stored) => (
  String(stored?.text ?? legacy ?? '').trim()
);

/**
 * Поля, у яких значення — текст, а не перелік.
 *
 * Для решти кома розділяє значення (`"380…, 380…"` у legacy-записах). Тут кома
 * — частина речення: «Люблю спорт, читання» різалось на дві «версії», і після
 * перенесення анкета показувала тільки останній шматок.
 */
const FREE_TEXT_COMPARISON_KEYS = new Set(['moreInfo_main', 'allergy', 'surgeries', 'chronicDiseases']);

export const isFreeTextComparisonKey = key => FREE_TEXT_COMPARISON_KEYS.has(key);

const textVersions = value => (Array.isArray(value) ? value : [value])
  .filter(item => typeof item === 'string' && item.trim())
  .map(item => item.trim());

export const comparisonValuesForKey = (key, value) => (
  isFreeTextComparisonKey(key) ? textVersions(value) : comparisonValues(value)
);

/**
 * Дописати текст, не стираючи наявного.
 *
 * Обидва тексти лишаються поруч, через порожній рядок. Той, що вже міститься в
 * іншому, вдруге не дописується — інакше повторний дотик до того самого рядка
 * порівняння дописав би його ще раз.
 */
export const appendComparisonText = (existing, incoming) => {
  const current = String(existing || '').trim();
  const added = String(incoming || '').trim();
  if (!added || current.includes(added)) return current;
  if (!current || added.includes(current)) return added;
  return `${current}\n\n${added}`;
};

/**
 * Значення текстового поля після перенесення: уся попередня історія картки-
 * отримувача плюс нова поточна версія, у якій обидва тексти.
 *
 * Поле пишеться цілком (`saveComparisonField`), тож віддати сам рядок означало
 * б стерти версії, що вже лежать у картці.
 */
export const mergeComparisonText = (source, target) => {
  const targetVersions = textVersions(target);
  const sourceVersions = textVersions(source);
  const current = targetVersions[targetVersions.length - 1] || '';
  const incoming = sourceVersions[sourceVersions.length - 1] || '';
  const merged = appendComparisonText(current, incoming);
  if (!merged) return targetVersions;
  // Поточна — остання: злите значення мусить стати в кінець, навіть якщо
  // такий самий текст уже траплявся в історії раніше.
  return [...targetVersions.filter(version => version !== merged), merged];
};
