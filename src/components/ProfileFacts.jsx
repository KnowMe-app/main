import { getExtraLocale, toInlineCase, toInlineCaseFirst } from '../utils/locales';
import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import {
  bmiValue,
  getBloodGroupDisplay,
  maritalStatusLabel,
  normalizeDisplayValue,
} from './profileLayoutConfig';
import { translateFieldValue } from './formFields';
import { getCurrentValue } from './getCurrentValue';
import { normalizeHeightCm, normalizeWeightKg } from '../utils/profileNormalization';
import { profileUiText, resolveProfileLanguage, translateProfileLabel } from '../utils/profileTexts';
import { formatDeliveryRecency } from '../utils/deliveryRecency';
import { formatProfileCountOrDate } from '../utils/profileDate';
import { uiText } from '../utils/uiTranslations';
import { describeGlasses, describeHair, describeLooks, describeWork } from '../utils/profileSentences';
import { PROGRAM_PLACE_CHOICES, formatRewardForDisplay, parseProgramPlaces, readHabitExtraKind } from '../utils/profileAnswers';

/*
 * Факти анкети — один блок на рядок стрічки й на відкриту картку.
 *
 * Досі одна донорка описувалась чотирма різними способами: курсивний рядок
 * «166 | не заміжня» у стрічці, рядки «підпис — значення» під ним, сітка
 * «Одяг: **34–36**» під стрілкою і ВЕЛИКІ підписи з чипами у відкритій
 * картці. Ще й словами різними: «донацій ще не було» в рядку й «0 донації» в
 * картці, пологи в картці є, а в рядку ні. Тепер обидва екрани збирають
 * картку з одних і тих самих трьох частин:
 *
 * 1. смуга показників (`buildProfileStatStrip`) — зріст, вага, ІМТ, кров;
 * 2. короткі факти (`buildProfileSummaryRows`) — пологи й донації,
 *    сімейний стан, зовнішність;
 * 3. розділи повної анкети (`buildProfileDetailSections`) — обличчя й фігура,
 *    (разом із розмірами й зором), освіта й робота.
 *
 * Перші дві частини беруть **лише поля картки стрічки** (`matchingCards`), тож
 * рядок списку показує їх одразу, без жодного читання, і не міняється, коли
 * приїхала повна анкета: верх відкритої картки — той самий блок тими самими
 * словами. Повна анкета лише уточнює на тих самих місцях: групу крові замість
 * самого резусу (`getBloodGroupDisplay`) і структуру волосся поруч із кольором. Третя частина — те, чого в картці
 * стрічки немає взагалі; її показують розгорнутий рядок і відкрита картка.
 */

const CSECTION_KEYS = ['cSection', 'csection', 'c_section', 'cesareanSection'];

export const resolveCSectionKey = user => CSECTION_KEYS.find(key => normalizeDisplayValue(user?.[key])) || 'csection';

const CSECTION_ZERO_VALUES = new Set(['не було', 'немає', 'нема', 'no', '-', '0']);
export const formatCSectionValue = raw => {
  const trimmed = String(raw || '').trim();
  if (CSECTION_ZERO_VALUES.has(trimmed.toLowerCase())) return '0';
  // У частині анкет у полі кесаревого лежить дата операції. Сирою вона
  // друкувалась в ISO — поруч із «останні 11.03.26» у форматі дд.мм.рр.
  return formatProfileCountOrDate(trimmed);
};

const OTHER_VALUES = new Set(['other', 'інше', 'иное']);
export const isOtherValue = value => OTHER_VALUES.has(String(value || '').trim().toLowerCase());

const lowerFirst = (text, lang) => toInlineCaseFirst(text, lang);

// Значення, вибране зі списку, — мовою інтерфейсу (`translateFieldValue`) і
// малими літерами: у рядку воно стоїть після підпису, а не починає речення.
// Малими всі, а не лише перша: у словнику трапляється «Пісочний Годинник».
// Німецька — виняток (`toInlineCase`): там іменник з великої.
const readOptionValue = (user, field, lang) => {
  const raw = normalizeDisplayValue(user?.[field]);
  if (!raw || isOtherValue(raw)) return '';
  const localized = lang === 'uk' || getExtraLocale(lang) ? translateFieldValue(field, raw, lang) : raw;
  return toInlineCase(localized.trim(), lang);
};

// Те, що людина набрала сама (професія, розмір), лишається як набрали.
const readTypedValue = (user, field) => {
  const raw = normalizeDisplayValue(user?.[field]);
  if (!raw || isOtherValue(raw)) return '';
  return raw;
};

