import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { CardBackendExtras } from './CardBackendExtras';
import styled, { css } from 'styled-components';
import { revealCss } from '../styles/revealAnimation';
import { get as firebaseGet, ref as refDb } from 'firebase/database';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';

import { inputUpdateValue } from './inputUpdatedValue';
import { useAutoResize } from '../hooks/useAutoResize';
import { color, OrangeBtn, uiTokens } from './styles';
import {
  pickerFieldsExtended as pickerFields,
  ppTechnicalKeyValueFieldNames,
  getFieldLabel,
  getFieldPlaceholder,
  getOptionLabel,
  getOptionValue,
} from './formFields';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import {
  formatDateToDisplay,
  formatDateAndFormula,
  normalizePhoneValue,
} from 'components/inputValidations';
import { parseUkTriggerQuery } from 'utils/parseUkTrigger';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { resolvePpTechnicalInputTargets } from 'utils/ppTechnicalInputTarget';
import { appendFieldValue, appendTextBlockValue } from 'utils/ppTechnicalInputAppend';
import {
  buildOverlayFieldEntries,
  buildSupersededOverlayEntries,
  getCanonicalCard,
  getOverlayHistoryForCard,
  pruneOverlaysMatchingCanonical,
  settleSupersededOverlayValue,
} from 'utils/multiAccountEdits';
import { PROFILE_BACKEND_REFRESH_EVENT } from 'utils/profileBackendRefresh';
import { loadProfileMutationHistory } from 'utils/profileMutations';
import { profileProposalService } from 'utils/profileProposalRepository';
import { profileProposalPaths } from 'utils/profileProposalStoragePaths';
import { areProposalValuesEqual } from 'utils/profileProposals';
import { SCREEN_ACCESS_OPTIONS, encodeScreenAccess, isAdminUid, parseScreenAccess } from 'utils/accessLevel';
import {
  PROFILE_DRAFT_SAVED_EVENT,
  describeDraftHistoryChange,
  getDraftRecordCreator,
  getDraftRecordDataSegments,
  isDraftProfileRecord,
} from 'utils/profileRecordSource';
import toast from 'react-hot-toast';
import { removeField } from './smallCard/actions';
import { FaArrowRight, FaTimes } from 'react-icons/fa';
import { InfoModal } from './InfoModal';
import { auth, database } from './config';
// Перелік індексованих полів і формат ключа беремо з того самого модуля, яким
// індексується анкета: локальна копія встигла розійтися з ним (не було
// `ameblo`), а ключ, побудований інакше, вказував би не на той вузол.
import { SEARCH_ID_INDEXED_FIELDS, describeSearchIdRecord, readSearchIdEntryIds } from 'utils/searchKeyUtils';
import { MULTI_DATA_ACCESS_FIELD } from 'utils/multiDataAccess';
import {
  groupProfileFormFieldsByBlock,
  buildProfileFormBlockHeader,
  buildRtdbConsoleLink,
  resolveProfileFormBlock,
  PROFILE_FORM_BLOCK_IDS,
} from './profileFormNodeBlocks';
import {
  appendEmptyFieldRow,
  canAppendFieldRow,
  fieldAcceptsMultipleValues,
  isUnfilledNewFieldRow,
  markFieldRowErased,
} from 'utils/profileFieldRows';
import { NestedObjectField, isNestedObjectValue } from './NestedObjectField';
import { PROFILE_FIELD_CHIPS_VISIBLE, rankFieldsByFillStats, splitProfileFormFields } from 'utils/profileFieldChips';
import { loadProfileFieldStats } from './profileFieldStatsRemote';
import { ProfileDataTree } from './ProfileDataTree';
import {
  PROFILE_DATE_FIELDS,
  resolveBirthDateFromAgeInput,
  resolveBirthDateFromAgeShorthand,
} from 'utils/profileDate';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'ProfileForm',
    path: args[0],
  });

export const getFieldsToRender = state => {
  const additionalFields = Object.keys(state).filter(
    key =>
      !pickerFields.some(field => field.name === key) &&
      key !== 'attitude' &&
      key !== 'whiteList' &&
      key !== 'blackList' &&
      key !== 'photos'
  );

  return [
    ...pickerFields,
    ...additionalFields.map(key => ({
      name: key,
      placeholder: key,
      ukrainianHint: PROFILE_FORM_LABELS[key] || key,
    })),
  ];
};

// Форма не показує: позначку власника (`getInTouch`), прибрані права
// (`accessLevel`, `canCreateProfiles`, `additionalAccessRules` — 22.11) і
// спільних власників реакцій (`multiDataAccessUserIds`): їх правлять у «Усі
// дані картки в базі», а рядком форми вони лише займали місце.
const PROFILE_FORM_FIELDS_TO_HIDE = new Set([
  'getInTouch',
  'accessLevel',
  'canCreateProfiles',
  'additionalAccessRules',
  MULTI_DATA_ACCESS_FIELD,
]);
const COMPACT_PROFILE_FIELDS = new Set(['birth', 'region', 'city', 'height', 'weight', 'blood']);
const PROFILE_FORM_TECHNICAL_FIELDS = new Set([
  'screenAccess',
  MULTI_DATA_ACCESS_FIELD,
]);

const buildOverlayPaths = cardUserId => {
  const normalizedCardId = String(cardUserId || '').trim();
  if (!normalizedCardId) return [];

  return [`${profileProposalPaths.update}/${normalizedCardId}`];
};

// Людські назви службових полів (22.11): адмін читав `lastCycle`,
// `cycleStatus`, `createdAt` сирими ключами бази.
const PROFILE_FORM_LABELS = {
  lastLogin: 'Останній логін',
  lastLogin2: 'Останній логін',
  publish: 'Опубліковано',
  vk: 'VK',
  clothingSize: 'Розмір одягу',
  lastCycle: 'Перший день циклу',
  cycleStatus: 'Стан циклу',
  createdAt: 'Створено',
  registrationDate: 'Реєстрація',
  seekingRole: 'Кого шукають',
  seeking: 'Кого шукають',
  programsAt: 'Програми оновлено',
  hiddenRoles: 'Сховані анкети',
  healthComplications: 'Ускладнення',
  street: 'Вулиця',
  screenAccess: 'Додаткові екрани',
  multiDataSourceUserIds: 'Спільні дані',
  agencyName: 'Назва агенції',
  orgFeatures: 'Ознаки організації',
  photoThumbs: 'Мініатюри фото',
  language: 'Мова',
};

const getFieldDisplayLabel = field => {
  const fieldName = resolveFieldNameBase(field?.name);

  return PROFILE_FORM_LABELS[fieldName] || getFieldLabel(field) || fieldName;
};

const getFieldPlaceholderText = field => {
  const fieldName = resolveFieldNameBase(field?.name);

  return getFieldPlaceholder(field) || PROFILE_FORM_LABELS[fieldName] || getFieldLabel(field) || fieldName;
};

