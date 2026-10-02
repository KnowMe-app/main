import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import {
  bmiValue,
  getBloodGroupDisplay,
  glassesLabel,
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
import { describeHair, describeLooks, describeSizes, describeWork } from '../utils/profileSentences';

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
 * 2. короткі факти (`buildProfileSummaryRows`) — зовнішність, пологи й
 *    донації, сімейний стан;
 * 3. розділи повної анкети (`buildProfileDetailSections`) — обличчя й фігура,
 *    освіта й робота, розміри.
 *
 * Перші дві частини беруть **лише поля картки стрічки** (`matchingCards`), тож
 * рядок списку показує їх одразу, без жодного читання, і не міняється, коли
 * приїхала повна анкета: верх відкритої картки — той самий блок тими самими
 * словами. Повна анкета лише уточнює на тих самих місцях: групу крові замість
 * самого резусу (`getBloodGroupDisplay`). Третя частина — те, чого в картці
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

const lowerFirst = text => (text ? text.charAt(0).toLocaleLowerCase('uk-UA') + text.slice(1) : '');

// Значення, вибране зі списку, — мовою інтерфейсу (`translateFieldValue`) і
// малими літерами: у рядку воно стоїть після підпису, а не починає речення.
// Малими всі, а не лише перша: у словнику трапляється «Пісочний Годинник».
const readOptionValue = (user, field, lang) => {
  const raw = normalizeDisplayValue(user?.[field]);
  if (!raw || isOtherValue(raw)) return '';
  return (lang === 'uk' ? translateFieldValue(field, raw) : raw).trim().toLocaleLowerCase('uk-UA');
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
// «Шатенка»), а перед «волоссям» стоїть прикметник. Структура тепер у картці
// стрічки (`hairStructure` у `MATCHING_CARD_MIRRORED_FIELDS`), тож усе про
// волосся стоїть тут, а не ще раз у розділах повної анкети.
const describeAppearance = (user, lang) => {
  const words = TRAIT_WORDS[lang];
  const eyes = readOptionValue(user, 'eyeColor', lang);
  const hair = describeHair(user, lang);
  const parts = [];
  if (eyes) parts.push(eyes.includes(words.eyes) ? eyes : `${eyes} ${words.eyes}`);
  if (hair) parts.push(hair);
  return parts.join(', ');
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

// «Пологи» — множинний іменник, і «2 пологи» українською не кажуть: до
// чотирьох це збірний числівник, далі — звичайний.
const UK_DELIVERY_WORDS = ['', 'одні пологи', 'двоє пологів', 'троє пологів', 'четверо пологів'];

/*
 * Давність пологів видно й тоді, коли кількості в анкеті немає: у частини
 * анкет заповнена сама дата останніх. Відкрита картка її показувала («3 роки
 * після пологів»), а рядок стрічки мовчав — бо питав спершу кількість.
 */
const describeDeliveries = (user, lang) => {
  const recency = formatDeliveryRecency(normalizeDisplayValue(user?.lastDelivery), lang);
  const read = readCount(normalizeDisplayValue(user?.ownKids));
  if (!read) {
    if (!recency) return { text: '', had: false };
    return { text: lang === 'uk' ? `останні пологи ${recency} тому` : `last delivery ${recency} ago`, had: true };
  }
  if (read.count === 0) return { text: lang === 'uk' ? 'пологів не було' : 'no deliveries', had: false };
  if (read.text) return { text: `${lang === 'uk' ? 'пологи' : 'deliveries'}: ${read.text}`, had: true };

  const count = read.count;
  let text;
  if (read.yes) text = lang === 'uk' ? 'були пологи' : 'had deliveries';
  else if (lang === 'uk') text = UK_DELIVERY_WORDS[count] || `${count} пологів`;
  else text = `${count} ${count === 1 ? 'delivery' : 'deliveries'}`;

  if (recency) {
    const single = count === 1;
    if (lang === 'uk') text += single ? `, ${recency} тому` : `, останні ${recency} тому`;
    else text += single ? `, ${recency} ago` : `, last ${recency} ago`;
  }
  return { text, had: true };
};

const describeCSection = (user, lang, hadDeliveries) => {
  const raw = normalizeDisplayValue(user?.[resolveCSectionKey(user)]);
  if (!raw) return '';
  const value = formatCSectionValue(raw);
  const label = profileUiText('factCSection', lang);
  // «Без КР» має сенс лише поруч із пологами: без них це відповідь на
  // питання, якого ніхто не ставив.
  if (value === '0') return hadDeliveries ? `${lang === 'uk' ? 'без' : 'no'} ${label}` : '';
  return `${label} ${value}`;
};

const ukDonationWord = count => {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return 'донацій';
  const ones = count % 10;
  if (ones === 1) return 'донація';
  if (ones >= 2 && ones <= 4) return 'донації';
  return 'донацій';
};

const describeDonations = (user, lang) => {
  const read = readCount(normalizeDisplayValue(user?.experience));
  if (!read) return '';
  if (read.count === 0) return lang === 'uk' ? 'донацій ще не було' : 'no donations yet';
  if (read.text) return `${lang === 'uk' ? 'донації' : 'donations'}: ${read.text}`;
  if (read.yes) return lang === 'uk' ? 'були донації' : 'has donated';
  return lang === 'uk'
    ? `${read.count} ${ukDonationWord(read.count)}`
    : `${read.count} ${read.count === 1 ? 'donation' : 'donations'}`;
};

// Число не відривається від свого слова («6 / донацій» на двох рядках), а
// крапка-розділювач — від попередньої частини: переноситься рядок лише між
// частинами.
const joinParts = parts => parts
  .map(part => part.replace(/(\d) (?=\S)/g, '$1 '))
  .join(' · ');

export const buildProfileSummaryRows = (user, language) => {
  const lang = resolveProfileLanguage(language);
  const rows = [];

  const appearance = describeAppearance(user, lang);
  if (appearance) rows.push({ key: 'appearance', label: translateProfileLabel('Appearance', lang), value: appearance });

  const deliveries = describeDeliveries(user, lang);
  const cSection = describeCSection(user, lang, deliveries.had);
  const donations = describeDonations(user, lang);
  const reproduction = [deliveries.text, cSection, donations].filter(Boolean);
  if (reproduction.length) {
    const hasDeliveries = Boolean(deliveries.text || cSection);
    let label = 'Deliveries, donations';
    if (!donations) label = 'Deliveries';
    else if (!hasDeliveries) label = 'Donations';
    rows.push({ key: 'reproduction', label: translateProfileLabel(label, lang), value: joinParts(reproduction) });
  }

  const marital = lowerFirst(maritalStatusLabel(normalizeDisplayValue(user?.maritalStatus), lang));
  if (marital) rows.push({ key: 'marital', label: translateProfileLabel('Marital status', lang), value: marital });

  return rows;
};

// Ключі полів, які вже сказав короткий блок: інші екрани (сітка, чипи) їх не
// повторюють.
export const PROFILE_SUMMARY_FIELD_KEYS = Object.freeze([
  'height', 'weight', 'bmi', 'blood', 'eyeColor', 'hairColor', 'hairStructure', 'ownKids', 'lastDelivery',
  ...CSECTION_KEYS, 'experience', 'maritalStatus',
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
  const localized = lang === 'uk' ? translateFieldValue('education', raw) : raw;
  // Підпис рядка вже каже «Освіта»: «вища освіта» поруч із ним — повтор.
  return lowerFirst(localized.replace(/\s+освіта$/i, '').trim());
};

const option = field => (user, lang) => readOptionValue(user, field, lang);
const typed = field => user => readTypedValue(user, field);

/*
 * Розділ = речення з відповідей, вибраних зі списку (`utils/profileSentences`),
 * плюс рядки «підпис — значення» для того, що людина набрала сама: власна
 * відповідь у речення не лягає, бо її рід і відмінок невідомі.
 */
const DETAIL_SECTIONS = [
  {
    key: 'looks',
    title: 'Face and figure',
    describe: describeLooks,
    fields: [
      { key: 'faceShape', label: 'Face shape', read: option('faceShape') },
      { key: 'noseShape', label: 'Nose', read: option('noseShape') },
      { key: 'lipsShape', label: 'Lips', read: option('lipsShape') },
      { key: 'chin', label: 'Chin', read: option('chin') },
      { key: 'bodyType', label: 'Body type', read: option('bodyType') },
      { key: 'breastSize', label: 'Breast size', read: typed('breastSize') },
      { key: 'race', label: 'Race', read: option('race') },
      { key: 'glasses', label: 'Glasses', read: (user, lang) => lowerFirst(glassesLabel(user?.glasses, lang)) },
    ],
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
  {
    key: 'sizes',
    title: 'Sizes',
    describe: describeSizes,
    fields: [
      { key: 'clothingSize', label: 'Clothing', read: typed('clothingSize') },
      { key: 'shoeSize', label: 'Shoe', read: typed('shoeSize') },
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

export const ProfileFactList = ({ rows, large = false }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <FactList>
      {rows.map(row => (
        <React.Fragment key={row.key}>
          <FactLabel>{row.label}</FactLabel>
          <FactValue $large={large}>{row.value}</FactValue>
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
  color: var(--matching-accent, var(--km-accent, #E8791A));
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
`;

const ABOUT_COLLAPSE_LENGTH = 230;

export const ProfileAboutSection = ({ text, language, accent, large = false }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const collapsible = text.length > ABOUT_COLLAPSE_LENGTH;
  const shown = collapsible && !expanded ? `${text.slice(0, ABOUT_COLLAPSE_LENGTH).trim()}…` : text;
  return (
    <DetailSection>
      <DetailTitle $accent={accent}>{profileUiText('about', language)}</DetailTitle>
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
