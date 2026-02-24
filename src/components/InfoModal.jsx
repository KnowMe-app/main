import React, { useState } from 'react';
import styled from 'styled-components';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const OptionsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left; 
`;

const OptionItem = styled.li`
  cursor: pointer;
  padding: 10px;
  color: black;
  font-size: 16px;
  line-height: 1.5;
  transition: background-color 0.3s ease;
  border-bottom: 1px solid #ddd; /* Лінія між елементами */

  &:last-child {
    /* border-bottom: none; Прибирає лінію у останнього елемента */
  }

  &:hover {
    background-color: #f5f5f5; /* Легкий фон при наведенні */
  }
`;

const CustomInput = styled.input`
  padding: 10px;
  padding-right: 40px;
  /* padding-bottom: 0; */
  /* margin-top: 10px; */
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  font-size: 16px;
  color: black; /* Темно оранжевий колір */
  line-height: 1.5;

  &::placeholder {
    color: darkorange; /* Темно оранжевий колір плейсхолдера */
    font-size: 16px;
    font-style: italic; /* Курсив для плейсхолдера */
    font-weight: bold; /* Жирний текст для плейсхолдера */
  }
  &:hover {
    background-color: #f5f5f5; /* Легкий фон при наведенні */
  }
`;

const CustomInputWrapper = styled.div`
  position: relative;
`;

const InlineDeleteButton = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 18px;

  &:hover {
    color: black;
  }
`;

const ActionRow = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
`;

const OkButton = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background-color: #ff7043;
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    background-color: #ff5722;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

const ModalContent = styled.div`
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  width: 300px;
  text-align: center;
  color: black;
  position: relative;
`;

const LargeModalContent = styled(ModalContent)`
  width: min(90vw, 720px);
  max-height: 90vh;
  overflow: auto;
`;

const OrangeStrong = styled.strong`
  color: orange;
`;

export const InfoModal = ({ onClose, onSelect, options, text, Context, DelConfirm, CompareCards, UtilityComposer }) => {

  const delProfile = (
    <>
      <p>Щоб видалити анкету, відправте запит на пошту</p>
      <a href="mailto:KnowMeEggDonor@gmail.com?subject=Видаліть мою анкету" style={{ color: 'black', textDecoration: 'none' }}>
        <strong>KnowMeEggDonor@gmail.com</strong>
      </a>
      <p>з темою листа "Видаліть мою анкету".</p>
    </>
  );

  const viewProfile = (
    <>
      <p>Щоб переглянути анкету, встановіть застосунок</p>
      <a href="https://play.google.com/store/apps/details?id=com.xanderkiev.MyApp" style={{ color: 'black', textDecoration: 'none' }}>
        <OrangeStrong>KnowMe: Egg donor</OrangeStrong>
      </a>
      <p>в Google Play</p>
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
  
  const dotsMenu = (
    <>{Context && <Context/>}
    </>
  );

  const utilityComposer = (
    <>{UtilityComposer && <UtilityComposer />}</>
  );

  //////////////////////////////
  const [customInput, setCustomInput] = useState(''); // Стан для власного вводу
  const [showCustomInput, setShowCustomInput] = useState(true); // Стан для показу власного вводу

  const handleSelect = option => {
    onSelect(option); // Вибрати звичайну опцію
  };

  const handleCustomInputChange = e => {
    setCustomInput(e.target.value); // Оновлення стану з власним ввідом
  };

  const handleConfirm = () => {
    if (!customInput.trim()) return;
    onSelect({ placeholder: customInput }); // Передати введене значення
    setCustomInput(''); // Очистити поле
    setShowCustomInput(false); // Сховати поле вводу
  };

  const handleCustomInputDelete = () => {
    setCustomInput('');
    setShowCustomInput(false);
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
      {showCustomInput && (
        <>
          <CustomInputWrapper>
            <CustomInput
              type="text"
              value={customInput}
              onChange={handleCustomInputChange}
              placeholder="Інший варіант"
              onKeyDown={handleKeyDown}
            />
            <InlineDeleteButton onClick={handleCustomInputDelete} aria-label="delete custom value">
              &times;
            </InlineDeleteButton>
          </CustomInputWrapper>
          <ActionRow>
            <OkButton onClick={handleConfirm} disabled={!customInput.trim()}>
              ОК
            </OkButton>
          </ActionRow>
        </>)} </>}
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
    case 'utilityComposer':
      body = utilityComposer;
      break;
    default:
      body = null;
  }

  if (text === 'utilityComposer') {
    ContentComponent = LargeModalContent;
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ContentComponent onClick={event => event.stopPropagation()}>{body}</ContentComponent>
    </ModalOverlay>
  );
};

export default InfoModal;