const removeButtonStyle = {
  width: '20px',
  height: '20px',
  marginLeft: '3px',
  marginRight: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${color.iconActive}`,
  padding: 0,
  flexShrink: 0,
};

const fieldRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '8px',
  flexWrap: 'nowrap',
  marginBottom: '4px',
};

const fieldValueStyle = {
  flexShrink: 1,
  minWidth: 0,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
};

const nestedValueContainerStyle = {
  flex: '1 1 auto',
  minWidth: 0,
};

const nestedIndentStyle = {
  marginLeft: '20px',
};

const resolveFieldNameBase = fieldName => String(fieldName || '').replace(/-\d+$/, '');

const BIRTH_DATE_FIELDS = new Set(['birth', 'birthWife', 'birthHusband']);

const PROFILE_FORM_RESTORE_LOG_PREFIX = '[ProfileRestore][ProfileForm]';

const getProfileFormRestoreTimestamp = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now());
  }
  return Date.now();
};

const PROFILE_FORM_RESTORE_DEBUG_STEPS = new Set([
  'admin-overlay-additions:load-success',
  'admin-overlay-additions:load-error',
  'editor-overlay:auto-apply-start',
  'editor-overlay:auto-apply-replacements',
  'editor-overlay:auto-apply-error',
]);

const logProfileFormRestoreStep = (step, payload = {}) => {
  if (!PROFILE_FORM_RESTORE_DEBUG_STEPS.has(step)) return;

  console.log(PROFILE_FORM_RESTORE_LOG_PREFIX, step, {
    at: getProfileFormRestoreTimestamp(),
    ...payload,
  });
};

const PHENOTYPE_FIELDS = [
  'eyeColor',
  'hairColor',
  'glasses',
  'hairStructure',
  'race',
  'bodyType',
  'faceShape',
  'noseShape',
  'lipsShape',
  'chin',
  'phenotype',
  'phenotypicCharacteristics',
  'phenotypeResponsibility',
  'responsibility',
];
const ANTHROPOMETRY_FIELDS = ['height', 'weight', 'imt', 'clothingSize', 'shoeSize', 'breastSize'];
const normalizePpTechnicalTargetValue = (fieldName, value) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';

  if (fieldName === 'phone') {
    return normalizePhoneValue(rawValue);
  }

  if (fieldName === 'otherLink') {
    return rawValue;
  }

  return inputUpdateValue(rawValue, { name: fieldName });
};

const normalizePpTechnicalFieldKey = rawKey =>
  String(rawKey || '').trim().toLowerCase().replace(/\s+/g, '');

const PP_TECHNICAL_FIELD_ALIASES = Object.fromEntries(
  ppTechnicalKeyValueFieldNames.map(fieldName => [normalizePpTechnicalFieldKey(fieldName), fieldName])
);

const normalizePpTechnicalKeyValueField = rawKey => {
  const normalized = normalizePpTechnicalFieldKey(rawKey);
  return PP_TECHNICAL_FIELD_ALIASES[normalized] || '';
};

const parsePpTechnicalKeyValueInput = rawInput => {
  const lines = String(rawInput || '').replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let activeBlock = null;

  const finishActiveBlock = () => {
    if (!activeBlock) return;
    entries.push({
      fieldName: activeBlock.fieldName,
      value: activeBlock.lines.join('\n').trim(),
    });
    activeBlock = null;
  };

  for (const line of lines) {
    const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_\s]*)\s*:\s*(.*)$/);

    if (keyValueMatch) {
      const fieldName = normalizePpTechnicalKeyValueField(keyValueMatch[1]);
      if (!fieldName) {
        if (activeBlock) activeBlock.lines.push(line.replace(/^\s{2}/, ''));
        continue;
      }

      finishActiveBlock();

      const rawValue = keyValueMatch[2] ?? '';
      if (rawValue.trim() === '|') {
        activeBlock = { fieldName, lines: [] };
      } else {
        entries.push({ fieldName, value: rawValue.trim() });
      }
      continue;
    }

    if (activeBlock) {
      activeBlock.lines.push(line.replace(/^\s{2}/, ''));
    }
  }

  finishActiveBlock();

  return entries.filter(({ value }) => String(value ?? '').trim());
};

const PP_TECHNICAL_APPEND_FIELD_NAMES = new Set([
  'name',
  'surname',
  'phone',
  'email',
  'telegram',
  'facebook',
  'instagram',
  'ameblo',
  'tiktok',
  'linkedin',
  'youtube',
  'twitter',
  'line',
  'otherLink',
  'other',
  'vk',
]);

const applyPpTechnicalKeyValueEntry = (stateDraft, fieldName, normalizedValue) => {
  if (fieldName === 'myComment') {
    stateDraft[fieldName] = appendTextBlockValue(stateDraft[fieldName], normalizedValue);
    return;
  }

  if (PP_TECHNICAL_APPEND_FIELD_NAMES.has(fieldName)) {
    stateDraft[fieldName] = appendFieldValue(stateDraft[fieldName], normalizedValue, fieldName);
    return;
  }

  stateDraft[fieldName] = normalizedValue;
};

const normalizePpTechnicalKeyValueEntry = (fieldName, value) => {
  if (fieldName === 'myComment') {
    return String(value ?? '').trim();
  }

  return normalizePpTechnicalTargetValue(fieldName, value);
};

const REPRODUCTIVE_FIELDS = [
  'birth',
  'ownKids',
  'lastDelivery',
  'lastCycle',
  'csection',
  'experience',
  'reward',
  'opuDate',
  'opuCountry',
  'opuEggsNumber',
];
const MEDICAL_LIFESTYLE_FIELDS = [
  'allergy',
  'surgeries',
  'chronicDiseases',
  'smoking',
  'alcohol',
  'sport',
  'hobbies',
  'twinsInFamily',
];
const HIDDEN_FOR_CL_PP_FIELDS = new Set([
  ...PHENOTYPE_FIELDS,
  ...ANTHROPOMETRY_FIELDS,
  ...REPRODUCTIVE_FIELDS,
  ...MEDICAL_LIFESTYLE_FIELDS,
  'profession',
  'education',
  'maritalStatus',
  'blood',
  'bloodGroup',
  'rh',
]);
const canOpenSearchIdBackendShortcut = (fieldName, value) =>
  (fieldName === 'userId' || SEARCH_ID_INDEXED_FIELDS.has(fieldName)) && String(value ?? '').trim();
const searchIdRecordContainsUserId = (recordValue, userId) =>
  Boolean(userId) && readSearchIdEntryIds(recordValue).includes(userId);

// Посилання в консоль будує один спільний хелпер — той самий, що й для
// заголовків блоків. Дві копії форматування вже розійшлися одна з одною, і
// саме в цьому був зламаний слеш після `/data`.
const buildUsersBackendUrl = userId => (userId ? buildRtdbConsoleLink(['matchingCards', userId]) : '');
const buildSearchIdBackendUrl = (searchIdRecordKey, searchIdField) =>
  (searchIdRecordKey ? buildRtdbConsoleLink(['searchId', searchIdRecordKey, searchIdField].filter(Boolean)) : '');


// Сталий порожній обʼєкт: `AddNewProfile` пропозицій не передає, а `= {}` у
// параметрі — новий обʼєкт на кожен рендер, і ефект відхилених пропозицій
// крутився без кінця («Maximum update depth exceeded»).
const EMPTY_OVERLAY_FIELD_ADDITIONS = Object.freeze({});

const sanitizeOverlayValue = value => {
  if (Array.isArray(value)) {
    const normalized = value.map(item => sanitizeOverlayValue(item)).filter(item => item !== '');
    return normalized.join(', ');
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const technicalOverlayFields = new Set(['editor', 'cachedAt', 'lastAction', 'cacheVersion']);
const resolveOverlayIncomingValue = change => {
  if (!change || typeof change !== 'object') return undefined;

  if (Object.prototype.hasOwnProperty.call(change, 'to')) {
    return change.to;
  }

  if (Object.prototype.hasOwnProperty.call(change, 'added')) {
    return change.added;
  }

  if (Object.prototype.hasOwnProperty.call(change, 'add')) {
    return change.add;
  }

  return undefined;
};

const formatOverlayDebugValue = value => {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map(item => sanitizeOverlayValue(item))
      .filter(item => item !== '');

    return normalizedItems.length ? `[${normalizedItems.join(', ')}]` : '—';
  }

  const normalizedValue = sanitizeOverlayValue(value);
  return normalizedValue === '' ? '—' : normalizedValue;
};

const describeOverlayChange = change => {
  if (!change || typeof change !== 'object') {
    return null;
  }

  const fromText = formatOverlayDebugValue(change.from);
  const toRaw = resolveOverlayIncomingValue(change);
  const toText = formatOverlayDebugValue(toRaw);
  const hasIncomingValue =
    Object.prototype.hasOwnProperty.call(change, 'to') ||
    Object.prototype.hasOwnProperty.call(change, 'add') ||
    Object.prototype.hasOwnProperty.call(change, 'added');

  if (hasIncomingValue) {
    return `${fromText} → ${toText}`;
  }

  if (Array.isArray(change?.removed) && change.removed.length > 0) {
    return `${formatOverlayDebugValue(change.removed)} → —`;
  }

  return null;
};

const normalizeOverlayComparableValue = value => sanitizeOverlayValue(value);

const normalizeOverlayReplacementValue = value => {
  if (Array.isArray(value)) {
    return value.map(item => (item === null || item === undefined ? '' : String(item).trim())).filter(Boolean);
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const mergeOverlayAddedValues = (currentValue, addedValue) => {
  const currentItems = Array.isArray(currentValue)
    ? currentValue
    : currentValue === undefined || currentValue === null || currentValue === ''
      ? []
      : [currentValue];

  const incomingItems = Array.isArray(addedValue) ? addedValue : [addedValue];
  const normalizedCurrent = currentItems
    .map(item => (item === null || item === undefined ? '' : String(item).trim()))
    .filter(Boolean);
  const normalizedIncoming = incomingItems
    .map(item => (item === null || item === undefined ? '' : String(item).trim()))
    .filter(Boolean);

  const merged = [...normalizedCurrent];
  normalizedIncoming.forEach(item => {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  });

  if (!merged.length) return '';
  if (merged.length === 1) return merged[0];
  return merged;
};

// Рекурсивне відображення всіх полів користувача, включно з вкладеними об'єктами та масивами
export const renderAllFields = (data, parentKey = '', options = {}) => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderAllFields:', data);
    return null;
  }

  const { userId, setUsers, stateUpdater, onRemoveKey } = options;
  const effectiveSetUsers = typeof setUsers === 'function' ? setUsers : stateUpdater;
  const canRemove = typeof effectiveSetUsers === 'function';

  // keyPath у handleRemove завжди рахується від кореня картки, тож removeField
  // потрібен саме кореневий об'єкт, а не піддерево поточного рівня рекурсії.
  // Він дає removeField синхронний знімок картки, щоб пейлоад для бекенду не
  // залежав від того, чи встигне React виконати updater-колбек setUsers.
  const rootData = parentKey ? options.rootData : data;
  const childOptions = parentKey ? options : { ...options, rootData: data };

  const handleRemove = keyPath => {
    if (typeof onRemoveKey === 'function') {
      const handled = onRemoveKey(keyPath);
      if (handled) {
        return;
      }
    }

    if (!canRemove) {
      return;
    }

    removeField(userId, keyPath, effectiveSetUsers, stateUpdater, keyPath, { cardData: rootData });
  };

  const extendedData = { ...data };
  if (typeof extendedData.birth === 'string') {
    extendedData.age = utilCalculateAge(extendedData.birth);
  }

  const priority = [
    'name',
    'surname',
    'fathersname',
    'birth',
    'blood',
    'maritalStatus',
    'csection',
    'weight',
    'height',
    'ownKids',
    'lastDelivery',
    'lastCycle',
    'facebook',
    'instagram',
    'telegram',
    'phone',
    'tiktok',
    'vk',
    'writer',
    'myComment',
    'region',
    'city',
  ];

  const sortedKeys = Object.keys(extendedData).sort((a, b) => {
    const indexA = priority.indexOf(a);
    const indexB = priority.indexOf(b);

    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return sortedKeys.map(key => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = extendedData[key];

    if (Array.isArray(value)) {
      return (
        <div key={nestedKey} style={{ marginBottom: '8px' }}>
          <div style={fieldRowStyle}>
            <span style={fieldValueStyle}>
              <strong>{key}</strong>
              {': '}
            </span>
            <div style={{ ...nestedValueContainerStyle }}>
              <div style={nestedIndentStyle}>
                {value.length > 0 ? (
                  value.map((item, idx) => {
                    const arrayKey = `${nestedKey}.${idx}`;

                    if (typeof item === 'object' && item !== null) {
                      return (
                        <div key={arrayKey} style={fieldRowStyle}>
                          <span style={fieldValueStyle}>
                            <strong>[{idx}]</strong>
                            {': '}
                          </span>
                          <div style={{ ...nestedValueContainerStyle }}>
                            <div style={nestedIndentStyle}>
                              {renderAllFields(item, arrayKey, childOptions)}
                            </div>
                          </div>
                          {canRemove && (
                            <OrangeBtn
                              type="button"
                              style={removeButtonStyle}
                              onClick={() => handleRemove(arrayKey)}
                            >
                              <FaTimes size={12} />
                            </OrangeBtn>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={arrayKey} style={fieldRowStyle}>
                        <span style={fieldValueStyle}>
                          <strong>[{idx}]</strong>
                          {': '}
                          {item != null ? item.toString() : '—'}
                        </span>
                        {canRemove && (
                          <OrangeBtn
                            type="button"
                            style={removeButtonStyle}
                            onClick={() => handleRemove(arrayKey)}
                          >
                            <FaTimes size={12} />
                          </OrangeBtn>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span style={fieldValueStyle}>—</span>
                )}
              </div>
            </div>
            {canRemove && (
              <OrangeBtn
                type="button"
                style={removeButtonStyle}
                onClick={() => handleRemove(nestedKey)}
              >
                <FaTimes size={12} />
              </OrangeBtn>
            )}
          </div>
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey} style={{ marginBottom: '8px' }}>
          <div style={fieldRowStyle}>
            <span style={fieldValueStyle}>
              <strong>{key}</strong>
              {': '}
            </span>
            <div style={{ ...nestedValueContainerStyle }}>
              <div style={nestedIndentStyle}>{renderAllFields(value, nestedKey, childOptions)}</div>
            </div>
            {canRemove && (
              <OrangeBtn
                type="button"
                style={removeButtonStyle}
                onClick={() => handleRemove(nestedKey)}
              >
                <FaTimes size={12} />
              </OrangeBtn>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={nestedKey} style={fieldRowStyle}>
        <span style={fieldValueStyle}>
          <strong>{key}</strong>
          {': '}
          {value != null ? value.toString() : '—'}
        </span>
        {canRemove && (
          <OrangeBtn
            type="button"
            style={removeButtonStyle}
            onClick={() => handleRemove(nestedKey)}
          >
            <FaTimes size={12} />
          </OrangeBtn>
        )}
      </div>
    );
  });
};

// Перелік полів-дат спільний з формою чернетки — див. `PROFILE_DATE_FIELDS`.
// `lastCycle` пишеться через ту саму нормалізацію дат (`normalizeStoredDates`),
// а `createdAt` лише показується — обидва крапками, як решта дат форми.
const PROFILE_FORM_DATE_FIELDS = new Set([...PROFILE_DATE_FIELDS, 'lastCycle']);
const PROFILE_FORM_READ_ONLY_DATE_FIELDS = new Set(['createdAt', 'registrationDate']);

/**
 * Блоки, розгорнуті доти, доки їх не згорнули руками.
 *
 * Анкету заповнюють згори вниз: картка стрічки, контакти, решта анкети. Усе
 * інше — робота з анкетою, технічне, legacy — читається зрідка й точково, і
 * саме воно розтягувало форму на кілька екранів інпутів.
 */
const DEFAULT_OPEN_PROFILE_FORM_BLOCKS = new Set([
  PROFILE_FORM_BLOCK_IDS.matchingCards,
  PROFILE_FORM_BLOCK_IDS.profileContacts,
  PROFILE_FORM_BLOCK_IDS.profileDetails,
]);

const OPEN_PROFILE_FORM_BLOCKS_STORAGE_KEY = 'profileFormOpenBlocks';

const isProfileFormBlockOpen = (openBlocks, blockId) => (
  Object.prototype.hasOwnProperty.call(openBlocks || {}, blockId)
    ? Boolean(openBlocks[blockId])
    : DEFAULT_OPEN_PROFILE_FORM_BLOCKS.has(blockId)
);

// `localStorage` тут — зручність, а не дані: у приватному вікні його може не
// бути взагалі, і форма має відкритись із типовими блоками, а не впасти.
const readOpenProfileFormBlocks = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(OPEN_PROFILE_FORM_BLOCKS_STORAGE_KEY) || 'null');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch (error) {
    return {};
  }
};

const persistOpenProfileFormBlocks = openBlocks => {
  try {
    localStorage.setItem(OPEN_PROFILE_FORM_BLOCKS_STORAGE_KEY, JSON.stringify(openBlocks));
  } catch (error) {
    // Ніде не показуємо: незбережений стан згортання нічого не ламає.
  }
};

/**
 * Поле, яке форма показує не в тому блоці, де воно лежить у базі.
 *
 * Повне прізвище живе в `profileDetails`, а картка стрічки несе лише ініціал
 * (`surnameShort`). Через це інпут прізвища стояв за кілька блоків від імені —
 * тобто рівно там, де його не шукають, заповнюючи ПІБ. Тепер він стоїть під
 * імʼям, а свій справжній вузол називає сам: підпис поруч із полем.
 */
const PROFILE_FORM_FIELD_DISPLAY_BLOCKS = {
  surname: { blockId: PROFILE_FORM_BLOCK_IDS.matchingCards, after: 'name' },
  // Кров стоїть одним рядком зі зростом і вагою (`MetricRow`), хоч лежить у
  // `profileDetails`.
  blood: { blockId: PROFILE_FORM_BLOCK_IDS.matchingCards, after: 'weight' },
};

// Короткі значення, що влазять утрьох в один рядок: це лише спосіб показу —
// збереження й правки ті самі, що в будь-якого поля.
const METRIC_ROW_FIELDS = ['height', 'weight', 'blood'];
// Короткі підписи в рядку: «Група крові та резус» на третині ширини телефона
// переносилось на два рядки й зсувало своє поле нижче сусідів.
const METRIC_ROW_LABELS = { height: 'Зріст, см', weight: 'Вага, кг', blood: 'Кров' };

const groupMetricRowFields = fields => {
  const items = [];
  let pending = [];
  const flush = () => {
    if (pending.length > 1) items.push({ metricRow: true, fields: pending });
    else pending.forEach(field => items.push({ field }));
    pending = [];
  };
  fields.forEach(field => {
    if (METRIC_ROW_FIELDS.includes(field?.name)) {
      pending.push(field);
      return;
    }
    flush();
    items.push({ field });
  });
  flush();
  return items;
};

export const ProfileForm = ({
  state,
  setState: setExternalState,
  handleBlur,
  handleSubmit,
  handleClear,
  handleDelKeyValue,
  handleFieldFocus,
  highlightedFields = [],
  deletedOverlayFields = [],
  isAdmin = false,
  dataSource = '',
  overlayFieldAdditions = EMPTY_OVERLAY_FIELD_ADDITIONS,
  refreshOverlayForEditor,
  deletingFieldsRef,
  // Batch 26 §8: whether the per-field backend-navigation arrows (SearchIdBackendButton) show at
  // all - defaults to true so a caller that hasn't wired up the toggle yet (no regression) keeps
  // today's always-visible behavior; AddNewProfile.jsx passes its own persisted toggle state.
  extendedMode = true,
}) => {
  const latestProfileDraftRef = useRef(state || {});
  const profileFormVersionRef = useRef(0);
  useEffect(() => {
    latestProfileDraftRef.current = state || {};
  }, [state]);
  const setState = useCallback((updater, debug = {}) => {
    setExternalState(prevState => {
      const nextState = typeof updater === 'function' ? updater(prevState) : updater;
      const changed = nextState !== prevState;
      if (changed) {
        profileFormVersionRef.current += 1;
        latestProfileDraftRef.current = nextState || {};
      }
      console.log('[ProfileSnapshotDebug][ProfileForm]', {
        source: debug.source || 'userChange',
        caller: debug.caller || 'ProfileForm.setState',
        timestamp: new Date().toISOString(),
        at: getProfileFormRestoreTimestamp(),
        version: profileFormVersionRef.current,
        applied: changed,
        reason: changed ? debug.reason || 'local-draft-updated' : debug.reason || 'unchanged',
        userId: nextState?.userId || prevState?.userId || '',
      });
      return nextState;
    });
  }, [setExternalState]);
  const canManageScreenAccess = isAdmin;
  // Чернетка — інше джерело, ніж готова анкета: один запис у
  // `multiData/profileMutations` з власним журналом. Посилання блоків і
  // історія правок ідуть за ним (див. `utils/profileRecordSource.js`).
  const isDraftRecord = isDraftProfileRecord(state);
  const draftRecordSegments = getDraftRecordDataSegments(state);
  const draftRecordCreator = getDraftRecordCreator(state);
  const [draftHistory, setDraftHistory] = useState({ cardId: '', entries: [], loading: false, error: '' });
  const fieldsMapForHistory = useMemo(() => new Map(pickerFields.map(field => [field.name, field])), []);
  const textareaRef = useRef(null);
  const moreInfoRef = useRef(null);
  const ppTechnicalInputRef = useRef(null);
  const [selectedField, setSelectedField] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [ppTechnicalInput, setPpTechnicalInput] = useState('');
  const [autoOverlayFieldAdditions, setAutoOverlayFieldAdditions] = useState({});
  const [authoritativeOverlayCardId, setAuthoritativeOverlayCardId] = useState('');
  const [dismissedOverlayEntries, setDismissedOverlayEntries] = useState({});
  // Пропозицію можна поправити перед тим, як прийняти: у ній буває зайвий
  // пробіл чи плюс, і доти адмін мусив прийняти як є, а потім правити поле
  // вручну. Виправлене лежить тут і тільки тут — у шарі редактора й в індексі
  // далі стоїть те, що він справді надіслав.
  const [overlayEntryDrafts, setOverlayEntryDrafts] = useState({});
  // Рішення по оверлеях можуть містити кілька послідовних RTDB-запитів.
  // Тримаємо їх у тому самому promise-ланцюжку, що й звичайні збереження
  // анкети: хрестик реагує одразу, а швидкі кліки не перетинають транзакції.
  const overlaySettlementQueueRef = useRef(Promise.resolve());
  // Які блоки анкети розгорнуті. Вибір переживає перезавантаження: анкету
  // відкривають десятки разів на день, і згортати ті самі блоки щоразу заново —
  // це та сама робота, від якої блоки й згортаються.
  const [openProfileFormBlocks, setOpenProfileFormBlocks] = useState(readOpenProfileFormBlocks);
  const toggleProfileFormBlock = useCallback(blockId => {
    setOpenProfileFormBlocks(previous => {
      const next = { ...previous, [blockId]: !isProfileFormBlockOpen(previous, blockId) };
      persistOpenProfileFormBlocks(next);
      return next;
    });
  }, []);
  // Поля, яких у картці немає, стоять чіпами «Додати поле» (21.11, на прохання
  // власниці продукту): форма з усіма полями була довгою, і заповнене губилось
  // серед порожнього. Відкрите чіпом поле лишається полем до іншої картки —
  // інакше стерте зникало б з-під пальця.
  const [revealedProfileFields, setRevealedProfileFields] = useState(() => new Set());
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [profileFieldStats, setProfileFieldStats] = useState(null);
  const pendingFieldFocusRef = useRef('');
  const formRootRef = useRef(null);
  useEffect(() => {
    setRevealedProfileFields(new Set());
    setChipsExpanded(false);
  }, [state?.userId]);
  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    loadProfileFieldStats().then(stats => {
      if (active) setProfileFieldStats(stats);
    });
    return () => {
      active = false;
    };
  }, [isAdmin]);
  // Новий порожній рядок — намір, а не значення (`appendEmptyFieldRow`):
  // зберігати нема чого, значення поїде в базу з першим набраним символом.
  const appendEmptyRowsTo = fieldNames => {
    // Знімати памʼятку, якої в стані немає зовсім, — це окреме збереження
    // (з новою `rev`) на кожен дотик до «+».
    if (Object.prototype.hasOwnProperty.call(state, 'myComment') && !state.myComment?.trim()) {
      handleDelKeyValue('myComment');
    }
    setState(prevState => fieldNames.reduce((next, fieldName) => ({
      ...next,
      [fieldName]: appendEmptyFieldRow(prevState[fieldName]),
    }), prevState));
  };
  // Чіпи стоять одним переліком під усіма блоками, тож блок поля може бути
  // згорнутим: тоді поле не змонтувалось би, а фокус не знайшов би нічого.
  // Чіп відкриває й свій блок.
  const revealProfileField = useCallback((fieldName, blockId) => {
    pendingFieldFocusRef.current = fieldName;
    if (blockId) {
      setOpenProfileFormBlocks(previous => {
        if (isProfileFormBlockOpen(previous, blockId)) return previous;
        const next = { ...previous, [blockId]: true };
        persistOpenProfileFormBlocks(next);
        return next;
      });
    }
    setRevealedProfileFields(previous => new Set(previous).add(fieldName));
  }, []);
  useEffect(() => {
    const fieldName = pendingFieldFocusRef.current;
    if (!fieldName) return;
    pendingFieldFocusRef.current = '';
    const group = formRootRef.current?.querySelector(`[data-profile-field="${String(fieldName).replace(/["\\]/g, '\\$&')}"]`);
    const control = group?.querySelector('input:not([type="checkbox"]), textarea, select');
    if (!group) return;
    group.scrollIntoView?.({ block: 'center' });
    control?.focus?.({ preventScroll: true });
  }, [revealedProfileFields]);
  const autoAppliedOverlayForUserRef = useRef('');
  // Відхилене лишається відхиленим до зміни картки. Поки скидання висіло ще й
  // на `overlayFieldAdditions`, воно спрацьовувало на кожному оновленні
  // пропса — а пропс перебудовується щоразу, коли `EditProfile` перечитує
  // шари, — і щойно прибраний хрестиком рядок повертався на екран сам собою.
  useEffect(() => {
    setDismissedOverlayEntries({});
    setOverlayEntryDrafts({});
  }, [state?.userId]);

  useEffect(() => {
    setAuthoritativeOverlayCardId('');
    setAutoOverlayFieldAdditions({});
  }, [state?.userId]);

  // A dismissal only suppresses the currently loaded overlay entry. Once a
  // refresh confirms that entry is gone, forget its signature so a later,
  // identical suggestion from the editor can be reviewed again.
  useEffect(() => {
    setDismissedOverlayEntries(previous => {
      if (!Object.keys(previous).length) return previous;
      return Object.entries(previous).reduce((next, [fieldName, signatures]) => {
      const liveSignatures = new Set((overlayFieldAdditions[fieldName] || []).map(entry => {
        const value = sanitizeOverlayValue(entry?.value);
        return `${value}::${entry?.editorUserId || ''}::${entry?.isDeleted ? '1' : '0'}${entry?.superseded ? '::v' : ''}`;
      }));
      const stillPresent = signatures.filter(signature => liveSignatures.has(signature));
      if (stillPresent.length) next[fieldName] = stillPresent;
      return next;
      }, {});
    });
  }, [overlayFieldAdditions]);

  const normalizeGetInTouchForSubmit = draftState => {
    if (!draftState || typeof draftState !== 'object') {
      return draftState;
    }

    if (!Object.prototype.hasOwnProperty.call(draftState, 'getInTouch')) {
      return draftState;
    }

    const rawValue = draftState.getInTouch;
    const normalized = formatDateAndFormula(rawValue);

    if (!normalized) {
      const { getInTouch: _omit, ...rest } = draftState;
      return rest;
    }

    return { ...draftState, getInTouch: normalized };
  };

  const submitWithNormalization = useCallback(async (nextState, overwrite, delCondition, options = {}) => {
    const payload =
      nextState && typeof nextState === 'object'
        ? normalizeGetInTouchForSubmit(nextState)
        : nextState;
    const submitProfileChanges = () => {
      const submission = Promise.resolve(
        handleSubmit(payload, overwrite, delCondition, 'submitWithNormalization')
      );
      if (options?.propagateSubmitError) return submission;
      submission.catch(error => {
        console.error('Failed to submit profile changes', error);
        const details = error?.message || String(error);
        toast.error(`Не вдалося зберегти зміни профілю.\n${details}`);
      });
      return undefined;
    };
    return submitProfileChanges();
  }, [handleSubmit]);

  const autoResizeMyComment = useAutoResize(textareaRef, state.myComment);
  const autoResizeMoreInfo = useAutoResize(moreInfoRef, state.moreInfo_main);
  const autoResizePpTechnicalInput = useAutoResize(ppTechnicalInputRef, ppTechnicalInput);

  const priorityOrder = [
    'birth',
    'name',
    'surname',
    'fathersname',
    'phone',
    'facebook',
    'instagram',
    'telegram',
    'tiktok',
    'region',
    'city',
    'height',
    'weight',
    'blood',
    'maritalStatus',
    'csection',
    'ownKids',
    'lastDelivery',
    'role',
  ];

  const fieldsToRender = getFieldsToRender(state);

  const normalizedFieldsToRender = (() => {
    let next = fieldsToRender;

    if (canManageScreenAccess && !next.some(field => field.name === 'screenAccess')) {
      next = [
        ...next,
        {
          name: 'screenAccess',
          placeholder: 'додаткові екрани',
          ukrainianHint: 'які додаткові екрани (Flow) відкрити користувачу',
        },
      ];
    }

    return next.filter(field => !PROFILE_FORM_FIELDS_TO_HIDE.has(resolveFieldNameBase(field?.name)));
  })();


  const getOverlayEntrySignature = entry => {
    const value = sanitizeOverlayValue(entry?.value);
    const replaced = entry?.replacement ? JSON.stringify(entry.replacement.from) : '';
    return `${value}::${entry?.editorUserId || ''}::${entry?.isDeleted ? '1' : '0'}::${replaced}`;
  };

  const getOverlayEntriesForField = fieldName => {
    if (!isAdmin) return [];

    const mergedEntries = authoritativeOverlayCardId === state?.userId
      ? (autoOverlayFieldAdditions[fieldName] || [])
      : [
        ...(overlayFieldAdditions[fieldName] || []),
        ...(autoOverlayFieldAdditions[fieldName] || []),
      ];

    return mergedEntries.filter((entry, idx, arr) => {
      const signature = getOverlayEntrySignature(entry);
      if ((dismissedOverlayEntries[fieldName] || []).includes(signature)) {
        return false;
      }

      return arr.findIndex(candidate => {
        const candidateSignature = getOverlayEntrySignature(candidate);
        return candidateSignature === signature;
      }) === idx;
    });
  };

  const dismissOverlayEntry = useCallback((fieldName, entry) => {
    const signature = getOverlayEntrySignature(entry);

    setDismissedOverlayEntries(prev => {
      const fieldEntries = prev[fieldName] || [];
      if (fieldEntries.includes(signature)) return prev;
      return { ...prev, [fieldName]: [...fieldEntries, signature] };
    });

    setAutoOverlayFieldAdditions(prev => {
      if (!prev[fieldName]) return prev;
      const nextEntries = prev[fieldName].filter(candidate => getOverlayEntrySignature(candidate) !== signature);
      if (nextEntries.length === prev[fieldName].length) return prev;
      if (!nextEntries.length) {
        const { [fieldName]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fieldName]: nextEntries };
    });
  }, []);

  const restoreOverlayEntry = useCallback((fieldName, entry) => {
    const signature = getOverlayEntrySignature(entry);

    setDismissedOverlayEntries(prev => {
      const nextSignatures = (prev[fieldName] || []).filter(candidate => candidate !== signature);
      if (nextSignatures.length === (prev[fieldName] || []).length) return prev;
      if (!nextSignatures.length) {
        const { [fieldName]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fieldName]: nextSignatures };
    });

    setAutoOverlayFieldAdditions(prev => {
      const currentEntries = prev[fieldName] || [];
      if (currentEntries.some(candidate => getOverlayEntrySignature(candidate) === signature)) return prev;
      return { ...prev, [fieldName]: [...currentEntries, entry] };
    });
  }, []);

  const readOverlayFieldAdditions = useCallback(async cardUserId => {
    const paths = buildOverlayPaths(cardUserId);
    if (!paths.length) return { paths: [], result: {} };

    const readOverlays = async () => Promise.all(
      paths.map(async path => {
        const snapshot = await get(refDb(database, path));
        return { path, exists: snapshot.exists(), rawValue: snapshot.exists() ? snapshot.val() : null };
      })
    );

    let snapshots = await readOverlays();

    // Картка читається з бекенду, а не з форми: у формі може лежати ще не
    // збережене, а рішення «це вже в анкеті» стосується записаного.
    let canonical = null;
    try {
      canonical = await getCanonicalCard(cardUserId);
    } catch (error) {
      console.warn('[ProfileForm] canonical card unavailable for overlay review', error);
    }

    // Пропозиція значення, яке в картці вже стоїть, нічого не пропонує: вона
    // лише дублює анкету на бекенді й висить у черзі. Такі значення знімаються
    // ще до показу — разом зі своїми записами в журналі.
    if (canonical && snapshots.some(item => item.rawValue)) {
      try {
        let pruned = 0;
        for (const item of snapshots) {
          if (!item.rawValue) continue;
          // eslint-disable-next-line no-await-in-loop
          pruned += await pruneOverlaysMatchingCanonical({ cardUserId, canonical, overlaysByEditor: item.rawValue });
        }
        if (pruned) snapshots = await readOverlays();
      } catch (error) {
        console.warn('[ProfileForm] overlay cleanup against the card skipped', error);
      }
    }

    // Пропозиції розкладає одне місце на всі екрани — по рядку на
    // значення, а не по рядку на поле.
    const result = {};
    snapshots.forEach(item => {
      Object.entries(buildOverlayFieldEntries(item.rawValue) || {}).forEach(([fieldName, entries]) => {
        result[fieldName] = [
          ...(result[fieldName] || []),
          ...(entries || []).map(entry => ({ ...entry, expectedCurrent: item.rawValue[entry.editorUserId] })),
        ];
      });
    });

    // Попередні версії правок живуть лише в журналі: шар тримає саму поточну
    // різницю, і друга правка того самого поля переписувала першу. Адмін
    // мусить бачити обидві — інакше він вирішує про правку, не знаючи, що
    // їй передувало.
    try {
      const historyEntries = await getOverlayHistoryForCard(cardUserId);
      const overlaysByEditor = snapshots.reduce((acc, item) => ({ ...acc, ...(item.rawValue || {}) }), {});
      const superseded = buildSupersededOverlayEntries({ historyEntries, overlaysByEditor, canonical });
      Object.entries(superseded).forEach(([fieldName, entries]) => {
        result[fieldName] = [...entries, ...(result[fieldName] || [])];
      });
    } catch (error) {
      console.warn('[ProfileForm] overlay history unavailable', error);
    }

    return { paths, result };
  }, []);

  const reconcileOverlayEntriesFromBackend = useCallback(async cardUserId => {
    const { result } = await readOverlayFieldAdditions(cardUserId);
    setAutoOverlayFieldAdditions(result);
    setAuthoritativeOverlayCardId(cardUserId);
    setDismissedOverlayEntries(previous => Object.entries(previous).reduce((next, [fieldName, signatures]) => {
      const backendSignatures = new Set(
        (result[fieldName] || []).map(getOverlayEntrySignature)
      );
      const stillDismissed = signatures.filter(signature => !backendSignatures.has(signature));
      if (stillDismissed.length) next[fieldName] = stillDismissed;
      return next;
    }, {}));
  }, [readOverlayFieldAdditions]);

  // Журнал чернетки (`multiData/profileMutationHistory/{картка}`): кожне
  // збереження автора, редактора чи адміна — запис «поле: було → стало».
  // Пропозиції редакторів (`multiData/editsHistory`) його не містять: правки
  // чернетки йдуть не шаром, а в неї саму, і доти адмін не бачив їх ніде,
  // крім черги на `create-profile`. Перечитується на відкритті, на «усі
  // поля» і після кожного запису чернетки в цьому табі.
  useEffect(() => {
    if (!isAdmin || !isDraftRecord || !state?.userId || typeof window === 'undefined') return undefined;
    const cardId = state.userId;
    let cancelled = false;
    let sequence = 0;
    const load = () => {
      sequence += 1;
      const current = sequence;
      setDraftHistory(previous => ({ ...previous, cardId, loading: true }));
      loadProfileMutationHistory(cardId)
        .then(entries => {
          if (cancelled || current !== sequence) return;
          setDraftHistory({ cardId, entries, loading: false, error: '' });
        })
        .catch(error => {
          if (cancelled || current !== sequence) return;
          setDraftHistory({ cardId, entries: [], loading: false, error: error?.code || error?.message || 'unknown' });
        });
    };
    const handleReload = event => {
      const eventCardId = event?.detail?.userId || event?.detail?.cardId;
      if (eventCardId && eventCardId !== cardId) return;
      load();
    };
    load();
    window.addEventListener(PROFILE_BACKEND_REFRESH_EVENT, handleReload);
    window.addEventListener(PROFILE_DRAFT_SAVED_EVENT, handleReload);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_BACKEND_REFRESH_EVENT, handleReload);
      window.removeEventListener(PROFILE_DRAFT_SAVED_EVENT, handleReload);
    };
  }, [isAdmin, isDraftRecord, state?.userId]);

  // Кнопка «усі поля» перечитує анкету з бекенду — а пропозиції редакторів і
  // їхні попередні версії лежать поза анкетою, тож перечитуються тут.
  useEffect(() => {
    if (!isAdmin || !state?.userId || typeof window === 'undefined') return undefined;
    const cardUserId = state.userId;
    const handleRefresh = event => {
      if (event?.detail?.userId && event.detail.userId !== cardUserId) return;
      reconcileOverlayEntriesFromBackend(cardUserId).catch(error => {
        console.warn('[ProfileForm] overlay refresh after backend reload failed', error);
      });
    };
    window.addEventListener(PROFILE_BACKEND_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PROFILE_BACKEND_REFRESH_EVENT, handleRefresh);
  }, [isAdmin, reconcileOverlayEntriesFromBackend, state?.userId]);

  /**
   * Рішення адмінки стосується **одного** значення, а не всієї правки поля.
   *
   * Шар зберігає зміну поля цілком, тож зняття поля (`change: null`) зносило
   * й ті значення, яких адмін не чіпав: дописав редактор два номери, адмін
   * прибрав один хрестиком — зникали обидва. Відхилене значення при цьому йде
   * ще й з `searchId`: ключ туди завів сам шар, і поки він там лишався,
   * прибраний номер далі знаходився пошуком.
   */
  const settleOverlayEntryInBackend = useCallback(async (fieldName, entry, action, acceptedValue) => {
    if (!fieldName || !entry?.editorUserId || !state?.userId) return;

    try {
      if (!entry.superseded && !entry.expectedCurrent) {
        throw Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' });
      }
      const decision = {
        operation: 'update',
        editorUserId: entry.editorUserId,
        cardUserId: state.userId,
        fieldName,
        value: entry.value,
        acceptedValue,
        action,
        expectedCurrent: entry.expectedCurrent,
        replacement: entry.replacement,
      };
      // Попередня версія вже живе лише в журналі. Поточне доповнення
      // приймається тим самим писачем, що й у черзі доповнень.
      let result;
      if (entry.superseded) result = await settleSupersededOverlayValue(decision);
      else result = await profileProposalService.reviewDraft({ ...decision, action: action === 'accept' ? 'accept' : 'reject' });
      if (!result) throw new Error('Overlay value was not settled');
      // Після запису перечитуємо шари картки: доти список пропозицій жив із
      // пропса, який лишався тим самим, і прибраний рядок повертався на екран
      // з наступним перемальовуванням.
      if (typeof refreshOverlayForEditor === 'function') await refreshOverlayForEditor();
      await reconcileOverlayEntriesFromBackend(state.userId);
      return result;
    } catch (error) {
      if (error?.code === 'REVISION_CONFLICT') {
        toast.error('Анкету або пропозицію вже змінено. Перевірте оновлені дані.');
        await reconcileOverlayEntriesFromBackend(state.userId).catch(() => {});
      } else {
        toast.error(action === 'accept' ? 'Не вдалося прийняти пропозицію' : 'Не вдалося видалити пропозицію');
      }
      return false;
    }
  }, [reconcileOverlayEntriesFromBackend, refreshOverlayForEditor, state?.userId]);

  const enqueueOverlaySettlement = useCallback((fieldName, entry, action, acceptedValue) => {
    const queuedSettlement = overlaySettlementQueueRef.current
      .catch(error => {
        console.error('Previous overlay settlement failed', error);
      })
      .then(() => settleOverlayEntryInBackend(fieldName, entry, action, acceptedValue));

    overlaySettlementQueueRef.current = queuedSettlement.catch(() => {});
    return queuedSettlement;
  }, [settleOverlayEntryInBackend]);

  const handleOverlayDismiss = async (fieldName, entry) => {
    // Рядок ховається до мережевого round trip. Сам запис іде в послідовну
    // чергу, а при відмові рядок повертається без перезавантаження сторінки.
    dismissOverlayEntry(fieldName, entry);
    const settled = await enqueueOverlaySettlement(fieldName, entry, 'discard');
    if (!settled) {
      try {
        // The queued proposal may already have been settled elsewhere. Re-read
        // the backend instead of resurrecting that stale row in the local cache.
        await reconcileOverlayEntriesFromBackend(state?.userId);
      } catch {
        // Only restore optimistically when even the authoritative read failed.
        restoreOverlayEntry(fieldName, entry);
      }
    }
  };

  const getOverlayEntryDraftKey = (fieldName, entry) => `${fieldName}::${getOverlayEntrySignature(entry)}`;

  const getOverlayEntryDraftValue = (fieldName, entry) => {
    const draftKey = getOverlayEntryDraftKey(fieldName, entry);
    return Object.prototype.hasOwnProperty.call(overlayEntryDrafts, draftKey)
      ? overlayEntryDrafts[draftKey]
      : entry?.value ?? '';
  };

  const setOverlayEntryDraftValue = (fieldName, entry, nextValue) => {
    const draftKey = getOverlayEntryDraftKey(fieldName, entry);
    setOverlayEntryDrafts(prev => ({ ...prev, [draftKey]: nextValue }));
  };

  // В анкету їде виправлене, а з шару й індексу знімається надіслане: у шарі
  // редактора лежить саме його значення, і ключ `searchId` заведено на нього ж.
  const handleOverlayApply = async (fieldName, entry) => {
    // Accepting a deletion removes the canonical value; accepting an addition
    // adopts it. Deletion suggestions therefore invert the usual row action.
    // Приймається при цьому виправлене в рядку значення, а не сире надіслане:
    // рядок пропозиції — звичайний інпут, і зайвий пробіл чи плюс адмін
    // прибирає просто в ньому.
    const acceptedValue = getOverlayEntryDraftValue(fieldName, entry);
    if (entry?.superseded) {
      const currentValue = state?.[fieldName];
      let nextState;
      let delCondition;
      if (entry.isDeleted) {
        nextState = { ...(state || {}) };
        if (Array.isArray(currentValue)) {
          nextState[fieldName] = currentValue.filter(value => value !== entry.value);
          if (!nextState[fieldName].length) delete nextState[fieldName];
        } else {
          delete nextState[fieldName];
        }
        delCondition = { [fieldName]: currentValue };
      } else {
        nextState = mergeOverlayValueIntoState(state || {}, fieldName, acceptedValue);
      }

      try {
        // Попередня версія існує лише в журналі. Спершу надійно записуємо
        // канонічну анкету, і тільки після успішного запису прибираємо єдину
        // backend-копію пропозиції.
        await submitWithNormalization(nextState, 'overwrite', delCondition, { propagateSubmitError: true });
      } catch {
        toast.error('Не вдалося зберегти зміни профілю');
        return;
      }

      setState(nextState, { source: 'overlayReview', reason: 'accepted-superseded-overlay' });
      const settledSuperseded = await enqueueOverlaySettlement(fieldName, entry, 'accept', acceptedValue);
      if (!settledSuperseded) return;
      dismissOverlayEntry(fieldName, entry);
      return;
    }
    const displayedId = state?.userId;
    const displayedValue = state?.[fieldName];
    const settled = await enqueueOverlaySettlement(fieldName, entry, 'accept', acceptedValue);
    if (!settled) return;
    setState(previous => {
      if (previous?.userId !== displayedId || !areProposalValuesEqual(previous?.[fieldName], displayedValue)) {
        return previous;
      }
      const next = { ...previous };
      if (settled.value === null) delete next[fieldName];
      else next[fieldName] = settled.value;
      if (settled.draft) next.__profileMutationRevision = settled.draft.revision;
      return next;
    }, { source: 'overlayReview', reason: 'accepted-overlay' });
    dismissOverlayEntry(fieldName, entry);
  };

  const mergeOverlayValueIntoState = (prevState, fieldName, value) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    if (normalizedValue === '' || normalizedValue === null || normalizedValue === undefined) {
      return prevState;
    }

    const existing = prevState[fieldName];

    if (Array.isArray(existing)) {
      if (existing.includes(normalizedValue)) return prevState;
      return { ...prevState, [fieldName]: [...existing, normalizedValue] };
    }

    if (existing === undefined || existing === null || existing === '') {
      return { ...prevState, [fieldName]: normalizedValue };
    }

    if (existing === normalizedValue) {
      return prevState;
    }

    return { ...prevState, [fieldName]: [existing, normalizedValue] };
  };

  const collectEditorOverlayReplacements = useCallback(async () => {
    const paths = buildOverlayPaths(state?.userId);
    const currentEditorId = auth.currentUser?.uid;

    if (!paths.length || !currentEditorId) {
      return {};
    }

    const replacements = {};

    await Promise.all(
      paths.map(async path => {
        const snapshot = await get(refDb(database, path));
        const rawValue = snapshot.exists() ? snapshot.val() : null;

        Object.entries(rawValue || {}).forEach(([editorUserId, overlay]) => {
          if (editorUserId !== currentEditorId) return;
          if (overlay?.adminOnly) return;

          const allFields = overlay?.fields || {};

          Object.entries(allFields).forEach(([fieldName, change]) => {
            if (technicalOverlayFields.has(fieldName)) return;
            if (!change || typeof change !== 'object') return;

            const hasFrom = Object.prototype.hasOwnProperty.call(change, 'from');
            const hasTo = Object.prototype.hasOwnProperty.call(change, 'to');
            const hasAdded = Object.prototype.hasOwnProperty.call(change, 'added');

            if (hasAdded) {
              const currentValue = Object.prototype.hasOwnProperty.call(replacements, fieldName)
                ? replacements[fieldName]
                : state?.[fieldName];
              const mergedValue = mergeOverlayAddedValues(currentValue, change.added);
              if (mergedValue !== '') {
                replacements[fieldName] = mergedValue;
              }
              return;
            }

            if (!hasFrom || !hasTo) return;

            const currentStateValue = normalizeOverlayComparableValue(state?.[fieldName]);
            const fromValue = normalizeOverlayComparableValue(change.from);
            if (currentStateValue !== fromValue) return;

            replacements[fieldName] = normalizeOverlayReplacementValue(change.to);
          });
        });
      })
    );

    return replacements;
  }, [state]);

  const applyEditorOverlayReplacements = useCallback(
    editorOverlayReplacements => {
      if (!editorOverlayReplacements || Object.keys(editorOverlayReplacements).length === 0) {
        return false;
      }

      let applied = false;

      setState(prevState => {
        const nextState = { ...prevState, ...editorOverlayReplacements };
        const changed = Object.keys(editorOverlayReplacements).some(
          fieldName => prevState[fieldName] !== nextState[fieldName]
        );

        if (!changed) return prevState;

        applied = true;
        submitWithNormalization(nextState, 'overwrite');
        return nextState;
      });

      return applied;
    },
    [setState, submitWithNormalization]
  );

  useEffect(() => {
    let isMounted = true;

    const loadOverlayFieldAdditions = async () => {
      if (!isAdmin) {
        logProfileFormRestoreStep('admin-overlay-additions:skip-not-admin', {
          userId: state?.userId || '',
        });
        if (isMounted) setAutoOverlayFieldAdditions({});
        return;
      }

      if (!state?.userId) {
        logProfileFormRestoreStep('admin-overlay-additions:skip-no-user-id');
        if (isMounted) setAutoOverlayFieldAdditions({});
        return;
      }

      try {
        logProfileFormRestoreStep('admin-overlay-additions:load-start', {
          userId: state.userId,
        });
        const { result } = await readOverlayFieldAdditions(state.userId);
        if (!isMounted) return;

        logProfileFormRestoreStep('admin-overlay-additions:load-success', {
          userId: state.userId,
          fieldsCount: Object.keys(result || {}).length,
        });
        setAutoOverlayFieldAdditions(result);
      } catch (error) {
        logProfileFormRestoreStep('admin-overlay-additions:load-error', {
          userId: state?.userId || '',
          message: error?.message || String(error),
        });
        if (isMounted) {
          setAutoOverlayFieldAdditions({});
        }
      }
    };

    loadOverlayFieldAdditions();

    return () => {
      isMounted = false;
    };
  }, [isAdmin, readOverlayFieldAdditions, state?.userId]);

  useEffect(() => {
    if (isAdmin) {
      logProfileFormRestoreStep('editor-overlay:auto-apply-skip-admin', {
        userId: state?.userId || '',
      });
      return;
    }
    if (!state?.userId) {
      logProfileFormRestoreStep('editor-overlay:auto-apply-skip-no-user-id');
      return;
    }
    if (autoAppliedOverlayForUserRef.current === state.userId) {
      logProfileFormRestoreStep('editor-overlay:auto-apply-skip-already-applied', {
        userId: state.userId,
      });
      return;
    }

    let cancelled = false;

    const applyOverlayOnMount = async () => {
      try {
        logProfileFormRestoreStep('editor-overlay:auto-apply-start', {
          userId: state.userId,
        });
        const replacements = await collectEditorOverlayReplacements();
        if (cancelled) return;

        logProfileFormRestoreStep('editor-overlay:auto-apply-replacements', {
          userId: state.userId,
          replacementsCount: Object.keys(replacements || {}).length,
        });
        applyEditorOverlayReplacements(replacements);
        autoAppliedOverlayForUserRef.current = state.userId;
      } catch (error) {
        logProfileFormRestoreStep('editor-overlay:auto-apply-error', {
          userId: state?.userId || '',
          message: error?.message || String(error),
        });
        if (!cancelled) {
          autoAppliedOverlayForUserRef.current = state.userId;
        }
      }
    };

    applyOverlayOnMount();

    return () => {
      cancelled = true;
    };
  }, [applyEditorOverlayReplacements, collectEditorOverlayReplacements, isAdmin, state?.userId]);

  const handleOverlayDebugAlert = async () => {
    const paths = buildOverlayPaths(state?.userId);
    const currentEditorId = auth.currentUser?.uid;
    const shouldShowOwnEditorOnly = !isAdmin;

    if (!paths.length) {
      window.alert('Немає userId, не можу побудувати маршрут до overlay полів.');
      return;
    }

    if (shouldShowOwnEditorOnly && !currentEditorId) {
      window.alert('Не вдалося визначити поточного редактора (uid).');
      return;
    }

    try {
      let editorOverlayApplied = false;
      const editorOverlayReplacements = await collectEditorOverlayReplacements();

      const debugResults = await Promise.all(
        paths.map(async path => {
          const snapshot = await get(refDb(database, path));
          const rawValue = snapshot.exists() ? snapshot.val() : null;

          const fieldEntries = Object.entries(rawValue || {}).reduce((acc, [editorUserId, overlay]) => {
            if (shouldShowOwnEditorOnly && editorUserId !== currentEditorId) {
              return acc;
            }
            if (shouldShowOwnEditorOnly && overlay?.adminOnly) return acc;

            const allFields = overlay?.fields || {};

            Object.entries(allFields).forEach(([fieldName, change]) => {
              if (technicalOverlayFields.has(fieldName)) return;
              if (!change || typeof change !== 'object') return;

              const changeDescription = describeOverlayChange(change);
              if (!changeDescription) return;

              if (shouldShowOwnEditorOnly) {
                acc.push(`${fieldName}: ${changeDescription}`);
                return;
              }

              acc.push(`${fieldName}:${formatOverlayDebugValue(resolveOverlayIncomingValue(change))}`);
            });

            return acc;
          }, []);

          return {
            path,
            exists: snapshot.exists(),
            fieldEntries,
          };
        })
      );

      if (shouldShowOwnEditorOnly) {
        editorOverlayApplied = applyEditorOverlayReplacements(editorOverlayReplacements);
      }

      const message = debugResults
        .map(result => {
          const entries = Array.from(new Set(result.fieldEntries || []));
          if (!entries.length) {
            return `${result.path}${shouldShowOwnEditorOnly ? `/${currentEditorId}` : ''}
(немає очищених значень)`;
          }

          return `${result.path}${shouldShowOwnEditorOnly ? `/${currentEditorId}` : ''}
${entries.join('\n')}`;
        })
        .join('\n\n---\n\n');

      if (editorOverlayApplied) {
        window.alert(`${message}\n\n✅ Дані оверлею застосовано до інпутів.`);
        return;
      }

      window.alert(message);

      if (!isAdmin && typeof refreshOverlayForEditor === 'function') {
        await refreshOverlayForEditor();
      }
    } catch (error) {
      window.alert(
        `Не вдалося прочитати ${paths[0]}: ${error?.message || error}`
      );
    }
  };

  // Пріоритетна сортовка нікуди не дівається — вона просто діє всередині
  // блоку. Адмін і далі бачить дату народження перед розміром взуття, але
  // тепер бачить ще й те, у який вузол бекенду ці двоє поїдуть.
  const prioritySortedFields = [
    ...priorityOrder
      .map(key => normalizedFieldsToRender.find(field => field.name === key))
      .filter(Boolean),
    ...normalizedFieldsToRender.filter(
      field => !priorityOrder.includes(field.name) && !PROFILE_FORM_TECHNICAL_FIELDS.has(field.name)
    ),
    ...normalizedFieldsToRender.filter(field => PROFILE_FORM_TECHNICAL_FIELDS.has(field.name)),
  ];

  // Групування задає порядок полів, а з нього — і порядок блоків: перший блок
  // той, чиє поле трапилось першим. Самі блоки форма складає нижче, за шляхом у
  // базі (`profileFormBlocks`).
  const { fields: sortedFieldsToRender } = groupProfileFormFieldsByBlock(prioritySortedFields);

  const roleTokens = Array.isArray(state?.role || state?.userRole)
    ? (state?.role || state?.userRole)
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    : String(state?.role || state?.userRole || '')
        .split(/[,\s/|]+/)
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
  const shouldHideFieldsForClPp = roleTokens.some(role => ['pp', 'cl'].includes(role));
  // Ролі картки для статистики чіпів: старе `pp` — ті самі біологічні батьки.
  const cardRolesForStats = [...new Set(roleTokens.map(role => (role === 'pp' ? 'ip' : role)))];

  // Поля, які форма справді показує. Перелік потрібен до рендера: з нього
  // складаються блоки, а раніше він фільтрувався просто перед `.map`.
  const visibleFieldsToRender = sortedFieldsToRender
    .filter(field => !['myComment', 'writer'].includes(field.name))
    .filter(field => (isAdmin ? true : !PROFILE_FORM_TECHNICAL_FIELDS.has(field.name)))
    .filter(field => (shouldHideFieldsForClPp ? !HIDDEN_FOR_CL_PP_FIELDS.has(field.name) : true));

  /**
   * Куди поле стає у формі — на відміну від того, у якому вузлі воно лежить.
   *
   * Розходяться ці двоє рівно там, де так зручніше заповнювати (`surname` під
   * `name`); сам запис від цього не змінюється — його маршрут визначає
   * `profileNodeSchema`, а не форма.
   */
  const resolveFieldDisplayBlock = field => (
    PROFILE_FORM_FIELD_DISPLAY_BLOCKS[field?.name]?.blockId || resolveProfileFormBlock(field?.name)
  );

  // Поле, пришпилене до чужого блоку, стає одразу за своїм якорем; якщо якоря
  // на екрані немає — лишається в кінці блоку, а не зникає.
  const orderPinnedFieldsWithinBlock = fields => {
    const pinned = fields.filter(field => PROFILE_FORM_FIELD_DISPLAY_BLOCKS[field.name]?.after);
    if (!pinned.length) return fields;

    const rest = fields.filter(field => !pinned.includes(field));
    const anchored = new Set();
    const ordered = rest.reduce((result, field) => {
      result.push(field);
      pinned
        .filter(pin => PROFILE_FORM_FIELD_DISPLAY_BLOCKS[pin.name].after === field.name)
        .forEach(pin => {
          anchored.add(pin);
          result.push(pin);
        });
      return result;
    }, []);

    return [...ordered, ...pinned.filter(pin => !anchored.has(pin))];
  };

  /**
   * Блоки форми: заголовок вузла, підказка і його поля.
   *
   * Зводяться блоки за шляхом у базі, а не за своїм id. Права доступу живуть у
   * тому самому `profileTechnical`, що й решта технічного, і двома блоками той
   * самий вузол малювався двічі — з однаковим посиланням і різними назвами.
   */
  const profileFormBlocks = (() => {
    const byPath = new Map();

    visibleFieldsToRender.forEach(field => {
      const header = buildProfileFormBlockHeader(resolveFieldDisplayBlock(field), {
        profileId: state?.userId,
        ownerId: auth.currentUser?.uid,
        draftSegments: draftRecordSegments,
      });
      const existing = byPath.get(header.path);

      if (existing) {
        existing.fields.push(field);
        if (header.hint && !existing.hints.includes(header.hint)) existing.hints.push(header.hint);
        return;
      }

      byPath.set(header.path, {
        ...header,
        hints: header.hint ? [header.hint] : [],
        fields: [field],
      });
    });

    return [...byPath.values()].map(block => {
      const fields = orderPinnedFieldsWithinBlock(block.fields);
      // Згорнутий блок не має права ховати те, чого від людини чекають: чужу
      // пропозицію, підсвічене поле, стерте оверлеєм значення.
      const attentionFields = fields
        .filter(field => (
          highlightedFields.includes(field.name)
          || deletedOverlayFields.includes(field.name)
          || getOverlayEntriesForField(field.name).length > 0
        ))
        .map(field => field.name);
      const needsAttention = attentionFields.length > 0;
      const { shown: shownFields, chips: chipFields } = splitProfileFormFields(fields, state, {
        keepShown: new Set([...revealedProfileFields, ...attentionFields]),
        stats: profileFieldStats,
        roles: cardRolesForStats,
      });

      return {
        ...block,
        fields,
        shownFields,
        chipFields,
        hint: block.hints.join(' '),
        isOpen: needsAttention || isProfileFormBlockOpen(openProfileFormBlocks, block.id),
      };
    });
  })();
  // «Не зберігається» (поля без вузла: `userId`, `cachedAt`, `rev`…) — технічні
  // залишки зведення, правити їх нема чого, і адмінові вони не потрібні.
  // Блок без жодного наявного поля теж не малюється: його поля — у чіпах.
  const storedProfileFormBlocks = profileFormBlocks.filter(block => block.id !== PROFILE_FORM_BLOCK_IDS.unstored);
  const visibleProfileFormBlocks = storedProfileFormBlocks.filter(block => block.shownFields.length > 0);
  const allChipFields = rankFieldsByFillStats(
    storedProfileFormBlocks.flatMap(block => block.chipFields.map(field => ({ ...field, chipBlockId: block.id }))),
    profileFieldStats,
    cardRolesForStats,
  );

  const handlePpTechnicalInputSubmit = useCallback(() => {
    const rawValue = String(ppTechnicalInput || '').trim();
    if (!rawValue) return;

    const keyValueEntries = parsePpTechnicalKeyValueInput(rawValue);
    const parsed = parseUkTriggerQuery(rawValue);

    setState(prevState => {
      const nextState = { ...prevState };

      if (keyValueEntries.length > 0) {
        keyValueEntries.forEach(({ fieldName, value }) => {
          const normalizedValue = normalizePpTechnicalKeyValueEntry(fieldName, value);
          if (!normalizedValue) return;

          applyPpTechnicalKeyValueEntry(nextState, fieldName, normalizedValue);
        });
      } else if (!parsed) {
        // Контакти й імʼя дописуються в історію поля, а дата народження з
        // віку («30р») замінює наявну — так само, як `поле: значення`.
        resolvePpTechnicalInputTargets(rawValue, {
          normalizePhone: normalizePhoneValue,
        }).forEach(({ fieldName, value }) => {
          const normalizedTechnicalValue = normalizePpTechnicalTargetValue(fieldName, value);
          if (!normalizedTechnicalValue) return;
          applyPpTechnicalKeyValueEntry(nextState, fieldName, normalizedTechnicalValue);
        });
      } else {
        const { contactType, contactValues, name, surname } = parsed;

        if (contactType) {
          if (contactType === 'phone') {
            const rawPhoneValue = Array.isArray(contactValues) ? contactValues[0] : contactValues;
            nextState.phone = appendFieldValue(nextState.phone, normalizePhoneValue(rawPhoneValue), 'phone');
          } else if (contactType === 'email') {
            const rawEmailValue = Array.isArray(contactValues) ? contactValues[0] : contactValues;
            nextState.email = appendFieldValue(nextState.email, String(rawEmailValue || '').trim(), 'email');
          } else {
            const rawContactValue = Array.isArray(contactValues) ? contactValues[0] : contactValues;
            nextState[contactType] = appendFieldValue(nextState[contactType], rawContactValue, contactType);
          }
        }
        if (name) {
          nextState.name = appendFieldValue(nextState.name, name, 'name');
        }
        if (surname) {
          nextState.surname = appendFieldValue(nextState.surname, surname, 'surname');
        }
      }

      submitWithNormalization(nextState, 'overwrite');
      return nextState;
    });

    setPpTechnicalInput('');
  }, [ppTechnicalInput, setState, submitWithNormalization]);

  const handleOpenModal = fieldName => {
    setSelectedField(fieldName);
    setShowInfoModal('pickerOptions');
  };

  const handleCloseModal = () => {
    setSelectedField(null);
    setShowInfoModal(false);
  };

  const handleSelectOption = option => {
    if (!selectedField) {
      handleCloseModal();
      return;
    }

    const optionValue = getOptionValue(option);
    const newValue = optionValue === 'Clear' ? '' : optionValue;
    setState(prevState => {
      const newState = { ...prevState, [selectedField]: newValue };
      submitWithNormalization(newState, 'overwrite');
      return newState;
    });

    handleCloseModal();
  };

  const handleOpenSearchIdBackend = async (fieldName, value) => {
    if (!canOpenSearchIdBackendShortcut(fieldName, value)) {
      toast.error('Немає значення для пошуку в searchId.');
      return;
    }

    const userId = String(state?.userId || '').trim();
    if (!userId) {
      toast.error('Немає userId для пошуку запису searchId.');
      return;
    }

    if (fieldName === 'userId') {
      window.open(buildUsersBackendUrl(String(value || userId).trim()), '_blank', 'noopener,noreferrer');
      return;
    }

    // Ключ у `searchId` детермінований: індексація анкети будує його тим самим
    // `describeSearchIdRecord`. Тому шукати його скануванням не треба — і не
    // можна: правила бази дають читання на `searchId/$key`, а не на `searchId`,
    // тож будь-який запит по кореню вузла завжди падав з Permission denied.
    // Ключ — це значення, а поле лежить у ньому, тож читається саме
    // `searchId/{значення}/{поле}`: сусідні поля того самого значення до цієї
    // анкети стосунку не мають.
    const searchIdRecord = describeSearchIdRecord({ [fieldName]: value });

    if (!searchIdRecord) {
      toast.error(`Не вдалося побудувати ключ searchId для ${fieldName}.`);
      return;
    }

    const { valueKey: searchIdRecordKey, field: searchIdField, path: searchIdPath } = searchIdRecord;

    try {
      const snapshot = await get(refDb(database, searchIdPath));

      if (!snapshot.exists()) {
        toast.error(`У backend searchId немає запису ${searchIdRecordKey}/${searchIdField}.`);
        return;
      }

      // Запис існує саме за цим ключем — це і є місце зберігання значення.
      // Якщо в ньому чужий id, це теж відповідь на питання «де мої дані»,
      // тому вузол відкриваємо, але кажемо про розбіжність вголос.
      if (!searchIdRecordContainsUserId(snapshot.val(), userId)) {
        toast(`Запис ${searchIdRecordKey}/${searchIdField} не містить userId ${userId}; відкриваю його.`);
      }

      window.open(buildSearchIdBackendUrl(searchIdRecordKey, searchIdField), '_blank', 'noopener,noreferrer');
    } catch (error) {
      const details = error?.message || String(error);
      toast.error(`Не вдалося відкрити searchId backend.\n${details}`);
    }
  };

  const handleProfileViewRemove = keyPath => {
    const normalizedPath = String(keyPath || '').trim();
    if (!normalizedPath) return false;

    if (!normalizedPath.includes('.')) {
      const rootValue = state?.[normalizedPath];
      if (Array.isArray(rootValue)) {
        const removeIndex = rootValue.length - 1;
        if (removeIndex >= 0) {
          handleClear(normalizedPath, removeIndex);
          return true;
        }
      }
      handleDelKeyValue(normalizedPath);
      return true;
    }

    const [fieldName, nestedIndex] = normalizedPath.split('.');
    if (/^\d+$/.test(nestedIndex)) {
      handleClear(fieldName, Number(nestedIndex));
      return true;
    }

    return false;
  };

  return (
    <FormPage>
      <FormCard ref={formRootRef}>
      {state.userId && (
        <div
          id={state.userId}
          style={{ display: 'none', textAlign: 'left', marginBottom: '8px' }}
        >
          {renderAllFields(state, '', {
            userId: state?.userId,
            setUsers: setState,
            onRemoveKey: handleProfileViewRemove,
          })}
          <CardBackendExtras cardId={state.userId} renderFields={value => renderAllFields(value)} />
        </div>
      )}
      {isAdmin && isDraftRecord && draftHistory.cardId === state.userId && (
        <DraftHistoryBox data-testid="draft-history">
          <summary>
            Історія змін чернетки
            {draftHistory.loading ? ' · читаємо…' : ` (${draftHistory.entries.length})`}
          </summary>
          {draftHistory.error
            ? <DraftHistoryNote>Журнал чернетки не прочитано: {draftHistory.error}</DraftHistoryNote>
            : !draftHistory.loading && draftHistory.entries.length === 0
              ? <DraftHistoryNote>Змін ще не записано.</DraftHistoryNote>
              : draftHistory.entries.map(entry => (
                <DraftHistoryRow key={entry.entryId} data-testid="draft-history-entry">
                  <span>{entry.at ? new Date(entry.at).toLocaleString('uk-UA') : '—'}</span>
                  <span>
                    {entry.actorUid && entry.actorUid === draftRecordCreator
                      ? 'автор'
                      : isAdminUid(entry.actorUid) ? 'адмін' : (entry.actorUid || '—')}
                  </span>
                  <strong>{getFieldLabel(fieldsMapForHistory.get(entry.fieldName)) || entry.fieldName}</strong>
                  <span>{describeDraftHistoryChange(entry.change)}</span>
                </DraftHistoryRow>
              ))}
        </DraftHistoryBox>
      )}
      <PickerContainer>
        <FieldMainRow>
          <InputDiv>
            <InputFieldContainer fieldName="ppTechnicalInput" value={ppTechnicalInput}>
              <InputField
                fieldName="ppTechnicalInput"
                name="ppTechnicalInput"
                aria-label="Швидке введення контактів і технічних даних"
                as="textarea"
                ref={ppTechnicalInputRef}
                rows={1}
                value={ppTechnicalInput}
                onChange={e => {
                  setPpTechnicalInput(e?.target?.value || '');
                  autoResizePpTechnicalInput(e.target);
                }}
                onBlur={handlePpTechnicalInputSubmit}
                placeholder="Вставте контакт або технічні дані — парсер розподілить їх по полях"
              />
            </InputFieldContainer>
          </InputDiv>
        </FieldMainRow>
      </PickerContainer>
      {/* Блок = вузол бекенду. Назва блоку словами звідси прибрана: два підписи
          на одне й те саме («Технічне» і `profileTechnical`) забирали висоту, а
          казали одне. Лишились адреса вузла — вона ж і кнопка згортання — і
          опис, заради якого блок і підписаний. Поля лежать у
          {sortedFieldsToRender}, згрупованому в profileFormBlocks. */}
      {visibleProfileFormBlocks.map(block => (
        <TechnicalFieldsSection key={block.path}>
          <BlockHeaderRow>
            <BlockToggle
              type="button"
              aria-expanded={block.isOpen}
              onClick={() => toggleProfileFormBlock(block.id)}
            >
              <BlockChevron $open={block.isOpen} aria-hidden="true">▾</BlockChevron>
              <BlockNodeName>{block.label}</BlockNodeName>
              <BlockFieldCount title={block.chipFields.length ? 'заповнено з усіх полів блоку' : undefined}>
                {block.chipFields.length ? `${block.shownFields.length} з ${block.fields.length}` : block.fields.length}
              </BlockFieldCount>
            </BlockToggle>
            {isAdmin && block.href && (
              <BlockBackendLink
                href={block.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`Відкрити ${block.path} у Firebase`}
                aria-label={`Відкрити ${block.path} у Firebase`}
              >
                <FaArrowRight size={12} />
              </BlockBackendLink>
            )}
          </BlockHeaderRow>
          {/* Поля без вузла збереження відкидає, тож і правити їх нема чого:
              вимкнений `fieldset` вимикає всі інпути й кнопки всередині. */}
          {block.isOpen && <ReadOnlyFieldset disabled={Boolean(block.readOnly)}><FieldsGrid>{(() => {
          const renderField = (field, fieldOptions = {}) => {
          const overlayEntries = getOverlayEntriesForField(field.name);
          const hasOverlaySuggestions = overlayEntries.length > 0;
          const displayValue =
            field.name === 'lastAction'
              ? formatDateToDisplay(normalizeLastAction(state.lastAction))
              : PROFILE_FORM_READ_ONLY_DATE_FIELDS.has(field.name) && !Array.isArray(state[field.name])
              ? formatDateToDisplay(state[field.name])
              // У базі дата лежить у `РРРР-ММ-ДД`, а в полі введення людина
              // бачить і набирає крапки. Поки перелік був коротший, дата
              // народження показувалась так, як лежить, — тобто задом наперед.
              : PROFILE_FORM_DATE_FIELDS.has(field.name)
              ? formatDateToDisplay(state[field.name])
              : state[field.name] || '';
          // «+» стоїть усередині поля, поруч із «×» (22.11, на прохання
          // власниці продукту): окремою кнопкою праворуч він забирав стовпчик
          // ширини в кожного поля. У рядку «зріст · вага · кров» він спільний.
          const hintLabel = (fieldOptions.inMetricRow && METRIC_ROW_LABELS[field.name]) || getFieldDisplayLabel(field);
          const showAddRow = !fieldOptions.inMetricRow
            && field.name !== 'lastAction'
            && fieldAcceptsMultipleValues(field.name)
            && canAppendFieldRow(state[field.name])
            && ((Array.isArray(field.options) && field.options.length !== 2 && field.options.length !== 3)
              || !Array.isArray(field.options));
          const addRowButton = showAddRow ? (
            <AddRowButton
              type="button"
              aria-label={`Додати значення: ${getFieldDisplayLabel(field)}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => appendEmptyRowsTo([field.name])}
            >
              +
            </AddRowButton>
          ) : null;
          return (
            <FieldGroup key={field.name} data-profile-field={field.name} $compact={COMPACT_PROFILE_FIELDS.has(field.name) && !Array.isArray(state[field.name]) && !hasOverlaySuggestions}>
            <PickerContainer
              style={hasOverlaySuggestions ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
            >
              <FieldMainRow>
              {Array.isArray(state[field.name]) ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                {state[field.name].map((value, idx) => (
                  <InputDiv
                    key={`${field.name}-${idx}`}
                    $isHighlighted={highlightedFields.includes(field.name)}
                    $isDeletedOverlay={deletedOverlayFields.includes(field.name)}
                    $isArrayValueItem
                    $isFirstArrayValueItem={idx === 0}
                  >
                    <InputFieldContainer fieldName={`${field.name}-${idx}`} value={value}>
                      <InputField
                        fieldName={`${field.name}-${idx}`}
                        as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                        ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                        inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                        name={`${field.name}-${idx}`}
                        aria-label={`${getFieldDisplayLabel(field)} — ${idx + 1}`}
                        placeholder={getFieldPlaceholderText(field)}
                        // Версії дати показуються так само, як одиничне поле:
                        // дд.мм.рррр, а не `РРРР-ММ-ДД`, як лежать у базі.
                        value={(PROFILE_FORM_DATE_FIELDS.has(field.name) ? formatDateToDisplay(value) : value) || ''}
                        $isDeletedOverlay={deletedOverlayFields.includes(field.name)}
                        onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                        onChange={e => {
                          if (field.name === 'myComment') {
                            autoResizeMyComment(e.target);
                          }
                          if (field.name === 'moreInfo_main') {
                            autoResizeMoreInfo(e.target);
                          }
                          const updatedValue =
                            field.name === 'telegram'
                              ? e?.target?.value
                              : inputUpdateValue(e?.target?.value, field);
                          setState(prevState => ({
                            ...prevState,
                            [field.name]: prevState[field.name].map((item, i) => (i === idx ? updatedValue : item)),
                          }));
                        }}
                        onBlur={() => {
                          console.log('[ProfileSaveDebug] ProfileForm array input blur', {
                            fieldName: field.name,
                            idx,
                            value: state?.[field.name],
                          });
                          // Зайшли в рядок, доданий «+», і вийшли, нічого не
                          // набравши, — це явне «поточного значення немає»
                          // (`isUnfilledNewFieldRow`). Пишемо порожню останню
                          // версію: попереднє значення лишається в історії, а
                          // стрічка його більше не показує.
                          const latestDraft = latestProfileDraftRef.current || state || {};
                          const rows = latestDraft[field.name];
                          // Поля доступу (правила, джерела даних) — переліки, а не
                          // версії: порожній елемент там нічого не «стирає».
                          const isAccessListField = field.name === MULTI_DATA_ACCESS_FIELD;
                          if (!isAccessListField && fieldAcceptsMultipleValues(field.name) && isUnfilledNewFieldRow(rows, idx)) {
                            const nextState = { ...latestDraft, [field.name]: markFieldRowErased(rows, idx) };
                            latestProfileDraftRef.current = nextState;
                            setState(prevState => ({
                              ...prevState,
                              [field.name]: Array.isArray(prevState?.[field.name])
                                ? markFieldRowErased(prevState[field.name], idx)
                                : prevState?.[field.name],
                            }));
                            submitWithNormalization(nextState, 'overwrite');
                            return;
                          }
                          handleBlur(`${field.name}-${idx}`);
                        }}
                      />
                      {extendedMode && canOpenSearchIdBackendShortcut(field.name, value) && (
                        <SearchIdBackendButton
                          type="button"
                          title="Відкрити запис searchId у Firebase"
                          aria-label="Відкрити запис searchId у Firebase"
                          $rightOffset="35px"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleOpenSearchIdBackend(field.name, value)}
                        >
                          <FaArrowRight size={14} />
                        </SearchIdBackendButton>
                      )}
                      {/* Рядок, який видно, має бути й чим прибрати — зокрема
                          щойно доданий кнопкою «+» і ще не заповнений. Раніше
                          умова пропускала `undefined`/`null`, тобто дірку в
                          масиві прибрати було нічим. */}
                      {(
                          <ClearButton
                          type="button"
                          aria-label={`Прибрати ${getFieldDisplayLabel(field)} — ${idx + 1}`}
                          onPointerDownCapture={e => {
                            console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                              eventType: e.type,
                              fieldName: field.name,
                              idx,
                              valueBeforeClear: state?.[field.name],
                            });
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onTouchStartCapture={e => {
                            console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                              eventType: e.type,
                              fieldName: field.name,
                              idx,
                              valueBeforeClear: state?.[field.name],
                            });
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDownCapture={e => {
                            console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                              eventType: e.type,
                              fieldName: field.name,
                              idx,
                              valueBeforeClear: state?.[field.name],
                            });
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            console.log('[ProfileSaveDebug] ProfileForm clear click', {
                              fieldName: field.name,
                              idx,
                              valueBeforeClear: state?.[field.name],
                            });
                            handleClear(field.name, idx);
                          }}
                        >
                          &times;
                        </ClearButton>
                      )}
                      {idx === state[field.name].length - 1 && addRowButton}
                    </InputFieldContainer>

                    {(
                      <>
                        {/* Підпис стоїть над першим рядком і більше не
                            повторюється: два телефони давали два однакові
                            «Телефон», і кожен з'їдав рядок екрана. Що це за
                            поле, каже перший — решта під ним і так його. */}
                        {idx === 0 && (
                          <Hint fieldName={field.name} isActive={value}>
                            {hintLabel}
                          </Hint>
                        )}
                        <Placeholder isActive={value}>{getFieldPlaceholderText(field)}</Placeholder>
                      </>
                    )}
                  </InputDiv>
                ))}
              </div>
            ) : isNestedObjectValue(state[field.name]) ? (
              // Обʼєкт у полі (програми, побажання батьків, вкладене з імпорту)
              // текстовим полем показати нема як — там стояло «[object Object]»,
              // і перше ж збереження записало б цей рядок замість обʼєкта.
              <NestedObjectField
                label={getFieldDisplayLabel(field)}
                value={state[field.name]}
                onChange={next => setState(prevState => ({ ...prevState, [field.name]: next }))}
                onCommit={next => {
                  const latestDraft = latestProfileDraftRef.current || state || {};
                  submitWithNormalization({ ...latestDraft, [field.name]: next }, 'overwrite');
                }}
                onDeleteField={() => handleDelKeyValue && handleDelKeyValue(field.name)}
              />
            ) : (
              <InputDiv $isHighlighted={highlightedFields.includes(field.name)} $isDeletedOverlay={deletedOverlayFields.includes(field.name)}>
                <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                  {field.name === 'screenAccess' ? (
                    // Галочки, а не текст: код екрана, якого немає в переліку,
                    // нічого не відкрив би, а одруківка мовчки лишила б людину
                    // без екрана. Зберігається одразу — як і решта прав, і
                    // лише повним адміном (правило `screenAccess` у базі).
                    <ScreenAccessList role="group" aria-label="Додаткові екрани">
                      {SCREEN_ACCESS_OPTIONS.map(option => {
                        const selected = parseScreenAccess(state[field.name]);
                        const checked = selected.includes(option.code);
                        return (
                          <ScreenAccessOption key={option.code}>
                            <input
                              type="checkbox"
                              name={`${field.name}-${option.code}`}
                              data-testid={`screen-access-${option.code}`}
                              checked={checked}
                              onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                              onChange={e => {
                                const nextCodes = e.target.checked
                                  ? [...selected, option.code]
                                  : selected.filter(code => code !== option.code);
                                const value = encodeScreenAccess(nextCodes);
                                setState(prevState => {
                                  const updated = { ...prevState, [field.name]: value };
                                  submitWithNormalization(updated, 'overwrite');
                                  return updated;
                                });
                              }}
                            />
                            <span>
                              <strong>{option.label}</strong>
                              {option.description ? ` — ${option.description}` : ''}
                            </span>
                          </ScreenAccessOption>
                        );
                      })}
                      {/* Видані екрани — особлива інструкція: людина з ними
                          бачить у меню лише їх, без стрічки й «Мого профілю»
                          (`specialScreensOnly` в `utils/accessLevel`). */}
                      <small data-testid="screen-access-hint">
                        Відмічені екрани замінюють стрічку й «Мій профіль»: у меню людини будуть лише вони.
                      </small>
                    </ScreenAccessList>
                  ) : (
                  <InputField
                    fieldName={field.name}
                    as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                    ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                    inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                    name={field.name}
                    aria-label={getFieldDisplayLabel(field)}
                    placeholder={getFieldPlaceholderText(field)}
                    value={displayValue}
                    $isDeletedOverlay={deletedOverlayFields.includes(field.name)}
                    onFocus={() => {
                      if (!Array.isArray(field.options)) {
                        handleFieldFocus && handleFieldFocus(field.name);
                        return;
                      }

                      if (['maritalStatus', 'csection'].includes(field.name)) {
                        handleFieldFocus && handleFieldFocus(field.name);
                        return;
                      }

                      if (
                        field.name !== 'education' &&
                        state[field.name] !== '' &&
                        state[field.name] !== undefined
                      ) {
                        handleFieldFocus && handleFieldFocus(field.name);
                        return;
                      }

                      handleOpenModal(field.name);
                    }}
                    onClick={() => {
                      if (field.name === 'education') {
                        handleOpenModal(field.name);
                      }
                    }}
                    {...(field.name === 'lastAction' || PROFILE_FORM_READ_ONLY_DATE_FIELDS.has(field.name)
                      ? { readOnly: true }
                      : {
                          onChange: e => {
                            if (field.name === 'myComment') {
                              autoResizeMyComment(e.target);
                            }
                            if (field.name === 'moreInfo_main') {
                              autoResizeMoreInfo(e.target);
                            }
                            let value = e?.target?.value;
                            if (field.name === 'publish') {
                              value = value.toLowerCase() === 'true';
                            } else if (field.name === 'telegram') {
                              value = e?.target?.value;
                            }
                            setState(prevState => ({
                              ...prevState,
                              [field.name]: Array.isArray(prevState[field.name])
                                ? [value, ...(prevState[field.name].slice(1) || [])]
                                : value,
                            }));
                          },
                          onBlur: () => {
                            const latestDraft = latestProfileDraftRef.current || state || {};
                            console.log('[ProfileSaveDebug] ProfileForm scalar input blur', {
                              fieldName: field.name,
                              value: latestDraft?.[field.name],
                              source: 'blur',
                              version: profileFormVersionRef.current,
                            });

                            if (deletingFieldsRef?.current?.has(field.name)) return;

                            if (field.name === 'myComment' && !latestDraft.myComment?.trim()) {
                              handleDelKeyValue('myComment');
                              return;
                            }

                            if (field.name === 'getInTouch') {
                              const raw = latestDraft.getInTouch;
                              const trimmed = typeof raw === 'string' ? raw.trim() : raw;

                              if (!trimmed) {
                                handleDelKeyValue('getInTouch');
                                return;
                              }
                            }

                            if (BIRTH_DATE_FIELDS.has(field.name)) {
                              const birthFromAge = resolveBirthDateFromAgeShorthand(latestDraft[field.name]);

                              if (birthFromAge) {
                                const nextState = {
                                  ...latestDraft,
                                  [field.name]: birthFromAge,
                                };

                                setState(nextState, {
                                  source: 'blur',
                                  caller: 'ProfileForm.scalarInput.onBlur',
                                  reason: 'birth-age-shorthand-normalized',
                                });
                                submitWithNormalization(nextState, 'overwrite');
                                return;
                              }
                            }

                            if (field.name === 'age') {
                              const birthFromAge = resolveBirthDateFromAgeInput(latestDraft.age);

                              if (birthFromAge) {
                                const nextState = {
                                  ...latestDraft,
                                  birth: birthFromAge,
                                };

                                setState(nextState, {
                                  source: 'blur',
                                  caller: 'ProfileForm.scalarInput.onBlur',
                                  reason: 'age-to-birth-normalized',
                                });
                                submitWithNormalization(nextState, 'overwrite');
                                return;
                              }
                            }

                            const needsSocialCleanup = ['facebook', 'instagram', 'twitter'].includes(field.name);
                            const rawValue = latestDraft[field.name];
                            const normalizedValue = needsSocialCleanup && rawValue != null
                              ? inputUpdateValue(rawValue, field)
                              : rawValue;

                            const nextState =
                              normalizedValue === rawValue
                                ? latestDraft
                                : {
                                    ...latestDraft,
                                    [field.name]: normalizedValue,
                                  };

                            if (normalizedValue !== rawValue) {
                              setState(nextState, {
                                source: 'blur',
                                caller: 'ProfileForm.scalarInput.onBlur',
                                reason: 'normalized-latest-draft',
                              });
                            }

                            submitWithNormalization(nextState, 'overwrite');
                          },
                        })}
                  />
                  )}
                  {extendedMode && canOpenSearchIdBackendShortcut(field.name, state[field.name]) && (
                    <SearchIdBackendButton
                      type="button"
                      title="Відкрити запис searchId у Firebase"
                      aria-label="Відкрити запис searchId у Firebase"
                      $rightOffset={field.name !== 'lastAction' && state[field.name] ? '82px' : '0px'}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleOpenSearchIdBackend(field.name, state[field.name])}
                    >
                      <FaArrowRight size={14} />
                    </SearchIdBackendButton>
                  )}
                  {field.name !== 'lastAction' && state[field.name] && (
                    <ClearButton
                      type="button"
                      aria-label={`Очистити ${getFieldDisplayLabel(field)}`}
                      onPointerDownCapture={e => {
                        console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                          eventType: e.type,
                          fieldName: field.name,
                          idx: undefined,
                          valueBeforeClear: state?.[field.name],
                        });
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onTouchStartCapture={e => {
                        console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                          eventType: e.type,
                          fieldName: field.name,
                          idx: undefined,
                          valueBeforeClear: state?.[field.name],
                        });
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDownCapture={e => {
                        console.log('[ProfileSaveDebug] ProfileForm clear pointer down', {
                          eventType: e.type,
                          fieldName: field.name,
                          idx: undefined,
                          valueBeforeClear: state?.[field.name],
                        });
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        console.log('[ProfileSaveDebug] ProfileForm clear click', {
                          fieldName: field.name,
                          idx: undefined,
                          valueBeforeClear: state?.[field.name],
                        });
                        handleClear(field.name);
                      }}
                    >
                      &times;
                    </ClearButton>
                  )}
                  {addRowButton}
                </InputFieldContainer>

                {(
                  <>
                    <Hint fieldName={field.name} isActive={state[field.name]}>
                      {hintLabel}
                    </Hint>
                    <Placeholder isActive={state[field.name]}>{getFieldPlaceholderText(field)}</Placeholder>
                  </>
                )}
              </InputDiv>
            )}


            {Array.isArray(field.options) && field.name !== 'education' ? (
              field.options.length === 2 ? (
                <ButtonGroup>
                  <Button
                    $compactText
                    type="button"
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'Yes',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Так
                  </Button>
                  <Button
                    $compactText
                    type="button"
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'No',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Ні
                  </Button>
                  <Button
                    $compactText
                    type="button"
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'Other',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        handleBlur(field.name);
                        return newState;
                      });
                    }}
                  >
                    Інше
                  </Button>
                </ButtonGroup>
              ) : field.options.length === 3 ? (
                <ButtonGroup>
                  {field.options.map(option => (
                    <Button
                      key={`${field.name}-${getOptionValue(option)}`}
                      type="button"
                      onClick={() => {
                        if (!state.myComment?.trim()) {
                          handleDelKeyValue('myComment');
                        }
                        setState(prevState => {
                          const newState = {
                            ...prevState,
                            [field.name]: getOptionValue(option),
                          };
                          submitWithNormalization(newState, 'overwrite');
                          if (getOptionValue(option) === 'Other') {
                            handleBlur(field.name);
                          }
                          return newState;
                        });
                      }}
                    >
                      {getOptionLabel(option)}
                    </Button>
                  ))}
                </ButtonGroup>
              ) : null
            ) : null}
              </FieldMainRow>

            {overlayEntries.map((entry, idx) => {
              // Пропозицію видно, її можна поправити перед «ОК» і відкрити її
              // запис у `searchId` тією самою стрілкою, що й у звичайного
              // рядка: ключ туди завів сам шар, і питання «а що там лежить»
              // виникає саме на цьому рядку.
              const draftValue = getOverlayEntryDraftValue(field.name, entry);
              return (
              <React.Fragment key={`overlay-${field.name}-${idx}`}>
              {/* Попередня версія правки — з журналу, а не з шару: читач її
                  вже переписав. Підпис каже про це, щоб «ОК» тут не читався як
                  рішення про поточну пропозицію. */}
              {entry.superseded && <OverlayVersionNote>Попередня версія правки</OverlayVersionNote>}
              <OverlayEntryRow>
                <InputDiv $isOverlaySuggestion $isDeletedOverlay={entry.isDeleted}>
                  <InputFieldContainer fieldName={field.name} value={draftValue}>
                    <InputField
                      fieldName={field.name}
                      name={`overlay-${field.name}-${idx}`}
                      aria-label={`Пропозиція: ${getFieldDisplayLabel(field)}`}
                      value={draftValue}
                      $isOverlaySuggestion
                      $isDeletedOverlay={entry.isDeleted}
                      onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                      onChange={e => setOverlayEntryDraftValue(field.name, entry, e.target.value)}
                    />
                    {extendedMode && canOpenSearchIdBackendShortcut(field.name, entry.value) && (
                      <SearchIdBackendButton
                        type="button"
                        title="Відкрити запис searchId у Firebase"
                        aria-label={`Відкрити запис searchId: ${getFieldDisplayLabel(field)}`}
                        $rightOffset="35px"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleOpenSearchIdBackend(field.name, entry.value)}
                      >
                        <FaArrowRight size={14} />
                      </SearchIdBackendButton>
                    )}
                    <ClearButton
                      type="button"
                      aria-label={`Відхилити пропозицію: ${getFieldDisplayLabel(field)}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleOverlayDismiss(field.name, entry)}
                    >
                      &times;
                    </ClearButton>
                  </InputFieldContainer>
                </InputDiv>
                <Button type="button" onClick={() => handleOverlayApply(field.name, entry)}>
                  ОК
                </Button>
              </OverlayEntryRow>
              </React.Fragment>
              );
            })}
            </PickerContainer>
            </FieldGroup>
          );
          };
          return groupMetricRowFields(block.shownFields).map(item => (item.metricRow ? (
            <MetricRow key={`metric-row-${item.fields.map(field => field.name).join('-')}`} $columns={item.fields.length} data-testid="profile-metric-row">
              {item.fields.map(field => renderField(field, { inMetricRow: true }))}
              {item.fields.some(field => canAppendFieldRow(state[field.name])) && (
                <AddRowButton
                  type="button"
                  $standalone
                  aria-label="Додати рядок: зріст, вага, кров"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => appendEmptyRowsTo(item.fields.map(field => field.name))}
                >
                  +
                </AddRowButton>
              )}
            </MetricRow>
          ) : renderField(item.field)));
          })()}</FieldsGrid>
          </ReadOnlyFieldset>}
        </TechnicalFieldsSection>
      ))}
      {/* Чіпи «Додати поле» — одним переліком на всю форму, найчастіше
          заповнювані першими (21.11, на прохання власниці продукту): по
          переліку на блок вони займали більше, ніж самі поля. */}
      {allChipFields.length > 0 && (
        <FieldChipsArea data-testid="profile-field-chips">
          <FieldChipsTitle>
            Додати поле
            {profileFieldStats && <FieldChipsNote>найчастіші першими</FieldChipsNote>}
          </FieldChipsTitle>
          <FieldChipsList>
            {(chipsExpanded ? allChipFields : allChipFields.slice(0, PROFILE_FIELD_CHIPS_VISIBLE)).map(field => (
              <FieldChip key={field.name} type="button" onClick={() => revealProfileField(field.name, field.chipBlockId)}>
                <span aria-hidden="true">+</span>
                {getFieldDisplayLabel(field)}
              </FieldChip>
            ))}
            {!chipsExpanded && allChipFields.length > PROFILE_FIELD_CHIPS_VISIBLE && (
              <FieldChipMore type="button" onClick={() => setChipsExpanded(true)}>
                Ще {allChipFields.length - PROFILE_FIELD_CHIPS_VISIBLE} ▸
              </FieldChipMore>
            )}
          </FieldChipsList>
        </FieldChipsArea>
      )}
      <OverlayDebugButton type="button" onClick={handleOverlayDebugAlert}>
        Оверлей
      </OverlayDebugButton>

      {/* Усе, що база знає про картку поза полями анкети: позначки власника
          (графік стимуляції в форму не доїжджав зовсім), чернетка з журналом,
          шари доповнень, відгуки, ключі searchId — деревом, з шляхом і
          посиланням у консоль на кожному вузлі. */}
      {isAdmin && state.userId ? (
        <ProfileDataTree
          cardId={state.userId}
          viewerId={auth.currentUser?.uid || ''}
          draftAuthorId={draftRecordCreator}
          record={state}
        />
      ) : null}

      </FormCard>

      {showInfoModal && (
        <InfoModal
          onClose={handleCloseModal}
          options={
            sortedFieldsToRender.find(field => field.name === selectedField)?.modalOptions ||
            sortedFieldsToRender.find(field => field.name === selectedField)?.options
          }
          onSelect={handleSelectOption}
          text={showInfoModal}
        />
      )}
    </FormPage>
  );
};

