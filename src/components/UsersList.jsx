import React from 'react';
import { fetchUserById, 
  // removeSearchId 
} from './config';

// Компонент для рендерингу кожної картки
const UserCard = ({ userData, editCard }) => {
  console.log('userData!!!!! :>> ', userData);

  const calculateAge = (birthDateString) => {
    if (typeof birthDateString !== 'string') {
      console.error('Invalid birthDateString:', birthDateString);
      return 'N/A'; // або поверніть 0, якщо потрібно обчислити вік
    }
  
    const [day, month, year] = birthDateString.split('.').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
  
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const renderFields = (data, parentKey = '') => {
    if (!data || typeof data !== 'object') {
      console.error('Invalid data passed to renderFields:', data);
      return null;
    }

    const extendedData = { ...data };
    if (typeof extendedData.birth === 'string') {
      extendedData.age = calculateAge(extendedData.birth);
    } else {
      console.warn('Invalid birth format:', extendedData.birth);
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

    let detailsRow = '';

    return sortedKeys.map((key) => {
      const nestedKey = parentKey ? `${parentKey}.${key}` : key;
      const value = extendedData[key];

      if (['attitude', 'photos', 'whiteList', 'blackList'].includes(key)) {
        return null;
      }

      // Спеціальне форматування для name, surname, age, blood, region
      if (['name', 'surname', 'age', 'blood', 'region'].includes(key)) {
        detailsRow += value ? `${value} ` : ''; // Додаємо тільки наявні значення
        if (key === 'region') {
          return (
            <div key={nestedKey}>
              <strong></strong> {detailsRow.trim()}
            </div>
          );
        }
        return null;
      }

          // Клікабельні посилання для соцмереж і телефону
          const links = {
            telegram: (value) => `https://t.me/${value}`,
            instagram: (value) => `https://instagram.com/${value}`,
            tiktok: (value) => `https://www.tiktok.com/@${value}`,
            phone: (value) => `tel:${value}`,
            facebook: (value) => `https://facebook.com/${value}`,
            email: (value) => `mailto:${value}`,
            telegramFromPhone: (value) => `https://t.me/${value.replace(/\s+/g, '')}`,
            viberFromPhone: (value) => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`, // Viber посилання
            whatsappFromPhone: (value) => `https://wa.me/${value.replace(/\s+/g, '')}`, // WhatsApp посилання
          };
          
          if (links[key] && value) {
            return (
              <div key={nestedKey}>
                <strong>{key}:</strong>{' '}
                {Array.isArray(value) ? (
                  value.map((val, idx) => (
                    <a
                      key={`${nestedKey}-${idx}`}
                      href={links[key](val)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                    >
                      {val}
                    </a>
                  ))
                ) : (
                  <>
                    <a
                      href={links[key](value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                    >
                      {value}
                    </a>
                    {key === 'phone' && (
                      <>
                        <a
                          href={links.telegramFromPhone(`+${value.replace(/\s+/g, '')}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                        >
                          Telegram
                        </a>
                        <a
                          href={links.viberFromPhone(value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                        >
                          Viber
                        </a>
                        <a
                          href={links.whatsappFromPhone(value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                        >
                          WhatsApp
                        </a>
                      </>
                    )}
                  </>
                )}
              </div>
            );
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
    <div style={styles.card2}>
      {renderFields(userData)}
    </div>
  );
};

// Компонент для рендерингу всіх карток
const UsersList = ({ users, setUsers, setSearch, setState  }) => {

  console.log('users in UsersList: ', users);

  const gradients = [
    'linear-gradient(to right, #fc466b, #3f5efb)',
    'linear-gradient(to right, #6a11cb, #2575fc)',
    'linear-gradient(to right, #ff7e5f, #feb47b)'
  ];
  
  // Функція для отримання градієнта на основі індексу картки
  const getCardStyle = (index) => ({
    position: 'relative',
    margin: '10px',
    // color: 'white',
    marginTop: '20px',
    // cursor: 'pointer',
    background: gradients[index % gradients.length],
    width: '100%'
  });

    // Обробник кліку на картці користувача
    const handleCardClick = async (userId) => {
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
    TEL;TYPE=CELL:${user.phone ? `tel:${user.phone}` : ''}
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
            style={getCardStyle(index)}
            // onClick={() => handleCardClick(userData.userId)} // Додаємо обробник кліку
          >

<button
              style={styles.removeButton}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                handleCardClick(userData.userId);
              }}
            >
              edit
            </button>

            <button
              style={{...styles.removeButton, backgroundColor: 'green', top: '50px',}}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                exportContacts(userData);
              }}
            >
              export
            </button>

            {/* <button
              style={styles.removeButton}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                handleRemoveUser(userId);
              }}
            >
              del
            </button> */}
            <UserCard userData={userData} />
          </div>
        ))}
      </div>
  );
};

// Стилі
const styles = {
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

export default UsersList;
