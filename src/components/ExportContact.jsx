// Функція для експорту контактів у форматі vCard
export const makeVCard = user => {
  // Формуємо vCard
  let contactVCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;

  // Обробка імені та прізвища
  const names = Array.isArray(user.name) ? user.name : [user.name];
  const surnames = Array.isArray(user.surname) ? user.surname : [user.surname];
  const fathersnames = Array.isArray(user.fathersname) ? user.fathersname : [user.fathersname];

  const fullName = `${surnames.join(' ').trim()} ${names.join(' ').trim()} ${fathersnames.join(' ').trim()}`;
  if (fullName.trim()) {
    contactVCard += `FN;CHARSET=UTF-8:СМДО ${fullName.trim()}\r\n`;
    contactVCard += `N;CHARSET=UTF-8:СМДО ${fullName.trim()};;;;\r\n`;
  }

  // Обробка телефонів
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];
  phones.forEach(phone => {
    if (phone) {
      contactVCard += `TEL;TYPE=CELL:+${String(phone).trim()}\r\n`;
    }
  });

  // Обробка email
  const emails = Array.isArray(user.email) ? user.email : [user.email];
  emails.forEach(email => {
    if (email) {
      contactVCard += `EMAIL;CHARSET=UTF-8;TYPE=HOME:${email.trim()}\r\n`;
    }
  });

  // Обробка адрес
  const addresses = Array.isArray(user.address) ? user.address : [user.address];
  addresses.forEach(address => {
    if (address) {
      const { street = '', city = '', region = '', country = '' } = address;
      contactVCard += `ADR;CHARSET=UTF-8;TYPE=HOME:;;${street.trim()};${city.trim()};${region.trim()};${country.trim()}\r\n`;
    }
  });

  // Обробка ролей
  const roles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
  roles.forEach(role => {
    if (role) {
      contactVCard += `TITLE;CHARSET=UTF-8:${role.trim()}\r\n`;
    }
  });

  // Обробка дат народження
  // const births = Array.isArray(user.birth) ? user.birth : [user.birth];
  // births.forEach(birth => {
  //   if (birth) {
  //     const [day, month, year] = birth.split('.');
  //     contactVCard += `BDAY:${year}-${month}-${day}\r\n`; // Формат YYYY-MM-DD
  //   }
  // });

  // Обробка соціальних мереж
  // Формування масивів посилань з даних користувача
  const socialLinksData = {
    Telegram: Array.isArray(user.telegram) ? user.telegram : [user.telegram],
    Instagram: Array.isArray(user.instagram) ? user.instagram : [user.instagram],
    TikTok: Array.isArray(user.tiktok) ? user.tiktok : [user.tiktok],
    Facebook: Array.isArray(user.facebook) ? user.facebook : [user.facebook],
    VK: Array.isArray(user.vk) ? user.vk : [user.vk],
    OtherLink: Array.isArray(user.otherLink) ? user.otherLink : [user.otherLink],
  };

  // Функції генерації посилань для різних соцмереж
  const linkGenerators = {
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherlink: value => `${value}`, // Пряме посилання без модифікацій
  };

  Object.entries(socialLinksData).forEach(([label, links]) => {
    links.forEach(link => {
      if (link) {
        const lowercaseLabel = label.toLowerCase();
        const generateLink = linkGenerators[lowercaseLabel];

        // Якщо є спеціальна функція-генератор, використовуємо її, інакше просто вставляємо лінк
        const url = generateLink ? generateLink(link) : link;

        contactVCard += `URL;CHARSET=UTF-8;TYPE=${label}:${url}\r\n`;
      }
    });
  });

  // Додаткові поля для NOTE
  const additionalInfo = {
    Birth: user.birth || '',
    Marriage: user.maritalStatus || '',
    Height: user.height || '',
    Weight: user.weight || '',
    Blood: user.blood || '',
    Deliveries: user.ownKids || '',
    Last_Delivery: user.lastDelivery || '',
    Csection: user.csection || '',
  };

  const description = Object.entries(additionalInfo)
    .filter(([, value]) => value) // Виключаємо порожні значення
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  if (description) {
    contactVCard += `NOTE;CHARSET=UTF-8:${description}\r\n`;
  }

  contactVCard += `END:VCARD\r\n`;
  return contactVCard;
};

export const saveToContact = data => {
  let contactVCard = '';
  var fileName = '';

  if (data.name) {
    // Один користувач (у нього є поле 'name')
    contactVCard += makeVCard(data);
    fileName = 'contact.vcf';
  } else {
    // Об’єкт з користувачами {id: user, ...}
    const firstFiveUsers = Object.entries(data)
    // .slice(0, 5);
    firstFiveUsers.forEach(([userId, user]) => {
      contactVCard += makeVCard(user);
    });
    fileName = 'contacts.vcf';
  }

  const vCardBlob = new Blob([contactVCard], { type: 'text/vcard;charset=utf-8' });
  const url = window.URL.createObjectURL(vCardBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();

  console.log('Generated vCard:', contactVCard);

  window.URL.revokeObjectURL(url);
};