const FormPage = styled.div`
  background: transparent;
  padding: 12px 0;
  width: 100%;

  @media (max-width: 768px) {
    padding: 8px 0;
  }
`;

const FormCard = styled.div`
  background: ${uiTokens.colors.cardBg};
  border: none;
  border-radius: ${uiTokens.radius.xl};
  box-shadow: none;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  gap: ${uiTokens.spacing.xs};

  @media (max-width: 768px) {
    padding: 12px;
    border-radius: ${uiTokens.radius.lg};
  }
`;

const TechnicalFieldsSection = styled.section`
  width: 100%;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--km-border);
`;

const FieldsGrid = styled.div`
  ${revealCss}
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, max(260px, calc(50% - 6px))), 1fr));
  gap: 10px 12px;
  margin-top: 10px;

`;

const FieldGroup = styled.div`
  min-width: 0;
  grid-column: ${({ $compact }) => ($compact ? 'auto' : '1 / -1')};
`;

const BlockHeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
`;

// Заголовок блоку — він же кнопка згортання: клікати доводиться саме по назві,
// і окрема стрілка збоку була б другою мішенню для того самого руху.
const BlockToggle = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--km-muted);
  text-align: left;
  cursor: pointer;
`;

const BlockChevron = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1;
  transition: transform 0.15s ease;
  transform: rotate(${({ $open }) => ($open ? '0deg' : '-90deg')});
