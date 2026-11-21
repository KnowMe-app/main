/**
 * Поля форми картки адміна: які малювати полем, а які — чіпом «Додати поле».
 *
 * На прохання власниці продукту (21.11) форма показує полями лише ті поля, що в
 * картці **є**, а решту — чіпами, найчастіше заповнювані в базі першими. Форма
 * з усіма ~60 полями була «довгою макаронею», де заповнене губилось серед
 * порожніх.
 *
 * «Є» — це ключ із будь-яким значенням, і **порожній рядок теж значення**: так
 * пишеться стерте поле (остання версія `''`), і в ньому лежить історія, яку
 * адмін має бачити. Чіпом стає лише поле, якого в записі немає зовсім
 * (`undefined` / `null`, порожній масив чи обʼєкт).
 */

export const PROFILE_FIELD_CHIPS_VISIBLE = 8;

// Керування правами — не дані анкети, а перемикачі адміна: вони стоять завжди.
export const ALWAYS_SHOWN_PROFILE_FIELDS = new Set(['accessLevel', 'canCreateProfiles', 'screenAccess']);

const isHole = value => value === undefined || value === null;

export const isProfileFieldPresent = value => {
  if (isHole(value)) return false;
  if (Array.isArray(value)) return value.some(item => !isHole(item));
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

// Роль у меншій кількості карток не дає надійної частки — тоді беремо всіх.
const MIN_ROLE_SAMPLE = 20;

/**
 * Частка карток із заповненим полем — серед карток тих самих ролей, що й ця
 * картка (найбільша з часток її ролей), а коли ролі невідомі чи рідкісні —
 * серед усіх. Поле без статистики — `-1`.
 */
export const resolveFieldFillRate = (fieldName, stats, roles = []) => {
  const entry = stats?.fields?.[fieldName];
  const totals = stats?.totals || {};
  if (!entry) return -1;
  const roleRates = roles
    .filter(role => Number(totals[role]) >= MIN_ROLE_SAMPLE)
    .map(role => Number(entry[role] || 0) / Number(totals[role]));
  if (roleRates.length) return Math.max(...roleRates);
  const all = Number(totals.all);
  return all > 0 ? Number(entry.all || 0) / all : -1;
};

/**
 * Поля за частотою заповнення, найчастіші першими. Без статистики — порядок
 * форми як є; поля, про які статистика мовчить, стоять після решти в порядку
 * форми.
 */
export const rankFieldsByFillStats = (fields, stats, roles = []) => {
  if (!stats?.fields) return fields;
  return fields
    .map((field, index) => ({ field, index, rate: resolveFieldFillRate(field?.name, stats, roles) }))
    .sort((left, right) => right.rate - left.rate || left.index - right.index)
    .map(item => item.field);
};

/**
 * Ділить поля блоку на ті, що малюються полем, і чіпи.
 *
 * `keepShown` — поля, які стоять полем незалежно від запису: відкриті чіпом у
 * цій картці та ті, що вимагають уваги (пропозиція редактора, підсвічене).
 */
export const splitProfileFormFields = (fields, state, { keepShown = new Set(), stats = null, roles = [] } = {}) => {
  const shown = [];
  const missing = [];
  fields.forEach(field => {
    const name = field?.name;
    if (ALWAYS_SHOWN_PROFILE_FIELDS.has(name) || keepShown.has(name) || isProfileFieldPresent(state?.[name])) {
      shown.push(field);
    } else {
      missing.push(field);
    }
  });
  return { shown, chips: rankFieldsByFillStats(missing, stats, roles) };
};
