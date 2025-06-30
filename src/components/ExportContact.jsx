// Функція для експорту контактів у форматі vCard
import { makeCardDescription } from './makeCardDescription';

export const makeVCard = user => {
  // Формуємо vCard
  let contactVCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;

  // Визначення префіксу для імені
  const getPrefix = user => {
    const hasAgentName = Array.isArray(user.name)
      ? user.name.some(n => String(n).trim().toLowerCase() === 'агент')
      : String(user.name).trim().toLowerCase() === 'агент';

    const userRoles = Array.isArray(user.userRole)
      ? user.userRole
      : [user.userRole];
    const roles = Array.isArray(user.role) ? user.role : [user.role];

    if (
      hasAgentName ||
      userRoles.includes('ag') ||
      roles.includes('ag')
    ) {
      return 'KMАгент';
    }

    if (userRoles.includes('ip')) {
      return 'KMПара';
    }

    if (user.userId && String(user.userId).length > 20) {
      return 'КМД';
    }

    if (user.userId && String(user.userId).startsWith('VK')) {
      return 'КМВК';
    }

    return 'КМСД';
  };

  const prefix = getPrefix(user);

  // Обробка телефонів (необхідно для випадку, коли немає ПІБ)
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];
  const firstPhone = phones.find(phone => phone);

  // Обробка імені та прізвища
  const names = Array.isArray(user.name) ? user.name : [user.name];
  const surnames = Array.isArray(user.surname) ? user.surname : [user.surname];
  const fathersnames = Array.isArray(user.fathersname)
    ? user.fathersname
    : [user.fathersname];

  const cleaned = arr =>
    arr
      .filter(Boolean)
      .map(part => String(part).trim())
      .filter(part => part.toLowerCase() !== 'агент');

  const fullNameParts = [
    ...cleaned(surnames),
    ...cleaned(names),
    ...cleaned(fathersnames),
  ];
  const fullName = fullNameParts.join(' ').trim();

  const finalName = fullName
    ? `${prefix} ${fullName}`
    : firstPhone
    ? `${prefix} ${String(firstPhone).trim()}`
    : prefix;

  contactVCard += `FN;CHARSET=UTF-8:${finalName}\r\n`;
  contactVCard += `N;CHARSET=UTF-8:${finalName};;;;\r\n`;

  // Обробка телефонів
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

  // Опис карти з використанням makeCardDescription
  const description = makeCardDescription(user);

  if (description) {
    contactVCard += `NOTE;CHARSET=UTF-8:${description}\r\n`;
  }

  contactVCard += `END:VCARD\r\n`;
  return contactVCard;
};

export const saveToContact = data => {
  // Limit each exported file to no more than 8000 contacts
  const CHUNK_SIZE = 8000;
  let usersList = [];
  let baseName = 'contacts';

  if (data.name) {
    // Один користувач (у нього є поле 'name')
    usersList = [data];
    baseName = 'contact';
  } else {
    usersList = Object.values(data);
  }

  for (let i = 0; i < usersList.length; i += CHUNK_SIZE) {
    const chunk = usersList.slice(i, i + CHUNK_SIZE);
    let contactVCard = '';

    chunk.forEach(user => {
      contactVCard += makeVCard(user);
    });

    const fileSuffix = usersList.length > CHUNK_SIZE ? `_${Math.floor(i / CHUNK_SIZE) + 1}` : '';
    const fileName = `${baseName}${fileSuffix}.vcf`;

    const vCardBlob = new Blob([contactVCard], { type: 'text/vcard;charset=utf-8' });
    const url = window.URL.createObjectURL(vCardBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();

    console.log('Generated vCard:', contactVCard);

    window.URL.revokeObjectURL(url);
  }
};
