import { useEffect, useRef } from 'react';
import { fetchUserById, 
  fetchUserData,
  updateDataInNewUsersRTDB,
  // removeSearchId 
} from './config';
import { formatDateAndFormula, formatDateToDisplay, formatDateToServer,} from './inputValidations';
import { makeUploadedInfo } from './makeUploadedInfo';
import { coloredCard } from './styles';

const handleChange = (setUsers, userId, key, value) => {
  const newValue = (key==='getInTouch' || key==='lastCycle') ? formatDateAndFormula(value) : value

setUsers((prevState) => ({
 ...prevState,
 [userId]: {
   ...prevState[userId],
  [key]: newValue,
 },
}));
};


const handleSubmit = async (userData) => {

const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId' ];
const commonFields = ['lastAction'];
const dublicateFields = ['weight', 'height', ];


// console.log('userData В handleSubmit', userData);
   const { existingData } = await fetchUserData(userData.userId);
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

export const renderTopBlock = (userData, setUsers) => {

  // console.log('userData в renderTopBlock:', userData );

  if (!userData) return null;

  

  // const nextContactDate = userData.getInTouch
  //   ? userData.getInTouch
  //   : 'НОВИЙ КОНТАКТ';

    


  return (
    <div style={{ padding: '7px',  position: 'relative',}}>
      <div>
        {userData.userId.substring(0, 6)}
        {renderGetInTouchInput(userData, setUsers)}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
      <strong>{`${(userData.name || userData.surname) ? `${userData.name || ''} ${userData.surname || ''}, ` : ''}`}</strong>
        {/* {renderBirthInfo(userData.birth)} */}
        {renderMaritalStatus(userData.maritalStatus)}
        {renderCsection(userData.csection)} 
          <div>
          {`${userData.birth ? `${userData.birth}, ` : ''}` +
    `${userData.height || ''}` +
    `${userData.height && userData.weight ? ' / ' : ''}` +
    `${userData.weight ? `${userData.weight}, ` : ''}` +
    `${userData.blood || ''}`}
    
    </div>
    <div>
          {`${userData.region ? `${userData.region}, ` : ''}`  }

    </div>
          
           
      </div>
      
      
      {renderDeliveryInfo(userData.ownKids, userData.lastDelivery, userData.csection)}
      {/* {renderIMT(userData.weight, userData.height)} */}
      
      {renderWriterInput(userData, setUsers)}
      {renderContacts(userData)}
      <RenderCommentInput userData={userData} setUsers={setUsers} />

      


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

// const renderBirthInfo = (birth) => {
//   const age = calculateAge(birth);

//   return age !== null ? (
//       <span>{age}р, </span>
//   ) : null;
// };

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
  const monthsAgo = lastDelivery ? calculateMonthsAgo(lastDelivery) : null;

  return (ownKids || monthsAgo !== null || csection) 
    ? (
      <div>
        {ownKids ? `Пологів ${ownKids}` : ''}
        {monthsAgo !== null ? `${ownKids ? ', ' : ''}ост пологи ${monthsAgo} міс тому` : ''}
        {/* {csection ? `${ownKids || monthsAgo !== null ? ', ' : ''}кс ${csection}` : ', _N/C_'} */}
      </div>
    )
    : null;
};

const renderLastCycleInput = (userData, setUsers) => {

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
          handleChange(setUsers, userData.userId, 'lastCycle', serverFormattedDate);
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

const renderGetInTouchInput = (userData, setUsers) => {

    
  return (
    <div>
      <label>Написати:</label>
      <input

        type="text"
        value={formatDateToDisplay(userData.getInTouch) || ''}
        // onChange={(e) => handleChange(setUsers, userData.userId, 'getInTouch', e.target.value)}
        onChange={(e) => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(e.target.value);
          handleChange(setUsers, userData.userId, 'getInTouch', serverFormattedDate);
        }}
        onBlur={() => handleSubmit(userData, 'overwrite')}
        // placeholder="Введіть дату або формулу"
        style={{...styles.underlinedInput, width: '20%',}}
      />
    </div>
  );
};

const RenderCommentInput = ({ userData, setUsers }) => {
  const textareaRef = useRef(null);

  const handleInputChange = (e) => {
    handleChange(setUsers, userData.userId, 'myComment', e.target.value);
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

const renderWriterInput = (userData, setUsers) => {
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
  
    // Викликаємо handleSubmit поза setUsers
    handleSubmit(newState, 'overwrite');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      {/* Верхній рядок: renderGetInTouchInput і інпут */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%' }}>
      {renderLastCycleInput(userData, setUsers)}
        <input
          type="text"
          // placeholder="Введіть ім'я"
          value={userData.writer || ''}
          onChange={(e) => handleChange(setUsers, userData.userId, 'writer', e.target.value)}
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
              .filter((val) => val.trim() !== '') // Пропускаємо порожні елементи масиву
              .map((val, idx) => (
                <div key={`${nestedKey}-${idx}`} style={{ marginBottom: '2px' }}>
                  <a
                    href={links[key](val.replace(/\s/g, ''))}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                  >
                    {val.replace(/\s/g, '')}
                  </a>
                  {key === 'phone' && (
                    <>
                      <a
                        href={links.telegramFromPhone(`+${val.replace(/\s+/g, '')}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                      >
                        Tg
                      </a>
                      <a
                        href={links.viberFromPhone(val)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                      >
                        V
                      </a>
                      <a
                        href={links.whatsappFromPhone(val)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                      >
                        W
                      </a>
                    </>
                  )}
                </div>
              ))
          ) : (
            <>
              <a
                href={links[key](value.replace(/\s/g, ''))}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
              >
                {value.replace(/\s/g, '')}
              </a>
              {key === 'phone' && (
                <>
                  <a
                    href={links.telegramFromPhone(`+${value.replace(/\s+/g, '')}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                  >
                    Tg
                  </a>
                  <a
                    href={links.viberFromPhone(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                  >
                    V
                  </a>
                  <a
                    href={links.whatsappFromPhone(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                  >
                    W
                  </a>
                </>
              )}
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
      return 'Married, ';
    case 'No': case '-':
      return 'Single, ';
    default:
      return maritalStatus || '';
  }
};

const renderCsection = (csection) => {

  // if (csection === undefined) {
  //   return ', кс ?';
  // }

  switch (csection) {
    case undefined :
    return '';
    case '1':
      return 'кс1, ';
    case '2':
      return 'кс2, ';
    case 'No': case '0': case 'Ні': case '-':
      return 'кс-, ';
    case 'Yes': case 'Так': case '+': 
      return 'кс+, ';
    default:
      return `кс ${csection}, `|| '';
  }
};

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
export const UserCard = ({ userData, setUsers }) => {


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
    {renderTopBlock(userData, setUsers)}
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
export const UsersList = ({ users, setUsers, setSearch, setState  }) => {

  // console.log('users in UsersList: ', users);

  // const handleRemoveUser = async (userId) => {
  //   await removeSearchId(userId); // Виклик функції для видалення
  //   // Оновлення стану користувачів
  //   setUsers(prevUsers => {
  //     const updatedUsers = { ...prevUsers };
  //     delete updatedUsers[userId]; // Видалення користувача за userId
  //     return updatedUsers; // Повертаємо оновлений об'єкт користувачів
  //   });
  // };

  // Функція для експорту контактів у форматі vCard
  const exportContacts = (user) => {
    let contactVCard = `
    BEGIN:VCARD
    VERSION:3.0
    FN:УК СМ ${user.name?.trim()} ${user.surname?.trim()}
    N:УК СМ ${user.surname?.trim() || ''};${user.name?.trim() || ''};;;
    TEL;TYPE=CELL:${user.phone ? `tel:${user.phone.replace(/\s/g, '')}` : ''}
    EMAIL;TYPE=HOME:${user.email || ''}
    ADR;TYPE=HOME:;;${user.street || ''};${user.city || ''};${user.region || ''};;${user.country || ''}
    ORG:${user.profession || ''}
    TITLE:${user.userRole || ''}
    BDAY:${user.birth || ''}
  `;

  // Додаємо лінки на соціальні мережі
  const socialLinks = {
    Telegram: user.telegram ? `https://t.me/${user.telegram}` : '',
    Instagram: user.instagram ? `https://instagram.com/${user.instagram}` : '',
    TikTok: user.tiktok ? `https://www.tiktok.com/@${user.tiktok}` : '',
    Facebook: user.facebook ? `https://facebook.com/${user.facebook}` : '',
  };

  Object.entries(socialLinks).forEach(([label, link]) => {
    if (link) {
      contactVCard += `URL;TYPE=${label}:${link}\n`;
    }
  });

  // Додаткові поля в опис
  const additionalInfo = {
    "Reward": user.reward,
    "Height": user.height,
    "Weight": user.weight,
    "Body Type": user.bodyType,
    "Clothing Size": user.clothingSize,
    "Shoe Size": user.shoeSize,
    "Eye Color": user.eyeColor,
    "Hair Color": user.hairColor,
    "Hair Structure": user.hairStructure,
    "Face Shape": user.faceShape,
    "Lips Shape": user.lipsShape,
    "Nose Shape": user.noseShape,
    "Chin": user.chin,
    "Blood Type": user.blood,
    "Own Kids": user.ownKids,
    "Last Delivery": user.lastDelivery,
    "Last Login": user.lastLogin,
    "Last Action": user.lastAction,
    "Education": user.education,
    "Marital Status": user.maritalStatus,
    "Are Terms Confirmed": user.areTermsConfirmed,
    "Language": user.language,
    "Experience": user.experience,
    "Race": user.race
  };

  const description = Object.entries(additionalInfo)
    .filter(([key, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  if (description) {
    contactVCard += `NOTE:${description}\n`;
  }

  contactVCard += `END:VCARD\n`;

  const blob = new Blob([contactVCard], { type: "text/vcard" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${user.name?.trim()}_${user.surname?.trim()}.vcf`;
  link.click();

  window.URL.revokeObjectURL(url);
}

  return (
    <div style={styles.container}>
    {Object.entries(users).map(([userId, userData], index) => (
            <div 
            key={userId} 
            style={{...coloredCard(index)}}
            // onClick={() => handleCardClick(userData.userId)} // Додаємо обробник кліку
          >

<button
              style={styles.removeButton}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                handleCardClick(userData.userId, setSearch, setState);
              }}
            >
              edit
            </button>

            <button
              style={{...styles.removeButton, backgroundColor: 'green', top: '10px', 
                // right: '118px'
                right: '60px'
              }}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                exportContacts(userData);
              }}
            >
              export
            </button>

            {/* <button
              style={{...styles.removeButton, backgroundColor: 'red', top: '42px'}}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                handleRemoveUser(userId);
              }}
            >
              del
            </button> */}
            <UserCard userData={userData} setUsers={setUsers} />
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
