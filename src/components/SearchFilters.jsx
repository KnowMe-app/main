import React from 'react';
import styled from 'styled-components';
import { FaFacebookF, FaInstagram, FaTelegramPlane, FaVk } from 'react-icons/fa';
import { PhoneHandsetIcon } from './icons/PhoneHandsetIcon';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { FaXTwitter } from 'react-icons/fa6';
import { CheckboxGroup } from './CheckboxGroup';
import { REACTION_FILTER_OPTIONS } from 'utils/reactionCategory';
import { uiText } from 'utils/uiTranslations';
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
      // Роль називає той самий дволітерний код, що й плашка на картці
      // (`getRoleCode`). Тут стояли слова — «ДО», «Агентства», «Батьки», — і
      // чіп фільтра казав про роль одне, а картка під ним інше.
      options: [
        { val: 'ed', label: 'ED' },
        { val: 'ag', label: 'AG' },
        { val: 'ip', label: 'IP' },
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'maritalStatus',
      label: 'Статус',
      options: [
        { val: 'married', label: 'Заміжня' },
        { val: 'unmarried', label: 'Не заміжня' },
        { val: 'other', label: '?' },
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
    {
      filterName: 'rh',
      label: 'Резус',
      options: [
        { val: '+', label: 'Rh+' },
        { val: '-', label: 'Rh-' },
        { val: 'other', label: '?' },
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
        { val: 'other', label: '?' },
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
        { val: 'other', label: '?' },
      ],
    },
    {
      filterName: 'country',
      label: 'Країна',
      options: [
        { val: 'ua', label: 'Україна' },
        { val: 'other', label: 'Інша країна' },
        { val: 'unknown', label: '?' },
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

  const offWithoutUnknown = off.filter(option => option.label !== '?');
  if (!offWithoutUnknown.length) {
    return { text: uiText('{group}: лише заповнені', language, { group: groupName }), danger: false };
  }

  if (offWithoutUnknown.length <= 2) {
    return {
      text: uiText('{group}: крім {values}', language, {
        group: groupName,
        values: offWithoutUnknown.map(option => localizeMatchingOptionLabel(option.label, language)).join(', '),
      }),
      danger: false,
    };
  }
  if (on.length <= 2) {
    return {
      text: uiText('{group}: {values}', language, {
        group: groupName,
        values: on.map(option => localizeMatchingOptionLabel(option.label, language)).join(', '),
      }),
      danger: false,
    };
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
export const resolveMatchingFilterGroups = ({ roleOptionKeys } = {}) => {
  if (!Array.isArray(roleOptionKeys)) return MATCHING_FILTER_GROUPS;
  const allowed = new Set(roleOptionKeys);
  return MATCHING_FILTER_GROUPS.map(group => (
    group.filterName === 'userRole'
      ? { ...group, options: group.options.filter(option => allowed.has(option.val)) }
      : group
  ));
};

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
export const buildMatchingFilterRailChips = (filters, language, { roleOptionKeys } = {}) => {
  const chips = resolveMatchingFilterGroups({ roleOptionKeys }).map(group => {
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

export const buildMatchingFilterChips = (filters, language, { roleOptionKeys } = {}) =>
  resolveMatchingFilterGroups({ roleOptionKeys })
  .map(group => {
    const label = buildMatchingFilterChipLabel(group, filters?.[group.filterName], language);
    if (!label) return null;
    return { filterName: group.filterName, groupLabel: uiText(group.label, language), ...label };
  })
  .filter(Boolean);

export const SearchFilters = ({
  filters,
  onChange,
  hideUserId = false,
  hideCommentLength = false,
  mode = 'default',
  allowedFilterNames,
  roleOptionKeys,
  bloodSearchKeyMode = false,
  reactionFilterOptions,
  optionCounts,
  bare = false,
}) => {
  const { language } = useAppSettings();
  let groups = [];
  const contactIconStyle = { display: 'inline-flex', alignItems: 'center' };
  const reactionOptions = reactionFilterOptions || (bloodSearchKeyMode
    ? [
        { key: 'pastGetInTouch', label: 'past' },
        { key: 'futureGetInTouch', label: 'future' },
        { key: 'like', label: '❤️' },
        { key: 'special99', label: '✖' },
        { key: 'question', label: '?' },
        { key: 'none', label: 'no' },
      ]
    : REACTION_FILTER_OPTIONS);

  if (mode === 'matching') {
    groups = resolveMatchingFilterGroups({ roleOptionKeys });
  } else {
    groups = [
      {
        filterName: 'reaction',
        label: 'Reaction',
        options: reactionOptions.map(option => ({
          val: option.key,
          label: option.label,
        })),
      },
      {
        filterName: 'lastAction',
        label: 'LA',
        compact: true,
        options: [
          { val: 'today', label: 'Today' },
          { val: 'yesterday', label: 'Yesterday' },
          { val: 'last3days', label: '3d' },
          { val: 'last7days', label: '7d' },
          { val: 'last14days', label: '14d' },
          { val: 'last30days', label: '30d' },
          { val: 'no', label: 'empty' },
          { val: '?', label: 'unknown format' },
        ],
      },
      {
        filterName: 'csection',
        label: 'C-section',
        options: [
          { val: 'cs2plus', label: 'cs2+' },
          { val: 'cs1', label: 'cs1' },
          { val: 'cs0', label: 'cs0' },
          { val: 'other', label: '?' },
          { val: 'no', label: 'no' },
        ],
      },
      {
        filterName: 'role',
        label: 'Role',
        options: [
          { val: 'ed', label: 'ed' },
          { val: 'sm', label: 'sm' },
          { val: 'ag', label: 'ag' },
          { val: 'ip', label: 'ip' },
          { val: 'pp', label: 'pp' },
          { val: 'cl', label: 'cl' },
          { val: 'other', label: '?' },
          ...(bloodSearchKeyMode
            ? [
                { val: 'empty', label: 'no' },
              ]
            : []),
        ],
      },
      {
        filterName: 'maritalStatus',
        label: 'Marital status',
        options: [
          { val: 'married', label: 'Married' },
          { val: 'unmarried', label: 'Single' },
          { val: 'other', label: '?' },
          ...(bloodSearchKeyMode
            ? [
                { val: 'empty', label: 'no' },
              ]
            : []),
        ],
      },
      {
        filterName: 'bloodGroup',
        label: 'Blood group',
        options: [
          { val: '1', label: '1' },
          { val: '2', label: '2' },
          { val: '3', label: '3' },
          { val: '4', label: '4' },
          { val: 'other', label: '?' },
          ...(bloodSearchKeyMode
            ? [
                { val: 'empty', label: 'no' },
              ]
            : []),
        ],
      },
      {
        filterName: 'rh',
        label: 'Rh',
        options: [
          { val: '+', label: '+' },
          { val: '-', label: '-' },
          { val: 'other', label: '?' },
          ...(bloodSearchKeyMode
            ? [
                { val: 'empty', label: 'no' },
              ]
            : []),
        ],
      },
      {
        filterName: 'age',
        label: 'Age',
        options: [
          { val: 'le25', label: '≤25' },
          { val: '26_30', label: '26-30' },
          { val: '31_33', label: '31-33' },
          { val: '34_36', label: '34-36' },
          { val: '37_42', label: '37-42' },
          { val: '43_plus', label: '43+' },
          { val: 'other', label: '?' },
          ...(bloodSearchKeyMode
            ? [
                { val: 'empty', label: 'no' },
              ]
            : []),
        ],
      },
      {
        filterName: 'imt',
        label: 'IMT',
        compact: true,
        options: [
          { val: 'le28', label: '≤28' },
          { val: '29_31', label: '29-31' },
          { val: '32_35', label: '32-35' },
          { val: '36_plus', label: '36+' },
          { val: 'other', label: '?' },
          { val: 'no', label: 'no' },
        ],
      },
      {
        filterName: 'height',
        label: 'Height',
        compact: true,
        options: [
          { val: 'lt163', label: '<163' },
          { val: '163_176', label: '163-176' },
          { val: '177_180', label: '177-180' },
          { val: '181_plus', label: '181+' },
          { val: 'other', label: '?' },
          { val: 'no', label: 'no' },
        ],
      },
      {
        filterName: 'contact',
        label: 'Контакти',
        compact: true,
        options: [
          { val: 'vk', label: <span style={contactIconStyle} title="VK"><FaVk /></span> },
          { val: 'instagram', label: <span style={contactIconStyle} title="Instagram"><FaInstagram /></span> },
          { val: 'ameblo', label: <span style={contactIconStyle} title="Ameblo">AB</span> },
          { val: 'facebook', label: <span style={contactIconStyle} title="Facebook"><FaFacebookF /></span> },
          { val: 'phone', label: <span style={contactIconStyle} title="Телефон"><PhoneHandsetIcon /></span> },
          { val: 'telegram', label: <span style={contactIconStyle} title="Telegram"><FaTelegramPlane /></span> },
          {
            val: 'telegram2',
            label: (
              <span style={contactIconStyle} title="Telegram #2">
                <FaTelegramPlane />
                <span style={{ marginLeft: '4px' }}>#2</span>
              </span>
            ),
          },
          { val: 'tiktok', label: <span style={contactIconStyle} title="TikTok"><SiTiktok /></span> },
          { val: 'email', label: <span style={contactIconStyle} title="Пошта"><MdEmail /></span> },
          { val: 'twitter', label: <span style={contactIconStyle} title="Twitter / X"><FaXTwitter /></span> },
          { val: 'line', label: <span style={contactIconStyle} title="Line">LINE</span> },
          { val: 'otherLink', label: <span style={contactIconStyle} title="Website">www</span> },
        ],
      },
      {
        filterName: 'userId',
        label: 'UserId',
        options: [
          { val: 'vk', label: 'vk' },
          { val: 'aa', label: 'aa' },
          { val: 'ab', label: 'ab' },
          { val: 'id', label: 'ID' },
          { val: 'long', label: '>20' },
          { val: 'mid', label: '>8<20' },
          { val: 'other', label: '?' },
        ],
      },
      {
        filterName: 'fields',
        label: 'Fields',
        options: [
          { val: 'le5', label: '≤5' },
          { val: 'f6_10', label: '6-10' },
          { val: 'f11_20', label: '11-20' },
          { val: 'f20_plus', label: '20+' },
        ],
      },
      {
        filterName: 'commentLength',
        label: 'Comment words',
        options: [
          { val: 'w0_9', label: '0-9' },
          { val: 'w10_29', label: '10-29' },
          { val: 'w30_49', label: '30-49' },
          { val: 'w50_99', label: '50-99' },
          { val: 'w100_199', label: '100-199' },
          { val: 'w200_plus', label: '200+' },
          { val: 'other', label: 'Все інше' },
        ],
      },
    ];
  }

  if (hideUserId) {
    groups = groups.filter(g => g.filterName !== 'userId');
  }
  if (hideCommentLength) {
    groups = groups.filter(g => g.filterName !== 'commentLength');
  }
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
          label={bare ? '' : (mode === 'matching' ? uiText(group.label, language) : group.label)}
          filterName={group.filterName}
          options={mode === 'matching'
            ? group.options.map(option => ({
              ...option,
              label: localizeMatchingOptionLabel(option.label, language),
            }))
            : group.options}
          // Числа «серед завантажених» — рахує їх сторінка, бо лише вона
          // знає, яка саме дека зараз на екрані.
          optionCounts={optionCounts?.[group.filterName]}
          filters={filters}
          onChange={onChange}
          selectOnly={mode === 'matching'}
          compact={group.compact}
        />
      ))}
    </FiltersCard>
  );
};
