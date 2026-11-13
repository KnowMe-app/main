/**
 * Пошук без звʼязку — серед карток, що лежать на пристрої.
 *
 * Без мережі запит пошуку до бази (`searchUsersOnly`) не падає, а висить, і
 * рядок «Шукаю…» стояв без кінця й без пояснення. Тепер стрічка без мережі
 * шукає серед збереженого (проєкції й повні анкети з кешу карток, номери — з
 * кешу контактів читача) і чесно каже, що шукала лише там: відповідь неповна,
 * але це відповідь, а не очікування.
 *
 * Тут лише чисте зіставлення; звідки взяти картки й контакти, вирішує
 * стрічка (`Matching`).
 */
const PHONE_KEYS = new Set(['phone', 'phone2', 'viber', 'whatsapp']);
const TEXT_FIELDS = [
  'name', 'surname', 'fathersname', 'agencyName', 'city', 'region', 'country',
  'telegram', 'instagram', 'facebook', 'tiktok', 'email', 'userId',
];
const CONTACT_TEXT_FIELDS = ['telegram', 'instagram', 'facebook', 'tiktok', 'email'];
const CONTACT_FIELDS = ['phone', ...CONTACT_TEXT_FIELDS];
// Ключі, які не називають поля: набране без розпізнаного поля `SearchBar`
// кладе в `name`, а `searchId` — сам ключ індексу. На них питаються всі поля.
const BROAD_KEYS = new Set(['', 'name', 'names', 'searchId']);

// Контакт, знайдений у кеші контактів читача, мусить їхати разом із карткою:
// `SearchBar` перевіряє видачу полем запиту (`filterSearchResultByParams`), а
// повна анкета в кеші контактів не несе (`sanitizeMatchingCardForCache`) —
// без цього знайдене за ніком відкидалось би вже на екрані.
const withCachedContacts = (card, contacts) => {
  const missing = CONTACT_FIELDS.filter(field => toValues(card[field]).length === 0 && toValues(contacts[field]).length > 0);
  if (!missing.length) return card;
  const merged = { ...card };
  missing.forEach(field => { merged[field] = contacts[field]; });
  return merged;
};

const toValues = value => (Array.isArray(value) ? value : [value])
  .filter(item => item !== undefined && item !== null && item !== '')
  .map(item => String(item));

const digitsOf = value => String(value || '').replace(/\D+/g, '');
const normalizeText = value => String(value || '').trim().toLocaleLowerCase('uk').replace(/^@/, '');

// Номер без коду країни («0671234567») і з кодом («380671234567») — той самий:
// повні номери звіряються останніми девʼятьма цифрами, а шматок номера (від
// шести цифр) — закінченням.
const phoneMatches = (queryDigits, candidate) => {
  const digits = digitsOf(candidate);
  if (!digits || queryDigits.length < 6) return false;
  if (queryDigits.length >= 9 && digits.length >= 9) return digits.slice(-9) === queryDigits.slice(-9);
  return digits.endsWith(queryDigits);
};

export const readOfflineSearchQuery = params => {
  const [key, value] = Object.entries(params || {})[0] || [];
  const text = String(value ?? '').trim();
  if (!text) return null;
  return { key: String(key || ''), text };
};

/**
 * @param {object[]} cards картки з пристрою (`userId` обовʼязковий)
 * @param {object} params той самий `{ поле: значення }`, що йде в пошук
 * @param {{ contactsById?: Record<string, object> }} [options]
 * @returns {object[]} знайдені картки, у порядку, в якому їх дали (з контактами
 *   з кешу контактів, яких у самій картці немає)
 */
export const searchCardsOnDevice = (cards, params, { contactsById = {}, detectedField = '' } = {}) => {
  const query = readOfflineSearchQuery(params);
  if (!query) return [];
  const queryDigits = digitsOf(query.text);
  // Поле, яке розпізнав `SearchBar` (`searchIdDetectedField`), важить більше за
  // вигляд набраного: числовий Facebook ID — не номер телефону.
  const field = String(detectedField || '');
  const looksNumeric = queryDigits.length >= 6 && queryDigits.length >= query.text.replace(/[\s()+-]/g, '').length;
  const isPhoneQuery = PHONE_KEYS.has(query.key) || PHONE_KEYS.has(field) || (!field && looksNumeric);
  const needle = normalizeText(query.text);
  if (!isPhoneQuery && needle.length < 2) return [];
  // Запит, що називає поле («telegram: x»), шукає лише в ньому — як і пошук
  // зі звʼязком: інакше нік у Telegram знаходив би картку з таким самим
  // ніком в Instagram (ревʼю #3395).
  const ownField = !BROAD_KEYS.has(query.key) && !PHONE_KEYS.has(query.key) && TEXT_FIELDS.includes(query.key)
    ? query.key
    : '';
  const textFields = ownField ? [ownField] : TEXT_FIELDS;
  const contactTextFields = ownField ? CONTACT_TEXT_FIELDS.filter(field => field === ownField) : CONTACT_TEXT_FIELDS;

  return (Array.isArray(cards) ? cards : []).filter(card => {
    if (!card?.userId) return false;
    const contacts = contactsById[card.userId] || {};
    const texts = [
      ...textFields.flatMap(field => toValues(card[field])),
      ...contactTextFields.flatMap(field => toValues(contacts[field])),
    ];
    if (isPhoneQuery) {
      const phones = [...toValues(card.phone), ...toValues(contacts.phone)];
      if (phones.some(phone => phoneMatches(queryDigits, phone))) return true;
      // Число, яке лише схоже на номер, — це й числовий ID у посиланні
      // (`profile.php?id=…`), тож ніки й посилання теж питаються.
      return !PHONE_KEYS.has(query.key) && !PHONE_KEYS.has(field)
        && texts.some(text => digitsOf(text).includes(queryDigits));
    }
    return texts.some(text => normalizeText(text).includes(needle));
  }).map(card => withCachedContacts(card, contactsById[card.userId] || {}));
};