`;

// Назва блоку — це адреса вузла в базі, а не слово. Саме вона й відповідає на
// питання «де ці дані лежать»; id анкети з неї прибраний — він однаковий у всіх
// блоків і лише витісняв назву вузла за край рядка.
const BlockNodeName = styled.span`
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
`;

const BlockFieldCount = styled.span`
  flex: 0 0 auto;
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--km-border);
  color: var(--km-muted);
  font-size: 10px;
  line-height: 1.6;
`;

const BlockBackendLink = styled.a`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 4px;
  color: var(--km-accent, #2b6);
`;

// Рамки й відступів у `fieldset` немає: він тут лише вимикає поля блоку.
// Зріст, вага й кров — одним рядком: значення короткі, а кожне на всю
// ширину забирало три рядки екрана. Спільний «+» — останньою колонкою.
const MetricRow = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns || 3}, minmax(0, 1fr)) auto;
  gap: 8px;
  align-items: start;

  /* Поле в рядку — одна комірка: «на всю ширину» (FieldGroup) тут
     поставило б кожне поле окремим рядком. */
  > div {
    min-width: 0;
    grid-column: auto;
  }
`;

// «+» усередині поля, поруч із «×»: та сама мішень і той самий тихий вигляд,
// лише кольором акценту — це дія «додати», а не «прибрати».
const AddRowButton = styled.button`
  position: relative;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 32px;
  margin-right: 2px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--km-accent);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  ${({ $standalone }) => ($standalone ? css`
    align-self: end;
    width: 34px;
    height: 38px;
    border: 1px solid ${uiTokens.colors.border};
    border-radius: 8px;
  ` : '')}

  &:hover { background: rgba(201, 96, 15, 0.08); }
  &:focus-visible { outline: 2px solid ${uiTokens.colors.borderFocus}; outline-offset: -2px; }
`;

// Чіпи «Додати поле» — заливкою без рамки, як решта вторинних контролів
// (`--km-fill`); «Ще N» — рамкою, бо це не поле, а розгортання переліку.
const FieldChipsArea = styled.div`
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--km-border);
`;

const FieldChipsTitle = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--km-text);
  font-size: 12px;
  font-weight: 600;