// ---------------------------------------------------------------------------
// 1. Смуга показників
// ---------------------------------------------------------------------------

/*
 * Резус із картки стрічки — це голий знак (`expandMatchingCard`: `blood = rh`).
 * «+» `getBloodGroupDisplay` читав, а «-» — ні: для `normalizeDisplayValue`
 * мінус — це заглушка порожнього поля («-», «—», «n/a»), тож донорка з
 * негативним резусом у рядку стрічки групи крові не мала зовсім. Голий знак
 * тут читається до тієї нормалізації.
 */
const RH_ONLY_VALUES = { '+': 'Rh+', '-': 'Rh−', '−': 'Rh−' };
export const readBloodDisplay = user => {
  const current = getCurrentValue(user?.blood);
  const raw = typeof current === 'string' ? current.trim() : '';
  if (RH_ONLY_VALUES[raw]) return RH_ONLY_VALUES[raw];
  return getBloodGroupDisplay(user) || '';
};

const STAT_CELLS = [
  { key: 'height', label: 'Height', unit: 'cm', read: user => normalizeHeightCm(normalizeDisplayValue(user?.height)) },
  { key: 'weight', label: 'Weight', unit: 'kg', read: user => normalizeWeightKg(normalizeDisplayValue(user?.weight)) },
  { key: 'bmi', label: 'BMI', read: bmiValue },
  // Картка стрічки несе самий резус — «Rh+»; повна анкета — групу, «O+».
  // Місце й підпис ті самі, уточнюється лише значення.
  { key: 'blood', label: 'Blood', read: user => readBloodDisplay(user) },
];

/**
 * Чотири комірки завжди в тому самому порядку: гортаючи список, їх порівнюють
 * одним рядком, тож відсутнє значення — тире, а не зсув сусідніх колонок.
 * Смуги немає зовсім, коли не відомо жодного з чотирьох (картка агенції).
 */
export const buildProfileStatStrip = (user, language) => {
  const lang = resolveProfileLanguage(language);
  const cells = STAT_CELLS.map(cell => {
    const value = cell.read(user);
    const text = value === null || value === undefined ? '' : String(value).trim();
    return {
      key: cell.key,
      label: translateProfileLabel(cell.label, lang),
      value: text || '—',
      unit: text && cell.unit ? translateProfileLabel(cell.unit, lang) : '',
      empty: !text,
    };
  });
  return cells.some(cell => !cell.empty) ? cells : [];
};

// ---------------------------------------------------------------------------
// 2. Короткі факти — самі поля картки стрічки
// ---------------------------------------------------------------------------

const TRAIT_WORDS = {
  uk: { eyes: 'очі', hair: 'волосся' },
  en: { eyes: 'eyes', hair: 'hair' },
};

// Колір і структура волосся — одним словосполученням («темне хвилясте
// волосся», `describeHair`): довідник кольору тримає іменники («Брюнетка»,
// «Шатенка»), а перед «волоссям» стоїть прикметник. Структури волосся в
// картці стрічки немає (і не буде: картку читає кожен рядок списку), тож
// рядок спершу каже колір, а структуру дописує повна анкета, щойно приїхала
// (розгорнутий рядок, відкрита картка). У розділах повної анкети волосся
// вдруге не повторюється.
const describeAppearance = (user, lang) => {
  const extra = getExtraLocale(lang);
  const words = TRAIT_WORDS[lang] || TRAIT_WORDS.en;
  const eyes = readOptionValue(user, 'eyeColor', lang);
  const hair = describeHair(user, lang);
  const parts = [];
  if (eyes) {
    if (extra) parts.push(extra.sentences.eyes(eyes));
    else parts.push(eyes.includes(words.eyes) ? eyes : `${eyes} ${words.eyes}`);
  }
  if (hair) parts.push(hair);
  return extra ? extra.sentences.clauses(parts) : parts.join(', ');
};

const YES_VALUES = new Set(['yes', 'так', 'є']);
const NO_VALUES = new Set(['no', 'ні', 'немає']);

// Кількість з поля анкети: число, «так/ні» або вільний текст, як його ввели.
const readCount = raw => {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return { count: Number(text) };
  if (YES_VALUES.has(text.toLowerCase())) return { yes: true };
  if (NO_VALUES.has(text.toLowerCase())) return { count: 0 };
  return { text };
};

