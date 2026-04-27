import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import styled, { css } from 'styled-components';
import { get, ref as refDb } from 'firebase/database';
import Photos from './Photos';
import { inputUpdateValue } from './inputUpdatedValue';
import { useAutoResize } from '../hooks/useAutoResize';
import { color, OrangeBtn } from './styles';
import { pickerFieldsExtended as pickerFields } from './formFields';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import {
  formatDateToDisplay,
  formatDateAndFormula,
} from 'components/inputValidations';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { patchOverlayField } from 'utils/multiAccountEdits';
import toast from 'react-hot-toast';
import { removeField } from './smallCard/actions';
import { FaTimes } from 'react-icons/fa';
import { InfoModal } from './InfoModal';
import { auth, database } from './config';
import {
  ADDITIONAL_ACCESS_FILTER_OPTIONS,
  ADDITIONAL_ACCESS_TEMPLATE,
  isUserAllowedByAnyAdditionalAccessRule,
  parseAdditionalAccessRuleGroups,
  resolveAdditionalAccessSearchKeyBuckets,
} from 'utils/additionalAccessRules';
import {
  buildNewUsersFilterSetIndex,
  getIndexedNewUsersIdsByRules,
  makeAdditionalRulesSetKey,
} from 'utils/newUsersFilterSetsIndex';
import {
  getCachedAdditionalRulesPreview,
  getCachedSearchKeyPayload,
  saveCachedAdditionalRulesPreview,
} from 'utils/searchKeyCache';

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
      ukrainianHint: key,
    })),
  ];
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

const ADDITIONAL_ACCESS_FIELD = 'additionalAccessRules';
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
]);
const SEARCH_KEY_ROOT = 'searchKey';
const ADDITIONAL_RULE_LABELS = {
  age: 'Вік',
  csection: 'КС',
  bloodGroup: 'Кров',
  rh: 'Резус',
  maritalStatus: 'Сімейний стан',
  imt: 'ІМТ',
  role: 'Роль',
  contact: 'Контакти',
  userId: 'UserId',
  reaction: 'Reaction',
  height: 'Height',
  weight: 'Weight',
  ageBirthDate: 'Birth date',
};
const ADDITIONAL_RULE_ORDER = Object.keys(ADDITIONAL_RULE_LABELS);
const ADDITIONAL_RULE_OPTION_LABELS = {
  le21: '<=21',
  '22_25': '22-25',
  '26_30': '26-30',
  '31_35': '31-35',
  '36_38': '36-38',
  '39_41': '39-41',
  '42_plus': '42+',
  cs2plus: '>=2',
  cs1: '1',
  cs0: '0',
};
const ADDITIONAL_RULE_OPTION_DESCRIPTIONS = {
  age: {
    le21: 'До 21 року включно',
    '22_25': '22-25 років',
    '26_30': '26-30 років',
    '31_35': '31-35 років',
    '36_38': '36-38 років',
    '39_41': '39-41 років',
    '42_plus': '42 роки і старше',
    '?': 'Некоректний формат віку',
    no: 'Вік не вказано',
  },
  csection: {
    cs2plus: '2 і більше КС',
    cs1: '1 КС',
    cs0: 'КС не було',
    '?': 'Невідоме значення',
    no: 'Поле КС порожнє',
  },
  bloodGroup: {
    '1': 'I група',
    '2': 'II група',
    '3': 'III група',
    '4': 'IV група',
    '?': 'Некоректне значення',
    no: 'Група крові не вказана',
  },
  rh: {
    '+': 'Резус позитивний',
    '-': 'Резус негативний',
    '?': 'Некоректний резус',
    no: 'Резус не вказано',
  },
  maritalStatus: {
    '+': 'Заміжня / married',
    '-': 'Незаміжня / single',
    '?': 'Інше або некоректне',
    no: 'Сімейний стан не вказано',
  },
  imt: {
    le28: 'ІМТ до 28',
    '29_31': 'ІМТ 29-31',
    '32_35': 'ІМТ 32-35',
    '36_plus': 'ІМТ 36+',
    '?': 'ІМТ не вдалося порахувати',
    no: 'Немає даних для ІМТ',
  },
};

const parseAdditionalRulesTextToBuilder = raw => {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return lines
    .map(line => {
      const [keyRaw, ...rest] = line.split(':');
      if (!keyRaw || rest.length === 0) return null;
      const key = keyRaw.trim();
      const rawTokens = rest
        .join(':')
        .split(',')
        .map(token => token.trim())
        .filter(Boolean);

      const allowedValues = new Set(rawTokens);
      if (key === 'age') {
        const numericAges = new Set(
          rawTokens
          .map(token => Number.parseInt(token, 10))
          .filter(age => Number.isFinite(age) && age >= 18)
        );
        const normalizedAgeTokens = new Set();
        if ([18, 19, 20, 21].every(age => numericAges.has(age))) normalizedAgeTokens.add('le21');
        if ([22, 23, 24, 25].every(age => numericAges.has(age))) normalizedAgeTokens.add('22_25');
        if ([26, 27, 28, 29, 30].every(age => numericAges.has(age))) normalizedAgeTokens.add('26_30');
        if ([31, 32, 33, 34, 35].every(age => numericAges.has(age))) normalizedAgeTokens.add('31_35');
        if ([36, 37, 38].every(age => numericAges.has(age))) normalizedAgeTokens.add('36_38');
        if ([39, 40, 41].every(age => numericAges.has(age))) normalizedAgeTokens.add('39_41');
        if (rawTokens.includes('42_plus') || rawTokens.includes('43_plus')) {
          normalizedAgeTokens.add('42_plus');
        }
        if (rawTokens.includes('?')) normalizedAgeTokens.add('?');
        if (rawTokens.includes('no')) normalizedAgeTokens.add('no');
        return { key, allowedValues: normalizedAgeTokens };
      }
      return { key, allowedValues };
    })
    .filter(Boolean);
};

const buildAdditionalRulesTextFromBuilder = rules =>
  rules
    .filter(rule => rule?.key && rule.allowedValues instanceof Set && rule.allowedValues.size > 0)
    .map(rule => {
      if (rule.key !== 'age') return `${rule.key}: ${[...rule.allowedValues].join(',')}`;

      const selected = rule.allowedValues;
      const numericAges = new Set();
      if (selected.has('le21')) [18, 19, 20, 21].forEach(age => numericAges.add(age));
      if (selected.has('22_25')) [22, 23, 24, 25].forEach(age => numericAges.add(age));
      if (selected.has('26_30')) [26, 27, 28, 29, 30].forEach(age => numericAges.add(age));
      if (selected.has('31_35')) [31, 32, 33, 34, 35].forEach(age => numericAges.add(age));
      if (selected.has('36_38')) [36, 37, 38].forEach(age => numericAges.add(age));
      if (selected.has('39_41')) [39, 40, 41].forEach(age => numericAges.add(age));

      const tokens = [...numericAges].sort((a, b) => a - b).map(age => String(age));
      if (selected.has('42_plus')) tokens.push('42_plus');
      if (selected.has('?')) tokens.push('?');
      if (selected.has('no')) tokens.push('no');
      return `${rule.key}: ${tokens.join(',')}`;
    })
    .join('\n');

const additionalRulesTextToInputs = raw => {
  if (Array.isArray(raw)) {
    const items = raw.map(item => String(item || ''));
    return items.length ? items : [''];
  }

  const text = String(raw || '');
  if (!text.trim()) return [''];
  return text.split(/\r?\n\s*\r?\n+/);
};