`;

const FieldChipsNote = styled.span`
  color: var(--km-muted);
  font-weight: 400;
`;

const FieldChipsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const FieldChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 11px 0 9px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--km-fill);
  color: var(--km-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;

  span {
    color: var(--km-accent);
    font-weight: 600;
  }

  &:hover { border-color: var(--km-border); }
  &:focus-visible { outline: 2px solid ${uiTokens.colors.borderFocus}; outline-offset: 2px; }
  &:disabled { cursor: default; opacity: 0.6; }
`;

const FieldChipMore = styled(FieldChip)`
  border-color: var(--km-border);
  background: transparent;
  color: var(--km-muted);
`;

const ReadOnlyFieldset = styled.fieldset`
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
`;


// Журнал чернетки — згорнутий за замовчуванням: його відкривають, коли
// треба звірити, хто і що міняв, а не щоразу, як відкривають анкету.
const DraftHistoryBox = styled.details`
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-card);
  color: var(--km-text);
  font-size: 13px;

  summary { cursor: pointer; font-weight: 700; }
`;

const DraftHistoryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  padding: 6px 0;
  border-top: 1px solid var(--km-border);
  overflow-wrap: anywhere;

  span:first-child { color: var(--km-muted); font-size: 12px; }
`;

const DraftHistoryNote = styled.p`
  margin: 8px 0 0;
  color: var(--km-muted);
