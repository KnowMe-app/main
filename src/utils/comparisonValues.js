import { getCurrentValue } from '../components/getCurrentValue';

// Normalize each item before deduplication; never stringify an entire array.
export const comparisonValues = value => {
  if (Array.isArray(value)) return value.flatMap(comparisonValues);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
};

// Повтор у історії лишається там, де стоїть **останнім**: поточна версія поля
// — остання (`getCurrentValue`), і звичайний `Set`, який тримає перше входження,
// пересунув би її вглиб історії.
const uniqueKeepingLast = values => values.filter((value, index) => values.lastIndexOf(value) === index);

// Поле стерли: історія є, а остання версія — порожній рядок. Стирання —
// відповідь «цього більше немає», і перенесення її не скасовує.
const isErasedHistory = value => Array.isArray(value)
  && String(getCurrentValue(value) ?? '').trim() === ''
  && value.some(item => typeof item === 'string' && item.trim());

/**
 * Значення поля після перенесення з іншої картки (таблиця порівняння).
 *
 * Перенесене стає **на початок** історії, а значення картки-отримувача — після
 * нього, і її поточне лишається останнім, тобто поточним. У стрічці людину й
 * далі видно такою, якою вона себе заповнила, а знайдене в дублікаті (старий
 * номер, інше прізвище) лягає в історію, яку бачить адмін, і ні для кого більше
 * не показується. Доти перенесене дописувалось у кінець і саме ставало
 * поточним: картка показувала всім номер із дубліката замість того, який
 * людина вказала сама.
 *
 * Порожнє поле бере перенесене як є — зберігати поточним там нема чого.
 */
export const mergeComparisonValues = (source, target) => {
  const kept = uniqueKeepingLast(comparisonValues(target));
  const added = uniqueKeepingLast(comparisonValues(source)).filter(value => !kept.includes(value));
  const merged = [...added, ...kept];
  return isErasedHistory(target) ? [...merged, ''] : merged;
};

/**
 * Фото — навпаки: перше в переліку головне, з нього береться аватар картки
 * (`resolveMatchingCardAvatarFromProfile`). Знімки з дубліката стають після
 * власних, інакше старе фото з імпорту стало б обличчям анкети.
 */
export const appendComparisonValues = (source, target) => (
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
 * Значення текстового поля після перенесення: поточний текст картки-джерела
 * стає найстаршою версією, а вся історія картки-отримувача — після нього, з її
 * поточним текстом останнім. Правило те саме, що в `mergeComparisonValues`:
 * перенесене бачить адмін, а не стрічка.
 *
 * Обидва тексти тут колись зливались в одну нову поточну версію — і «Про
 * себе» з дубліката ставало видно всім поруч із тим, що людина написала сама.
 *
 * Поле пишеться цілком (`saveComparisonField`), тож віддати сам рядок означало
 * б стерти версії, що вже лежать у картці.
 */
export const mergeComparisonText = (source, target) => {
  const targetVersions = textVersions(target);
  const sourceVersions = textVersions(source);
  const incoming = sourceVersions[sourceVersions.length - 1] || '';
  const merged = !incoming || targetVersions.includes(incoming) ? targetVersions : [incoming, ...targetVersions];
  return isErasedHistory(target) ? [...merged, ''] : merged;
};
