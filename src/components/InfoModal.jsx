import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(20, 16, 12, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 16px;
  box-sizing: border-box;
`;

const OptionsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
`;

const OptionItem = styled.li`
  cursor: pointer;
  padding: 12px 10px;
  color: var(--km-text);
  font-size: 15px;
  line-height: 1.5;
  border-radius: 10px;
  transition: background-color 0.18s ease, color 0.18s ease;

  & + & {
    border-top: 1px solid var(--km-border);
  }

  &:hover {
    background-color: var(--km-accent-light);
    color: var(--km-accent);
  }
`;

const CustomInput = styled.input`
  padding: 12px;
  padding-right: 40px;
  width: 100%;
  box-sizing: border-box;
  border: 1.5px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
  outline: none;
  font-family: var(--km-font);
  font-size: 15px;
  color: var(--km-text);
  line-height: 1.5;
  margin-top: 10px;

  &::placeholder {
    color: var(--km-muted);
    font-size: 14px;
  }

  &:focus {
    border-color: var(--km-accent);
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
`;

const CustomInputWrapper = styled.div`
  position: relative;
`;

const InlineDeleteButton = styled.button`
  position: absolute;
  right: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  top: calc(50% + 5px);
  transform: translateY(-50%);
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--km-muted);
  font-size: 18px;
  touch-action: manipulation;

  &:hover {
    color: var(--km-text);
    background-color: var(--km-accent-light);
  }

  &:focus-visible {
    outline: 2px solid var(--km-accent);
    outline-offset: 1px;
  }
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
`;

const OkButton = styled.button`
  min-height: 40px;
  padding: 8px 24px;
  border: none;
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  color: #fff;
  border-radius: 99px;
  cursor: pointer;
  font-family: var(--km-font);
  font-size: 14px;
  font-weight: 700;
  transition: box-shadow 0.18s ease, transform 0.18s ease, filter 0.18s ease;

  &:hover {
    filter: brightness(1.05);
    box-shadow: 0 8px 22px rgba(232, 121, 26, 0.28);
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

const ModalContent = styled.div`
  background-color: var(--km-card);
  color: var(--km-text);
  font-family: var(--km-font);
  padding: 20px;
  border-radius: var(--km-radius-lg);
  border: 1px solid var(--km-border);
  box-shadow: var(--km-shadow-pop);
  width: min(92vw, 320px);
  text-align: center;
  position: relative;
  box-sizing: border-box;
`;

const LargeModalContent = styled(ModalContent)`
  width: min(90vw, 720px);
  max-height: 90vh;
  overflow: auto;
`;

const MenuModalContent = styled(ModalContent)`
  width: min(92vw, 380px);
  padding: 14px;
  border-radius: 22px;
  max-height: 90vh;
  overflow: auto;
`;

const OrangeStrong = styled.strong`
  color: var(--km-accent);
`;

// Спільні елементи для модалок підтвердження (використовуються і в інших екранах).
export const ModalTitle = styled.h3`
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--km-text);
`;

export const ModalText = styled.p`
  margin: 0 0 4px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--km-muted);
`;

export const ModalActionRow = styled(ActionRow)``;

export const ModalPrimaryButton = styled(OkButton)``;

export const ModalDangerButton = styled(OkButton)`
  background: var(--km-danger);

  &:hover {
    box-shadow: 0 8px 22px rgba(180, 35, 24, 0.25);
  }
`;

export const ModalGhostButton = styled.button`
  min-height: 40px;
  padding: 8px 24px;
  border: 1.5px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 99px;
  cursor: pointer;
  font-family: var(--km-font);
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

  &:hover {
    background: var(--km-accent-light);
    border-color: var(--km-accent);
    color: var(--km-accent);
  }

  &:active {
    transform: scale(0.98);
  }
