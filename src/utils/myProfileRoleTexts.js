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
  ip: {
    name: { label: 'Як до вас звертатись', placeholder: 'Наприклад: Олена й Андрій' },
    moreInfo_main: { label: 'Побажання', placeholder: 'Наприклад: 1-ша група крові, зріст від 165, Київ' },
  },
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

/** Підпис і підказка поля; порожній обʼєкт — лишити спільні з `pickerFields`. */
export const resolveMyProfileFieldText = (name, role) => {
  const normalized = normalizeRole(role);
  return {
    ...(COMMON_FIELD_TEXT[name] || {}),
    ...(ROLE_FIELD_TEXT[normalized]?.[name] || {}),
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