/*
 * «Ні» форма пише мінусом (`csectionOptions`), а для показу мінус — заглушка
 * порожнього поля (`normalizeDisplayValue`). Тож відповідь «кесаревого не
 * було» картка ковтала ще до `formatCSectionValue`, який читає мінус як нуль:
 * СМ відповідала на питання, а її анкета виглядала незаповненою, і рядок
 * мовчав про «усі природним шляхом» — те, за чим СМ і обирають.
 */
const readCSectionAnswer = user => {
  const shown = normalizeDisplayValue(user?.[resolveCSectionKey(user)]);
  if (shown) return shown;
  return CSECTION_KEYS.some(key => String(getCurrentValue(user?.[key]) ?? '').trim() === '-') ? '-' : '';
};

/*
 * Пологи й кесарів — одним рядком «Пологи», де головне видно до першої коми:
 * «**3**, з яких **2 КР**, останні 3 роки тому» чи «**2**, **без КР**, …».
 * Кількість — цифрою (підпис уже каже «Пологи», тож слово вдруге не
 * повторюється), без кесаревого — зеленим, кесарів — жовтим, давність —
 * сірим у кінці. Доти тут стояло речення «троє пологів, одні — кесаревим
 * розтином, решта природним шляхом», і число з кесаревим читач мусив
 * вишукувати в ньому сам (обрано власницею продукту, варіант A2 мокапу).
 *
 * Рядок віддає і `value` (простий текст — тести, пошук очима), і `parts`
 * з тоном кожного шматка, який малює `ProfileFactList`.
 */
const TONE_COUNT = 'count';
const TONE_NATURAL = 'natural';
const TONE_CAESAREAN = 'caesarean';
const TONE_MUTED = 'muted';

// Слова рядка для української й англійської; решта мов — `sentences` у
// своєму модулі (`utils/locales`) тієї ж форми.
const DELIVERY_WORDS = {
  uk: {
    deliveries: {
      none: 'не було',
      yes: 'були',
      recencyOnly: r => `останні ${r} тому`,
      recencySingle: r => `${r} тому`,
      recencyLast: r => `останні ${r} тому`,
    },
    cSection: {
      none: 'без КР',
      single: 'КР',
      all: () => 'усі КР',
      part: n => ['з яких ', `${n} КР`],
      atLeast: n => ['з яких ', `щонайменше ${n} КР`],
      count: n => `${n} КР`,
      countAtLeast: n => `щонайменше ${n} КР`,
    },
    donations: { none: 'ще не було', yes: 'були' },
  },
  en: {
    deliveries: {
      none: 'none',
      yes: 'yes',
      recencyOnly: r => `last ${r} ago`,
      recencySingle: r => `${r} ago`,
      recencyLast: r => `last ${r} ago`,
    },
    cSection: {
      none: 'no C-section',
      single: 'C-section',
      all: n => (n === 2 ? 'both C-section' : 'all C-section'),
      part: n => ['including ', `${n} C-section`],
      atLeast: n => ['including ', `at least ${n} C-section`],
      count: n => `${n} C-section`,
      countAtLeast: n => `at least ${n} C-section`,
    },
    donations: { none: 'none yet', yes: 'yes' },
  },
};

const resolveDeliveryWords = lang => getExtraLocale(lang)?.sentences || DELIVERY_WORDS[lang] || DELIVERY_WORDS.en;

/*
 * Відповідь про кесарів: `'0'` — не було, число — скільки, «2+» — щонайменше
 * стільки (саме «2+» не пишемо: поруч з резусом і групою крові воно читалось
 * як «РК 2+»), решта — свій текст людини, і для нього окремий рядок «КР».
 */
const readCSectionCount = value => {
  if (value === '0') return { count: 0 };
  const match = /^(\d+)\s*\+$/.exec(value);
  if (match) return { count: Number(match[1]), atLeast: true };
  if (/^\d+$/.test(value)) return { count: Number(value) };
  return null;
};

