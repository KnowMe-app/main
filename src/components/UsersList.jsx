import React, { useEffect, useRef } from 'react';
import {
  fetchUserById,
  // fetchUserData,
  updateDataInNewUsersRTDB,
  // removeSearchId
} from './config';
import { formatDateAndFormula, formatDateToDisplay, formatDateToServer } from './inputValidations';
import { makeUploadedInfo } from './makeUploadedInfo';
import { AttentionDiv, coloredCard, OrangeBtn } from './styles';
import { saveToContact } from './ExportContact';

const handleChange = (setUsers, setState, userId, key, value, click) => {
  const newValue = key === 'getInTouch' || key === 'lastCycle' ? formatDateAndFormula(value) : value;

  if (setState) {
    setUsers(prevState => {
      const newState = { ...prevState, [key]: newValue };
      click && handleSubmit(newState);
      return newState;
    });
  } else {
    setUsers(prevState => {
      const newState = {
        ...prevState,
        [userId]: {
          ...prevState[userId],
          [key]: newValue,
        },
      };
      click && handleSubmit(newState[userId], 'overwrite');
      return newState;
    });
  }
};

const handleSubmit = async userData => {
  const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = ['lastAction'];
  const dublicateFields = ['weight', 'height'];

  console.log('userData В handleSubmit', userData);
  //  const { existingData } = await fetchUserData(userData.userId);
  console.log('userData.userId :>> ', userData.userId);
  const { existingData } = await fetchUserById(userData.userId);
  console.log('1111 :>> ');
  const uploadedInfo = makeUploadedInfo(existingData, userData);

// Оновлюємо поле lastAction поточною датою у форматі рррр-мм-дд
const currentDate = new Date();
currentDate.setDate(currentDate.getDate());

// Форматуємо дату в локальному часі замість використання UTC
const year = currentDate.getFullYear();
const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
const day = String(currentDate.getDate()).padStart(2, '0');
const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD

uploadedInfo.lastAction = formattedDate;

  // Фільтруємо ключі, щоб видалити зайві поля
  const cleanedStateForNewUsers = Object.fromEntries(
    Object.entries(uploadedInfo).filter(([key]) => [...fieldsForNewUsersOnly, ...contacts, ...commonFields, ...dublicateFields].includes(key))
  );

  console.log('cleanedStateForNewUsers!!!!!!!!!!!!!!', cleanedStateForNewUsers);

  await updateDataInNewUsersRTDB(userData.userId, cleanedStateForNewUsers, 'update');
};