const sanitizeOverlayValue = value => {
  if (Array.isArray(value)) {
    const normalized = value.map(item => sanitizeOverlayValue(item)).filter(item => item !== '');
    return normalized.join(', ');
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const isEmptyOverlayValue = value => sanitizeOverlayValue(value) === '';
const technicalOverlayFields = new Set(['editor', 'cachedAt', 'lastAction']);
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

    removeField(userId, keyPath, effectiveSetUsers, stateUpdater, keyPath);
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
                              {renderAllFields(item, arrayKey, options)}
                            </div>
                          </div>
                          {canRemove && (
                            <OrangeBtn
                              type="button"
                              style={removeButtonStyle}
                              onClick={() => handleRemove(arrayKey)}
                            >
                              <FaTimes size={12} color={color.white} />
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
                            <FaTimes size={12} color={color.white} />
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
                <FaTimes size={12} color={color.white} />
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
              <div style={nestedIndentStyle}>{renderAllFields(value, nestedKey, options)}</div>
            </div>
            {canRemove && (
              <OrangeBtn
                type="button"
                style={removeButtonStyle}
                onClick={() => handleRemove(nestedKey)}
              >
                <FaTimes size={12} color={color.white} />
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
            <FaTimes size={12} color={color.white} />
          </OrangeBtn>
        )}
      </div>
    );
  });
};

