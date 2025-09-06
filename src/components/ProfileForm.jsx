import React, { useRef, useState } from 'react';
import styled, { css } from 'styled-components';
import Photos from './Photos';
import { inputUpdateValue } from './inputUpdatedValue';
import { useAutoResize } from '../hooks/useAutoResize';
import { color } from './styles';
import { pickerFieldsExtended as pickerFields } from './formFields';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { parseDDMMYYYY } from '../utils/parseDDMMYYYY';

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

// Рекурсивне відображення всіх полів користувача, включно з вкладеними об'єктами та масивами
const renderAllFields = (data, parentKey = '') => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderAllFields:', data);
    return null;
  }

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
        <div key={nestedKey}>
          <strong>{key}:</strong>
          <div style={{ marginLeft: '20px' }}>
            {value.map((item, idx) =>
              typeof item === 'object' && item !== null ? (
                <div key={`${nestedKey}[${idx}]`}>
                  <strong>[{idx}]:</strong>
                  <div style={{ marginLeft: '20px' }}>{renderAllFields(item, `${nestedKey}[${idx}]`)}</div>
                </div>
              ) : (
                <div key={`${nestedKey}[${idx}]`}>
                  <strong>[{idx}]:</strong> {item != null ? item.toString() : '—'}
                </div>
              ),
            )}
          </div>
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey}>
          <strong>{key}:</strong>
          <div style={{ marginLeft: '20px' }}>{renderAllFields(value, nestedKey)}</div>
        </div>
      );
    }

    return (
      <div key={nestedKey}>
        <strong>{key}:</strong> {value != null ? value.toString() : '—'}
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
}) => {
  const textareaRef = useRef(null);
  const moreInfoRef = useRef(null);
  const [customField, setCustomField] = useState({ key: '', value: '' });

  const handleAddCustomField = () => {
    if (!customField.key) return;
    setState(prevState => {
      const newState = { ...prevState, [customField.key]: customField.value };
      handleSubmit(newState, 'overwrite');
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

  const fieldsToRender = getFieldsToRender(state);

  const sortedFieldsToRender = [
    ...priorityOrder
      .map(key => fieldsToRender.find(field => field.name === key))
      .filter(Boolean),
    ...fieldsToRender.filter(field => !priorityOrder.includes(field.name)),
  ];

  return (
    <>
      {state.userId && (
        <div
          id={state.userId}
          style={{ display: 'none', textAlign: 'left', marginBottom: '8px' }}
        >
          {renderAllFields(state)}
        </div>
      )}
      {sortedFieldsToRender
        .filter(field => !['myComment', 'getInTouch', 'writer', 'pregnancyWeek'].includes(field.name))
        .map((field, index) => {
          const displayValue =
            field.name === 'updatedAt'
              ? new Date(
                  state.updatedAt ?? parseDDMMYYYY(state.lastAction)
                ).toLocaleDateString('uk-UA')
              : state[field.name] || '';
          return (
            <PickerContainer key={index}>
              {Array.isArray(state[field.name]) ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexWrap: 'wrap' }}>
                {state[field.name].map((value, idx) => (
                  <InputDiv key={`${field.name}-${idx}`}>
                    <InputFieldContainer fieldName={`${field.name}-${idx}`} value={value}>
                      <InputField
                        fieldName={`${field.name}-${idx}`}
                        as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                        ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                        inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                        name={`${field.name}-${idx}`}
                        value={value || ''}
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
              <InputDiv>
                <InputFieldContainer fieldName={field.name} value={state[field.name]}>
                  <InputField
                    fieldName={field.name}
                    as={(field.name === 'moreInfo_main' || field.name === 'myComment') && 'textarea'}
                    ref={field.name === 'myComment' ? textareaRef : field.name === 'moreInfo_main' ? moreInfoRef : null}
                    inputMode={field.name === 'phone' ? 'numeric' : 'text'}
                    name={field.name}
                    value={displayValue}
                    {...(field.name === 'updatedAt'
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
                          onBlur: () => handleSubmit(state, 'overwrite'),
                        })}
                  />
                  {field.name !== 'updatedAt' && state[field.name] && (
                    <ClearButton
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleClear(field.name)}
                    >
                      &times;
                    </ClearButton>
                  )}
                  {field.name !== 'updatedAt' && state[field.name] && (
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

            {field.name !== 'updatedAt' &&
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
                    setState(prevState => {
                      const updatedField =
                        Array.isArray(prevState[field.name]) && prevState[field.name].length > 0
                          ? [...prevState[field.name], '']
                          : [prevState[field.name], ''];
                      const newState = { ...prevState, [field.name]: updatedField };
                      handleSubmit(newState, 'overwrite');
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
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'Yes',
                        };
                        handleSubmit(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Так
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'No',
                        };
                        handleSubmit(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Ні
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: 'Other',
                        };
                        handleSubmit(newState, 'overwrite');
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
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '-',
                        };
                        handleSubmit(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    Ні
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '1',
                        };
                        handleSubmit(newState, 'overwrite');
                        return newState;
                      });
                    }}
                  >
                    1
                  </Button>
                  <Button
                    onClick={() => {
                      setState(prevState => {
                        const newState = {
                          ...prevState,
                          [field.name]: '2',
                        };
                        handleSubmit(newState, 'overwrite');
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
      <InputDiv>
        <InputFieldContainer fieldName="pregnancyWeek" value={state.pregnancyWeek}>
          <InputField
            fieldName="pregnancyWeek"
            inputMode="numeric"
            name="pregnancyWeek"
            value={state.pregnancyWeek || ''}
            placeholder="25"
            onChange={e =>
              setState(prev => ({ ...prev, pregnancyWeek: e.target.value }))
            }
            onBlur={e => {
              const week = parseInt(e.target.value, 10);
              if (!isNaN(week)) {
                const today = new Date();
                const dueDate = new Date(today);
                dueDate.setDate(today.getDate() + (40 - week) * 7);
                const getInTouch = new Date(dueDate);
                getInTouch.setMonth(getInTouch.getMonth() + 9);
                const format = d =>
                  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
                const updatedState = {
                  ...state,
                  pregnancyWeek: e.target.value,
                  dueDate: format(dueDate),
                  getInTouch: format(getInTouch),
                };
                if (state.ownKids !== undefined && state.ownKids !== '') {
                  updatedState.ownKids = Number(state.ownKids) + 1;
                }
                setState(updatedState);
                handleSubmit(updatedState, 'overwrite');
              }
            }}
          />
          {state.pregnancyWeek && (
            <ClearButton
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() =>
                setState(prev => ({ ...prev, pregnancyWeek: '' }))
              }
            >
              &times;
            </ClearButton>
          )}
        </InputFieldContainer>
        <Hint fieldName="pregnancyWeek" isActive={state.pregnancyWeek}>25</Hint>
        <Placeholder isActive={state.pregnancyWeek}>Тиждень вагітності</Placeholder>
      </InputDiv>
      <Photos state={state} setState={setState} />
    </>
  );
};

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
  background-color: #fff;
  border: 1px solid #ccc;
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
  height: 100%;
  resize: vertical;
  &::placeholder {
    color: transparent;
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
  background-color: #fff;
  border: 1px solid #ccc;
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

