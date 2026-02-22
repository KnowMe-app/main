import React, { useRef, useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
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
import { isAdminUid } from 'utils/accessLevel';
import toast from 'react-hot-toast';
import { removeField } from './smallCard/actions';
import { FaTimes } from 'react-icons/fa';
import { auth } from './config';

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
}) => {
  const canManageAccessLevel = isAdmin || isAdminUid(auth.currentUser?.uid);
  const textareaRef = useRef(null);
  const moreInfoRef = useRef(null);
  const [customField, setCustomField] = useState({ key: '', value: '' });
  const [collection, setCollection] = useState('newUsers');

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

  const submitWithNormalization = (nextState, overwrite, delCondition) => {
    const payload =
      nextState && typeof nextState === 'object'
        ? normalizeGetInTouchForSubmit(nextState)
        : nextState;
    handleSubmit(payload, overwrite, delCondition);
  };

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
          const displayValue =
            field.name === 'lastAction'
              ? formatDateToDisplay(normalizeLastAction(state.lastAction))
              : field.name === 'lastDelivery'
              ? formatDateToDisplay(state.lastDelivery)
              : field.name === 'getInTouch'
              ? formatDateToDisplay(state.getInTouch)
              : state[field.name] || '';
          return (
            <PickerContainer key={index}>
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
                    marginLeft: '10px',
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
  background-color: ${({ $isDeletedOverlay }) => ($isDeletedOverlay ? '#f7f7f7' : '#fff')};
  border: ${({ $isHighlighted, $isDeletedOverlay }) => {
    if ($isDeletedOverlay) return '1px dashed #b5b5b5';
    if ($isHighlighted) return '2px solid #2f6df6';
    return '1px solid #ccc';
  }};
  border-radius: 5px;
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: auto;
`;

const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  align-items: center;
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
    if ($isDeletedOverlay) return '1px dashed #b5b5b5';
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
  margin-left: 8px;
  box-sizing: border-box;
`;

const Button = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 12px;
  flex: 0 1 auto;
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
