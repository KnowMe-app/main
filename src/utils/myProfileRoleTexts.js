/**
 * Як «Мій профіль» називає поля й розділи — залежно від того, хто його заповнює.
 *
 * Форма одна на всі ролі, і досі говорила до всіх як до донорки: агенція
 * вписувала назву в «Імʼя», контактну особу — в «Прізвище», а розповідь про
 * себе шукала в розділі «Спосіб життя». Поля в базі ті самі (`name`,
 * `surname`, `moreInfo_main`) — міняється лише те, як форма про них питає,
 * тож картка стрічки й пошук читають їх, як і раніше.
 *
 * Підказки пишуться як «Наприклад: …» для всіх ролей: сірі «Марія» й
 * «Іваненко» в порожньому полі виглядали як уже введене значення, і людина
 * не розуміла, чому анкета заповнена на 8%.
 *
 * Спільний `pickerFields` не чіпається: з нього малює десяток інших екранів
 * (адмінка, редагування, імпорт), і там ці поля лишаються тим, чим є.
 */

const COMMON_FIELD_TEXT = Object.freeze({
  name: { placeholder: 'Наприклад: Марія' },
  surname: { placeholder: 'Наприклад: Іваненко' },
  phone: { placeholder: 'Наприклад: +380671234567' },
  // Приклад — донорський; у сурогатної мами свій (`ROLE_FIELD_TEXT.sm`).
  reward: { label: 'Бажана винагорода', placeholder: 'Наприклад: від 1000 $, залежить від програми' },
  // «Детальніше» й «Уточнити» відкривають поле для власного тексту, і
  // «Введіть свій варіант» питало там не про те: ускладнення чи алергію не
  // обирають як варіант, їх описують. Підказка каже, що саме написати.
  healthComplications: { detailPlaceholder: 'Наприклад: прееклампсія в другій вагітності' },
  surgeries: { detailPlaceholder: 'Наприклад: апендицит у 2021' },
  allergy: { detailPlaceholder: 'Наприклад: пеніцилін' },
  chronicDiseases: { detailPlaceholder: 'Наприклад: гіпотиреоз, під контролем' },
  maritalStatus: { detailPlaceholder: 'Наприклад: цивільний шлюб' },
  smoking: { detailPlaceholder: 'Наприклад: кинула 2 роки тому' },
  alcohol: { detailPlaceholder: 'Наприклад: келих вина на свята' },
  // Чипи кесаревого — до двох, а в СМ пологів буває й чотири: «Свій варіант»
  // тут — число, а не варіант.
  csection: { detailPlaceholder: 'Наприклад: 3' },
});

const ROLE_FIELD_TEXT = Object.freeze({
  ag: {
    name: { label: 'Назва агенції', placeholder: 'Наприклад: Мрія Донорства' },
    agencyName: { label: 'Назва агенції', placeholder: 'Наприклад: Мрія Донорства' },
    surname: { label: 'Контактна особа', placeholder: 'Як до вас звертатись' },
    moreInfo_main: { label: 'Про агенцію', placeholder: 'Послуги, міста, кого шукаєте' },
  },
  cl: {
    name: { label: 'Назва клініки', placeholder: 'Наприклад: Клініка «Нове життя»' },
    agencyName: { label: 'Назва клініки', placeholder: 'Наприклад: Клініка «Нове життя»' },
    surname: { label: 'Контактна особа', placeholder: 'Як до вас звертатись' },
    moreInfo_main: { label: 'Про клініку', placeholder: 'Програми, адреса, кого шукаєте' },
  },
  // «Побажання» тут були вільним текстом про групу крові й зріст — тепер це
  // вимоги програми, а зовнішність донорки — чіпи в «Кого шукаєте». Поле
  // лишилось тим, чим його й читають у картці: розповіддю батьків про себе.
  ip: {
    name: { label: 'Як до вас звертатись', placeholder: 'Наприклад: Олена й Андрій або «Пара з Києва»' },
    moreInfo_main: { label: 'Про нас', placeholder: 'Наприклад: ми разом девʼять років і мріємо про першу дитину' },
  },
  // Програма сурогатної мами — десятки тисяч і щомісячні виплати, а приклад
  // з донорської анкети («від 1000 $») підказував СМ суму вдесятеро меншу за
  // ту, яку їй пропонують агенції. «Про себе» питає те, що читають у
  // анкеті СМ: діти, вагітності, мотивація.
  sm: {
    reward: { placeholder: 'Наприклад: від 15 000 $ + щомісячні виплати' },
    moreInfo_main: { placeholder: 'Діти, як минали вагітності, чому хочете стати сурогатною мамою' },
  },
});

// Донорка, яка ще й СМ, пише в ті самі поля (`reward`, `moreInfo_main`) одну
// відповідь на обидві анкети, тож і приклад мусить підходити обом, а не
// тій ролі, яка випадково стоїть у переліку першою.
const BOTH_PERSON_ANKETAS_FIELD_TEXT = Object.freeze({
  reward: { placeholder: 'Наприклад: донація від 1000 $, програма СМ від 15 000 $' },
});

const ROLE_SECTION_TITLES = Object.freeze({
  ag: { personal: '🏢 Агенція', lifestyle: '📝 Про агенцію' },
  cl: { personal: '🏥 Клініка', lifestyle: '📝 Про клініку' },
  ip: { personal: '👤 Про вас', lifestyle: '📝 Кого шукаєте' },
  // Розділ «Медична інформація» в СМ питає саме про вагітності й пологи, а
  // «Спосіб життя» скорочено до куріння, алкоголю й «Про себе».
  sm: { medical: '🤰 Здоровʼя й вагітності', lifestyle: '📝 Про себе' },
});

const normalizeRole = role => String(role || '').trim().toLowerCase();

const isDonor = role => !role || role === 'ed';

const hasBothPersonAnketas = (role, roles) => {
  if (!['', 'ed', 'sm'].includes(role) || !Array.isArray(roles)) return false;
  const normalized = roles.map(normalizeRole);
  return normalized.includes('ed') && normalized.includes('sm');
};

/**
 * Підпис і підказка поля; порожній обʼєкт — лишити спільні з `pickerFields`.
 * `roles` — усі ролі анкети: особисті поля донорки й СМ спільні, і підказку
 * для них вирішує саме набір, а не одна роль.
 */
export const resolveMyProfileFieldText = (name, role, roles = []) => {
  const normalized = normalizeRole(role);
  const byRole = hasBothPersonAnketas(normalized, roles)
    ? BOTH_PERSON_ANKETAS_FIELD_TEXT
    : ROLE_FIELD_TEXT[normalized];
  return {
    ...(COMMON_FIELD_TEXT[name] || {}),
    ...(byRole?.[name] || {}),
  };
};

/**
 * Назва розділу. Розділ «Спосіб життя» в не-донорки тримає саме «Про себе» —
 * решту його полів (куріння, спорт, освіта) форма їй не показує, — тож і
 * зветься він так, як питає.
 */
export const resolveMyProfileSectionTitle = (key, role, fallback) => {
  const normalized = normalizeRole(role);
  const byRole = ROLE_SECTION_TITLES[normalized]?.[key];
  if (byRole) return byRole;
  if (key === 'lifestyle' && !isDonor(normalized)) return '📝 Про себе';
  return fallback;
};