`;

export const InfoModal = ({
  onClose,
  onSelect,
  onCustomInputClear,
  options,
  text,
  Context,
  DelConfirm,
  CompareCards,
  MoreActions,
  FlowComposer,
  initialCustomInput = '',
}) => {
  const openedAtRef = useRef(Date.now());

  const delProfile = (
    <>
      <ModalTitle>Видалення анкети</ModalTitle>
      <ModalText>Щоб видалити анкету, відправте запит на пошту</ModalText>
      <a href="mailto:KnowMeEggDonor@gmail.com?subject=Видаліть мою анкету" style={{ color: 'inherit', textDecoration: 'none' }}>
        <OrangeStrong>KnowMeEggDonor@gmail.com</OrangeStrong>
      </a>
      <ModalText style={{ marginTop: 4 }}>з темою листа «Видаліть мою анкету».</ModalText>
    </>
  );

  const viewProfile = (
    <>
      <ModalTitle>Перегляд анкети</ModalTitle>
      <ModalText>Щоб переглянути анкету, встановіть застосунок</ModalText>
      <a href="https://play.google.com/store/apps/details?id=com.xanderkiev.MyApp" style={{ color: 'inherit', textDecoration: 'none' }}>
        <OrangeStrong>KnowMe: Egg donor</OrangeStrong>
      </a>
      <ModalText style={{ marginTop: 4 }}>в Google Play</ModalText>
    </>
  );

  const delConfirm = (
    <>{DelConfirm && <DelConfirm/>}
  </>
);

  const compareCards = (
    <>{CompareCards && <CompareCards/>}
  </>
);

  const moreActions = (
    <>{MoreActions && <MoreActions />}</>
  );
  
  const dotsMenu = (
    <>{Context && <Context/>}
    </>
  );

  const flowComposer = (
    <>{FlowComposer && <FlowComposer />}</>
  );

  //////////////////////////////
  const [customInput, setCustomInput] = useState(''); // Стан для власного вводу

  useEffect(() => {
    if (text !== 'pickerOptions') {
      return;
    }
    const preparedValue = typeof initialCustomInput === 'string' ? initialCustomInput.trim() : '';
    setCustomInput(preparedValue);
  }, [initialCustomInput, text]);

  const handleSelect = option => {
    onSelect(option); // Вибрати звичайну опцію
  };

  const handleCustomInputChange = e => {
    const nextValue = e.target.value;
    if (customInput.trim() && !nextValue.trim()) {
      onCustomInputClear?.();
    }
    setCustomInput(nextValue); // Оновлення стану з власним ввідом
  };

  const handleConfirm = () => {
    if (!customInput.trim()) return;
    onSelect({ placeholder: customInput }); // Передати введене значення
    setCustomInput(''); // Очистити поле
  };

  const handleCustomInputDelete = () => {
    setCustomInput('');
    onCustomInputClear?.();
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  const pickerOptions = (
    <>
    {options && <><OptionsList>
        {options.map(option => (
          <OptionItem key={option.placeholder} onClick={() => handleSelect(option)}>
            {option.placeholder} / {option.ukrainian}
          </OptionItem>
        ))}
      </OptionsList>
      <>
        <CustomInputWrapper>
          <CustomInput
            type="text"
            value={customInput}
            onChange={handleCustomInputChange}
            placeholder="Інший варіант"
            onKeyDown={handleKeyDown}
          />
          {!!customInput && (
            <InlineDeleteButton onClick={handleCustomInputDelete} aria-label="delete custom value">
              &times;
            </InlineDeleteButton>
          )}
        </CustomInputWrapper>
        <ActionRow>
          <OkButton onClick={handleConfirm} disabled={!customInput.trim()}>
            ОК
          </OkButton>
        </ActionRow>
      </> </>}
    </>
  );

  let ContentComponent = ModalContent;
  let body = null;

  switch (text) {
    case 'delProfile':
      body = delProfile;
      break;
    case 'viewProfile':
      body = viewProfile;
      break;
    case 'pickerOptions':
      body = pickerOptions;
      break;
    case 'dotsMenu':
      body = dotsMenu;
      break;
    case 'delConfirm':
      body = delConfirm;
      break;
    case 'compareCards':
      body = compareCards;
      break;
    case 'moreActions':
      body = moreActions;
      break;
    case 'flowComposer':
      body = flowComposer;
      break;
    default:
      body = null;
  }

  if (text === 'moreActions' || text === 'flowComposer') {
    ContentComponent = LargeModalContent;
  }

  if (text === 'dotsMenu') {
    ContentComponent = MenuModalContent;
  }

  const handleOverlayClick = event => {
    if (Date.now() - openedAtRef.current < 250) {
      return;
    }
    if (text === 'pickerOptions' && customInput.trim()) {
      onSelect({ placeholder: customInput.trim() });
      return;
    }
    onClose(event);
  };

  return (
    <ModalOverlay onClick={handleOverlayClick}>
      <ContentComponent onClick={event => event.stopPropagation()}>{body}</ContentComponent>
    </ModalOverlay>
  );
};

export default InfoModal;
