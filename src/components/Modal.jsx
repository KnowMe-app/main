// import React, { useState } from 'react';
// import styled, { css } from 'styled-components';

// // Styled Components
// // const ModalOverlay = styled.div`
// //   position: fixed;
// //   top: 0;
// //   left: 0;
// //   width: 100%;
// //   height: 100%;
// //   background-color: rgba(0, 0, 0, 0.5);
// //   display: flex;
// //   justify-content: center;
// //   align-items: center;
// // `;

// // const ModalContainer = styled.div`
// //   position: relative;
// //   background-color: white;
// //   padding: 10px;
// //   border-radius: 5px;
// //   width: 300px;
// // `;

// // const OptionsList = styled.ul`
// //   list-style: none;
// //   padding: 0;
// //   margin: 0;
// // `;

// // const OptionItem = styled.li`
// //   cursor: pointer;
// //   padding: 10px;
// //   color: black;
// //   font-size: 16px;
// //   line-height: 1.5;
// //   transition: background-color 0.3s ease;
// //   border-bottom: 1px solid #ddd; /* Лінія між елементами */
  
// //   &:last-child {
// //     /* border-bottom: none; Прибирає лінію у останнього елемента */
// //   }
  
// //   &:hover {
// //     background-color: #f5f5f5; /* Легкий фон при наведенні */
// //   }
// // `;

// const CustomInputContainer = styled.div`
//   /* width: 100%; */
//   /* box-sizing: border-box; */
 
//   /* &:hover {
//     background-color: #f5f5f5; /* Легкий фон при наведенні */

// `;

// // const CustomInput = styled.input`
// //  padding: 10px;
// //  /* padding-bottom: 0; */
// //   /* margin-top: 10px; */
// //   width: 100%;
// //   box-sizing: border-box;
// //   border: none;
// //   outline: none;
// //   font-size: 16px;
// //   color: black; /* Темно оранжевий колір */
// //   line-height: 1.5;

// //   &::placeholder {
// //     color: darkorange; /* Темно оранжевий колір плейсхолдера */
// //     font-size: 16px;
// //     font-style: italic; /* Курсив для плейсхолдера */
// //     font-weight: bold; /* Жирний текст для плейсхолдера */
// //   }
// //   &:hover {
// //     background-color: #f5f5f5; /* Легкий фон при наведенні */
// //   }
 
// // `;

// // const ConfirmButton = styled.button`
// //   margin-top: 10px;
// //   padding: 8px;
// //   width: 100%;
// // `;

// // Modal Component
// export const Modal = ({ options, onClose, onSelect }) => {
//   const [customInput, setCustomInput] = useState(''); // Стан для власного вводу
//   const [showCustomInput, setShowCustomInput] = useState(true); // Стан для показу власного вводу

//   const handleSelect = (option) => {
//     onSelect(option); // Вибрати звичайну опцію
//   };

//   const handleCustomInputChange = (e) => {
//     setCustomInput(e.target.value); // Оновлення стану з власним ввідом
//   };

//   const handleConfirm = () => {
//     onSelect({ placeholder: customInput }); // Передати введене значення
//     setCustomInput(''); // Очистити поле
//     setShowCustomInput(false); // Сховати поле вводу
//   };

//   const handleKeyDown = (e) => {
//     if (e.key === 'Enter') {
//       handleConfirm();
//     }
//   };

//   return (
//     <ModalOverlay onClick={onClose}>
//       {/* <ModalContainer onClick={(e) => e.stopPropagation()}> */}
//         {/* <CloseButton onClick={onClose}>Х</CloseButton> */}
//         <OptionsList>
//           {options.map(option => (
//             <OptionItem key={option.placeholder} onClick={() => handleSelect(option)}>
//               {option.placeholder} / {option.ukrainian}
//             </OptionItem>
//           ))}
//         </OptionsList>
//         {showCustomInput && (
//           // <CustomInputContainer>
//             <CustomInput
//               type="text"
//               value={customInput}
//               onChange={handleCustomInputChange}
//               placeholder="Інший варіант"
//               onBlur={handleConfirm}
//               onKeyDown={handleKeyDown} 
//             />
//           // </CustomInputContainer>
//         )}
//       </ModalContainer>
//     </ModalOverlay>
//   );
// };