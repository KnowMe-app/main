import React, { useState } from 'react';
import styled from 'styled-components';
import { CheckboxGroup } from './CheckboxGroup';
import { REACTION_FILTER_KEYS } from 'utils/reactionCategory';
import { PAYMENT_FILTER_BUCKETS, PAYMENT_FILTER_NONE } from 'utils/donorPrograms';
import { uiText } from 'utils/uiTranslations';
import { isPersonalFilterGroup, roleSelectionAllowsPersonalAnketas } from 'utils/matchingPersonalFilters';
import { useAppSettings } from '../hooks/useAppSettings';

/* Оболонка груп. У поповері рейки вона гола (`$bare`): поповер сам уже
 * картка з рамкою, і друга рамка всередині читалась би наліпкою — та сама
 * помилка, що й з вкладеними плашками в рядку стрічки. */
const FiltersCard = styled.div`
  background: ${({ $bare }) => ($bare ? 'transparent' : 'var(--matching-section-bg, var(--km-card))')};
  border: ${({ $bare }) => ($bare ? 'none' : '1px solid var(--matching-section-border, var(--km-border))')};
  color: var(--matching-panel-text, var(--km-text));
  font-family: var(--km-font);
  border-radius: ${({ $bare }) => ($bare ? '0' : 'var(--km-radius)')};
  padding: ${({ $bare }) => ($bare ? '0' : '10px 12px 6px')};
  margin: ${({ $bare }) => ($bare ? '0' : '0 0 8px')};
`;

// Опція «даних немає» в групах стрічки. Тут стояв голий «?», і читач не знав,
// що під ним: анкети без віку, без резусу, без сімейного стану. Впізнає таку
// опцію позначка `unknown`, а не підпис (див. `isUnknownFilterOption`).
const UNKNOWN_OPTION_LABEL = 'Не вказано';

/*
 * Групи фільтрів стрічки — один перелік на рейку чіпів і на поповер групи.
 *
 * Підписи тут українські, бо український рядок — це ключ словника
 * (`uiTranslations`), а не переклад. Поки тут стояло `Blood group`, `Rh`, `Age`
 * і `BMI`, словник не мав що перекладати в інший бік: українська шухляда
 * показувала чотири англійські підписи між трьома українськими — половина
 * одного екрана однією мовою, половина іншою.
 *
 * Те саме з підписами опцій: вони йдуть крізь той самий `uiText`
 * (`localizeMatchingOptionLabel`), а код ролі чи межа діапазону (`ED`, `≤25`,
 * `Rh+`) проходять незмінними — словник вертає ключ, якого в ньому немає.
 */