export const renderTopBlock = (userData, setUsers, setShowInfoModal, setState) => {
  // console.log('userData в renderTopBlock:', userData );
  if (!userData) return null;

  const renderExportButton = userData => (
    <button
      style={{
        ...styles.removeButton,
        backgroundColor: 'green',
        // top: '10px',
        // right: '60px',
        top: '10px',
        right: '10px',
      }}
      onClick={e => {
        e.stopPropagation(); // Запобігаємо активації кліку картки
        saveToContact(userData);
      }}
    >
      save
    </button>
  );

  const renderDeleteButton = userId => (
    <button
      style={{
        ...styles.removeButton,
        backgroundColor: 'red',
        top: '42px',
      }}
      onClick={e => {
        console.log('delConfirm :>> ');
        e.stopPropagation(); // Запобігаємо активації кліку картки
        setShowInfoModal('delConfirm'); // Trigger the modal opening

        // handleRemoveUser(userId);
      }}
    >
      del
    </button>
  );

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      {renderDeleteButton(userData.userId)}
      {renderExportButton(userData)}
      <div>
        {userData.isDuplicate&&'ПОВТОР!!!!!!!!! '}
        {userData.userId}
        {renderGetInTouchInput(userData, setUsers, setState)}
        {(userData.userRole !== 'ag' || userData.userRole !== 'ip' || userData.role !== 'ag') && renderLastCycleInput(userData, setUsers, setState)}
        { renderDeliveryInfo(setUsers, setState, userData)}
        {userData.birth && `${userData.birth} - `}
        {userData.birth && renderBirthInfo(userData.birth)}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
        <strong>
        {
            (() => {
              const nameParts = [];
              if (userData.surname) nameParts.push(userData.surname);
              if (userData.name) nameParts.push(userData.name);
              if (userData.fathersname) nameParts.push(userData.fathersname);
              return nameParts.length > 0 ? `${nameParts.join(' ')}` : '';
            })()
          }
        </strong>
        {/* {renderBirthInfo(userData.birth)} */}
       
        {/* {renderCsection(userData.csection)}  */}
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {
            (() => {
              const parts = [];
              if (userData.maritalStatus) parts.push(renderMaritalStatus(userData.maritalStatus));
              if (userData.blood) parts.push(renderBlood(userData.blood));
              if (userData.height) parts.push(userData.height);
              if (userData.height && userData.weight) parts.push('/');
              if (userData.weight) parts.push(`${userData.weight} - `);
              if (userData.weight && userData.height) parts.push(`${calculateIMT(userData.weight, userData.height)}`);
              // if (userData.birth) parts.push(`${userData.birth},`);
              // return parts.join(' ');
              return parts.map((part, index) => <React.Fragment key={index}>{part} </React.Fragment>);
            })()
          }
        </div>
        <div>
          {
            (() => {
              const locationParts = [];
              if (userData.region) locationParts.push(userData.region);
              if (userData.city) locationParts.push(userData.city);
              return locationParts.join(', ');
            })()
          }
        </div>
      </div>

     

      {renderContacts(userData)}
      {renderWriterInput(userData, setUsers, setState)}
      <RenderCommentInput userData={userData} setUsers={setUsers} setState={setState} />

      {/* <button
      // style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer', backgroundColor: 'purple', }}
              style={{...styles.removeButton, backgroundColor: 'purple', top: '10px', right: '60px'}}
              onClick={() => {
                const details = document.getElementById(userData.userId);
                if (details) {
                  details.style.display = details.style.display === 'none' ? 'block' : 'none';
                }
              }}
            >
              more
            </button> */}

      <div
        onClick={() => {
          const details = document.getElementById(userData.userId);
          if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
          }
        }}
        style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer', color: '#ebe0c2', fontSize: '18px' }}
      >
        ...
      </div>
    </div>
  );
};

const renderBirthInfo = birth => {
  const age = calculateAge(birth);

  return age !== null ? <span>{age}р</span> : null;
};

const renderBlood = (blood) => {
console.log('blood :>> ', blood);

  return (
      <AttentionDiv 
          style={{
              // padding: '1px 6px',
              
              // color: 'white',
              // border: 'none',
              // borderRadius: '5px',
              // display: 'inline-block',
              // fontSize: '14px',
              backgroundColor: 'orange',
          }}
      >
          РК {blood}
      </AttentionDiv >
  );
};

// const renderIMT = (weight, height,) => {
//   const imt = calculateIMT(weight, height);
//   if (weight || height) {
//     return (
//       <div>
//         {weight && height
//           ? `ІМТ ${imt}`
//           : weight
//           ? `${weight} кг`
//           : `${height} см`}
//       </div>
//     );
//   }
//   return null; // Нічого не відображати, якщо немає ваги і зросту
// };

