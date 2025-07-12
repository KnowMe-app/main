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

const ModalContent = styled.div`
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  width: 300px;
  text-align: center;
  color: black;
  position: relative;
`;

const OrangeStrong = styled.strong`
  color: orange;
`;

export const InfoModal = ({ onClose, onSelect, options, text, Context, DelConfirm, CompareCards }) => {

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
    onSelect({ placeholder: customInput }); // Передати введене значення
    setCustomInput(''); // Очистити поле
    setShowCustomInput(false); // Сховати поле вводу
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
        // <CustomInputContainer>
        <CustomInput
          type="text"
          value={customInput}
          onChange={handleCustomInputChange}
          placeholder="Інший варіант"
          onBlur={handleConfirm}
          onKeyDown={handleKeyDown}
        />)}</>}
    </>
  );

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent>
        {text === 'delProfile' && delProfile}
        {text === 'viewProfile' && viewProfile}
        {text === 'pickerOptions' && pickerOptions}
        {text === 'dotsMenu' && dotsMenu}
        {text === 'delConfirm' && delConfirm}
        {text === 'compareCards' && compareCards}
      </ModalContent>
    </ModalOverlay>
  );
};

export default InfoModal;
