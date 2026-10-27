/*
 * Фільтри стрічки, які питають про **людину**: сімейний стан, пологи,
 * кесарів, резус, вік, ІМТ. Їх має лише особиста анкета (донорка, СМ) — в
 * агенції чи біологічних батьків ні сімейного стану, ні резусу немає.
 *
 * Тож вони мають сенс лише тоді, коли в деці можуть бути особисті анкети:
 * «Тип профілю» пропонує читачеві донорок чи СМ і хоч одну з них увімкнено.
 * Донорка, яка гортає агенції й батьків, бачила «Сімейний стан», «Пологи» й
 * «Резус» — чіпи, які або не міняли нічого, або (знявши «Не вказано»)
 * вичищали всю деку, бо в агенції цих полів немає. Агенція, яка обрала самих
 * агенцій і батьків, — так само.
 *
 * «Країна» тут не стоїть: вона є в кожної анкети.
 */
export const PERSONAL_FILTER_GROUP_NAMES = Object.freeze(['maritalStatus', 'deliveries', 'cesarean', 'rh', 'age', 'bmi']);

const PERSONAL_ROLE_FILTER_KEYS = Object.freeze(['ed', 'sm']);
const PERSONAL_FILTER_GROUP_SET = new Set(PERSONAL_FILTER_GROUP_NAMES);

export const isPersonalFilterGroup = filterName => PERSONAL_FILTER_GROUP_SET.has(filterName);

// Фільтр, складений до чіпа «Сурогатна мати», ключа `sm` не знає: СМ ходила
// під «Інші» (`isRoleCategoryAllowed` у `matchingDataProvider` — те саме правило).
const isRoleKeyEnabled = (roleFilters, key) => {
  if (key === 'sm' && roleFilters.sm === undefined) return Boolean(roleFilters.other);
  return roleFilters[key] === undefined ? true : Boolean(roleFilters[key]);
};

/**
 * Чи можуть у деці цього читача бути особисті анкети.
 *
 * `roleOptionKeys` — чіпи «Типу профілю», які читачеві показують
 * (`listFeedRoleFilterKeysForViewer`); без переліку — усі. Донорці й СМ
 * особистих чіпів не показують зовсім, тож для них відповідь завжди «ні».
 */
export const roleSelectionAllowsPersonalAnketas = (roleFilters, roleOptionKeys) => {
  const offered = Array.isArray(roleOptionKeys) ? roleOptionKeys : PERSONAL_ROLE_FILTER_KEYS;
  const personal = PERSONAL_ROLE_FILTER_KEYS.filter(key => offered.includes(key));
  if (!personal.length) return false;
  if (!roleFilters || typeof roleFilters !== 'object') return true;
  return personal.some(key => isRoleKeyEnabled(roleFilters, key));
};

/**
 * Знімає звуження з особистих груп, коли їх читачеві не показують.
 *
 * Фільтри лежать у `localStorage`, і невидима позначка не має права різати
 * деку: агенція, яка звузила донорок до «Не заміжня», а потім обрала самих
 * агенцій, інакше лишалась би з умовою, якої не бачить і зняти не може.
 * Обʼєкт повертається той самий, коли міняти нема чого.
 */
export const alignPersonalFilterGroupsWithRoles = (filters, roleOptionKeys) => {
  if (!filters || typeof filters !== 'object') return filters;
  if (roleSelectionAllowsPersonalAnketas(filters.userRole, roleOptionKeys)) return filters;
  let next = filters;
  PERSONAL_FILTER_GROUP_NAMES.forEach(name => {
    const group = filters[name];
    if (!group || typeof group !== 'object' || Object.values(group).every(Boolean)) return;
    if (next === filters) next = { ...filters };
    next[name] = Object.keys(group).reduce((acc, key) => ({ ...acc, [key]: true }), {});
  });
  return next;
};