const renderDeliveryInfo = (setUsers, setState, userData) => {
  const { ownKids, lastDelivery, csection } = userData;

  // Функція для парсингу дати з формату дд.мм.рррр
  const parseCsectionDate = dateString => {
    // Перевірка формату дд.мм.рррр
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;

    if (!dateRegex.test(dateString)) {
      return null; // Повертаємо null, якщо формат не відповідає
    }

    const [day, month, year] = dateString.split('.').map(Number);

    // Перевірка на коректність дати
    const isValidDate = (d, m, y) =>
      d > 0 &&
      d <= 31 &&
      m > 0 &&
      m <= 12 &&
      y > 0 &&
      !isNaN(new Date(y, m - 1, d).getTime());

    if (!isValidDate(day, month, year)) {
      return null; // Повертаємо null, якщо дата некоректна
    }

    return dateString;
  };

  // Використовуємо `csection` як дату останніх пологів, якщо `lastDelivery` не задано
  const effectiveLastDelivery = lastDelivery || (csection && parseCsectionDate(csection));

  // Додаємо перевірку перед викликом `split`
  let deliveryDate = null;
  if (effectiveLastDelivery && /^\d{2}\.\d{2}\.\d{4}$/.test(effectiveLastDelivery)) {
    const [day, month, year] = effectiveLastDelivery.split('.').map(Number);
    deliveryDate = new Date(year, month - 1, day); // JavaScript місяці починаються з 0
  }

  const monthsAgo = effectiveLastDelivery ? calculateMonthsAgo(effectiveLastDelivery) : null;

  const whenGetInTouch = deliveryDate
    ? new Date(deliveryDate.getFullYear(), deliveryDate.getMonth() + 18, deliveryDate.getDate())
    : null;

  // Форматування дати у формат "дд.мм.рррр"
  const formatDate = date =>
    date
      ? date
          .toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          .replace(/\//g, '.')
      : null;

  if (!ownKids && monthsAgo === null && !csection) return null;

  const parts = [];
  if (effectiveLastDelivery) parts.push(`${effectiveLastDelivery} пологи`);

  if (monthsAgo !== null) {
    if (monthsAgo > 24) {
      const years = Math.floor(monthsAgo / 12); // Округлення до меншого
      parts.push(`${years}рт, `);
    } else {
      parts.push(`${monthsAgo}м, `);
    }
  }

  if (ownKids) parts.push(`всього ${ownKids},`);

  // Повертаємо результат
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
      {parts.map((part, index) => (
        <span key={`part-${index}`} style={{ whiteSpace: 'nowrap' }}>
          {part}
        </span>
      ))}
      {csection && (
        <button
          key="csection"
          onClick={() => {
            // alert(`C-section: ${formatDate(whenGetInTouch)}`);
            handleChange(setUsers, setState, userData.userId, 'getInTouch', formatDate(whenGetInTouch), true);
          }}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#28A745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 10px',
          }}
        >
          кс {csection}
        </button>
      )}
    </div>
  );
};


