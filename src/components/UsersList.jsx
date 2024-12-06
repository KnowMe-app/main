import { useEffect, useRef } from 'react';
import { fetchUserById, 
  // fetchUserData,
  updateDataInNewUsersRTDB,
  // removeSearchId 
} from './config';
import { formatDateAndFormula, formatDateToDisplay, formatDateToServer,} from './inputValidations';
import { makeUploadedInfo } from './makeUploadedInfo';
import { coloredCard } from './styles';

const handleChange = (setUsers, setState, userId, key, value) => {

  console.log('handleChange :>> ', value);
  const newValue = (key==='getInTouch' || key==='lastCycle') ? formatDateAndFormula(value) : value

console.log('flag :>> ', );
if (setState){
console.log('flag :>> ',);
  setUsers(prevState => ({
    ...prevState,
    [key]: value,
  }));
}
else {
  setUsers((prevState) => ({
 ...prevState,
 [userId]: {
   ...prevState[userId],
  [key]: newValue,
 },
}));
}


};


const handleSubmit = async (userData) => {

const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId' ];
const commonFields = ['lastAction'];
const dublicateFields = ['weight', 'height', ];


console.log('userData В handleSubmit', userData);
  //  const { existingData } = await fetchUserData(userData.userId);
   const { existingData } = await fetchUserById(userData.userId);
   console.log('1111 :>> ', );
   const uploadedInfo = makeUploadedInfo(existingData, userData);
   // console.log('uploadedInfo В handleSubmit', uploadedInfo);
       // Фільтруємо ключі, щоб видалити зайві поля
       const cleanedStateForNewUsers = Object.fromEntries(
         Object.entries(uploadedInfo).filter(
         ([key]) => [...fieldsForNewUsersOnly, ...contacts, ...commonFields, ...dublicateFields].includes(key)
         )
         );

         console.log('cleanedStateForNewUsers', cleanedStateForNewUsers);


   
   await updateDataInNewUsersRTDB(userData.userId, cleanedStateForNewUsers, 'update');
};



