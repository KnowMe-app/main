import React, { useState } from 'react';

// Модальне вікно
    export const Modal = ({ options, onClose, onSelect }) => {
        const [customInput, setCustomInput] = useState(''); // Стан для власного вводу
        const [showCustomInput, setShowCustomInput] = useState(true); // Стан для показу власного вводу
      
        const handleSelect = (option) => {
        //   if (option.placeholder === 'Other') {
            // setShowCustomInput(true); // Показати поле для вводу власного тексту
        //   } else {
            onSelect(option); // Вибрати звичайну опцію
        //   }
        };
      
        const handleCustomInputChange = (e) => {
          setCustomInput(e.target.value); // Оновлення стану з власним ввідом
        };
      
        const handleConfirm = () => {
          onSelect({ placeholder: customInput }); // Передати введене значення
          setCustomInput(''); // Очистити поле
          setShowCustomInput(false); // Сховати поле вводу
        };
      
        return (
          <div style={{ position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', backgroundColor: 'white', padding: '20px', borderRadius: '5px', width: '300px' }}>
              <button style={{ position: 'absolute', top: '10px', right: '10px' }} onClick={onClose}>Х</button>
              <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
                {options.map(option => (
                  <li key={option.placeholder} onClick={() => handleSelect(option)} style={{ cursor: 'pointer', padding: '10px', color: 'black', fontSize: '16px', // Розмір шрифта
                    lineHeight: '1.5', // Висота рядка для покращення читабельності
                 }}>
                    {option.placeholder} / {option.ukrainian}
                  </li>
                ))}
              </ul>
              {showCustomInput && (
                <div style={{ 
                    width: '100%', 
                    boxSizing: 'border-box', // Забезпечує, що padding враховується в ширині
                    padding: '0 10px', // Додає відступи, якщо потрібно
                    }}>
                   <input
      type="text"
      value={customInput}
      onChange={handleCustomInputChange}
      placeholder="Інший варіант"
      style={{ 
        // padding: '8px',
        marginTop: '10px',
        width: '100%', // Задає ширину інпуту на 100% ширини контейнера
        boxSizing: 'border-box', // Ураховує padding і border в ширині інпуту
        border: 'none', // Прибирає бордер інпуту
        outline: 'none', // Прибирає обведення при фокусуванні (якщо потрібно)
        fontSize: '16px', // Розмір шрифта для інпуту
        color: 'black', // Колір тексту в інпуті
         lineHeight: '1.5',
         backgroundColor: '#e0e0e0'
      }}
    />
                  <button onClick={handleConfirm} style={{ marginTop: '10px', padding: '8px', width: '100%' }}>Confirm</button>
                </div>
              )}
            </div>
          </div>
        );
      };

      <style jsx>{`
        input::placeholder {
          color: black; /* Колір плейсхолдера, що відповідає кольору тексту */
          font-size: 16px; /* Розмір шрифта плейсхолдера, що відповідає розміру тексту */
        }
      `}</style>