const describeDeliveries = (user, lang) => {
  const words = resolveDeliveryWords(lang);
  const read = readCount(normalizeDisplayValue(user?.ownKids));
  const recency = formatDeliveryRecency(normalizeDisplayValue(user?.lastDelivery), lang);
  const rawCSection = readCSectionAnswer(user);
  const cSectionValue = rawCSection ? formatCSectionValue(rawCSection) : '';
  const cSection = cSectionValue ? readCSectionCount(cSectionValue) : null;
  const customCSection = cSectionValue && !cSection ? cSectionValue : '';

  if (read?.count === 0) {
    return { parts: [{ text: words.deliveries.none, tone: TONE_MUTED }], customCSection };
  }

  const parts = [];
  const total = read && Number.isInteger(read.count) ? read.count : null;
  if (total) parts.push({ text: String(total), tone: TONE_COUNT });
  else if (read?.yes) parts.push({ text: words.deliveries.yes });
  else if (read?.text) parts.push({ text: read.text });

  if (cSection) {
    const { count, atLeast } = cSection;
    // «Без КР» має сенс лише поруч із пологами: без них це відповідь на
    // питання, якого ніхто не ставив.
    if (count === 0) {
      if (parts.length) parts.push({ text: words.cSection.none, tone: TONE_NATURAL });
    } else if (!total) {
      parts.push({ text: atLeast ? words.cSection.countAtLeast(count) : words.cSection.count(count), tone: TONE_CAESAREAN });
    } else if (!atLeast && count >= total) {
      parts.push({ text: total === 1 ? words.cSection.single : words.cSection.all(total), tone: TONE_CAESAREAN });
    } else {
      // «з яких» — звичайним текстом, жовтим лише саме «2 КР» (як у мокапі).
      const [lead, text] = atLeast ? words.cSection.atLeast(count) : words.cSection.part(count);
      parts.push({ lead, text, tone: TONE_CAESAREAN });
    }
  }

  if (recency) {
    let text = words.deliveries.recencyLast(recency);
    if (!parts.length) text = words.deliveries.recencyOnly(recency);
    else if (total === 1) text = words.deliveries.recencySingle(recency);
    parts.push({ text, tone: TONE_MUTED });
  }

  return { parts, customCSection };
};

const describeDonations = (user, lang) => {
  const read = readCount(normalizeDisplayValue(user?.experience));
  if (!read) return null;
  const words = resolveDeliveryWords(lang).donations;
  if (read.count === 0) return [{ text: words.none, tone: TONE_MUTED }];
  if (read.text) return [{ text: read.text }];
  if (read.yes) return [{ text: words.yes }];
  return [{ text: String(read.count), tone: TONE_COUNT }];
};

// Шматки рядка через кому (японська й китайська — своїм знаком,
// `deliveries.separator`); розділювач перед сірою давністю теж сірий.
const joinRowParts = (parts, separator = ', ') => parts.flatMap(({ lead, ...part }, index) => [
  ...(index === 0 ? [] : [{ text: separator, tone: part.tone === TONE_MUTED ? TONE_MUTED : undefined }]),
  ...(lead ? [{ text: lead }] : []),
  part,
]);

// Число не відривається від свого слова («2 / КР», «16 / міс» на двох
// рядках): переноситься рядок лише між шматками.
const keepNumbersWithWords = text => String(text).replace(/(\d) (?=\S)/g, '$1\u00a0');

const factRow = (key, label, rawParts) => {
  const parts = rawParts.map(part => ({ ...part, text: keepNumbersWithWords(part.text) }));
  return { key, label, value: parts.map(part => part.text).join(''), parts };
};

export const buildProfileSummaryRows = (user, language) => {
  const lang = resolveProfileLanguage(language);
  const rows = [];

  const deliveries = describeDeliveries(user, lang);
  const deliveryParts = joinRowParts(deliveries.parts, resolveDeliveryWords(lang).deliveries.separator);
  // Досвід СМ і ускладнення — про ті самі пологи, тож стоять тут, а не в
  // «Про себе» (на прохання власниці продукту).
  const pregnancyNotes = describeLifestyleFields(user, lang, PREGNANCY_FIELD_KEYS);
  if (pregnancyNotes) {
    if (deliveryParts.length) deliveryParts.push({ text: '. ' });
    deliveryParts.push({ text: pregnancyNotes });
  }
  if (deliveryParts.length) rows.push(factRow('reproduction', translateProfileLabel('Deliveries', lang), deliveryParts));

  // Свій текст про кесарів («планове у 2019, екстрене у 2022») у рядок
  // пологів не вкладається — йому окремий рядок «КР», тим самим жовтим.
  if (deliveries.customCSection) {
    rows.push(factRow('cSection', translateProfileLabel('C-section', lang), [{ text: deliveries.customCSection, tone: TONE_CAESAREAN }]));
  }

  // Донації — окремим рядком і цифрою: з пологами в одному рядку вони
  // губили обидва числа.
  const donations = describeDonations(user, lang);
  if (donations) rows.push(factRow('donations', translateProfileLabel('Donations', lang), donations));

  const marital = lowerFirst(maritalStatusLabel(normalizeDisplayValue(user?.maritalStatus), lang), lang);
  if (marital) rows.push({ key: 'marital', label: translateProfileLabel('Marital status', lang), value: marital });

  // Зовнішність — після пологів і сімейного стану: те, за чим обирають СМ і
  // донорку, читається першим (на прохання власниці продукту).
  const appearance = describeAppearance(user, lang);
  if (appearance) rows.push({ key: 'appearance', label: translateProfileLabel('Appearance', lang), value: appearance });

  return rows;
};