const renderLastCycleInput = (userData, setUsers, setState) => {

  const nextCycle = calculateNextDate(userData.lastCycle);

  return (
    <React.Fragment>
  <style>
    {`
      input::placeholder {
        color: white; /* Робимо плейсхолдер білим */
        opacity: 1;   /* Для чіткої видимості */
      }
    `}
  </style>
  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
      <input
        type="text"
        value={formatDateToDisplay(userData.lastCycle) || ''}
        placeholder='міс'
        onChange={e => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(e.target.value);
          handleChange(setUsers, setState, userData.userId, 'lastCycle', serverFormattedDate);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        // placeholder="01.01.2021"
        style={{ ...styles.underlinedInput, 
          marginLeft: 0,
          textAlign: 'left',
          color: 'white', // Колір текст
        }}
      />
      {/* {nextCycle && <span> місячні - {nextCycle}</span>} */}
      {nextCycle && (
      <React.Fragment>
        <span style={{ marginLeft: '10px', marginRight: '5px', color: 'white', }}>місячні -</span>
        <button
          onClick={() => 
            handleChange(setUsers, setState, userData.userId, 'getInTouch', nextCycle, true)} // Замість alert додайте потрібну логіку
          style={{
    //         padding: '5px 10px',
    //         display: 'flex', // Використовуємо flexbox
    // justifyContent: 'center', // Центруємо текст горизонтально
    // alignItems: 'center', // Центруємо текст вертикально
    // backgroundColor: '#007BFF', // Колір кнопки
    // color: 'white',
    // border: 'none',
    // borderRadius: '4px',
    // cursor: 'pointer',
    // fontSize: '16px',
    // // height: '40px', // Задаємо висоту для точного центрування
    // width: 'auto', // Або конкретна ширина, якщо потрібно

    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007BFF',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 10px',


          }}
        >
          {nextCycle.slice(0, 5)}
        </button>
      </React.Fragment>
    )}
      </div>
    </React.Fragment>
  );
};

const renderGetInTouchInput = (userData, setUsers, setState) => {
  const handleSendToEnd = () => {
    handleChange(setUsers, setState, userData.userId, 'getInTouch', '2099-99-99', true);
  };

  const handleAddDays = (days) => {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + days);
  
    // Форматуємо дату в локальному часі замість використання UTC
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
    const day = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD
    handleChange(setUsers, setState, userData.userId, 'getInTouch', formattedDate, true);
  };

  const ActionButton = ({ label, days, onClick }) => (
    <OrangeBtn
      onClick={() => (onClick ? onClick(days) : null)}
      style={{   width: '25px', /* Встановіть ширину, яка визначатиме розмір кнопки */
        height: '25px', /* Встановіть висоту, яка повинна дорівнювати ширині */
      marginLeft: '5px',
      marginRight: 0,
    }}
    >
      {label}
    </OrangeBtn>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center',}}>
      {/* <label style={{ marginRight: '10px' }}>Пізніше:</label> */}
      <input
        type="text"
        value={formatDateToDisplay(formatDateAndFormula(userData.getInTouch)) || ''}
        onChange={e => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(formatDateAndFormula(e.target.value));
          handleChange(setUsers, setState, userData.userId, 'getInTouch', serverFormattedDate);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        style={{ ...styles.underlinedInput, 
          marginLeft: 0,
          textAlign: 'left',
        }}
      />
      <ActionButton label="3д" days={3} onClick={handleAddDays} />
      <ActionButton label="7д" days={7} onClick={handleAddDays} />
      <ActionButton label="1м" days={30} onClick={handleAddDays} />
      <ActionButton label="6м" days={180} onClick={handleAddDays} />
      <ActionButton label="1р" days={365} onClick={handleAddDays} />
      <ActionButton label="99" onClick={handleSendToEnd} />

    </div>
  );
};

const RenderCommentInput = ({ userData, setUsers, setState }) => {

  console.log('userData in RenderCommentInput :>> ', userData);
  const textareaRef = useRef(null);

  const handleInputChange = e => {
    handleChange(setUsers, setState, userData.userId, 'myComment', e.target.value);
  };

  const autoResize = textarea => {
    textarea.style.height = 'auto'; // Скидаємо висоту
    textarea.style.height = `${textarea.scrollHeight}px`; // Встановлюємо нову висоту
  };

  useEffect(() => {
    if (textareaRef.current) {
      autoResize(textareaRef.current); // Встановлюємо висоту після завантаження
    }
  }, [userData.myComment]); // Виконується при завантаженні та зміні коментаря

  return (
    <div
      style={{
        display: 'flex', // Використовуємо flexbox
        justifyContent: 'center', // Центрування по горизонталі
        alignItems: 'center', // Центрування по вертикалі
        height: '100%', // Висота контейнера
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder="Додайте коментар"
        value={userData.myComment || ''}
        onChange={e => {
          handleInputChange(e);
          autoResize(e.target);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        style={{
          // marginLeft: '10px',
          width: '100%',
          // height: 25,
          // minHeight: '40px',
          resize: 'none',
          overflow: 'hidden',
          padding: '5px',
        }}
      />
    </div>
  );
};

const renderWriterInput = (userData, setUsers, setState) => {
  const handleCodeClick = code => {
    let currentWriter = userData.writer || '';
    let updatedCodes = currentWriter?.split(', ').filter(item => item !== code); // Видаляємо, якщо є
    updatedCodes = [code, ...updatedCodes]; // Додаємо код першим
    handleChange(setUsers, setState, userData.userId, 'writer',  updatedCodes.join(', '), true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      {/* Верхній рядок: renderGetInTouchInput і інпут */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%' }}>
        <input
          type="text"
          // placeholder="Введіть ім'я"
          value={userData.writer || ''}
          onChange={e => handleChange(setUsers, setState, userData.userId, 'writer', e.target.value)}
          onBlur={() => handleSubmit(userData, 'overwrite')}
          style={{
            ...styles.underlinedInput,
            flexGrow: 1, // Займає залишковий простір
            maxWidth: '100%', // Обмежує ширину контейнером
          }}
        />
      </div>

      {/* Нижній рядок: кнопки */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', width: '100%' }}>
        {['IgF', 'IgTT', 'Ср', 'Срр', 'Ik', 'Т', 'V', 'W', 'ТТ', 'Ін'].map(code => (
          <OrangeBtn
            key={code}
            onClick={() => handleCodeClick(code)}
            style={{
              // padding: 5,
              cursor: 'pointer',
              flex: '1', // Рівномірно розподіляє кнопки по всій ширині
              // minWidth: '15px', // Мінімальна ширина кнопок
              width: '25px', /* Встановіть ширину, яка визначатиме розмір кнопки */
        height: '25px', /* Встановіть висоту, яка повинна дорівнювати ширині */
      marginLeft: '5px',
      marginRight: 0,
      color: 'black'
              // color: 'orange'
            }}
          >
            {code}
          </OrangeBtn>
        ))}
      </div>
    </div>
  );
};

// const renderContacts = (data, parentKey = '') => {
//   if (!data || typeof data !== 'object') {
//     console.error('Invalid data passed to renderContacts:', data);
//     return null;
//   }

//   const links = {
//     telegram: (value) => `https://t.me/@${value}`,
//     instagram: (value) => `https://instagram.com/${value}`,
//     tiktok: (value) => `https://www.tiktok.com/@${value}`,
//     phone: (value) => `tel:${value}`,
//     facebook: (value) => `https://facebook.com/${value}`,
//     email: (value) => `mailto:${value}`,
//     telegramFromPhone: (value) => `https://t.me/+${value.replace(/\s+/g, '')}`,
//     viberFromPhone: (value) => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
//     whatsappFromPhone: (value) => `https://wa.me/${value.replace(/\s+/g, '')}`,
//   };

//   return Object.keys(data).map((key) => {
//     const nestedKey = parentKey ? `${parentKey}.${key}` : key;
//     const value = data[key];

//     if (!value || (Array.isArray(value) && value.length === 0)) {
//       return null;
//     }

//     if (!links[key]) {
//       // console.warn(`No link function defined for key: ${key}`);
//       return null; // Пропускаємо ключі, які не мають обробки
//     }

//     const isSingleValue = Array.isArray(value) ? value.filter((v) => v.trim() !== '').length <= 1 : true;

//     const labelMap = {
//       email: 'Mail',
//       phone: 'Tel',
//       facebook: 'FB',
//       instagram: 'Inst',
//       tiktok: 'Tiktok',
//     };

//     const label = labelMap[key] || key;

//     return (
//       <div key={nestedKey} style={{
//         whiteSpace: 'normal', // Дозволяє перенесення між словами
//       wordBreak: 'break-word', // Розриває слова, якщо вони виходять за межі контейнера
//       overflowWrap: 'break-word', // Переносить слова лише за потреби
//       maxWidth: '83%',
//       }}>
//         {!['email', 'phone'].includes(key) && <strong>{label}:</strong>}{' '}
//         {Array.isArray(value) ? (
//           value
//             .filter((val) => val.trim() !== '')
//             .map((val, idx) => (
//               <span key={`${nestedKey}-${idx}`} style={{ marginRight: '8px' }}>
//                 <a
//                   href={links[key](val)}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   style={{ color: 'inherit', textDecoration: 'none' }}
//                 >
//                   {isSingleValue ? label : val}
//                 </a>
//                 {key === 'phone' && (
//                   <>
//                     <a
//                       href={links.telegramFromPhone(val)}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                       style={{ marginLeft: '5px' }}
//                     >
//                       Tg
//                     </a>
//                     <a
//                       href={links.viberFromPhone(val)}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                       style={{ marginLeft: '5px' }}
//                     >
//                       V
//                     </a>
//                     <a
//                       href={links.whatsappFromPhone(val)}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                       style={{ marginLeft: '5px' }}
//                     >
//                       W
//                     </a>
//                   </>
//                 )}
//               </span>
//             ))
//         ) : (
//           <a
//             href={links[key](value)}
//             target="_blank"
//             rel="noopener noreferrer"
//             style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
//           >
//             {isSingleValue ? label : value}
//           </a>
//         )}
//       </div>
//     );
//   });
// };

const renderContacts = (data, parentKey = '') => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderContacts:', data);
    return null;
  }

  const links = {
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    phone: value => `tel:${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherLink: value => `${value}`,
    email: value => `mailto:${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: value => `https://wa.me/${value.replace(/\s+/g, '')}`,
  };

  return Object.keys(data).map(key => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = data[key];

    // Пропускаємо ключ, якщо його значення — порожній рядок або порожній масив
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return null;
    }

    if (links[key]) {
      return (
        <div key={nestedKey}>
          {!['email', 'phone'].includes(key) && <strong>{key}:</strong>}{' '}
          {Array.isArray(value) ? (
            value
              .filter(val => typeof val === 'string' && val.trim() !== '') // Фільтруємо лише непусті рядки
              .map((val, idx) => {
                try {
                  const processedVal = key === 'phone' ? val.replace(/\s/g, '') : val; // Видаляємо пробіли тільки для phone
                  return (
                    <div key={`${nestedKey}-${idx}`} style={{ marginBottom: '2px' }}>
                      <a
                        href={links[key](processedVal)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                      >
                        {key === 'phone' ? `+${processedVal}` : processedVal}
                      </a>
                      {key === 'phone' && (
                        <>
                          <a
                            href={links.telegramFromPhone(`+${val}`)} // Telegram отримує значення з пробілами
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            Tg
                          </a>
                          <a
                            href={links.viberFromPhone(processedVal)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            V
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedVal)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            W
                          </a>
                        </>
                      )}
                    </div>
                  );
                } catch (error) {
                  return (
                    <div key={`${nestedKey}-${idx}`} style={{ marginBottom: '2px' }}>
                      {val}
                    </div>
                  );
                }
              })
          ) : (
            <>
              {(() => {
                try {
                  const processedValue = key === 'phone' ? value.replace(/\s/g, '') : value; // Видаляємо пробіли тільки для phone
                  return (
                    <>
                      <a
                        href={links[key](processedValue)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                      >
                        {key === 'phone' ? `+${processedValue}` : processedValue}
                      </a>
                      {key === 'phone' && (
                        <>
                          <a
                            href={links.telegramFromPhone(`+${value}`)} // Telegram отримує значення з пробілами
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            Tg
                          </a>
                          <a
                            href={links.viberFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            V
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            W
                          </a>
                        </>
                      )}
                    </>
                  );
                } catch (error) {
                  return <div>{value}</div>;
                }
              })()}
            </>
          )}
        </div>
      );
    }

    return null; // Якщо ключ не обробляється
  });
};

const renderMaritalStatus = maritalStatus => {
  switch (maritalStatus) {
    case 'Yes':
    case '+':
      return 'Заміжня';
    case 'No':
    case '-':
      return 'Незаміжня';
    default:
      return maritalStatus || '';
  }
};

// const renderCsection = (csection) => {

//   // if (csection === undefined) {
//   //   return ', кс ?';
//   // }

//   switch (csection) {
//     case undefined :
//     return '';
//     case '1':
//       return 'кс1, ';
//     case '2':
//       return 'кс2, ';
//     case 'No': case '0': case 'Ні': case '-':
//       return 'кс-, ';
//     case 'Yes': case 'Так': case '+':
//       return 'кс+, ';
//     default:
//       return `кс ${csection}, `|| '';
//   }
// };

const calculateAge = birthDateString => {
  if (!birthDateString) return null;
  if (typeof birthDateString !== 'string') return birthDateString;
  const [day, month, year] = birthDateString?.split('.').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const calculateMonthsAgo = dateString => {
  if (!dateString) return null;
  if (typeof dateString !== 'string') return dateString;

  const [day, month, year] = dateString?.split('.').map(Number);
  const deliveryDate = new Date(year, month - 1, day);
  const now = new Date();

  const monthsDiff = (now.getFullYear() - deliveryDate.getFullYear()) * 12 + (now.getMonth() - deliveryDate.getMonth());
  return monthsDiff;
};

const calculateNextDate = dateString => {
  if (!dateString) return '';

  // Перевіряємо, чи введена дата у форматі DD.MM.YYYY
  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(dateString)) {
    // Перетворюємо DD.MM.YYYY у формат YYYY-MM-DD
    const [day, month, year] = dateString.split('.');
    dateString = `${year}-${month}-${day}`;
  }

  // Перевіряємо, чи дата тепер у форматі YYYY-MM-DD
  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!storagePattern.test(dateString)) {
    console.error('Invalid date format after conversion:', dateString);
    return '';
  }

  // Створюємо об'єкт дати
  const [year, month, day] = dateString.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);

  // Перевіряємо, чи дата валідна
  if (isNaN(currentDate.getTime())) {
    console.error('Invalid date object:', currentDate);
    return '';
  }

  // Додаємо 28 днів
  currentDate.setDate(currentDate.getDate() + 28);

  // Форматуємо результат у форматі DD.MM.YYYY
  const dayFormatted = String(currentDate.getDate()).padStart(2, '0');
  const monthFormatted = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearFormatted = currentDate.getFullYear();

  return `${dayFormatted}.${monthFormatted}.${yearFormatted}`;
  // return `${dayFormatted}.${monthFormatted}`;
};

const calculateIMT = (weight, height) => {
  if (weight && height) {
    const heightInMeters = height / 100;
    return (weight / (heightInMeters ** 2)).toFixed(1);
  }
  return 'N/A';
};

// Компонент для рендерингу кожної картки
export const UserCard = ({ userData, setUsers, setShowInfoModal }) => {
  // console.log('userData!!!!! :>> ', userData);

  // Ініціалізація локального стану на основі userData
  // const [localUserData, setLocalUserData] = useState({});

  // Синхронізація локального стану при завантеженні
  // useEffect(() => {
  //   // console.log('Updated userData!!!!!!!!!!!!!!!!!!!!!!!!!!!!!: в юх ефект', userData);
  //   setLocalUserData(userData);
  // }, []);

  const renderFields = (data, parentKey = '') => {
    if (!data || typeof data !== 'object') {
      console.error('Invalid data passed to renderFields:', data);
      return null;
    }

    const extendedData = { ...data };
    if (typeof extendedData.birth === 'string') {
      extendedData.age = calculateAge(extendedData.birth);
    } else {
      // console.warn('Invalid birth format:', extendedData.birth);
    }

    const sortedKeys = Object.keys(extendedData).sort((a, b) => {
      const priority = ['name', 'surname', 'fathersname',  'birth', 'blood', 'maritalStatus', 'csection', 'weight', 'height', 'ownKids', 'lastDelivery','lastCycle',  'facebook', 'instagram', 'telegram', 'phone', 'tiktok', 'vk', 'writer', 'myComment', 'region', 'city'];
      const indexA = priority.indexOf(a);
      const indexB = priority.indexOf(b);

      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // let detailsRow = '';

    return sortedKeys.map(key => {
      const nestedKey = parentKey ? `${parentKey}.${key}` : key;
      const value = extendedData[key];

      if (['attitude', 'photos', 'whiteList', 'blackList'].includes(key)) {
        return null;
      }

      if (typeof value === 'object' && value !== null) {
        return (
          <div key={nestedKey}>
            <strong>{key}:</strong>
            <div style={{ marginLeft: '20px' }}>{renderFields(value, nestedKey)}</div>
          </div>
        );
      }

      return (
        <div key={nestedKey}>
          <strong>{key}:</strong> {value.toString()}
        </div>
      );
    });
  };

  return (
    <div>
      {renderTopBlock(userData, setUsers, setShowInfoModal)}
      <div id={userData.userId} style={{ display: 'none' }}>
        {renderFields(userData)}
      </div>
    </div>
  );
};

// Обробник кліку на картці користувача
const handleCardClick = async (userId, setSearch, setState) => {
  const userData = await fetchUserById(userId);
  if (userData) {
    console.log('Дані знайденого користувача: ', userData);
    setSearch(`id: ${userData.userId}`);
    setState(userData);
    // setUsers(userData)
    // Додаткова логіка обробки даних користувача
  } else {
    console.log('Користувача не знайдено.');
  }
};

// Компонент для рендерингу всіх карток
export const UsersList = ({ users, setUsers, setSearch, setState, setShowInfoModal, setCompare }) => {
  console.log('users in UsersList: ', users);
  console.log('users!!!!!!!!!! :>> ', users);

  const renderEditButton = (userId, setSearch, setState) => (
    <button
      style={styles.removeButton}
      onClick={e => {
        e.stopPropagation(); // Запобігаємо активації кліку картки
        handleCardClick(userId, setSearch, setState);
      }}
    >
      edit
    </button>
  );

  const renderInfoButton = (index, users) => {

    const delKeys = [
      'photos',
      'areTermsConfirmed',
      'attitude',
      'breastSize',
      'chin',
      'bodyType',
      'lastAction',
      'clothingSize',
      'deviceHeight',
      'education',
      'experience',
      'eyeColor',
      'faceShape',
      'glasses',
      'hairColor',
      'hairStructure',
      'language',
      'lastLogin',
      'lipsShape',
      'noseShape',
      'profession',
      'publish',
      'race',
      'registrationDate',
      'reward',
      'shoeSize',
      'street',
      'whiteList',
      'blackList',
      'photos',
    ];



    return (
      <button
      style={{...styles.removeButton, top: 105, backgroundColor: 'purple'}}
      onClick={e => {
        e.stopPropagation();
        const entries = Object.entries(users);
        const currentUser = entries[index][1];
        const nextUser = entries[index + 1]?.[1]; // Перевірка чи існує наступний юзер
      
        // Тут ми НЕ виймаємо photos, щоб він залишився в currentUser та nextUser
        const restCurrentUser = currentUser || {};
        const restNextUser = nextUser || {};
      
        // Виберемо лише ключі, які містяться у whiteList
        const filteredCurrentKeys = Object.keys(restCurrentUser).filter(key => !delKeys.includes(key));
        const filteredNextKeys = nextUser ? Object.keys(restNextUser).filter(key => !delKeys.includes(key)) : [];
      
        const keys = new Set([...filteredCurrentKeys, ...filteredNextKeys]);
      
        let rows = '';
        for (const key of keys) {
          const currentVal = restCurrentUser[key] !== undefined ? restCurrentUser[key] : '';
          const nextVal = nextUser ? (restNextUser[key] !== undefined ? restNextUser[key] : '') : 'No next user';
      
          // Пропускаємо рядок, якщо є наступний користувач і значення однакові
          if (nextUser && String(currentVal).trim() === String(nextVal).trim()) {
            continue;
          }
      
          rows += `
          <tr>
            <td style="width:20%; white-space: normal; word-break: break-word;">${key}</td>
            <td style="width:40%; white-space: normal; word-break: break-word;">${currentVal}</td>
            <td style="width:40%; white-space: normal; word-break: break-word;">${nextVal}</td>
          </tr>
        `;
      }
    
      const message = `
        <div style="font-size:10px; font-family: Arial, sans-serif;">
          <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th style="width:20%; white-space: normal; word-break: break-word;">Key</th>
                <th style="width:40%; white-space: normal; word-break: break-word;">Current User</th>
                <th style="width:40%; white-space: normal; word-break: break-word;">Next User</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
      
        setShowInfoModal('compareCards');
        setCompare(message);
      }}
      
      >
        comp
      </button>
    );
  };
  
  return (
    <div style={styles.container}>
        <OrangeBtn
        style={{
          // margin: '10px',
          // padding: '10px',
          // backgroundColor: '#28a745',
          // color: 'white',
          // border: 'none',
          // borderRadius: '5px',
          // cursor: 'pointer',
        }}
        onClick={()=>{saveToContact(users)}}
      >
        Export Users
      </OrangeBtn>
      {Object.entries(users).map(([userId, userData], index) => (
        <div
          key={userId}
          style={{ ...coloredCard(index) }}
          // onClick={() => handleCardClick(userData.userId)} // Додаємо обробник кліку
        >
          {renderEditButton(userData.userId, setSearch, setState)}
          {renderInfoButton(index, users)}
          {/* {renderExportButton(userData)} */}

          <UserCard setShowInfoModal={setShowInfoModal} userData={userData} setUsers={setUsers} />
        </div>
      ))}
    </div>
  );
};

// Стилі
const styles = {
  underlinedInput: {
    border: 'none',
    borderBottom: '1px solid white',
    backgroundColor: 'transparent',
    outline: 'none',
    fontSize: '16px',
    padding: 0,
    color: 'white',
    marginLeft: 5,
    width: '9.5ch', // Точний розмір для дати формату 01.01.2022
    textAlign: 'center', // Вирівнювання тексту
  },

  container: {
    display: 'flex',
    flexWrap: 'wrap',
    // justifyContent: 'center',
  },
  card: {
    position: 'relative', // Додаємо для розташування кнопки
    margin: '10px', // Відстань між картками
    color: 'black',
    marginTop: '20px',
    // cursor: 'pointer',
    background: 'linear-gradient(to right, #ff7e5f, #feb47b)', // Виправлено
    width: '100%',
  },
  card2: {
    position: 'relative', // Додаємо для розташування кнопки
    margin: '10px', // Відстань між картками
    color: 'white',
  },
  removeButton: {
    // position: 'absolute',
    // top: '10px', // Відступ від верхнього краю
    // left: '100%', // Центруємо по горизонталі
    // transform: 'translateX(-50%)', // Центруємо кнопку
    // marginLeft: 'auto',
    padding: '3px 6px',
    backgroundColor: 'orange',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    // left: '100%',
    position: 'absolute',
    top: '73px',
        right: '10px',

    zIndex: 999,
  },
};
