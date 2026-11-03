/**
 * Усі версії поля для картки адміна.
 *
 * Поле анкети лежить у базі скаляром або масивом версій (історія: поточна —
 * остання, `''` — поле стерли). Стрічка показує лише поточну версію, а адмін
 * мусить бачити всю історію, кожну версію у тому ж форматі, що й скаляр
 * («Незаміжня → Заміжня», а не сире `No,Yes`), і стирання теж.
 *
 * Дірки (`null`/`undefined` — так SDK добиває пропущені індекси) версіями не є
 * й пропускаються. Порожній рядок лишається: це стирання.
 */
export const ERASED_VERSION_LABEL = 'стерто';
export const VERSION_SEPARATOR = ' → ';

const isHole = value => value === undefined || value === null;

const asVersionList = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const keys = Object.keys(value);
  if (!keys.length || !keys.every(key => /^\d+$/.test(key))) return null;
  return keys
    .slice()
    .sort((left, right) => Number(left) - Number(right))
    .map(key => value[key]);
};

/** Версії поля рядками; `''` — стирання. Скаляр — одна версія, порожній — жодної. */
export const listValueVersions = value => {
  const list = asVersionList(value);
  if (!list) {
    if (isHole(value)) return [];
    const text = String(value).trim();
    return text ? [text] : [];
  }
  const versions = list
    .filter(item => !isHole(item))
    .map(item => (typeof item === 'object' ? '' : String(item).trim()));
  // Сусідні однакові версії нічого не кажуть адмінові.
  return versions.filter((item, index) => index === 0 || item !== versions[index - 1]);
};

/**
 * Версії, відформатовані тим самим `format`, що й скаляр, через стрілку.
 * Порожній результат — `''` (показувати нічого).
 */
export const formatValueVersions = (value, format = item => item) => {
  const versions = listValueVersions(value);
  if (!versions.length) return '';
  return versions
    .map(item => (item === '' ? ERASED_VERSION_LABEL : String(format(item) ?? item)))
    .join(VERSION_SEPARATOR);
};