// Ключі полів, які вже сказав короткий блок: інші екрани (сітка, чипи) їх не
// повторюють.
export const PROFILE_SUMMARY_FIELD_KEYS = Object.freeze([
  'height', 'weight', 'bmi', 'blood', 'eyeColor', 'hairColor', 'hairStructure', 'ownKids', 'lastDelivery',
  ...CSECTION_KEYS, 'experience', 'maritalStatus', 'surrogacyExperience', 'healthComplications',
]);

// ---------------------------------------------------------------------------
// 3. Розділи повної анкети
// ---------------------------------------------------------------------------

// «Так/ні» в освіті відповідає на питання форми «чи є вища», а не називає
// освіту: «Освіта — ні» прочиталось би як «без освіти».
const EDUCATION_FLAG_VALUES = new Set(['yes', 'no', 'так', 'ні']);

const describeEducation = (user, lang) => {
  const raw = normalizeDisplayValue(user?.education);
  if (!raw || isOtherValue(raw) || EDUCATION_FLAG_VALUES.has(raw.toLowerCase())) return '';
  const localized = lang === 'uk' || getExtraLocale(lang) ? translateFieldValue('education', raw, lang) : raw;
  // Підпис рядка вже каже «Освіта»: «вища освіта» поруч із ним — повтор.
  return lowerFirst(localized.replace(/\s+освіта$/i, '').trim(), lang);
};

const option = field => (user, lang) => readOptionValue(user, field, lang);
const typed = field => user => readTypedValue(user, field);

// «Так/Ні» з форми (`Yes`/`No`); власна відповідь («іноді», «прееклампсія
// в 2019») лишається як написали.
const YES_ANSWERS = new Set(['yes', 'так', '+', 'true']);
const NO_ANSWERS = new Set(['no', 'ні', 'false']);

/*
 * Відповіді «Так/Ні» про досвід СМ, ускладнення й звички — реченнями від
 * першої особи, що дописуються до «Про себе» (`ProfileRow`). Власна відповідь
 * («келих на свята») стоїть як написали, після назви теми.
 */
// «Іноді» й «Припинила» — готові варіанти куріння й алкоголю
// (`utils/profileAnswers`), а не своя відповідь: без власних речень картка
// показувала б їх сирим словом з бази («Куріння: sometimes»).
const LIFESTYLE_SENTENCES = {
  surrogacyExperience: { yes: 'Маю досвід сурогатного материнства.', no: 'Ще не брала участі в програмі сурогатного материнства.', other: 'Досвід сурогатного материнства: {value}.' },
  healthComplications: { yes: 'Під час вагітностей чи пологів були ускладнення.', no: 'Ускладнень під час вагітностей і пологів не було.', other: 'Про ускладнення: {value}.' },
  smoking: { yes: 'Курю.', no: 'Не курю.', sometimes: 'Курю іноді.', quit: 'Кинула курити.', other: 'Куріння: {value}.' },
  alcohol: { yes: 'Вживаю алкоголь.', no: 'Не вживаю алкоголю.', sometimes: 'Алкоголь вживаю іноді.', other: 'Алкоголь: {value}.' },
};

const readYesNo = (user, field) => {
  const raw = readTypedValue(user, field);
  const lower = raw.toLowerCase();
  if (YES_ANSWERS.has(lower)) return { kind: 'yes', raw };
  if (NO_ANSWERS.has(lower)) return { kind: 'no', raw };
  const extraKind = readHabitExtraKind(raw);
  if (extraKind && LIFESTYLE_SENTENCES[field]?.[extraKind]) return { kind: extraKind, raw };
  return raw ? { kind: 'other', raw } : null;
};

export const LIFESTYLE_FIELD_KEYS = Object.freeze(Object.keys(LIFESTYLE_SENTENCES));

const PREGNANCY_FIELD_KEYS = ['surrogacyExperience', 'healthComplications'];

// Власна відповідь іде після «Алкоголь:» — з малої, як продовження речення
// («Алкоголь: на свята.», а не «… На свята.»).
const lifestyleSentence = (user, field, lang) => {
  const answer = readYesNo(user, field);
  if (!answer) return '';
  const value = answer.kind === 'other' ? lowerFirst(answer.raw, lang) : answer.raw;
  return uiText(LIFESTYLE_SENTENCES[field][answer.kind], lang, { value });
};