export const renderTopBlock = (userData, setUsers, setShowInfoModal, setState) => {
  // console.log('userData в renderTopBlock:', userData );
  if (!userData) return null;

  // Функція для експорту контактів у форматі vCard
  const exportContacts = (user) => {
    console.log('user :>> ', user);
  
    // Формуємо vCard
    let contactVCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
  
    // Обробка імені та прізвища
    const names = Array.isArray(user.name) ? user.name : [user.name];
    const surnames = Array.isArray(user.surname) ? user.surname : [user.surname];
  
    const fullName = `${names.join(' ').trim()} ${surnames.join(' ').trim()}`;
    if (fullName.trim()) {
      contactVCard += `FN;CHARSET=UTF-8:${fullName.trim()}\r\n`;
      contactVCard += `N;CHARSET=UTF-8:УК СМ ${names.join(' ').trim()} ${surnames.join(' ').trim()};;;\r\n`;
    }
  
    // Обробка телефонів
    const phones = Array.isArray(user.phone) ? user.phone : [user.phone];
    phones.forEach((phone) => {
      if (phone) {
        contactVCard += `TEL;TYPE=CELL:+${phone.trim()}\r\n`;
      }
    });
  
    // Обробка email
    const emails = Array.isArray(user.email) ? user.email : [user.email];
    emails.forEach((email) => {
      if (email) {
        contactVCard += `EMAIL;CHARSET=UTF-8;TYPE=HOME:${email.trim()}\r\n`;
      }
    });
  
    // Обробка адрес
    const addresses = Array.isArray(user.address) ? user.address : [user.address];
    addresses.forEach((address) => {
      if (address) {
        const { street = '', city = '', region = '', country = '' } = address;
        contactVCard += `ADR;CHARSET=UTF-8;TYPE=HOME:;;${street.trim()};${city.trim()};${region.trim()};${country.trim()}\r\n`;
      }
    });
  
    // Обробка ролей
    const roles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
    roles.forEach((role) => {
      if (role) {
        contactVCard += `TITLE;CHARSET=UTF-8:${role.trim()}\r\n`;
      }
    });
  
    // Обробка дат народження
    const births = Array.isArray(user.birth) ? user.birth : [user.birth];
    births.forEach((birth) => {
      if (birth) {
        const [day, month, year] = birth.split('.');
        contactVCard += `BDAY:${year}-${month}-${day}\r\n`; // Формат YYYY-MM-DD
      }
    });
  
    // Обробка соціальних мереж
    const socialLinks = {
      Telegram: Array.isArray(user.telegram) ? user.telegram : [user.telegram],
      Instagram: Array.isArray(user.instagram) ? user.instagram : [user.instagram],
      TikTok: Array.isArray(user.tiktok) ? user.tiktok : [user.tiktok],
      Facebook: Array.isArray(user.facebook) ? user.facebook : [user.facebook],
    };
  
    Object.entries(socialLinks).forEach(([label, links]) => {
      links.forEach((link) => {
        if (link) {
          contactVCard += `URL;CHARSET=UTF-8;TYPE=${label}:https://${label.toLowerCase()}.com/${link}\r\n`;
        }
      });
    });
  
    // Додаткові поля для NOTE
    const additionalInfo = {
      Reward: user.reward || '',
      Height: user.height || '',
      Weight: user.weight || '',
      'Body Type': user.bodyType || '',
      'Clothing Size': user.clothingSize || '',
      'Shoe Size': user.shoeSize || '',
      'Eye Color': user.eyeColor || '',
      'Hair Color': user.hairColor || '',
      'Hair Structure': user.hairStructure || '',
      'Face Shape': user.faceShape || '',
      'Lips Shape': user.lipsShape || '',
      'Nose Shape': user.noseShape || '',
      Chin: user.chin || '',
      'Blood Type': user.blood || '',
      'Own Kids': user.ownKids || '',
      'Last Delivery': user.lastDelivery || '',
      'Last Login': user.lastLogin || '',
      'Last Action': user.lastAction || '',
      Education: user.education || '',
      'Marital Status': user.maritalStatus || '',
      'Are Terms Confirmed': user.areTermsConfirmed || '',
      Language: user.language || '',
      Experience: user.experience || '',
      Race: user.race || '',
    };
  
    const description = Object.entries(additionalInfo)
      .filter(([, value]) => value) // Виключаємо порожні значення
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  
    if (description) {
      contactVCard += `NOTE;CHARSET=UTF-8:${description}\r\n`;
    }
  
    contactVCard += `END:VCARD\r\n`;
  
    // Створюємо Blob із кодуванням UTF-8
    const vCardBlob = new Blob([contactVCard], { type: 'text/vcard;charset=utf-8' });
  
    // Завантаження файлу
    const url = window.URL.createObjectURL(vCardBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${names[0]?.trim() || 'user'}_${surnames[0]?.trim() || 'data'}.vcf`;
    link.click();
  
    console.log('Generated vCard:', contactVCard);
  
    window.URL.revokeObjectURL(url);
  };

  const renderExportButton = (userData) => (
    <button
      style={{
        ...styles.removeButton,
        backgroundColor: 'green',
        top: '10px',
        right: '60px',
      }}
      onClick={(e) => {
        e.stopPropagation(); // Запобігаємо активації кліку картки
        exportContacts(userData);
      }}
    >
      export
    </button>
  );
  
  const renderDeleteButton = (userId) => (
    <button
      style={{
        ...styles.removeButton,
        backgroundColor: 'red',
        top: '42px',
      }}
      onClick={(e) => {
        console.log('delConfirm :>> ');
        e.stopPropagation(); // Запобігаємо активації кліку картки
        setShowInfoModal('delConfirm'); // Trigger the modal opening

        // handleRemoveUser(userId);
      }}
    >
      del
    </button>
  );
  

  // const nextContactDate = userData.getInTouch
  //   ? userData.getInTouch
  //   : 'НОВИЙ КОНТАКТ';

    

// console.log('userData in renderTopBlock :>> ', userData);
  return (
    <div style={{ padding: '7px',  position: 'relative',}}>
      {renderDeleteButton(userData.userId)}
      {renderExportButton(userData)}
      <div>
      {userData.userId}
        {/* {userData.userId.substring(0, 4)} */}
        {renderGetInTouchInput(userData, setUsers, setState)}
        {renderLastCycleInput(userData, setUsers, setState)}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
      <strong>
  {`${(userData.surname || userData.name || userData.fathersname)
    ? `${userData.surname || ''} ${userData.name || ''} ${userData.fathersname || ''}, `
    : ''}`}
</strong>
        {renderBirthInfo(userData.birth)}
        {renderMaritalStatus(userData.maritalStatus)}
        {/* {renderCsection(userData.csection)}  */}
        <div style={{ whiteSpace: 'pre-wrap' }}>
  {`${userData.birth ? `${userData.birth}, ` : ''}` +
    `${userData.height || ''}` +
    `${userData.height && userData.weight ? ' / ' : ''}` +
    `${userData.weight ? `${userData.weight}, ` : ''}` +
    `${userData.blood || ''}`}
  {renderDeliveryInfo(userData.ownKids, userData.lastDelivery, userData.csection)}
</div>
    <div>
          {`${userData.region ? `${userData.region}, ` : ''}`  }

    </div>
          
           
      </div>
      
      
      
      {/* {renderIMT(userData.weight, userData.height)} */}
      
      
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

const renderBirthInfo = (birth) => {
  const age = calculateAge(birth);

  return age !== null ? (
      <span>{age}, </span>
  ) : null;
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

const renderDeliveryInfo = (ownKids, lastDelivery, csection) => {
// Функція для парсингу дати з формату дд.мм.рррр
const parseCsectionDate = (dateString) => {
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

  return dateString; // Повертаємо коректний об'єкт Date
};

   // Використовуємо `csection` як дату останніх пологів, якщо `lastDelivery` не задано
   const effectiveLastDelivery = lastDelivery || (csection && parseCsectionDate(csection));
   const monthsAgo = effectiveLastDelivery ? calculateMonthsAgo(effectiveLastDelivery) : null;

  // return (ownKids || monthsAgo !== null || csection) 
  //   ? (
  //     <div>
  //       {ownKids ? `Пологів ${ownKids}` : ''}
  //       {monthsAgo !== null ? `${ownKids ? ', ' : ''}ост пологи ${monthsAgo} міс тому` : ''}
  //       {/* {csection ? `${ownKids || monthsAgo !== null ? ', ' : ''}кс ${csection}` : ', _N/C_'} */}
  //     </div>
  //   )
  //   : null;
  if (!ownKids && monthsAgo === null && !csection) return null;

  const parts = [];
  if (ownKids) parts.push(`Пологів ${ownKids}`);

  if (monthsAgo !== null) {
    parts.push(`ост ${monthsAgo} міс тому`);
  }

  if (csection) parts.push(`кс ${csection}`);
  // Якщо csection не потрібно показувати, закоментуйте цей рядок або видаліть його.

  return <div>{parts.join(', ')}</div>;
};

const renderLastCycleInput = (userData, setUsers, setState, ) => {

  const nextCycle = calculateNextDate(userData.lastCycle);

  return (
    <div>
      <label>Міс:</label>
      <input
        type="text"
        value={formatDateToDisplay(userData.lastCycle) || ''}
        onChange={(e) => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(e.target.value);
          handleChange(setUsers, setState, userData.userId, 'lastCycle', serverFormattedDate);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        // placeholder="01.01.2021"
        style={{...styles.underlinedInput, flexGrow: 1, // Займає залишковий простір
          maxWidth: '100%'}}
      />
      {nextCycle && <span> - {nextCycle}</span>}
    </div>
  );
};

const renderGetInTouchInput = (userData, setUsers, setState) => {

  return (
    <div>
      <label>Пізніше:</label>
      <input

        type="text"
        value={formatDateToDisplay(formatDateAndFormula(userData.getInTouch)) || ''}
        // onChange={(e) => handleChange(setUsers, userData.userId, 'getInTouch', e.target.value)}
        onChange={(e) => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(formatDateAndFormula(e.target.value));
          handleChange(setUsers, setState, userData.userId, 'getInTouch', serverFormattedDate);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        // placeholder="Введіть дату або формулу"
        style={{...styles.underlinedInput, width: '20%',}}
      />
    </div>
  );
};

const RenderCommentInput = ({ userData, setUsers, setState,  }) => {
  const textareaRef = useRef(null);

  const handleInputChange = (e) => {
    handleChange(setUsers, setState, userData.userId, 'myComment', e.target.value);
  };

  const autoResize = (textarea) => {
    textarea.style.height = 'auto'; // Скидаємо висоту
    textarea.style.height = `${textarea.scrollHeight}px`; // Встановлюємо нову висоту
  };

  useEffect(() => {
    if (textareaRef.current) {
      autoResize(textareaRef.current); // Встановлюємо висоту після завантаження
    }
  }, [userData.myComment]); // Виконується при завантаженні та зміні коментаря

  return (
    <div style={{
      display: 'flex', // Використовуємо flexbox
      justifyContent: 'center', // Центрування по горизонталі
      alignItems: 'center', // Центрування по вертикалі
      height: '100%', // Висота контейнера
    }}>
      <textarea
        ref={textareaRef}
        placeholder="Додайте коментар"
        value={userData.myComment || ''}
        onChange={(e) => {
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
  const handleCodeClick = (code) => {
    let currentWriter = userData.writer || '';
    let updatedCodes = currentWriter?.split(', ').filter((item) => item !== code); // Видаляємо, якщо є
    updatedCodes = [code, ...updatedCodes]; // Додаємо код першим

    const newState = {
      ...userData,
      writer: updatedCodes.join(', '),
    };
  
    setUsers((prev) => ({
      ...prev,
      [userData.userId]: newState,
    }));

    // handleChange(setUsers, setState, userData.userId, 'writer');
  
    // Викликаємо handleSubmit поза setUsers
    handleSubmit(newState, 'overwrite');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      {/* Верхній рядок: renderGetInTouchInput і інпут */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%' }}>
      
        <input
          type="text"
          // placeholder="Введіть ім'я"
          value={userData.writer || ''}
          onChange={(e) => handleChange(setUsers, setState, userData.userId, 'writer', e.target.value)}
          onBlur={() => handleSubmit(userData, 'overwrite')}
          style={{...styles.underlinedInput, flexGrow: 1, // Займає залишковий простір
            maxWidth: '100%' // Обмежує ширину контейнером
            }}
        />
      </div>

      {/* Нижній рядок: кнопки */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', width: '100%' }}>
        {['Ig','Ср', 'Срр', 'Ik', 'Т','V','W', 'ТТ', 'Ін', ].map((code) => (
          <button
            key={code}
            onClick={() => handleCodeClick(code)}
            style={{
              padding: 5,
              cursor: 'pointer',
              flex: '1', // Рівномірно розподіляє кнопки по всій ширині
              minWidth: '15px', // Мінімальна ширина кнопок
              // color: 'orange'
            }}
          >
            {code}
          </button>
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
    telegram: (value) => `https://t.me/${value}`,
    instagram: (value) => `https://instagram.com/${value}`,
    tiktok: (value) => `https://www.tiktok.com/@${value}`,
    phone: (value) => `tel:${value}`,
    facebook: (value) => `https://facebook.com/${value}`,
    vk: (value) => `https://vk.com/${value}`,
    otherLink: (value) => `${value}`,
    email: (value) => `mailto:${value}`,
    telegramFromPhone: (value) => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: (value) => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: (value) => `https://wa.me/${value.replace(/\s+/g, '')}`,
  };

  return Object.keys(data).map((key) => {
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
              .filter((val) => typeof val === 'string' && val.trim() !== '') // Фільтруємо лише непусті рядки
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

const renderMaritalStatus = (maritalStatus) => {
  switch (maritalStatus) {
    case 'Yes': case '+':
      return 'Заміжня, ';
    case 'No': case '-':
      return 'Незаміжня, ';
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

const calculateAge = (birthDateString) => {
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

const calculateMonthsAgo = (dateString) => {
  if (!dateString) return null;
  if (typeof dateString !== 'string') return dateString;

  const [day, month, year] = dateString?.split('.').map(Number);
  const deliveryDate = new Date(year, month - 1, day);
  const now = new Date();

  const monthsDiff = (now.getFullYear() - deliveryDate.getFullYear()) * 12 + (now.getMonth() - deliveryDate.getMonth());
  return monthsDiff;
};

const calculateNextDate = (dateString) => {

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
  // const yearFormatted = currentDate.getFullYear();

  // return `${dayFormatted}.${monthFormatted}.${yearFormatted}`;
  return `${dayFormatted}.${monthFormatted}`;
};

// const calculateIMT = (weight, height) => {
//   if (weight && height) {
//     const heightInMeters = height / 100;
//     return (weight / (heightInMeters ** 2)).toFixed(1);
//   }
//   return 'N/A';
// };


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
      const priority = ['name', 'surname', 'age', 'blood', 'region', 'lastAction', 'lastDelivery', 'facebook', 'instagram', 'telegram', 'phone', 'tiktok'];
      const indexA = priority.indexOf(a);
      const indexB = priority.indexOf(b);

      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // let detailsRow = '';

    return sortedKeys.map((key) => {
      const nestedKey = parentKey ? `${parentKey}.${key}` : key;
      const value = extendedData[key];

      if (['attitude', 'photos', 'whiteList', 'blackList'].includes(key)) {
        return null;
      }

      if (typeof value === 'object' && value !== null) {
        return (
          <div key={nestedKey}>
            <strong>{key}:</strong>
            <div style={{ marginLeft: '20px' }}>
              {renderFields(value, nestedKey)}
            </div>
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
        setState(userData)
        // setUsers(userData)
        // Додаткова логіка обробки даних користувача
      } else {
        console.log('Користувача не знайдено.');
      }
    };

// Компонент для рендерингу всіх карток
export const UsersList = ({ users, setUsers, setSearch, setState, setShowInfoModal  }) => {

  console.log('users in UsersList: ', users);



  const renderEditButton = (userId, setSearch, setState) => (
    <button
      style={styles.removeButton}
      onClick={(e) => {
        e.stopPropagation(); // Запобігаємо активації кліку картки
        handleCardClick(userId, setSearch, setState);
      }}
    >
      edit
    </button>
  );
  
  



  return (
    <div style={styles.container}>
    {Object.entries(users).map(([userId, userData], index) => (
            <div 
            key={userId} 
            style={{...coloredCard(index)}}
            // onClick={() => handleCardClick(userData.userId)} // Додаємо обробник кліку
          >
            
            {renderEditButton(userData.userId, setSearch, setState)}
            {/* {renderExportButton(userData)} */}

            <UserCard setShowInfoModal = {setShowInfoModal} userData={userData} setUsers={setUsers} />
          </div>
        ))}
      </div>
  );
};

// Стилі
const styles = {
  underlinedInput: {
    border: "none",
    borderBottom: "1px solid white",
    backgroundColor: "transparent",
    outline: "none",
    fontSize: "16px",
    padding: 0,
    color: "white",
    marginLeft: 5,
    width: "9ch", // Точний розмір для дати формату 01.01.2022
    textAlign: "center" // Вирівнювання тексту
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
    width: '100%'
  },
  card2: {
    position: 'relative', // Додаємо для розташування кнопки
    margin: '10px', // Відстань між картками
    color:'white',
  },
  removeButton: {
    // position: 'absolute',
    // top: '10px', // Відступ від верхнього краю
    // left: '100%', // Центруємо по горизонталі
    // transform: 'translateX(-50%)', // Центруємо кнопку
    // marginLeft: 'auto',
    padding: '5px 10px',
    backgroundColor: 'orange',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    // left: '100%',
    position: 'absolute',
    top: '10px', // Відступ від верхнього краю
    right: '10px', // Відступ зліва
    zIndex: 999,
  },
};