`;


const PickerContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 2px;
`;

const InputDiv = styled.div`
  display: flex;
  flex-direction: column-reverse;
  align-items: stretch;
  gap: 4px;
  position: relative;
  margin: 0;
  padding: 0;
  --field-bg: ${({ $isDeletedOverlay, $isOverlaySuggestion }) => {
    if ($isOverlaySuggestion) return uiTokens.colors.cardBg;
    if ($isDeletedOverlay) return uiTokens.colors.mutedBg;
    return uiTokens.colors.cardBg;
  }};
  --field-border: ${({ $isHighlighted, $isDeletedOverlay, $isOverlaySuggestion }) => {
    if ($isDeletedOverlay) return uiTokens.colors.danger;
    if ($isOverlaySuggestion || $isHighlighted) return uiTokens.colors.borderFocus;
    return uiTokens.colors.border;
  }};
  border-radius: 0;
  box-sizing: border-box;
  flex: ${({ $isOverlaySuggestion }) => ($isOverlaySuggestion ? '1 1 0' : '1 1 auto')};
  width: ${({ $isOverlaySuggestion }) => ($isOverlaySuggestion ? 'auto' : '100%')};
  min-width: 0;
  height: auto;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  margin-top: ${({ $isArrayValueItem, $isFirstArrayValueItem }) =>
    $isArrayValueItem && !$isFirstArrayValueItem ? '8px' : '0'};
`;