const describeLifestyleFields = (user, lang, fields) => fields
  .map(field => lifestyleSentence(user, field, lang))
  .filter(Boolean)
  .join(' ');

// «Про себе»: звички й зір. Досвід СМ і ускладнення — у рядку «Пологи»
// (`buildProfileSummaryRows`), окуляри — тут, а не в «Обличчі й фігурі».
export const describeLifestyle = (user, language) => {
  const lang = resolveProfileLanguage(language);
  const smoking = readYesNo(user, 'smoking');
  const alcohol = readYesNo(user, 'alcohol');
  const habits = smoking?.kind === 'no' && alcohol?.kind === 'no'
    ? uiText('Не курю й не вживаю алкоголю.', lang)
    : describeLifestyleFields(user, lang, ['smoking', 'alcohol']);
  return [habits, describeGlasses(user?.glasses, lang)].filter(Boolean).join(' ');
};

/** «Про себе» людини разом із відповідями про здоровʼя й звички. */
export const composeAboutText = (bio, user, language) => {
  const own = String(bio || '').trim();
  const lifestyle = describeLifestyle(user, language);
  if (!lifestyle) return own;
  if (!own) return lifestyle;
  return /[.!?…)]$/.test(own) ? `${own} ${lifestyle}` : `${own}. ${lifestyle}`;
};

/*
 * Розділ = речення з відповідей, вибраних зі списку (`utils/profileSentences`),
 * плюс рядки «підпис — значення» для того, що людина набрала сама: власна
 * відповідь у речення не лягає, бо її рід і відмінок невідомі.
 */
// Бажана винагорода: сума з розрядами й валютою (голе «1350» — долари:
// читач не знав, у чому рахувати), «Хочу обговорити» — словами мовою
// читача, старий текст — як написали (`utils/profileAnswers`).
const describeReward = (raw, lang) => formatRewardForDisplay(raw, uiText('За домовленістю', lang));

// Де людина готова проходити програму — коди з форми (`programPlace`) мовою
// читача, а країни, які вона дописала після «За кордоном», — як написала.
const describeProgramPlace = (user, lang) => {
  const codes = parseProgramPlaces(readTypedValue(user, 'programPlace'));
  if (!codes.length) return '';
  const labels = codes.map(code => {
    const text = uiText(PROGRAM_PLACE_CHOICES.find(choice => choice.value === code).phrase, lang);
    const countries = code === 'abroad' ? readTypedValue(user, 'programPlaceNote') : '';
    return countries ? `${text} (${countries})` : text;
  });
  const extraList = getExtraLocale(lang)?.sentences.clauses;
  const places = extraList ? extraList(labels) : labels.join(', ');
  return uiText('Готова проходити програму: {places}.', lang, { places });
};

const DETAIL_SECTIONS = [
  {
    key: 'looks',
    title: 'Face and figure',
    describe: args => describeLooks({ ...args, includeGlasses: false }),
    fields: [
      { key: 'faceShape', label: 'Face shape', read: option('faceShape') },
      { key: 'noseShape', label: 'Nose', read: option('noseShape') },
      { key: 'lipsShape', label: 'Lips', read: option('lipsShape') },
      { key: 'chin', label: 'Chin', read: option('chin') },
      { key: 'bodyType', label: 'Body type', read: option('bodyType') },
      { key: 'breastSize', label: 'Breast size', read: typed('breastSize') },
      { key: 'race', label: 'Race', read: option('race') },
      { key: 'clothingSize', label: 'Clothing', read: typed('clothingSize') },
      { key: 'shoeSize', label: 'Shoe', read: typed('shoeSize') },
    ],
  },
  // Бажана винагорода — окремим розділом, а не в «Про себе»: це умова
  // співпраці, а не розповідь про себе (на прохання власниці продукту).
  // Відповіді про досвід, ускладнення, куріння й алкоголь пішли в «Про себе»
  // реченнями (`describeLifestyle`): табличка «Куріння — ні» читалась як
  // анкета, а не як людина.
  // Де готова проходити програму — поруч із винагородою: обидва — умови
  // програми, а не розповідь про себе.
  {
    key: 'programPlace',
    title: 'Program',
    describe: ({ user, lang }) => ({ text: describeProgramPlace(user, lang), used: new Set(['programPlace', 'programPlaceNote']) }),
    fields: [],
  },
  {
    key: 'reward',
    title: 'Desired compensation',
    describe: ({ typed: read, lang }) => ({ text: describeReward(read('reward'), lang), used: new Set(['reward']) }),
    fields: [],
  },
  {
    key: 'work',
    title: 'Education and work',
    describe: describeWork,
    fields: [
      { key: 'education', label: 'Education', read: describeEducation },
      { key: 'profession', label: 'Profession', read: typed('profession') },
    ],
  },
];

