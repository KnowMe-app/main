import {
  toAgeCategory,
  toBmiCategory,
  toCountryCategory,
  toMaritalStatusCategory,
  toRhCategory,
  toRoleCategory,
} from './matchingDataProvider';

/**
 * Скільки карток підпадає під кожну опцію групи — серед уже завантажених.
 *
 * Число біля опції — це не прикраса, а відповідь на питання «що буде, якщо я
 * це зніму». Поки його не було, звуження робилось наосліп: читач гасив «≤25» і
 * дивився, чи щось змінилось у списку.
 *
 * Рахують тут **ті самі** категоризатори, що й пост-фільтр та індексний план
 * (`matchingDataProvider`). Своєї копії межі тут заводити не можна: саме
 * розбіжність на окрузі («26_30» проти «26–30 включно») і робить число
 * неправдою — воно обіцяло б одне, а фільтр давав би інше.
 *
 * **Групи крові тут немає, і це не пропуск.** Картка стрічки носить лише знак
 * резуса: номер групи з проєкції прибрано, бо разом вони складаються назад у
 * повне `blood`, яке живе за межею приватності (`toBloodGroupCategory` на
 * такій картці чесно каже `unknown`). Звужує за групою індекс `searchKey/blood`
 * — ще до того, як картка сюди дійде. Тож числа для неї були б нулями в усіх
 * пʼятьох опціях, тобто рядом чіпів, який відмовляє сам собі.
 */
const CATEGORIZERS = {
  userRole: toRoleCategory,
  maritalStatus: toMaritalStatusCategory,
  rh: toRhCategory,
  age: toAgeCategory,
  bmi: toBmiCategory,
  country: toCountryCategory,
};

export const matchingFilterGroupHasCounts = filterName => Boolean(CATEGORIZERS[filterName]);

/**
 * `{ [опція]: скільки }` для однієї групи, або `null`, якщо картка на це
 * питання не відповідає.
 *
 * Роль читається через `roleIndexSets` тим самим шляхом, що й фільтр: у картці
 * ролі може не бути зовсім, а в бакеті `searchKey/users/role` вона є.
 */
export const countMatchingFilterOptions = ({ filterName, users = [], roleIndexSets = null } = {}) => {
  const categorize = CATEGORIZERS[filterName];
  if (!categorize) return null;

  const counts = {};
  (Array.isArray(users) ? users : []).forEach(user => {
    const bucket = filterName === 'userRole' ? categorize(user, roleIndexSets) : categorize(user);
    const key = bucket === undefined || bucket === null || bucket === '' ? 'other' : String(bucket);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};
