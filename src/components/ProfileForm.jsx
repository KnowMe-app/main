import React, { useRef, useState, useEffect, useCallback } from 'react';
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
import { auth, database } from './config';

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

  const { userId, setUsers, stateUpdater } = options;
  const effectiveSetUsers = typeof setUsers === 'function' ? setUsers : stateUpdater;
  const canRemove = typeof effectiveSetUsers === 'function';

  const handleRemove = keyPath => {
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
  dataSource,
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
  const [autoOverlayFieldAdditions, setAutoOverlayFieldAdditions] = useState({});
  const [dismissedOverlayEntries, setDismissedOverlayEntries] = useState({});
  const autoAppliedOverlayForUserRef = useRef('');

  useEffect(() => {
    setDismissedOverlayEntries({});
  }, [state?.userId, overlayFieldAdditions]);

  useEffect(() => {
    if (!dataSource || dataSource === 'loading') return;

    toast.success(
      dataSource === 'backend'
        ? 'Data loaded from backend'
        : 'Data loaded from local storage'
    );
  }, [dataSource]);

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

  const submitWithNormalization = useCallback((nextState, overwrite, delCondition) => {
    const payload =
      nextState && typeof nextState === 'object'
        ? normalizeGetInTouchForSubmit(nextState)
        : nextState;
    handleSubmit(payload, overwrite, delCondition);
  }, [handleSubmit]);

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
  ];

  const accessLevelOptions = [
    { value: 'matching:view', label: 'matching view' },
    { value: 'matching:view&write', label: 'matching view and write' },
    { value: 'add:view', label: 'add view' },
    { value: 'add:view&write', label: 'add view and write' },
    { value: 'add+matching:view', label: 'add and matching view' },
    { value: 'add+matching:view&write', label: 'add and matching view and write' },
  ];

  const fieldsToRender = getFieldsToRender(state);

  const normalizedFieldsToRender = canManageAccessLevel && !fieldsToRender.some(field => field.name === 'accessLevel')
    ? [...fieldsToRender, { name: 'accessLevel', placeholder: 'access level', ukrainianHint: 'рівень доступу' }]
    : fieldsToRender;


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

  const handleOverlayDismiss = async (fieldName, entry) => {
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

  return (
    <>
      {state.userId && (
        <div
          id={state.userId}
          style={{ display: 'none', textAlign: 'left', marginBottom: '8px' }}
        >
          {renderAllFields(state, '', { userId: state?.userId, setUsers: setState })}
        </div>
      )}
      {sortedFieldsToRender
        .filter(field => !['myComment', 'writer'].includes(field.name))
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
                        onBlur={() => handleBlur(`${field.name}-${idx}`)}
                      />
                      {(value || value === '') && (
                          <ClearButton
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleClear(field.name, idx)}
                        >
                          &times;
                        </ClearButton>
                      )}
                    </InputFieldContainer>

                    <Hint fieldName={field.name} isActive={value}>
                      {field.ukrainian || field.placeholder}
                    </Hint>
                    <Placeholder isActive={value}>{field.ukrainianHint}</Placeholder>
                  </InputDiv>
                ))}
              </div>
            ) : (
              <InputDiv $isHighlighted={highlightedFields.includes(field.name)} $isDeletedOverlay={deletedOverlayFields.includes(field.name)}>
                <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                  {field.name === 'accessLevel' ? (
                    <AccessLevelSelect
                      name={field.name}
                      value={state[field.name] || accessLevelOptions[0].value}
                      onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
                      onChange={e => {
                        const value = e.target.value;
                        setState(prevState => ({ ...prevState, [field.name]: value }));
                      }}
                      onBlur={() => handleBlur(field.name)}
                    >
                      {accessLevelOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </AccessLevelSelect>
                  ) : (
                  <InputField
                    fieldName={field.name}
                    as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                    ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                    inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                    name={field.name}
                    value={displayValue}
                    $isDeletedOverlay={deletedOverlayFields.includes(field.name)}
                    onFocus={() => handleFieldFocus && handleFieldFocus(field.name)}
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
                      onClick={() => handleClear(field.name)}
                    >
                      &times;
                    </ClearButton>
                  )}
                  {field.name !== 'lastAction' && state[field.name] && (
                    <DelKeyValueBTN
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleDelKeyValue(field.name)}
                    >
                      del
                    </DelKeyValueBTN>
                  )}
                </InputFieldContainer>

                <Hint fieldName={field.name} isActive={state[field.name]}>
                  {field.ukrainian || field.placeholder}
                </Hint>
                <Placeholder isActive={state[field.name]}>{field.ukrainianHint}</Placeholder>
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

            {Array.isArray(field.options) ? (
              field.options.length === 2 ? (
                <ButtonGroup>
                  <Button
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
                  <Button
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '-',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Ні
                  </Button>
                  <Button
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '1',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    1
                  </Button>
                  <Button
                    onClick={() => {
                      if (!state.myComment?.trim()) {
                        handleDelKeyValue('myComment');
                      }
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '2',
                        };
                        submitWithNormalization(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    2
                  </Button>
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
  width: 100%;
  padding-left: 10px;
  background: transparent;
  min-height: 30px;
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