/**
 * Те, чого в картці стрічки немає: з нею приходить повна анкета. Розділ без
 * жодного значення не малюється — порожній заголовок нічого не каже.
 */
export const buildProfileDetailSections = (user, language) => {
  const lang = resolveProfileLanguage(language);
  const typedValue = field => readTypedValue(user, field);
  return DETAIL_SECTIONS
    .map(section => {
      const { text, used } = section.describe({ user, lang, typed: typedValue });
      return {
        key: section.key,
        title: translateProfileLabel(section.title, lang),
        text,
        rows: section.fields
          .filter(field => !used.has(field.key))
          .map(field => ({ key: field.key, label: translateProfileLabel(field.label, lang), value: field.read(user, lang) }))
          .filter(row => row.value),
      };
    })
    .filter(section => section.text || section.rows.length > 0);
};

// ---------------------------------------------------------------------------
// Розкладка
// ---------------------------------------------------------------------------

// Кожна змінна має запасну: блок малює і стрічка, де оголошені `--matching-*`,
// і відкрита картка; невідома змінна в скороченому записі робить нечинним
// увесь запис (див. «Контакти показуються одним представленням» у CLAUDE.md).
const TEXT = 'var(--matching-header-text, var(--km-text, #1A1A1A))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #7A7A72))';
const HAIRLINE = 'var(--matching-card-border, var(--km-border, #E8E8E2))';

const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 10px;
  border-top: 1px solid ${HAIRLINE};
  border-bottom: 1px solid ${HAIRLINE};
  font-variant-numeric: tabular-nums;
`;

const StatCell = styled.div`
  min-width: 0;
  padding: 8px 6px 8px 10px;
  border-left: 1px solid ${HAIRLINE};

  &:first-child {
    padding-left: 0;
    border-left: 0;
  }
`;

const StatValue = styled.div`
  font-size: ${({ $large }) => ($large ? '19px' : '17px')};
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
  color: ${({ $empty }) => ($empty ? MUTED : TEXT)};
  opacity: ${({ $empty }) => ($empty ? 0.6 : 1)};
`;

const StatUnit = styled.span`
  font-size: 11.5px;
  font-weight: 600;
  color: ${MUTED};
`;

const StatLabel = styled.div`
  margin-top: 1px;
  font-size: 11.5px;
  color: ${MUTED};
`;

export const ProfileStatStrip = ({ cells, large = false }) => {
  if (!cells || cells.length === 0) return null;
  return (
    <Strip>
      {cells.map(cell => (
        <StatCell key={cell.key}>
          <StatValue $large={large} $empty={cell.empty}>
            {cell.value}
            {cell.unit && <StatUnit>{` ${cell.unit}`}</StatUnit>}
          </StatValue>
          <StatLabel>{cell.label}</StatLabel>
        </StatCell>
      ))}
    </Strip>
  );
};

const FactList = styled.dl`
  display: grid;
  grid-template-columns: minmax(96px, max-content) minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 6px;
  margin: 10px 0 0;
  line-height: 1.4;
`;

const FactLabel = styled.dt`
  margin: 0;
  font-size: 12.5px;
  line-height: 20px;
  color: ${MUTED};
`;

const FactValue = styled.dd`
  margin: 0;
  font-size: ${({ $large }) => ($large ? '15px' : '14px')};
  line-height: 20px;
  color: ${TEXT};
  overflow-wrap: anywhere;
