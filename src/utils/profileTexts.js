import { getStoredLanguage } from '../hooks/useAppSettings';

/**
 * Мова картки анкети: і підписи блоків, і значення, які підставляє застосунок.
 *
 * Досі це були дві різні мови в одному рядку: підпис англійською
 * («Own kids», «Marital status»), а відповідь українською («є», «не заміжня») —
 * бо підписи писали в макеті, а відповіді рахували `maritalStatusLabel` і
 * `ownKidsBooleanLabel`, і кожне з двох місць мало свою мову за замовчуванням.
 * У меню трьох крапок мова вже є (`appLanguage`), тож правильна відповідь одна:
 * усе, що складає застосунок, іде обраною мовою.
 *
 * Чого тут навмисно немає — тексту, який ввела людина. Ім'я, місто, освіта,
 * коментар лишаються тією мовою, якою їх написали: перекладати вміст анкети
 * означало б показувати не те, що в ній написано.
 *
 * Ключ словника — англійський підпис, той самий, що стоїть у
 * `profileLayoutConfig`. Тобто макет лишається читабельним англійською, а
 * переклад живе одним списком, і поле без перекладу видно одразу — воно
 * зостається англійським, а не зникає.
 */

export const DEFAULT_PROFILE_LANGUAGE = 'en';

export const resolveProfileLanguage = language => {
  if (language === 'uk' || language === 'en') return language;
  try {
    return getStoredLanguage();
  } catch {
    return DEFAULT_PROFILE_LANGUAGE;
  }
};

/** Підписи полів і заголовки блоків: англійський оригінал → український. */
const UK_BY_EN_LABEL = {
  // блоки
  'Main information': 'Основне',
  Appearance: 'Зовнішність',
  'Donation experience': 'Досвід донації',
  'Agency details': 'Про агенцію',
  Contacts: 'Контакти',
  'Key details': 'Головне',

  // hero / метрики
  Height: 'Зріст',
  Weight: 'Вага',
  BMI: 'ІМТ',
  'Blood/Rh': 'Група/Rh',
  Exp: 'Досвід',
  Country: 'Країна',
  City: 'Місто',
  Region: 'Область',
  Family: 'Сімʼя',
  Program: 'Програма',
  'Looking for': 'Шукають',
  Services: 'Послуги',
  Specialization: 'Спеціалізація',
  Role: 'Роль',

  // основне
  Education: 'Освіта',
  Profession: 'Професія',
  'Marital status': 'Сімейний стан',
  'Family status': 'Сімейний стан',
  'Own kids': 'Власні діти',
  Clothing: 'Одяг',
  Shoe: 'Взуття',
  'Program interest': 'Цікавить програма',
  Budget: 'Бюджет',
  'Agency name': 'Назва агенції',

  // зовнішність
  Eyes: 'Очі',
  'Hair color': 'Колір волосся',
  'Hair structure': 'Структура волосся',
  'Face shape': 'Форма обличчя',
  Nose: 'Ніс',
  Lips: 'Губи',
  Chin: 'Підборіддя',
  Hair: 'Волосся',
  'Body type': 'Фігура',
  'Breast size': 'Груди',
  Race: 'Раса',
  Glasses: 'Окуляри',

  // досвід
  'Previous donation': 'Попередні донації',
  'Donation count': 'Кількість донацій',
  Donations: 'Донації',
  'C-section': 'Кесарів розтин',

  // ролі
  'Egg donor': 'Донорка яйцеклітин',
  Agency: 'Агенція',
  'Intended parents': 'Батьки',
  'Surrogate mother': 'Сурогатна мати',
  Client: 'Клієнт',
  Profile: 'Анкета',

  // контакти
  Phone: 'Телефон',
  Email: 'Пошта',
  'Other link': 'Посилання',
  Website: 'Сайт',
  Other: 'Інше',
  Street: 'Адреса',
};

/**
 * Підпис обраною мовою.
 *
 * Англійська віддається як є — словник тримає лише переклад, тож англійський
 * бік не може розійтись сам із собою. Підпис, якого в словнику немає, теж
 * лишається як є: краще одне англійське слово серед українських, ніж порожній
 * рядок на місці підпису.
 */
export const translateProfileLabel = (label, language) => {
  const text = String(label ?? '').trim();
  if (!text) return '';
  if (resolveProfileLanguage(language) !== 'uk') return text;
  return UK_BY_EN_LABEL[text] || text;
};

/**
 * Значення, які підставляє застосунок, а не вводить людина.
 *
 * Кожне — пара «так/ні» під своїм іменем, бо однією парою вони не описуються:
 * у сімейного стану це «заміжня / не заміжня», у дітей — «є / немає», а в
 * окулярів — просто «так / ні».
 */
const DERIVED_VALUES = {
  yesNo: { uk: ['так', 'ні'], en: ['Yes', 'No'] },
  marital: { uk: ['заміжня', 'не заміжня'], en: ['Married', 'Single'] },
  ownKids: { uk: ['є', 'немає'], en: ['Yes', 'No'] },
};

export const derivedValueTexts = (kind, language) => {
  const pair = DERIVED_VALUES[kind] || DERIVED_VALUES.yesNo;
  return pair[resolveProfileLanguage(language)] || pair.en;
};

/** Статичні написи картки анкети. Ключ — англійський оригінал. */
const UI_TEXTS = {
  showContacts: { en: 'Show contacts', uk: 'Показати контакти' },
  show: { en: 'show', uk: 'показати' },
  personalNote: { en: 'Private note', uk: 'Приватна нотатка' },
  personalNoteHint: { en: 'Only you see it', uk: 'Бачите тільки ви' },
  personalNotePlaceholder: { en: 'A note for yourself', uk: 'Нотатка для себе' },
  publicComment: { en: 'Public comment', uk: 'Публічний коментар' },
  publicCommentHint: { en: 'Everyone sees it', uk: 'Бачать усі' },
  publicCommentPlaceholder: { en: 'Add a public comment', uk: 'Додати публічний коментар' },
  notes: { en: 'Notes', uk: 'Нотатки' },

  // Рядок метрик під іменем: слова в ньому теж складає застосунок.
  factCSection: { en: 'CS', uk: 'КС' },
  factBirths: { en: 'births', uk: 'пологів' },
  factNoBirths: { en: 'no births', uk: 'без пологів' },
  factLastDelivery: { en: 'last', uk: 'останні' },
};

export const profileUiText = (key, language) => {
  const entry = UI_TEXTS[key];
  if (!entry) return '';
  return entry[resolveProfileLanguage(language)] || entry.en;
};