const FieldMainRow = styled.div`
  display: flex;
  align-items: flex-end;
  width: 100%;
  gap: 8px;
  flex-wrap: wrap;

  > ${InputDiv} {
    flex: 1 1 140px;
    width: auto;
  }
`;

const OverlayEntryRow = styled.div`
  display: flex;
  align-items: flex-end;
  width: 100%;
  gap: 8px;
  margin-top: 8px;
`;

const OverlayVersionNote = styled.div`
  margin-top: 8px;
  font-size: 12px;
  color: var(--km-muted, #8a8580);
`;

const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  align-items: center;
  border-radius: ${uiTokens.radius.sm};
  padding-left: ${({ fieldName, value }) => {
    const baseFieldName = resolveFieldNameBase(fieldName);
    if (baseFieldName === 'phone') return '20px';
    if (baseFieldName === 'telegram' || baseFieldName === 'instagram' || baseFieldName === 'tiktok' || baseFieldName === 'twitter') return '25px';
    if (baseFieldName === 'facebook') return /^\d+$/.test(value) ? '20px' : '25px';
    if (baseFieldName === 'vk') return /^\d+$/.test(value) || value === '' ? '23px' : '10px';
    return '10px';
  }};
  max-width: 100%;
  min-width: 0;
  pointer-events: auto;
  color: ${({ $isDeletedOverlay }) => ($isDeletedOverlay ? uiTokens.colors.textSecondary : uiTokens.colors.textPrimary)};
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  resize: vertical;
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.35;
  padding-top: 8px;
  padding-bottom: 8px;
  padding-right: 8px;
  &[readonly] { cursor: pointer; }

  @media (pointer: coarse) {
    font-size: 16px;
  }
  ${({ as, fieldName }) => {
    const baseFieldName = resolveFieldNameBase(fieldName);
    if (as === 'textarea' && baseFieldName === MULTI_DATA_ACCESS_FIELD) {
      return css`
        min-height: 36px;
        max-height: 84px;
        resize: vertical;
      `;
    }
    if (as === 'textarea' && baseFieldName === 'ppTechnicalInput') {
      return css`
        overflow: hidden;
        resize: none;
      `;
    }
    return null;
  }}
  &::placeholder {
    color: ${uiTokens.colors.textSecondary};
    opacity: 0.7;
  }