`;

// Тони шматків рядка (`parts`): цифра жирніше й крупніше, «без КР» —
// зеленим, кесарів — жовтим, давність — сірим.
const FACT_TONE_STYLES = {
  [TONE_COUNT]: css`
    font-weight: 700;
    font-size: 1.12em;
  `,
  [TONE_NATURAL]: css`
    font-weight: 700;
    color: var(--km-fact-natural, #23824A);
  `,
  [TONE_CAESAREAN]: css`
    font-weight: 700;
    color: var(--km-fact-caesarean, #946B00);
  `,
  [TONE_MUTED]: css`
    color: ${MUTED};
  `,
};

const FactPart = styled.span`
  ${({ $tone }) => FACT_TONE_STYLES[$tone] || ''}
`;

export const ProfileFactList = ({ rows, large = false }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <FactList>
      {rows.map(row => (
        <React.Fragment key={row.key}>
          <FactLabel>{row.label}</FactLabel>
          <FactValue $large={large}>
            {row.parts
              ? row.parts.map((part, index) => (part.tone
                ? <FactPart key={index} $tone={part.tone}>{part.text}</FactPart>
                : <React.Fragment key={index}>{part.text}</React.Fragment>))
              : row.value}
          </FactValue>
        </React.Fragment>
      ))}
    </FactList>
  );
};

const sectionBoundary = css`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${HAIRLINE};

  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
`;

const DetailSection = styled.section`
  ${sectionBoundary}

  dl {
    margin-top: 8px;
  }
`;

// Риска перед заголовком — кольором ролі, та сама, що смужка на краю картки.
const DetailTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: ${TEXT};

  &::before {
    content: '';
    flex: 0 0 auto;
    width: 3px;
    height: 13px;
    border-radius: 2px;
    background: ${({ $accent }) => $accent || MUTED};
  }
`;

const AboutText = styled.p`
  margin: 8px 0 0;
  font-size: ${({ $large }) => ($large ? '15px' : '14px')};
  line-height: 1.5;
  color: ${TEXT};
  opacity: 0.86;
  white-space: pre-line;
  overflow-wrap: anywhere;
`;

const AboutToggle = styled.button`
  margin: 4px 0 0;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--matching-accent, var(--km-accent, #C9600F));
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
`;

const ABOUT_COLLAPSE_LENGTH = 230;

// `title` — коли розповідь не «про себе»: батьки пишуть «Про нас».
export const ProfileAboutSection = ({ text, language, accent, large = false, title = '' }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const collapsible = text.length > ABOUT_COLLAPSE_LENGTH;
  const shown = collapsible && !expanded ? `${text.slice(0, ABOUT_COLLAPSE_LENGTH).trim()}…` : text;
  return (
    <DetailSection>
      <DetailTitle $accent={accent}>{title || profileUiText('about', language)}</DetailTitle>
      <AboutText $large={large}>{shown}</AboutText>
      {collapsible && (
        <AboutToggle
          type="button"
          aria-expanded={expanded}
          onClick={event => {
            event.stopPropagation();
            setExpanded(value => !value);
          }}
        >
          {uiText(expanded ? 'Згорнути' : 'Читати далі', language)}
        </AboutToggle>
      )}
    </DetailSection>
  );
};

export const ProfileDetailSections = ({ sections, accent, large = false }) => {
  if (!sections || sections.length === 0) return null;
  return sections.map(section => (
    <DetailSection key={section.key}>
      <DetailTitle $accent={accent}>{section.title}</DetailTitle>
      {section.text ? <AboutText $large={large}>{section.text}</AboutText> : null}
      {section.rows.length ? <ProfileFactList rows={section.rows} large={large} /> : null}
    </DetailSection>
  ));
};

const GOOD = 'var(--km-success, #2E9B55)';

const WishList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
`;

const WishChip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid ${({ $match }) => ($match ? GOOD : HAIRLINE)};
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.35;
  color: ${TEXT};

  b {
    color: ${GOOD};
    font-weight: 700;
  }
`;

const WishNote = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: ${MUTED};
`;

/**
 * «Більше про біологічних батьків»: як шукають, де програма, побажання до
 * донорки (`buildParentDetailSections`). Побажання — чіпами, а збіг з
 * анкетою читачки — «✓» на чіпі: відмови тут немає, бо побажання не
 * відсіюють.
 */
export const ParentDetailSections = ({ sections, accent, large = false }) => {
  if (!sections || sections.length === 0) return null;
  return sections.map(section => (
    <DetailSection key={section.key} data-testid={section.key}>
      <DetailTitle $accent={accent}>{section.title}</DetailTitle>
      {section.text ? <AboutText $large={large}>{section.text}</AboutText> : null}
      {section.items?.length ? (
        <WishList>
          {section.items.map(item => (
            <WishChip key={item.key} $match={item.match} data-match={item.match ? 'true' : undefined}>
              {item.match ? <b aria-hidden="true">✓</b> : null}
              <span>{item.label ? `${item.label}: ${item.text}` : item.text}</span>
            </WishChip>
          ))}
        </WishList>
      ) : null}
      {section.note ? <WishNote>{section.note}</WishNote> : null}
    </DetailSection>
  ));
};