export const ProfileForm = ({
  state,
  setState,
  handleBlur,
  handleSubmit,
  handleClear,
  handleDelKeyValue,
  handleFieldFocus,
  highlightedFields = [],
  deletedOverlayFields = [],
  isAdmin = false,
  overlayFieldAdditions = {},
  refreshOverlayForEditor,
}) => {
  const canManageAccessLevel = isAdmin;
  const textareaRef = useRef(null);
  const moreInfoRef = useRef(null);
  const [customField, setCustomField] = useState({ key: '', value: '' });
  const [collection, setCollection] = useState('newUsers');
  const [selectedField, setSelectedField] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [autoOverlayFieldAdditions, setAutoOverlayFieldAdditions] = useState({});
  const [dismissedOverlayEntries, setDismissedOverlayEntries] = useState({});
  const [showAdditionalRulesModal, setShowAdditionalRulesModal] = useState(false);
  const [activeAdditionalRuleInputIndex, setActiveAdditionalRuleInputIndex] = useState(0);
  const [additionalRuleBuilder, setAdditionalRuleBuilder] = useState([]);
  const [previewAdditionalRulesText, setPreviewAdditionalRulesText] = useState('');
  const [availableCardsCount, setAvailableCardsCount] = useState(0);
  const [isLoadingAvailableCards, setIsLoadingAvailableCards] = useState(false);
  const [isIndexingAdditionalRules, setIsIndexingAdditionalRules] = useState(false);
  const autoAppliedOverlayForUserRef = useRef('');

  const addEmptyAdditionalFilter = useCallback(() => {
    const used = new Set(additionalRuleBuilder.map(rule => rule.key));
    const firstAvailable = ADDITIONAL_RULE_ORDER.find(key => !used.has(key)) || ADDITIONAL_RULE_ORDER[0];
    if (!firstAvailable) return;
    setAdditionalRuleBuilder(prev => [...prev, { key: firstAvailable, allowedValues: new Set() }]);
  }, [additionalRuleBuilder]);

  const additionalRulesDraftText = useMemo(
    () => buildAdditionalRulesTextFromBuilder(additionalRuleBuilder),
    [additionalRuleBuilder]
  );
  const additionalAccessFieldValue = state?.[ADDITIONAL_ACCESS_FIELD];
  const additionalRulesInputs = useMemo(() => {
    const rawValue = additionalAccessFieldValue;
    if (Array.isArray(rawValue)) {
      return rawValue.map(item => String(item || ''));
    }
    return additionalRulesTextToInputs(rawValue);
  }, [additionalAccessFieldValue]);
  const activeAdditionalRulesDraftText = useMemo(() => {
    const activeInputValue = String(additionalRulesInputs[activeAdditionalRuleInputIndex] || '');
    if (!activeInputValue.trim()) return additionalRulesDraftText;
    return additionalRulesDraftText || activeInputValue;
  }, [activeAdditionalRuleInputIndex, additionalRulesDraftText, additionalRulesInputs]);
  useEffect(() => {
    if (state?.userId) return;
    autoAppliedOverlayForUserRef.current = '';
  }, [state?.userId]);

  useEffect(() => {
    if (!showAdditionalRulesModal) return;
    const activeInputValue = additionalRulesInputs[activeAdditionalRuleInputIndex] || '';
    setPreviewAdditionalRulesText(String(activeInputValue || '').trim());
    const parsed = parseAdditionalRulesTextToBuilder(activeInputValue);
    if (parsed.length > 0) {
      setAdditionalRuleBuilder(parsed);
      return;
    }
    setAdditionalRuleBuilder([{ key: ADDITIONAL_RULE_ORDER[0], allowedValues: new Set() }]);
  }, [activeAdditionalRuleInputIndex, additionalRulesInputs, showAdditionalRulesModal]);

  useEffect(() => {
    if (!showAdditionalRulesModal) return;

    let cancelled = false;
    const loadAvailableCards = async () => {
      const parsedRuleGroups = parseAdditionalAccessRuleGroups(previewAdditionalRulesText);
      const accessUserId = String(state?.userId || '').trim();
      const cachedPreview = getCachedAdditionalRulesPreview({
        rawRules: previewAdditionalRulesText,
        accessUserId,
      });
      if (cachedPreview) {
        setAvailableCardsCount(cachedPreview.count);
        return;
      }

      if (!parsedRuleGroups.length) {
        setAvailableCardsCount(0);
        saveCachedAdditionalRulesPreview({
          rawRules: previewAdditionalRulesText,
          accessUserId,
          count: 0,
          userIds: [],
        });
        return;
      }

      setIsLoadingAvailableCards(true);
      try {
        const indexed = await getIndexedNewUsersIdsByRules({
          rawRules: previewAdditionalRulesText,
          accessUserId,
        });

        if (indexed?.userIds) {
          saveCachedAdditionalRulesPreview({
            rawRules: previewAdditionalRulesText,
            accessUserId,
            count: indexed.userIds.length,
            userIds: indexed.userIds,
          });
          if (!cancelled) {
            setAvailableCardsCount(indexed.userIds.length);
          }
          return;
        }

        const matchedIds = new Set();
        const collectIdsByIndexValues = async (indexName, values) => {
          const requestedValues = [...new Set((Array.isArray(values) ? values : [...(values || [])]).filter(Boolean))];
          if (!indexName || requestedValues.length === 0) return new Set();

          const indexPayload = await getCachedSearchKeyPayload(`${SEARCH_KEY_ROOT}/${indexName}`, async () => {
            const indexSnapshot = await get(refDb(database, `${SEARCH_KEY_ROOT}/${indexName}`));
            return {
              exists: indexSnapshot.exists(),
              value: indexSnapshot.exists() ? indexSnapshot.val() || {} : null,
            };
          });

          if (!indexPayload?.exists || !indexPayload.value || typeof indexPayload.value !== 'object') {
            return new Set();
          }

          const ids = new Set();
          requestedValues.forEach(value => {
            const bucketValue = indexPayload.value?.[value];
            if (!bucketValue || typeof bucketValue !== 'object') return;
            Object.keys(bucketValue).forEach(userId => ids.add(userId));
          });

          return ids;
        };

        const collectAgeIdsByRule = async parsedRules => {
          if (!parsedRules?.age && !parsedRules?.age42plus && !parsedRules?.ageUnknown && !parsedRules?.ageNo) {
            return new Set();
          }

          const agePayload = await getCachedSearchKeyPayload(`${SEARCH_KEY_ROOT}/age`, async () => {
            const ageSnapshot = await get(refDb(database, `${SEARCH_KEY_ROOT}/age`));
            return {
              exists: ageSnapshot.exists(),
              value: ageSnapshot.exists() ? ageSnapshot.val() || {} : null,
            };
          });
          if (!agePayload?.exists) return new Set();

          const ids = new Set();
          Object.entries(agePayload.value || {}).forEach(([bucket, value]) => {
            let isBucketAllowed = false;

            if (bucket === 'no') {
              isBucketAllowed = Boolean(parsedRules.ageNo);
            } else if (bucket === '?') {
              isBucketAllowed = Boolean(parsedRules.ageUnknown);
            } else {
              const match = String(bucket).match(/^d_(\d{4})-(\d{2})-(\d{2})$/);
              if (match) {
                const [, year, month, day] = match;
                const age = utilCalculateAge(`${day}.${month}.${year}`);
                if (Number.isFinite(age)) {
                  isBucketAllowed = Boolean(parsedRules.age?.has(age) || (parsedRules.age42plus && age >= 42));
                }
              }
            }

            if (!isBucketAllowed || !value || typeof value !== 'object') return;
            Object.keys(value).forEach(userId => ids.add(userId));
          });

          return ids;
        };

        for (const parsedRules of parsedRuleGroups) {
          const bucketMap = resolveAdditionalAccessSearchKeyBuckets(parsedRules);
          const activeGroups = Object.entries(bucketMap || {}).filter(([indexName, values]) => {
            if (indexName === 'age') return false;
            const asArray = Array.isArray(values) ? values : [...(values || [])];
            return asArray.length > 0;
          });
          if (activeGroups.length > 0) {
            const groupIds = await Promise.all(
              activeGroups.map(([indexName, values]) => collectIdsByIndexValues(indexName, values))
            );
            groupIds.forEach(ids => {
              ids.forEach(userId => matchedIds.add(userId));
            });
          }

          const ageMatchedIds = await collectAgeIdsByRule(parsedRules);
          ageMatchedIds.forEach(userId => matchedIds.add(userId));
        }

        const matchedIdList = [...matchedIds];
        const finalMatchedIds = [];
        const BATCH_SIZE = 150;

        for (let index = 0; index < matchedIdList.length; index += BATCH_SIZE) {
          const batch = matchedIdList.slice(index, index + BATCH_SIZE);
          const rows = await Promise.all(
            batch.map(async userId => {
              const [newUserSnap, userSnap] = await Promise.all([
                get(refDb(database, `newUsers/${userId}`)),
                get(refDb(database, `users/${userId}`)),
              ]);
              if (!newUserSnap.exists() && !userSnap.exists()) return null;
              return {
                userId,
                ...(userSnap.exists() ? userSnap.val() : {}),
                ...(newUserSnap.exists() ? newUserSnap.val() : {}),
              };
            })
          );

          rows.forEach(user => {
            if (!user) return;
            if (isUserAllowedByAnyAdditionalAccessRule(user, parsedRuleGroups)) {
              finalMatchedIds.push(user.userId);
            }
          });
        }

        const uniqueMatchedUserIds = [...new Set(finalMatchedIds.filter(Boolean))];
        saveCachedAdditionalRulesPreview({
          rawRules: previewAdditionalRulesText,
          accessUserId,
          count: uniqueMatchedUserIds.length,
          userIds: uniqueMatchedUserIds,
        });
        if (!cancelled) {
          setAvailableCardsCount(uniqueMatchedUserIds.length);
        }
      } catch (error) {
        console.error('Failed to build additional access preview', error);
        if (!cancelled) {
          setAvailableCardsCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAvailableCards(false);
        }
      }
    };

    loadAvailableCards();
    return () => {
      cancelled = true;
    };
  }, [
    previewAdditionalRulesText,
    showAdditionalRulesModal,
    state?.userId,
  ]);

  useEffect(() => {
    setDismissedOverlayEntries({});
  }, [state?.userId, overlayFieldAdditions]);

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

  const buildMatchedUserIdsBySetKey = useCallback((rawRules, accessUserId, matchedByInputIndex) => {
    const normalizedAccessUserId = String(accessUserId || '').trim();
    if (!normalizedAccessUserId || !matchedByInputIndex || typeof matchedByInputIndex !== 'object') return null;

    const ruleInputs = Array.isArray(rawRules)
      ? rawRules.map(item => String(item || '').trim())
      : String(rawRules || '')
        .split(/\r?\n\s*\r?\n+/)
        .map(item => item.trim());

    const matchedBySetKey = {};
    ruleInputs.forEach((rulesText, index) => {
      if (!rulesText) return;
      const inputIndex = index + 1;
      const setKey = makeAdditionalRulesSetKey(rulesText, normalizedAccessUserId, inputIndex);
      if (!setKey) return;
      const userIds = matchedByInputIndex[inputIndex];
      if (!Array.isArray(userIds)) return;
      matchedBySetKey[setKey] = userIds;
    });

    return Object.keys(matchedBySetKey).length > 0 ? matchedBySetKey : null;
  }, []);

  const getIndexedMatchedUserIdsByInputIndex = useCallback(async rawRules => {
    const accessUserId = String(state?.userId || '').trim();
    if (!accessUserId) {
      toast.error('Не знайдено userId для індексації');
      return null;
    }

    const ruleInputs = Array.isArray(rawRules)
      ? rawRules.map(item => String(item || '').trim()).filter(Boolean)
      : String(rawRules || '')
        .split(/\r?\n\s*\r?\n+/)
        .map(item => item.trim())
        .filter(Boolean);
    if (!ruleInputs.length) {
      toast.error('Немає правил для індексації');
      return null;
    }

    const matchedByInputIndex = {};
    for (let index = 0; index < ruleInputs.length; index += 1) {
      const rulesText = ruleInputs[index];
      // eslint-disable-next-line no-await-in-loop
      const indexed = await getIndexedNewUsersIdsByRules({
        rawRules: rulesText,
        accessUserId,
      });
      if (!indexed?.userIds) {
        toast.error('Індексів searchKey не знайдено. Спершу запустіть загальну індексацію.');
        return null;
      }
      matchedByInputIndex[index + 1] = [...new Set((indexed.userIds || []).filter(Boolean))];
    }

    return matchedByInputIndex;
  }, [state?.userId]);

  const submitWithNormalization = useCallback(async (nextState, overwrite, delCondition, options = {}) => {
    const payload =
      nextState && typeof nextState === 'object'
        ? normalizeGetInTouchForSubmit(nextState)
        : nextState;
    try {
      const rawRules = payload?.[ADDITIONAL_ACCESS_FIELD];
      const shouldReindexAfterAdditionalRulesChange =
        rawRules !== undefined || Boolean(delCondition?.[ADDITIONAL_ACCESS_FIELD] !== undefined);
      if (shouldReindexAfterAdditionalRulesChange) {
        const accessUserId = String(payload?.userId || state?.userId || '').trim();
        const matchedUserIdsByInputIndex =
          options?.matchedUserIdsByInputIndex && typeof options.matchedUserIdsByInputIndex === 'object'
            ? options.matchedUserIdsByInputIndex
            : await getIndexedMatchedUserIdsByInputIndex(rawRules);

        if (!matchedUserIdsByInputIndex) {
          Promise.resolve(handleSubmit(payload, overwrite, delCondition)).catch(error => {
            console.error('Failed to submit profile changes', error);
            const details = error?.message || String(error);
            toast.error(`Не вдалося зберегти зміни профілю.\n${details}`);
          });
          return;
        }

        const matchedUserIdsBySetKey = buildMatchedUserIdsBySetKey(
          rawRules,
          accessUserId,
          matchedUserIdsByInputIndex
        );
        const indexResult = await buildNewUsersFilterSetIndex({
          rawRules: rawRules !== undefined ? rawRules : '',
          accessUserId,
          matchedUserIdsBySetKey,
        });
        if (indexResult && Number(indexResult.writesCount || 0) === 0 && Number(indexResult?.setKeys?.length || 0) === 0) {
          toast('searchKeySets не оновлено: не знайдено валідних правил.');
        }
      }
    } catch (error) {
      const code = String(error?.code || '');
      if (code.includes('PERMISSION_DENIED')) {
        console.warn('Skipped additional access newUsers filter-set index rebuild due to permissions.', error);
        const details = error?.message || String(error);
        toast.error(
          `Немає прав на запис у searchKeySets.\nПеревірте Firebase Rules для цього користувача.\n${details}`
        );
      } else if (code.includes('MISSING_SEARCHKEY_INDEX')) {
        toast.error('Індексів searchKey не знайдено. Спершу запустіть загальну індексацію.');
      } else {
        console.error('Failed to update additional access newUsers filter-set index', error);
        const details = error?.message || String(error);
        toast.error(`Не вдалося зберегти індексацію наборів фільтрів.\n${details}`);
      }
    }
    Promise.resolve(handleSubmit(payload, overwrite, delCondition)).catch(error => {
      console.error('Failed to submit profile changes', error);
      const details = error?.message || String(error);
      toast.error(`Не вдалося зберегти зміни профілю.\n${details}`);
    });
  }, [buildMatchedUserIdsBySetKey, getIndexedMatchedUserIdsByInputIndex, handleSubmit, state?.userId]);

  const handleAddCustomField = () => {
    if (!customField.key) return;
    if (!state.myComment?.trim()) {
      handleDelKeyValue('myComment');
    }
    setState(prevState => {
      const newState = { ...prevState, [customField.key]: customField.value };
      submitWithNormalization(newState, 'overwrite');
      return newState;
    });
    setCustomField({ key: '', value: '' });
  };

  const handleAdditionalRuleKeyChange = (index, nextKey) => {
    setAdditionalRuleBuilder(prev =>
      prev.map((rule, ruleIndex) =>
        ruleIndex === index ? { key: nextKey, allowedValues: new Set() } : rule
      )
    );
  };

  const toggleAdditionalRuleValue = (index, token) => {
    setAdditionalRuleBuilder(prev =>
      prev.map((rule, ruleIndex) => {
        if (ruleIndex !== index) return rule;
        const next = new Set(rule.allowedValues);
        if (next.has(token)) {
          next.delete(token);
        } else {
          next.add(token);
        }
        return { ...rule, allowedValues: next };
      })
    );
  };

  const removeAdditionalRule = index => {
    setAdditionalRuleBuilder(prev => prev.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const handleRemoveAdditionalAccessRuleInput = useCallback((removeIndex = null, action = 'clear') => {
    const currentInputs = additionalRulesInputs.map(item => String(item || '').trim()).filter(Boolean);
    const shouldRemoveByIndex = Number.isInteger(removeIndex);
    const nextInputs = shouldRemoveByIndex
      ? currentInputs.filter((_, idx) => idx !== removeIndex)
      : [];
    const nextActiveIndex = Math.min(
      shouldRemoveByIndex ? removeIndex : 0,
      Math.max(nextInputs.length - 1, 0)
    );

    setActiveAdditionalRuleInputIndex(nextActiveIndex);
    setPreviewAdditionalRulesText(String(nextInputs[nextActiveIndex] || '').trim());

    setState(prevState => {
      const updated = { ...prevState };
      const previousValue = prevState?.[ADDITIONAL_ACCESS_FIELD];
      const removedValue = shouldRemoveByIndex
        ? Array.isArray(previousValue)
          ? previousValue[removeIndex]
          : previousValue
        : previousValue;

      if (nextInputs.length === 0) {
        delete updated[ADDITIONAL_ACCESS_FIELD];
      } else if (nextInputs.length === 1) {
        updated[ADDITIONAL_ACCESS_FIELD] = nextInputs[0];
      } else {
        updated[ADDITIONAL_ACCESS_FIELD] = nextInputs;
      }

      const delCondition =
        action === 'del' || removedValue !== undefined
          ? { [ADDITIONAL_ACCESS_FIELD]: removedValue }
          : undefined;
      submitWithNormalization(updated, 'overwrite', delCondition);
      return updated;
    });
  }, [additionalRulesInputs, setState, submitWithNormalization]);

  const indexAdditionalRulesForUser = useCallback(async rawRules => {
    const accessUserId = String(state?.userId || '').trim();
    if (!accessUserId) return null;

    setIsIndexingAdditionalRules(true);
    const toastId = 'additional-rules-indexing';
    let stage = 'start';
    const stageToast = message => toast.loading(message, { id: toastId });
    stageToast('1/3 Індексація searchKeySets: старт...');

    try {
      stage = 'load-searchkey';
      stageToast('2/3 Читання пулів із searchKey...');
      const matchedUserIdsByInputIndex = await getIndexedMatchedUserIdsByInputIndex(rawRules);
      if (!matchedUserIdsByInputIndex) {
        toast('searchKeySets не оновлено: відсутні індекси searchKey.', { id: toastId });
        return null;
      }

      const matchedUserIdsBySetKey = buildMatchedUserIdsBySetKey(
        rawRules,
        accessUserId,
        matchedUserIdsByInputIndex
      );

      stage = 'write-index';
      stageToast('3/3 Запис індексів у searchKeySets...');
      const indexResult = await buildNewUsersFilterSetIndex({
        rawRules,
        accessUserId,
        matchedUserIdsBySetKey,
      });

      const setsCount = Number(indexResult?.setKeys?.length || 0);
      const matchedCount = Number(indexResult?.userIds?.length || 0);
      const writesCount = Number(indexResult?.writesCount || 0);
      if (setsCount === 0 && writesCount === 0) {
        toast('searchKeySets не оновлено: не знайдено валідних правил.', { id: toastId });
      } else {
        toast.success(
          `5/5 Готово: індексацію searchKeySets оновлено (${setsCount} наборів, ${matchedCount} карток, ${writesCount} змін).`,
          { id: toastId }
        );
      }

      return indexResult;
    } catch (error) {
      const code = String(error?.code || '');
      const details = error?.message || String(error);
      if (code.includes('PERMISSION_DENIED')) {
        toast.error(
          `Помилка на етапі "${stage}": немає прав на запис у searchKeySets.\nПеревірте Firebase Rules для цього користувача.\n${details}`,
          { id: toastId }
        );
      } else if (code.includes('MISSING_SEARCHKEY_INDEX')) {
        toast.error('Індексів searchKey не знайдено. Спершу запустіть загальну індексацію.', { id: toastId });
      } else {
        toast.error(`Помилка на етапі "${stage}": не вдалося виконати індексацію наборів фільтрів.\n${details}`, { id: toastId });
      }
      return null;
    } finally {
      setIsIndexingAdditionalRules(false);
    }
  }, [buildMatchedUserIdsBySetKey, getIndexedMatchedUserIdsByInputIndex, state?.userId]);

  const applyAdditionalRulesFromBuilder = async () => {
    const rulesText = buildAdditionalRulesTextFromBuilder(additionalRuleBuilder);
    if (!rulesText.trim()) {
      toast.error('Оберіть щонайменше один фільтр перед застосуванням');
      return;
    }

    const matchedByInputIndex = await getIndexedMatchedUserIdsByInputIndex(rulesText);
    if (!matchedByInputIndex) return;
    const matchedUserIds = matchedByInputIndex[1] || [];

    setState(prevState => {
      const currentValue = prevState?.[ADDITIONAL_ACCESS_FIELD];
      const updatedValue = Array.isArray(currentValue)
        ? currentValue.map((item, idx) => (idx === activeAdditionalRuleInputIndex ? rulesText : item))
        : rulesText;
      const updated = {
        ...prevState,
        [ADDITIONAL_ACCESS_FIELD]: updatedValue,
      };
      submitWithNormalization(updated, 'overwrite', undefined, {
        matchedUserIdsByInputIndex: {
          [activeAdditionalRuleInputIndex + 1]: matchedUserIds,
        },
      });
      return updated;
    });
    setPreviewAdditionalRulesText(prev => {
      const nextInputs = additionalRulesTextToInputs(prev);
      nextInputs[activeAdditionalRuleInputIndex] = rulesText;
      return String(nextInputs[activeAdditionalRuleInputIndex] || '').trim();
    });
  };

  const indexAdditionalRulesFromBuilder = async () => {
    const rulesText = buildAdditionalRulesTextFromBuilder(additionalRuleBuilder);
    if (!rulesText.trim()) {
      toast.error('Оберіть щонайменше один фільтр перед індексацією');
      return;
    }

    const currentValue = state?.[ADDITIONAL_ACCESS_FIELD];
    const updatedValue = Array.isArray(currentValue)
      ? currentValue.map((item, idx) => (idx === activeAdditionalRuleInputIndex ? rulesText : item))
      : rulesText;

    setState(prevState => ({
      ...prevState,
      [ADDITIONAL_ACCESS_FIELD]: updatedValue,
    }));
    const updatedInputs = Array.isArray(updatedValue) ? updatedValue : additionalRulesTextToInputs(updatedValue);
    setPreviewAdditionalRulesText(String(updatedInputs[activeAdditionalRuleInputIndex] || '').trim());

    await indexAdditionalRulesForUser(updatedValue);
  };

  const handleCombinedAdditionalRulesChange = event => {
    const nextActiveRulesText = event?.target?.value || '';
    const nextBuilder = parseAdditionalRulesTextToBuilder(nextActiveRulesText);

    setAdditionalRuleBuilder(
      nextBuilder.length > 0
        ? nextBuilder
        : [{ key: ADDITIONAL_RULE_ORDER[0], allowedValues: new Set() }]
    );

    setState(prevState => {
      const currentValue = prevState?.[ADDITIONAL_ACCESS_FIELD];
      const updatedValue = Array.isArray(currentValue)
        ? currentValue.map((item, idx) => (idx === activeAdditionalRuleInputIndex ? nextActiveRulesText : item))
        : nextActiveRulesText;
      const updated = {
        ...prevState,
        [ADDITIONAL_ACCESS_FIELD]: updatedValue,
      };
      submitWithNormalization(updated, 'overwrite');
      return updated;
    });
  };

  const autoResizeMyComment = useAutoResize(textareaRef, state.myComment);
  const autoResizeMoreInfo = useAutoResize(moreInfoRef, state.moreInfo_main);

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
    'accessLevel',
    ADDITIONAL_ACCESS_FIELD,
  ];

  const accessLevelOptions = [
    { value: '', label: 'access level' },
    { value: 'matching:view', label: 'matching view' },
    { value: 'matching:view&write', label: 'matching view and write' },
    { value: 'add:view', label: 'add view' },
    { value: 'add:view&write', label: 'add view and write' },
    { value: 'add+matching:view', label: 'add and matching view' },
    { value: 'add+matching:view&write', label: 'add and matching view and write' },
  ];

  const fieldsToRender = getFieldsToRender(state);

  const normalizedFieldsToRender = (() => {
    let next = fieldsToRender;

    if (canManageAccessLevel && !next.some(field => field.name === 'accessLevel')) {
      next = [...next, { name: 'accessLevel', placeholder: 'access level', ukrainianHint: 'рівень доступу' }];
    }

    if (canManageAccessLevel && !next.some(field => field.name === ADDITIONAL_ACCESS_FIELD)) {
      next = [
        ...next,
        {
          name: ADDITIONAL_ACCESS_FIELD,
          placeholder: 'age: 21,22,23',
          ukrainianHint: 'додаткові правила доступу до newUsers',
        },
      ];
    }

    return next;
  })();


  const getOverlayEntrySignature = entry => {
    const value = sanitizeOverlayValue(entry?.value);
    return `${value}::${entry?.editorUserId || ''}::${entry?.isDeleted ? '1' : '0'}`;
  };

  const getOverlayEntriesForField = fieldName => {
    if (!isAdmin) return [];

    const mergedEntries = [
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

  const removeOverlayEntryFromBackend = useCallback(async (fieldName, entry) => {
    if (!fieldName || !entry?.editorUserId || !state?.userId) return;

    try {
      await patchOverlayField({
        editorUserId: entry.editorUserId,
        cardUserId: state.userId,
        fieldName,
        change: null,
      });
    } catch {
      toast.error('Не вдалося видалити оверлей-поле');
    }
  }, [state?.userId]);

  const removeOverlayValueFromState = useCallback((fieldName, entryValue) => {
    if (!fieldName) return;

    const currentValue = state?.[fieldName];

    if (Array.isArray(currentValue)) {
      const entryIndex = currentValue.findIndex(value => value === entryValue);
      if (entryIndex !== -1) {
        handleClear(fieldName, entryIndex);
      }
      return;
    }

    if (currentValue === entryValue || (typeof currentValue === 'string' && String(currentValue).trim() === String(entryValue).trim())) {
      handleDelKeyValue(fieldName);
    }
  }, [handleClear, handleDelKeyValue, state]);

  const handleOverlayDismiss = async (fieldName, entry) => {
    removeOverlayValueFromState(fieldName, entry?.value);
    dismissOverlayEntry(fieldName, entry);
    await removeOverlayEntryFromBackend(fieldName, entry);
  };

  const handleOverlayApply = async (fieldName, entry) => {
    adoptOverlayValue(fieldName, entry?.value);
    dismissOverlayEntry(fieldName, entry);
    await removeOverlayEntryFromBackend(fieldName, entry);
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

  const adoptOverlayValue = (fieldName, value) => {
    if (!fieldName) return;

    setState(prevState => {
      const mergedState = mergeOverlayValueIntoState(prevState, fieldName, value);
      if (mergedState === prevState) return prevState;

      submitWithNormalization(mergedState, 'overwrite');
      return mergedState;
    });
  };

  const buildOverlayPaths = cardUserId => {
    const normalizedCardId = String(cardUserId || '').trim();
    if (!normalizedCardId) return [];

    return [`multiData/edits/${normalizedCardId}`];
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

  const readOverlayFieldAdditions = useCallback(async cardUserId => {
    const paths = buildOverlayPaths(cardUserId);
    if (!paths.length) return { paths: [], result: {} };

    const debugResults = await Promise.all(
      paths.map(async path => {
        const snapshot = await get(refDb(database, path));
        const rawValue = snapshot.exists() ? snapshot.val() : null;
        const fieldMap = {};

        Object.entries(rawValue || {}).forEach(([editorUserId, overlay]) => {
          const allFields = overlay?.fields || {};

          Object.entries(allFields).forEach(([fieldName, change]) => {
            if (technicalOverlayFields.has(fieldName)) return;
            if (!change || typeof change !== 'object') return;

            const hasTo = Object.prototype.hasOwnProperty.call(change, 'to');
            const hasAdd = Object.prototype.hasOwnProperty.call(change, 'add');
            const hasAdded = Object.prototype.hasOwnProperty.call(change, 'added');
            const hasFrom = Object.prototype.hasOwnProperty.call(change, 'from');
            const incomingValue = resolveOverlayIncomingValue(change);
            const normalizedTo = sanitizeOverlayValue(incomingValue);
            const normalizedFrom = sanitizeOverlayValue(change?.from);
            const fieldEntries = fieldMap[fieldName] || [];
            const hasIncomingValue = hasTo || hasAdded || hasAdd;

            if (hasIncomingValue && !isEmptyOverlayValue(incomingValue)) {
              if (!fieldEntries.some(entry => entry.value === normalizedTo && entry.editorUserId === editorUserId)) {
                fieldMap[fieldName] = [...fieldEntries, { value: normalizedTo, editorUserId, isDeleted: false }];
              }
              return;
            }

            if (hasIncomingValue && hasFrom && !isEmptyOverlayValue(change?.from)) {
              if (!fieldEntries.some(entry => entry.value === normalizedFrom && entry.editorUserId === editorUserId)) {
                fieldMap[fieldName] = [...fieldEntries, { value: normalizedFrom, editorUserId, isDeleted: true }];
              }
            }
          });
        });

        return {
          path,
          exists: snapshot.exists(),
          fieldMap,
        };
      })
    );

    const result = {};
    debugResults.forEach(item => {
      Object.entries(item.fieldMap || {}).forEach(([fieldName, entries]) => {
        result[fieldName] = [...(result[fieldName] || []), ...(entries || [])];
      });
    });

    return { paths, result };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadOverlayFieldAdditions = async () => {
      if (!isAdmin) {
        if (isMounted) setAutoOverlayFieldAdditions({});
        return;
      }

      if (!state?.userId) {
        if (isMounted) setAutoOverlayFieldAdditions({});
        return;
      }

      try {
        const { result } = await readOverlayFieldAdditions(state.userId);
        if (!isMounted) return;

        setAutoOverlayFieldAdditions(result);
      } catch {
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
    if (isAdmin) return;
    if (!state?.userId) return;
    if (autoAppliedOverlayForUserRef.current === state.userId) return;

    let cancelled = false;

    const applyOverlayOnMount = async () => {
      try {
        const replacements = await collectEditorOverlayReplacements();
        if (cancelled) return;

        applyEditorOverlayReplacements(replacements);
        autoAppliedOverlayForUserRef.current = state.userId;
      } catch {
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

  const sortedFieldsToRender = [
    ...priorityOrder
      .map(key => normalizedFieldsToRender.find(field => field.name === key))
      .filter(Boolean),
    ...normalizedFieldsToRender.filter(field => !priorityOrder.includes(field.name)),
  ];

  const roleTokens = Array.isArray(state?.role || state?.userRole)
    ? (state?.role || state?.userRole)
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    : String(state?.role || state?.userRole || '')
        .split(/[,\s/|]+/)
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
  const shouldHideFieldsForClPp = roleTokens.some(role => ['pp', 'cl'].includes(role));

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

    const newValue = option.placeholder === 'Clear' ? '' : option.placeholder;
    setState(prevState => {
      const newState = { ...prevState, [selectedField]: newValue };
      submitWithNormalization(newState, 'overwrite');
      return newState;
    });

    handleCloseModal();
  };

  const handleProfileViewRemove = keyPath => {
    const normalizedPath = String(keyPath || '').trim();
    if (!normalizedPath) return false;

    if (!normalizedPath.includes('.')) {
      if (normalizedPath === ADDITIONAL_ACCESS_FIELD) {
        handleRemoveAdditionalAccessRuleInput(null, 'del');
        return true;
      }
      handleDelKeyValue(normalizedPath);
      return true;
    }

    const [fieldName, nestedIndex] = normalizedPath.split('.');
    if (/^\d+$/.test(nestedIndex)) {
      if (fieldName === ADDITIONAL_ACCESS_FIELD) {
        handleRemoveAdditionalAccessRuleInput(Number(nestedIndex), 'clear');
        return true;
      }
      handleClear(fieldName, Number(nestedIndex));
      return true;
    }

    return false;
  };

  return (
    <>
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
        </div>
      )}
      {sortedFieldsToRender
        .filter(field => !['myComment', 'writer'].includes(field.name))
        .filter(field => (isAdmin ? true : field.name !== ADDITIONAL_ACCESS_FIELD))
        .filter(field => {
          if (!shouldHideFieldsForClPp) return true;
          return !HIDDEN_FOR_CL_PP_FIELDS.has(field.name);
        })
        .map((field, index) => {
          const overlayEntries = getOverlayEntriesForField(field.name);
          const hasOverlaySuggestions = overlayEntries.length > 0;
          const displayValue =
            field.name === 'lastAction'
              ? formatDateToDisplay(normalizeLastAction(state.lastAction))
              : field.name === 'lastDelivery'
              ? formatDateToDisplay(state.lastDelivery)
              : field.name === 'getInTouch'
              ? formatDateToDisplay(state.getInTouch)
              : state[field.name] || '';
          return (
            <PickerContainer
              key={index}
              style={hasOverlaySuggestions ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
            >
              <FieldMainRow>
              {Array.isArray(state[field.name]) ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                {state[field.name].map((value, idx) => (
                  <InputDiv key={`${field.name}-${idx}`} $isHighlighted={highlightedFields.includes(field.name)} $isDeletedOverlay={deletedOverlayFields.includes(field.name)}>
                    <InputFieldContainer fieldName={`${field.name}-${idx}`} value={value}>
                      <InputField
                        fieldName={`${field.name}-${idx}`}
                        as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                        ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                        inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                        name={`${field.name}-${idx}`}
                        value={value || ''}
                        $isDeletedOverlay={deletedOverlayFields.includes(field.name)}
                        onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                        readOnly={field.name === ADDITIONAL_ACCESS_FIELD}
                        onClick={() => {
                          if (field.name !== ADDITIONAL_ACCESS_FIELD) return;
                          setActiveAdditionalRuleInputIndex(idx);
                          setShowAdditionalRulesModal(true);
                        }}
                        onChange={e => {
                          if (field.name === ADDITIONAL_ACCESS_FIELD) return;
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
                        onBlur={() => handleBlur(`${field.name}-${idx}`)}
                      />
                      {(value || value === '') && (
                          <ClearButton
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            if (field.name === ADDITIONAL_ACCESS_FIELD) {
                              handleRemoveAdditionalAccessRuleInput(idx, 'clear');
                              return;
                            }
                            handleClear(field.name, idx);
                          }}
                        >
                          &times;
                        </ClearButton>
                      )}
                    </InputFieldContainer>

                    {field.name !== 'accessLevel' && (
                      <>
                        <Hint fieldName={field.name} isActive={value}>
                          {field.ukrainian || field.placeholder}
                        </Hint>
                        <Placeholder isActive={value}>{field.ukrainianHint}</Placeholder>
                      </>
                    )}
                  </InputDiv>
                ))}
              </div>
            ) : (
              <InputDiv $isHighlighted={highlightedFields.includes(field.name)} $isDeletedOverlay={deletedOverlayFields.includes(field.name)}>
                <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                  {field.name === 'accessLevel' ? (
                    <AccessLevelSelect
                      name={field.name}
                      value={state[field.name] || ''}
                      onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                      onChange={e => {
                        const value = e.target.value;
                        setState(prevState => ({ ...prevState, [field.name]: value }));
                      }}
                      onBlur={() => handleBlur(field.name)}
                    >
                      {accessLevelOptions.map(option => (
                        <option key={option.value || 'placeholder'} value={option.value} disabled={option.value === ''}>
                          {option.label}
                        </option>
                      ))}
                    </AccessLevelSelect>
                  ) : field.name === ADDITIONAL_ACCESS_FIELD ? (
                    <>
                      <InputField
                        fieldName={field.name}
                        name={field.name}
                        value={displayValue}
                        placeholder={ADDITIONAL_ACCESS_TEMPLATE}
                        readOnly
                        onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                        onClick={() => {
                          setActiveAdditionalRuleInputIndex(0);
                          setShowAdditionalRulesModal(true);
                        }}
                      />
                    </>
                  ) : (
                  <InputField
                    fieldName={field.name}
                    as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                    ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                    inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                    name={field.name}
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
                    {...(field.name === 'lastAction'
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
                            } else if (field.name === 'telgram') {
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
                            if (field.name === 'myComment' && !state.myComment?.trim()) {
                              handleDelKeyValue('myComment');
                              return;
                            }

                            if (field.name === 'getInTouch') {
                              const raw = state.getInTouch;
                              const trimmed = typeof raw === 'string' ? raw.trim() : raw;

                              if (!trimmed) {
                                handleDelKeyValue('getInTouch');
                                return;
                              }
                            }

                            submitWithNormalization(state, 'overwrite');
                          },
                        })}
                  />
                  )}
                  {field.name !== 'lastAction' && state[field.name] && (
                    <ClearButton
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (field.name === ADDITIONAL_ACCESS_FIELD) {
                          handleRemoveAdditionalAccessRuleInput(null, 'clear');
                          return;
                        }
                        handleClear(field.name);
                      }}
                    >
                      &times;
                    </ClearButton>
                  )}
                  {field.name !== 'lastAction' && state[field.name] && (
                    <DelKeyValueBTN
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        if (field.name === ADDITIONAL_ACCESS_FIELD) {
                          handleRemoveAdditionalAccessRuleInput(null, 'del');
                          return;
                        }
                        handleDelKeyValue(field.name);
                      }}
                    >
                      del
                    </DelKeyValueBTN>
                  )}
                </InputFieldContainer>

                {field.name !== 'accessLevel' && (
                  <>
                    <Hint fieldName={field.name} isActive={state[field.name]}>
                      {field.ukrainian || field.placeholder}
                    </Hint>
                    <Placeholder isActive={state[field.name]}>{field.ukrainianHint}</Placeholder>
                  </>
                )}
              </InputDiv>
            )}

            {field.name !== 'lastAction' &&
              state[field.name] &&
              (Array.isArray(state[field.name])
                ? state[field.name].length === 0 || state[field.name][state[field.name].length - 1] !== ''
                : true) &&
              ((Array.isArray(field.options) && field.options.length !== 2 && field.options.length !== 3) ||
                !Array.isArray(field.options)) && (
                <Button
                  style={{
                    display: Array.isArray(state[field.name]) ? 'block' : 'inline-block',
                    alignSelf: Array.isArray(state[field.name]) ? 'flex-end' : 'auto',
                    marginBottom: Array.isArray(state[field.name]) ? '14px' : '0',
                    marginLeft: 0,
                  }}
                  onClick={() => {
                    if (!state.myComment?.trim()) {
                      handleDelKeyValue('myComment');
                    }
                    setState(prevState => {
                      const updatedField =
                        Array.isArray(prevState[field.name]) && prevState[field.name].length > 0
                          ? [...prevState[field.name], '']
                          : [prevState[field.name], ''];
                      const newState = { ...prevState, [field.name]: updatedField };
                      submitWithNormalization(newState, 'overwrite');
                      return newState;
                    });
                  }}
                >
                  +
                </Button>
              )}

            {field.name !== ADDITIONAL_ACCESS_FIELD && Array.isArray(field.options) && field.name !== 'education' ? (
              field.options.length === 2 ? (
                <ButtonGroup>
                  <Button
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
                      key={`${field.name}-${option.placeholder}`}
                      type="button"
                      onClick={() => {
                        if (!state.myComment?.trim()) {
                          handleDelKeyValue('myComment');
                        }
                        setState(prevState => {
                          const newState = {
                            ...prevState,
                            [field.name]: option.placeholder,
                          };
                          submitWithNormalization(newState, 'overwrite');
                          if (option.placeholder === 'Other') {
                            handleBlur(field.name);
                          }
                          return newState;
                        });
                      }}
                    >
                      {option.ukrainian || option.placeholder}
                    </Button>
                  ))}
                </ButtonGroup>
              ) : null
            ) : null}
              </FieldMainRow>

            {overlayEntries.map((entry, idx) => (
              <OverlayEntryRow key={`overlay-${field.name}-${idx}`}>
                <InputDiv $isOverlaySuggestion $isDeletedOverlay={entry.isDeleted}>
                  <InputFieldContainer fieldName={field.name} value={entry.value}>
                    <InputField
                      fieldName={field.name}
                      name={`overlay-${field.name}-${idx}`}
                      value={entry.value}
                      readOnly
                      $isOverlaySuggestion
                      $isDeletedOverlay={entry.isDeleted}
                      onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                    />
                    <ClearButton
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleOverlayDismiss(field.name, entry)}
                    >
                      &times;
                    </ClearButton>
                  </InputFieldContainer>
                  <Hint fieldName={field.name} isActive={entry.value}>
                    {field.ukrainian || field.placeholder}
                  </Hint>
                  <Placeholder isActive={entry.value}>{field.ukrainianHint}</Placeholder>
                </InputDiv>
                <Button type="button" onClick={() => handleOverlayApply(field.name, entry)}>
                  ОК
                </Button>
              </OverlayEntryRow>
            ))}
          </PickerContainer>
        );
        })}
      <KeyValueRow>
        <CustomInput
          placeholder="ключ"
          value={customField.key}
          onChange={e => setCustomField(prev => ({ ...prev, key: e.target.value }))}
          onBlur={() => {
            if (customField.key && customField.value) {
              handleAddCustomField();
            }
          }}
        />
        <Colon>:</Colon>
        <CustomInput
          placeholder="значення"
          value={customField.value}
          onChange={e => setCustomField(prev => ({ ...prev, value: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleAddCustomField();
            }
          }}
          onBlur={() => {
            if (customField.key && customField.value) {
              handleAddCustomField();
            }
          }}
        />
        <Button onClick={handleAddCustomField}>+</Button>
      </KeyValueRow>
      <PhotosBlock>
        <CollectionToggle
          value={collection}
          onChange={e => setCollection(e.target.value)}
        >
          <option value="users">users</option>
          <option value="newUsers">newUsers</option>
        </CollectionToggle>
        <Photos state={state} setState={setState} collection={collection} />
      </PhotosBlock>
      {(canManageAccessLevel || !isAdmin) && (
        <OverlayDebugButton type="button" onClick={handleOverlayDebugAlert}>
          Оверлей
        </OverlayDebugButton>
      )}

      {showAdditionalRulesModal && (
        <AdditionalRulesOverlay>
          <AdditionalRulesModal onClick={e => e.stopPropagation()}>
            <AdditionalRulesClose type="button" onClick={() => setShowAdditionalRulesModal(false)}>
              <FaTimes />
            </AdditionalRulesClose>
            <h3>Додаткові правила доступу</h3>
            <small>Оберіть фільтри по групах. Порожня група не застосовується.</small>

            {additionalRuleBuilder.map((rule, index) => {
              const options = ADDITIONAL_ACCESS_FILTER_OPTIONS[rule.key] || [];
              return (
                <AdditionalRuleBlock key={`${rule.key}-${index}`}>
                  <AdditionalRuleHeader>
                    <select
                      value={rule.key}
                      onChange={event => handleAdditionalRuleKeyChange(index, event.target.value)}
                    >
                      {ADDITIONAL_RULE_ORDER.map(key => (
                        <option key={key} value={key}>
                          {ADDITIONAL_RULE_LABELS[key]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeAdditionalRule(index)}>
                      <FaTimes />
                    </button>
                  </AdditionalRuleHeader>
                  <AdditionalRuleOptions>
                    {options.map(option => (
                      <label key={`${rule.key}-${option}`}>
                        <input
                          type="checkbox"
                          checked={rule.allowedValues.has(option)}
                          onChange={() => toggleAdditionalRuleValue(index, option)}
                        />
                        <AdditionalRuleOptionText>
                          <span>{ADDITIONAL_RULE_OPTION_LABELS[option] || option}</span>
                          <small>
                            {ADDITIONAL_RULE_OPTION_DESCRIPTIONS[rule.key]?.[option] ||
                              `Токен: ${option}`}
                          </small>
                        </AdditionalRuleOptionText>
                      </label>
                    ))}
                  </AdditionalRuleOptions>
                </AdditionalRuleBlock>
              );
            })}

            <AdditionalRuleActions>
              <button type="button" onClick={addEmptyAdditionalFilter}>+ Фільтр</button>
              <button type="button" onClick={applyAdditionalRulesFromBuilder}>Застосувати</button>
              <button
                type="button"
                onClick={indexAdditionalRulesFromBuilder}
                disabled={isIndexingAdditionalRules}
              >
                {isIndexingAdditionalRules ? 'Індексація...' : 'Індексувати'}
              </button>
            </AdditionalRuleActions>

            <AdditionalRulePreview
              value={activeAdditionalRulesDraftText || ADDITIONAL_ACCESS_TEMPLATE}
              onChange={handleCombinedAdditionalRulesChange}
            />
            <AdditionalCardsTitle>
              Доступні карточки для активного набору ({availableCardsCount}) {isLoadingAvailableCards ? '...завантаження' : ''}
            </AdditionalCardsTitle>
          </AdditionalRulesModal>
        </AdditionalRulesOverlay>
      )}

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
    </>
  );
};

const PhotosBlock = styled.div`
  position: relative;
  max-width: 400px;
  margin: 0 auto;
`;

const CollectionToggle = styled.select`
  position: absolute;
  top: 0;
  right: 0;
`;

const PickerContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  box-sizing: border-box;
  width: 100%;
  @media (max-width: 768px) {
    background-color: #f5f5f5;
  }
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin: 10px 0;
  padding: 10px;
  background-color: ${({ $isDeletedOverlay, $isOverlaySuggestion }) => {
    if ($isOverlaySuggestion) return '#fff';
    if ($isDeletedOverlay) return '#f7f7f7';
    return '#fff';
  }};
  border: ${({ $isHighlighted, $isDeletedOverlay, $isOverlaySuggestion }) => {
    if ($isDeletedOverlay) return '2px solid #e53935';
    if ($isOverlaySuggestion) return '1px solid #2f6df6';
    if ($isHighlighted) return '2px solid #2f6df6';
    return '1px solid #ccc';
  }};
  border-radius: 5px;
  box-sizing: border-box;
  flex: ${({ $isOverlaySuggestion }) => ($isOverlaySuggestion ? '1 1 0' : '1 1 auto')};
  width: ${({ $isOverlaySuggestion }) => ($isOverlaySuggestion ? 'auto' : '100%')};
  min-width: 0;
  height: auto;
`;

const FieldMainRow = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  flex-wrap: nowrap;
`;

const OverlayEntryRow = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
`;

const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  align-items: center;
  border-radius: 0;
  padding-left: ${({ fieldName, value }) => {
    if (fieldName === 'phone') return '20px';
    if (fieldName === 'telegram' || fieldName === 'instagram' || fieldName === 'tiktok') return '25px';
    if (fieldName === 'facebook') return /^\d+$/.test(value) ? '20px' : '25px';
    if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' ? '23px' : '10px';
    return '10px';
  }};
  max-width: 100%;
  min-width: 0;
  pointer-events: auto;
  color: ${({ $isDeletedOverlay }) => ($isDeletedOverlay ? '#8f8f8f' : '#000')};
  height: 100%;
  resize: vertical;
  &::placeholder {
    color: transparent;
  }
`;

const AccessLevelSelect = styled.select`
  border: none;
  outline: none;
  flex: 1;
  align-items: center;
  border-radius: 0;
  max-width: 100%;
  min-width: 0;
  width: 100%;
  padding-left: 10px;
  padding-right: 24px;
  background: transparent;
  min-height: 100%;
  height: 100%;
  color: ${({ value }) => (value ? '#000' : 'gray')};
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23666' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px 6px;

  option[value=''] {
    color: gray;
  }
`;

const Hint = styled.label`
  position: absolute;
  padding-left: ${({ fieldName }) => {
    if (fieldName === 'phone') return '20px';
    if (fieldName === 'telegram' || fieldName === 'facebook' || fieldName === 'instagram' || fieldName === 'tiktok') return '25px';
    if (fieldName === 'vk') return '23px';
    return '10px';
  }};
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
  ${({ isActive }) =>
    isActive &&
    css`
      display: none;
    `}
`;

const Placeholder = styled.label`
  position: absolute;
  padding-left: 10px;
  top: 0;
  transform: translateY(-100%);
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  ${({ isActive }) =>
    isActive &&
    css`
      left: 10px;
      top: 0;
      transform: translateY(-100%);
      font-size: 12px;
      color: orange;
    `}
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
  &::before {
    content: ${({ fieldName, value }) => {
      if (fieldName === 'phone') return "'+'";
      if (fieldName === 'telegram' || fieldName === 'instagram' || fieldName === 'tiktok') return "'@'";
      if (fieldName === 'facebook') return /^\d+$/.test(value) ? "'='" : "'@'";
      if (fieldName === 'vk') return /^\d+$/.test(value) || value === '' || value === undefined ? "'id'" : "''";
      return "''";
    }};
    position: absolute;
    left: 10px;
    display: flex;
    align-items: center;
    color: ${({ value }) => (value ? '#000' : 'gray')};
    font-size: 16px;
    text-align: center;
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 18px;
  width: 35px;
  height: 35px;
  &:hover {
    color: black;
  }
`;

const AdditionalRulesOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1200;
  display: flex;
  align-items: stretch;
  justify-content: center;
`;

const AdditionalRulesModal = styled.div`
  background: #fff;
  color: #1f1f1f;
  width: min(760px, 100vw);
  height: 100vh;
  padding: 16px 14px;
  overflow: auto;
  position: relative;
  line-height: 1.35;
`;

const AdditionalRulesClose = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
`;

const AdditionalRuleBlock = styled.div`
  padding: 8px 0;
  margin-top: 8px;
`;

const AdditionalRuleHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  select,
  button {
    padding: 6px 10px;
  }
`;

const AdditionalRuleOptions = styled.div`
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px 10px;

  label {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  input {
    margin-top: 2px;
  }
`;

const AdditionalRuleOptionText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;

  small {
    color: #666;
    font-size: 11px;
    line-height: 1.25;
  }
`;

const AdditionalRuleActions = styled.div`
  margin-top: 14px;
  display: flex;
  gap: 8px;
`;

const AdditionalRulePreview = styled.textarea`
  margin-top: 14px;
  background: #fafafa;
  color: #1f1f1f;
  border: 1px solid #ddd;
  padding: 10px;
  white-space: pre-wrap;
  width: 100%;
  min-height: 140px;
  resize: vertical;
  font-family: inherit;
`;

const AdditionalCardsTitle = styled.h4`
  margin-top: 14px;
  margin-bottom: 8px;
`;

const DelKeyValueBTN = styled.button`
  position: absolute;
  right: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: red;
  font-size: 18px;
  width: 35px;
  height: 35px;
  &:hover {
    color: black;
  }
`;

const KeyValueRow = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin: 10px 0;
  padding: 10px;
  background-color: ${({ $isDeletedOverlay }) => ($isDeletedOverlay ? '#f7f7f7' : '#fff')};
  border: ${({ $isHighlighted, $isDeletedOverlay }) => {
    if ($isDeletedOverlay) return '2px solid #e53935';
    if ($isHighlighted) return '2px solid #2f6df6';
    return '1px solid #ccc';
  }};
  border-radius: 5px;
  box-sizing: border-box;
  width: 100%;
`;

const CustomInput = styled.input`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  max-width: 100%;
  min-width: 0;
  height: 100%;
`;

const Colon = styled.span`
  margin: 0 10px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-left: 0;
  box-sizing: border-box;
`;

const Button = styled.button`
  width: 35px;
  min-width: 35px;
  height: 35px;
  min-height: 35px;
  padding: 3px;
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 12px;
  flex: 0 0 35px;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
  margin-right: 10px;
  &:hover {
    background-color: ${color.accent};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  &:active {
    transform: scale(0.98);
  }
`;

const OverlayDebugButton = styled(Button)`
  margin-top: 12px;
`;