`;

const ScreenAccessList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
`;

const ScreenAccessOption = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 32px;
  color: ${uiTokens.colors.textPrimary};
  font-size: ${uiTokens.typography.fontSizeMd};
  cursor: pointer;

  input {
    margin-top: 3px;
    flex: 0 0 auto;
  }
`;

const Hint = styled.label`
  position: static;
  padding-left: 2px;
  transition: color 0.2s ease;
  color: ${uiTokens.colors.textSecondary};
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
`;

const Placeholder = styled.label`
  display: none;
`;

const InputFieldContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  height: 100%;
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 38px;
  border: 1px solid var(--field-border, ${uiTokens.colors.border});
  border-radius: 8px;
  background: var(--field-bg, ${uiTokens.colors.cardBg});
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus-within {
    border-color: ${uiTokens.colors.borderFocus};
    box-shadow: 0 0 0 3px rgba(201, 96, 15, 0.1);
  }
  &::before {
    content: ${({ fieldName, value }) => {
      const baseFieldName = resolveFieldNameBase(fieldName);
      if (baseFieldName === 'phone') return "'+'";
      if (baseFieldName === 'telegram' || baseFieldName === 'instagram' || baseFieldName === 'tiktok' || baseFieldName === 'twitter') return "'@'";
      if (baseFieldName === 'facebook') return /^\d+$/.test(value) ? "'='" : "'@'";
      if (baseFieldName === 'vk') return /^\d+$/.test(value) || value === '' || value === undefined ? "'id'" : "''";
      return "''";
    }};
    position: absolute;
    left: 10px;
    display: flex;
    align-items: center;
    color: ${({ value }) => (value ? uiTokens.colors.textPrimary : uiTokens.colors.textSecondary)};
    font-size: 16px;
    text-align: center;
  }
`;

const SearchIdBackendButton = styled.button`
  position: relative;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--km-accent);
  font-size: 16px;
  width: 30px;
  height: 32px;
  padding: 0;
  z-index: 1;

  &:hover {
    color: var(--km-text);
  }
  &:focus-visible { outline: 2px solid ${uiTokens.colors.borderFocus}; outline-offset: -2px; }
`;

const ClearButton = styled.button`
  position: relative;
  flex: 0 0 30px;
  margin-right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${uiTokens.colors.textSecondary};
  font-size: 16px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  &:focus-visible { outline: 2px solid ${uiTokens.colors.borderFocus}; outline-offset: -2px; }
  &:hover {
    color: ${uiTokens.colors.textPrimary};
    background: rgba(255, 140, 0, 0.12);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 6px;
  margin-left: 0;
  box-sizing: border-box;
  flex-shrink: 0;
  flex-wrap: wrap;
  max-width: 100%;
  margin-bottom: 2px;
`;

const Button = styled.button`
  min-width: 34px;
  height: 34px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid ${uiTokens.colors.border};
  background: ${uiTokens.colors.cardBg};
  color: ${uiTokens.colors.accent};
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  flex: 0 0 auto;
  transition: filter 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
  margin-right: 0;
  white-space: nowrap;

  &:hover {
    border-color: ${uiTokens.colors.borderFocus};
    background: rgba(201, 96, 15, 0.08);
  }

  &:focus-visible {
    outline: 2px solid ${uiTokens.colors.borderFocus};
    outline-offset: 2px;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const OverlayDebugButton = styled(Button)`
  margin-top: 12px;
`;