export const MATCHING_FILTER_GROUPS = [
    {
      filterName: 'userRole',
      label: 'Тип профілю',
      // Роль називає те саме слово, що й плашка на картці (`getRoleLabel`,
      // перелік `PROFILE_ROLE_OPTIONS`). Тут стояли коди — `ED`, `AG`, `IP`, — і
      // їх знав лише той, хто бачив дані: читач дивився на «IP» й не знав, що
      // це біологічні батьки. Узгоджено саме з карткою: слово в чіпі й на
      // плашці фото однакове.
      //
      // «Інші», а не «?» чи «Без ролі»: під цю опцію `toRoleCategory` кладе
      // клініки й анкети без ролі взагалі.
      //
      // Сурогатна мати — окремий чіп: вона лежала в «Інших», і батьки, які
      // шукають саме СМ, не могли відфільтрувати її від клінік і порожніх
      // анкет. Збережений фільтр без цього ключа бере значення «Інших»
      // (`getInitialFilters`), тож нічого, що людина бачила, не зникає.
      options: [
        { val: 'ed', label: 'Донор ооцитів' },
        { val: 'sm', label: 'Сурогатна мати' },
        { val: 'ag', label: 'Агенція' },
        { val: 'ip', label: 'Біологічні батьки' },
        { val: 'other', label: 'Інші' },
      ],
    },
    // Групи «Виплата» тут більше немає: чіпи сум прибрано з рейки разом із
    // сортуванням за виплатою. Межі (`PAYMENT_FILTER_BUCKETS`) лишились у
    // `donorPrograms` — їх і далі рахує картка програми.
    {
      filterName: 'maritalStatus',
      label: 'Сімейний стан',
      options: [
        { val: 'married', label: 'Заміжня' },
        { val: 'unmarried', label: 'Не заміжня' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    // Групи крові в цьому переліку немає навмисно: лишився самий резус.
    //
    // Це та сама причина, з якої в неї не рахуються числа біля опцій: картка
    // стрічки носить сам лише знак резуса (`bloodGroup` у
    // `MATCHING_CARD_FORBIDDEN_FIELDS`), тож група крові в рейці була чіпом,
    // під яким усі опції показували нуль, а звуження за ним відрізало б деку
    // за тим, чого в ній не видно.
    //
    // Індекс `searchKey` тримає обидва в одному бакеті (`1+`, `2-`, `+`, `no`),
    // і провайдер це вміє — `buildBloodBuckets` бере резус і без групи, — тож
    // прибраний чіп нічого не ламає: бакети просто перестають звужуватись за
    // першим символом. Стара збережена позначка теж не переживає цього:
    // `getInitialFilters` переносить лише ті ключі, які є в переліку за
    // замовчуванням, а фільтр, якого читачеві більше не показують, не має
    // права далі різати деку мовчки.
    // Пологи й кесарів — з полів картки стрічки (`ownKids`, `csection`), тож
    // і числа біля опцій, і звуження бачать те саме, що рядок «Пологи».
    {
      filterName: 'deliveries',
      label: 'Пологи',
      compact: true,
      options: [
        { val: '0', label: 'Без дітей' },
        { val: 'le4', label: '≤4' },
        { val: 'ge5', label: '≥5' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    {
      filterName: 'cesarean',
      label: 'Кесарів розтин',
      compact: true,
      options: [
        { val: 'cs0', label: 'Не було' },
        { val: 'cs1', label: '1' },
        { val: 'cs2plus', label: '≥2' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    {
      filterName: 'rh',
      label: 'Резус',
      options: [
        { val: '+', label: 'Rh+' },
        { val: '-', label: 'Rh-' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    {
      filterName: 'age',
      label: 'Вік',
      compact: true,
      options: [
        { val: 'le25', label: '≤25' },
        { val: '26_30', label: '26-30' },
        { val: '31_33', label: '31-33' },
        { val: '34_36', label: '34-36' },
        { val: '37_plus', label: '37+' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    {
      filterName: 'bmi',
      label: 'ІМТ',
      compact: true,
      options: [
        { val: 'lt18_5', label: '<18.5' },
        { val: '18_5_24_9', label: '18.5-24.9' },
        { val: '25_29_9', label: '25-29.9' },
        { val: '30_plus', label: '30+' },
        { val: 'other', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
    {
      filterName: 'country',
      label: 'Країна',
      options: [
        { val: 'ua', label: 'Україна' },
        { val: 'other', label: 'Інша країна' },
        { val: 'unknown', label: UNKNOWN_OPTION_LABEL, unknown: true },
      ],
    },
  ];

// Matching's filters are subtractive: a group starts with everything on and the
// reader switches off what they don't want. So the chip label is built from what
// is *off*, not what is on - "крім Агентства" says more in less space than
// listing the four kinds that are still in.
//
// The "?" option (no data on record) is deliberately left out of the "крім"
// count: dropping unknowns is a different intent from excluding a real value,
// and a group where only "?" is off reads as "лише заповнені".
/*
 * Підпис опції мовою інтерфейсу.
 *
 * Словник вертає ключ незмінним, коли перекладу немає, тож через нього
 * можна пропускати все підряд: дволітерний код ролі й межа діапазону
 * лишаються собою, а «Заміжня» чи «Інша країна» перекладаються.
 */
export const localizeMatchingOptionLabel = (label, language) =>
  (typeof label === 'string' ? uiText(label, language) : label);

// «Даних немає»: у стрічці — позначка `unknown`, в адмінських групах — і далі
// голий «?».
const isUnknownFilterOption = option => Boolean(option?.unknown) || option?.label === '?';

export const buildMatchingFilterChipLabel = (group, values, language) => {
  const options = group.options || [];
  if (!values || typeof values !== 'object') return null;

  const off = options.filter(option => !values[option.val]);
  if (!off.length) return null;

  // Підпис групи й слова-звʼязки в чіпі йдуть мовою інтерфейсу: чіп стоїть
  // поруч із рештою шапки матчингу, і «Статус: крім Married» посеред
  // англійського екрана читалось як половина речення чужою мовою.
  const groupName = uiText(group.label, language);
  const on = options.filter(option => values[option.val]);
  if (!on.length) return { text: uiText('{group}: нічого', language, { group: groupName }), danger: true };

  const offWithoutUnknown = off.filter(option => !isUnknownFilterOption(option));
  if (!offWithoutUnknown.length) {
    return { text: uiText('{group}: лише заповнені', language, { group: groupName }), danger: false };
  }

  const listValues = list => list.map(option => localizeMatchingOptionLabel(option.label, language)).join(', ');

  // Чіп каже, кого показано, коли це коротше: обране «≥5» чіп називав
  // «Пологи: крім Без дітей, ≤4», а обрану «Україну» — «Країна: крім Інша
  // країна», мовчачи, що «Не вказано» теж сховано. «Тип профілю» — позитивно
  // й до трьох значень: агенція за замовчуванням бачила «крім Агенція,
  // Біологічні батьки», а донорка колись читала такий чіп як заборону.
  const positiveLimit = group.filterName === 'userRole' ? 3 : 2;
  if (on.length <= positiveLimit) {
    return { text: uiText('{group}: {values}', language, { group: groupName, values: listValues(on) }), danger: false };
  }

  // «Крім…» називає все сховане, зокрема «Не вказано»: без нього підпис
  // обіцяв картки, яких у деці немає.
  const offListed = off.length <= 3 ? off : null;
  if (offListed && offWithoutUnknown.length <= 2) {
    return { text: uiText('{group}: крім {values}', language, { group: groupName, values: listValues(offListed) }), danger: false };
  }
  return {
    text: uiText('{group}: {shown} з {total}', language, {
      group: groupName,
      shown: on.length,
      total: options.length,
    }),
    danger: false,
  };
};

/**
 * Ті самі групи, але без опцій, яких цьому читачеві не показують.
 *
 * Джерело переліку одне на шухляду і на чіпи: інакше донорці, якій `ED` у
 * шухляді вже не малюють, ряд чіпів однаково писав би «Тип профілю: крім ED» —
 * про позначку, якої вона не бачить і зняти не може.
 */
/*
 * `roleFilters` — поточний «Тип профілю». Групи про людину (сімейний стан,
 * пологи, резус, вік…) стоять лише тоді, коли в деці можуть бути особисті
 * анкети (`roleSelectionAllowsPersonalAnketas`): донорці, яка гортає агенції
 * й батьків, і агенції, яка обрала самих агенцій, вони нічого не звужують.
 * Без `roleFilters` групи не відсіюються — так їх бачать адмінські екрани.
 */
export const resolveMatchingFilterGroups = ({ roleOptionKeys, paymentOptionKeys, roleFilters } = {}) => {
  const hidePersonal = roleFilters !== undefined && !roleSelectionAllowsPersonalAnketas(roleFilters, roleOptionKeys);
  if (!Array.isArray(roleOptionKeys) && !Array.isArray(paymentOptionKeys) && !hidePersonal) return MATCHING_FILTER_GROUPS;
  const allowedRoles = Array.isArray(roleOptionKeys) ? new Set(roleOptionKeys) : null;
  const allowedPayments = Array.isArray(paymentOptionKeys) ? new Set(paymentOptionKeys) : null;
  return MATCHING_FILTER_GROUPS
    .filter(group => !(hidePersonal && isPersonalFilterGroup(group.filterName)))
    .map(group => {
    if (group.filterName === 'userRole' && allowedRoles) {
      return { ...group, options: group.options.filter(option => allowedRoles.has(option.val)) };
    }
    if (group.filterName === 'payment' && allowedPayments) {
      return { ...group, options: group.options.filter(option => allowedPayments.has(option.val)) };
    }
    return group;
  })
    // Група без жодної опції для цього читача — не чіп: агенції стрічка
    // показує донорок, і «Виплата» там нічого не звужувала б.
    .filter(group => group.options.length > 0);
};

/** Опції «Виплати» для читача: донорці — донорські межі, СМ — свої, решті — усі. */
export const listPaymentFilterKeysForViewer = viewerType => [
  ...(viewerType === 'sm' ? [] : PAYMENT_FILTER_BUCKETS.ed.map(bucket => bucket.key)),
  ...(viewerType === 'ed' ? [] : PAYMENT_FILTER_BUCKETS.sm.map(bucket => bucket.key)),
  PAYMENT_FILTER_NONE,
];

/*
 * Ряд чіпів рейки — чіп на кожну групу, а не лише на змінені.
 *
 * Раніше над стрічкою стояли самі лише активні фільтри, і ряд умів рівно
 * одне: зняти групу. Що ще можна звузити, було видно лише відкривши
 * шухляду — тобто інструмент називав себе тільки тоді, коли ним уже
 * скористались. Тепер група стоїть у ряду завжди: незаймана показує саму
 * назву (`Вік`), звужена — той самий підпис, що й старий чіп (`Вік: крім ≤25`).
 *
 * Перелік груп той самий, що й у поповера (`resolveMatchingFilterGroups`), тож
 * чіп, якого цьому читачеві не показують, не з’являється й тут.
 */
export const buildMatchingFilterRailChips = (filters, language, { roleOptionKeys, paymentOptionKeys } = {}) => {
  const chips = resolveMatchingFilterGroups({ roleOptionKeys, paymentOptionKeys, roleFilters: filters?.userRole ?? null }).map(group => {
    const groupLabel = uiText(group.label, language);
    const summary = buildMatchingFilterChipLabel(group, filters?.[group.filterName], language);
    return {
      filterName: group.filterName,
      groupLabel,
      text: summary ? summary.text : groupLabel,
      narrowed: Boolean(summary),
      danger: Boolean(summary?.danger),
    };
  });

  /*
   * Звужені групи йдуть першими, і це не оздоблення.
   *
   * Ряд прокручується вбік — груп сім, на екран телефона влазить чотири. Зі
   * сталим порядком «Країна: лише Україна» лишалась за межею екрана саме
   * тоді, коли пояснює, чому в деці п’ять карток замість сімнадцяти, — тобто
   * читач бачив порожнішу стрічку й жодного пояснення поруч.
   *
   * Смикання від цього немає: порядок рахується зі **застосованих** фільтрів,
   * а вони міняються лише на закритті поповера. Чіп під пальцем ніколи не
   * зрушається, а порядок всередині кожної половини лишається сталим.
   */
  return [...chips.filter(chip => chip.narrowed), ...chips.filter(chip => !chip.narrowed)];
};

export const buildMatchingFilterChips = (filters, language, { roleOptionKeys, paymentOptionKeys } = {}) =>
  resolveMatchingFilterGroups({ roleOptionKeys, paymentOptionKeys, roleFilters: filters?.userRole ?? null })
  .map(group => {
    const label = buildMatchingFilterChipLabel(group, filters?.[group.filterName], language);
    if (!label) return null;
    return { filterName: group.filterName, groupLabel: uiText(group.label, language), ...label };
  })
  .filter(Boolean);

/*
 * Фільтри картотеки адміна (`AddNewProfile`) — розділами, українською.
 *
 * Тут стояли чотирнадцять груп підряд англійськими кодами — `LA`, `IMT`,
 * `C-section`, опції `cs2+`, `pp`, `∅`, `+`/`-` для дати дзвінка, `unknown
 * format`, — і зрозуміти їх міг лише той, хто їх писав. Ключі опцій ті самі,
 * що й були (їх читає `filterMain` і індекс `searchKey`, а збережений стан
 * лежить у `localStorage`), — змінились лише слова й порядок.
 *
 * Розділи йдуть від того, про що адмін питає найчастіше: людина й здоровʼя —
 * це відбір донорки, «ваша робота з карткою» — позначки й остання дія, а
 * службові групи (контакти, тип id, кількість полів, довжина коментаря) —
 * інструменти чистки бази, тож вони згорнуті.
 *
 * Опції «даних немає» позначено `unknown`: підпис активного фільтра каже про
 * них окремо («лише заповнені»), як і в стрічці matching.
 */
const NOT_SET_LABEL = 'Не вказано';
const OTHER_VALUE_LABEL = 'Інше значення';

export const ADMIN_FILTER_SECTIONS = [
  {
    key: 'person',
    title: 'Людина',
    groups: [
      {
        filterName: 'role',
        label: 'Роль',
        options: [
          { val: 'ed', label: 'Донор ооцитів' },
          { val: 'sm', label: 'Сурогатна мати' },
          { val: 'ag', label: 'Агенція' },
          { val: 'ip', label: 'Біологічні батьки' },
          { val: 'pp', label: 'Батьки (стара анкета)' },
          { val: 'cl', label: 'Клініка' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'empty', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'age',
        label: 'Вік',
        compact: true,
        options: [
          { val: 'le25', label: '≤25' },
          { val: '26_30', label: '26–30' },
          { val: '31_33', label: '31–33' },
          { val: '34_36', label: '34–36' },
          { val: '37_42', label: '37–42' },
          { val: '43_plus', label: '43+' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'empty', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'maritalStatus',
        label: 'Сімейний стан',
        options: [
          { val: 'married', label: 'Заміжня' },
          { val: 'unmarried', label: 'Не заміжня' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'empty', label: NOT_SET_LABEL, unknown: true },
        ],
      },
    ],
  },
  {
    key: 'health',
    title: 'Здоровʼя',
    groups: [
      {
        filterName: 'bloodGroup',
        label: 'Група крові',
        compact: true,
        options: [
          { val: '1', label: '1' },
          { val: '2', label: '2' },
          { val: '3', label: '3' },
          { val: '4', label: '4' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'empty', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'rh',
        label: 'Резус',
        compact: true,
        options: [
          { val: '+', label: 'Rh+' },
          { val: '-', label: 'Rh−' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'empty', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'imt',
        label: 'ІМТ',
        compact: true,
        options: [
          { val: 'le28', label: '≤28' },
          { val: '29_31', label: '29–31' },
          { val: '32_35', label: '32–35' },
          { val: '36_plus', label: '36+' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'no', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'height',
        label: 'Зріст',
        compact: true,
        options: [
          { val: 'lt163', label: '<163' },
          { val: '163_176', label: '163–176' },
          { val: '177_180', label: '177–180' },
          { val: '181_plus', label: '181+' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'no', label: NOT_SET_LABEL, unknown: true },
        ],
      },
      {
        filterName: 'csection',
        label: 'Кесарів розтин',
        options: [
          { val: 'cs0', label: 'Не було' },
          { val: 'cs1', label: '1' },
          { val: 'cs2plus', label: '2 і більше' },
          { val: 'other', label: OTHER_VALUE_LABEL, unknown: true },
          { val: 'no', label: NOT_SET_LABEL, unknown: true },
        ],
      },
    ],
  },
  {
    key: 'work',
    title: 'Ваша робота з карткою',
    groups: [
      {
        // Категорію рахує `getReactionCategory`: «99» і реакції важать більше
        // за дату, а минула дата — це строго раніше за сьогодні.
        filterName: 'reaction',
        label: 'Мої позначки',
        options: [
          { val: REACTION_FILTER_KEYS.PAST_GET_IN_TOUCH, label: 'Дата дзвінка минула' },
          { val: REACTION_FILTER_KEYS.FUTURE_GET_IN_TOUCH, label: 'Дзвінок сьогодні чи пізніше' },
          { val: REACTION_FILTER_KEYS.LIKE, label: 'Обрані' },
          { val: REACTION_FILTER_KEYS.DISLIKE, label: 'Не цікаві' },
          { val: REACTION_FILTER_KEYS.SPECIAL_99, label: 'Не дзвонити (99)' },
          { val: REACTION_FILTER_KEYS.QUESTION, label: 'Нотатка замість дати' },
          { val: REACTION_FILTER_KEYS.NONE, label: 'Без позначок' },
        ],
      },
      {
        // Межі накопичувальні (`isLastActionAllowedByFilters`): «≤ 7 днів»
        // уже містить «сьогодні», тож обирати тут треба одну.
        filterName: 'lastAction',
        label: 'Остання дія',
        compact: true,
        options: [
          { val: 'today', label: 'Сьогодні' },
          { val: 'yesterday', label: 'Вчора' },
          { val: 'last3days', label: '≤ 3 днів' },
          { val: 'last7days', label: '≤ 7 днів' },
          { val: 'last14days', label: '≤ 14 днів' },
          { val: 'last30days', label: '≤ 30 днів' },
          { val: 'no', label: 'Не було' },
          { val: '?', label: 'Дата нечитна', unknown: true },
        ],
      },
    ],
  },
  {
    key: 'service',
    title: 'Службові',
    note: 'для чистки бази',
    collapsible: true,
    groups: [
      {
        // Картка проходить, коли в ній є бодай один з обраних контактів.
        filterName: 'contact',
        label: 'Є контакт',
        options: [
          { val: 'phone', label: 'Телефон' },
          { val: 'telegram', label: 'Telegram' },
          { val: 'telegram2', label: 'Telegram 2' },
          { val: 'instagram', label: 'Instagram' },
          { val: 'facebook', label: 'Facebook' },
          { val: 'tiktok', label: 'TikTok' },
          { val: 'email', label: 'Пошта' },
          { val: 'twitter', label: 'X' },
          { val: 'line', label: 'LINE' },
          { val: 'ameblo', label: 'Ameblo' },
          { val: 'vk', label: 'VK' },
          { val: 'otherLink', label: 'Сайт' },
        ],
      },
      {
        filterName: 'userId',
        label: 'ID картки',
        options: [
          { val: 'long', label: 'Акаунт (довгий id)' },
          { val: 'mid', label: '9–20 знаків' },
          { val: 'aa', label: 'aa…' },
          { val: 'ab', label: 'ab…' },
          { val: 'id', label: 'ID…' },
          { val: 'vk', label: 'vk…' },
          { val: 'other', label: 'Інший' },
        ],
      },
      {
        filterName: 'fields',
        label: 'Заповнено полів',
        compact: true,
        options: [
          { val: 'le5', label: '≤5' },
          { val: 'f6_10', label: '6–10' },
          { val: 'f11_20', label: '11–20' },
          { val: 'f20_plus', label: '20+' },
        ],
      },
      {
        filterName: 'commentLength',
        label: 'Коментар, слів',
        compact: true,
        options: [
          { val: 'w0_9', label: '0–9' },
          { val: 'w10_29', label: '10–29' },
          { val: 'w30_49', label: '30–49' },
          { val: 'w50_99', label: '50–99' },
          { val: 'w100_199', label: '100–199' },
          { val: 'w200_plus', label: '200+' },
          { val: 'other', label: 'Без коментаря' },
        ],
      },
    ],
  },
];

export const ADMIN_FILTER_GROUPS = ADMIN_FILTER_SECTIONS.flatMap(section => section.groups);

const filterAdminGroups = (groups, { hideUserId, hideCommentLength, allowedFilterNames } = {}) => {
  const allowedSet = Array.isArray(allowedFilterNames) && allowedFilterNames.length > 0
    ? new Set(allowedFilterNames)
    : null;
  return groups.filter(group => !(hideUserId && group.filterName === 'userId')
    && !(hideCommentLength && group.filterName === 'commentLength')
    && (!allowedSet || allowedSet.has(group.filterName)));
};

/**
 * Активні фільтри адміна — підписами для чіпів над списком («Вік: 26–30»,
 * «Роль: крім Агенція»). Правило підпису те саме, що в стрічці
 * (`buildMatchingFilterChipLabel`): коротше з «кого показано» і «крім кого».
 */
export const buildAdminFilterChips = filters => ADMIN_FILTER_GROUPS
  .map(group => {
    const label = buildMatchingFilterChipLabel(group, filters?.[group.filterName], 'uk');
    if (!label) return null;
    return { filterName: group.filterName, groupLabel: group.label, ...label };
  })
  .filter(Boolean);

const SectionTitle = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--km-text);
`;

const SectionNote = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: var(--km-muted);
`;

const Section = styled.section`
  & + & {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--km-border);
  }
`;

const SectionToggle = styled.button`
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--km-text);
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--km-accent-ring);
    outline-offset: 2px;
  }
`;

const SectionBody = styled.div`
  margin-top: 10px;
`;

const AdminFilterSections = ({ filters, onChange, optionCounts, groupOptions }) => {
  const [openSections, setOpenSections] = useState({});
  const sections = ADMIN_FILTER_SECTIONS
    .map(section => ({ ...section, groups: filterAdminGroups(section.groups, groupOptions) }))
    .filter(section => section.groups.length > 0);

  const renderGroups = groups => groups.map(group => (
    <CheckboxGroup
      key={group.filterName}
      label={group.label}
      filterName={group.filterName}
      options={group.options}
      optionCounts={optionCounts?.[group.filterName]}
      filters={filters}
      onChange={onChange}
      selectOnly
      compact={group.compact}
    />
  ));

  return sections.map(section => {
    if (!section.collapsible) {
      return (
        <Section key={section.key} data-testid={`admin-filter-section-${section.key}`}>
          <SectionTitle>{section.title}</SectionTitle>
          {renderGroups(section.groups)}
        </Section>
      );
    }
    // Згорнутий розділ, у якому вже щось звужено, розгортається сам:
    // фільтр, якого не видно, діяв би мовчки.
    const narrowed = section.groups.some(group => group.options.some(option => filters?.[group.filterName]?.[option.val] === false));
    const open = openSections[section.key] ?? narrowed;
    return (
      <Section key={section.key} data-testid={`admin-filter-section-${section.key}`}>
        <SectionToggle
          type="button"
          aria-expanded={open}
          onClick={() => setOpenSections(previous => ({ ...previous, [section.key]: !open }))}
        >
          {open ? '▾' : '▸'} {section.title}
          {section.note && <SectionNote>{section.note}</SectionNote>}
        </SectionToggle>
        {open && <SectionBody>{renderGroups(section.groups)}</SectionBody>}
      </Section>
    );
  });
};

export const SearchFilters = ({
  filters,
  onChange,
  hideUserId = false,
  hideCommentLength = false,
  mode = 'default',
  allowedFilterNames,
  roleOptionKeys,
  paymentOptionKeys,
  optionCounts,
  bare = false,
}) => {
  const { language } = useAppSettings();

  if (mode !== 'matching') {
    // Тап по чіпу обирає те, що шукаєте (`selectOnly`), як і в стрічці
    // matching: «Група крові → 2» лишає саму другу групу. Доти тут було
    // віднімання — група стартувала з усім увімкненим, і щоб побачити другу
    // групу крові, треба було вимкнути п'ять інших.
    return (
      <FiltersCard $bare={bare}>
        <AdminFilterSections
          filters={filters}
          onChange={onChange}
          optionCounts={optionCounts}
          groupOptions={{ hideUserId, hideCommentLength, allowedFilterNames }}
        />
      </FiltersCard>
    );
  }

  let groups = resolveMatchingFilterGroups({ roleOptionKeys, paymentOptionKeys, roleFilters: filters?.userRole ?? null });
  if (Array.isArray(allowedFilterNames) && allowedFilterNames.length > 0) {
    const allowedSet = new Set(allowedFilterNames);
    groups = groups.filter(group => allowedSet.has(group.filterName));
  }

  return (
    <FiltersCard $bare={bare}>
      {groups.map(group => (
        <CheckboxGroup
          key={group.filterName}
          // У поповері рейки (`bare`) назва групи вже стоїть у шапці, і другий
          // такий самий підпис під нею читався як два різні заголовки.
          label={bare ? '' : uiText(group.label, language)}
          filterName={group.filterName}
          options={group.options.map(option => ({
            ...option,
            label: localizeMatchingOptionLabel(option.label, language),
          }))}
          // Числа «серед завантажених» — рахує їх сторінка, бо лише вона
          // знає, яка саме дека зараз на екрані.
          optionCounts={optionCounts?.[group.filterName]}
          filters={filters}
          onChange={onChange}
          selectOnly
          compact={group.compact}
        />
      ))}
    </FiltersCard>
  );
};
