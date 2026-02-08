// Функція для експорту контактів у форматі vCard
import { makeCardDescription } from './makeCardDescription';

const hasCyrillic = value => /[\u0400-\u04FF]/.test(value);
const hasEmoji = value => /[\p{Extended_Pictographic}]/u.test(value);
const hasInvalidAt = value => value.includes('@') && !value.endsWith('@');
const hasWhitespace = value => /\s/.test(value);

const isValidUrlValue = value => {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (hasWhitespace(trimmed)) return false;
  if (hasCyrillic(trimmed)) return false;
  if (hasEmoji(trimmed)) return false;
  if (hasInvalidAt(trimmed)) return false;
  return true;
};

const getPrefix = user => {
  const hasAgentName = Array.isArray(user.name)
    ? user.name.some(n => String(n).trim().toLowerCase() === 'агент')
    : String(user.name).trim().toLowerCase() === 'агент';

  const userRoles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
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

const cleanedNameParts = arr =>
  arr
    .filter(Boolean)
    .map(part => String(part).trim())
    .filter(part => part.toLowerCase() !== 'агент');

const getContactName = user => {
  const prefix = getPrefix(user);
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];
  const firstPhone = phones.find(phone => phone);

  const names = Array.isArray(user.name) ? user.name : [user.name];
  const surnames = Array.isArray(user.surname) ? user.surname : [user.surname];
  const fathersnames = Array.isArray(user.fathersname)
    ? user.fathersname
    : [user.fathersname];

  const fullNameParts = [
    ...cleanedNameParts(surnames),
    ...cleanedNameParts(names),
    ...cleanedNameParts(fathersnames),
  ];
  const fullName = fullNameParts.join(' ').trim();

  if (fullName) {
    return `${prefix} ${fullName}`;
  }

  if (firstPhone) {
    return `${prefix} ${String(firstPhone).trim()}`;
  }

  return prefix;
};

const normalizeTikTokHandle = value => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const match = trimmed.match(/tiktok\.com\/@?([^/?#]+)/i);
  if (match && match[1]) {
    return match[1].replace(/^@/, '');
  }
  return trimmed.replace(/^@/, '').split(/[?#/]/)[0];
};

const linkGenerators = {
  telegram: value => `https://t.me/${value}`,
  instagram: value => `https://instagram.com/${value}`,
  tiktok: value => {
    const handle = normalizeTikTokHandle(value);
    return handle ? `https://www.tiktok.com/%40${handle}` : '';
  },
  facebook: value => `https://facebook.com/${value}`,
  vk: value => `https://vk.com/${value}`,
  otherlink: value => `${value}`,
};

const collectSocialLinks = user => {
  const socialLinksData = {
    Telegram: Array.isArray(user.telegram) ? user.telegram : [user.telegram],
    Instagram: Array.isArray(user.instagram) ? user.instagram : [user.instagram],
    TikTok: Array.isArray(user.tiktok) ? user.tiktok : [user.tiktok],
    Facebook: Array.isArray(user.facebook) ? user.facebook : [user.facebook],
    VK: Array.isArray(user.vk) ? user.vk : [user.vk],
    OtherLink: Array.isArray(user.otherLink) ? user.otherLink : [user.otherLink],
  };

  return Object.entries(socialLinksData).reduce((acc, [label, links]) => {
    const lowercaseLabel = label.toLowerCase();
    const generateLink = linkGenerators[lowercaseLabel];
    const normalizedLinks = links
      .filter(Boolean)
      .map(link => {
        const url = generateLink ? generateLink(link) : link;
        const rawValue = String(link).trim();
        if (!isValidUrlValue(rawValue)) return null;
        if (!isValidUrlValue(url)) return null;
        return url;
      })
      .filter(Boolean);

    if (normalizedLinks.length) {
      acc[label] = normalizedLinks;
    }
    return acc;
  }, {});
};

export const makeVCard = user => {
  // Формуємо vCard
  let contactVCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;

  const finalName = getContactName(user);
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];

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

  const socialLinks = collectSocialLinks(user);
  Object.entries(socialLinks).forEach(([label, links]) => {
    links.forEach(url => {
      contactVCard += `URL;CHARSET=UTF-8;TYPE=${label}:${url}\r\n`;
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

const escapeCsvValue = value => {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const stringifyList = list =>
  list
    .filter(Boolean)
    .map(item => String(item).trim())
    .filter(Boolean)
    .join('; ');

export const makeCsvRow = user => {
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];
  const emails = Array.isArray(user.email) ? user.email : [user.email];
  const addresses = Array.isArray(user.address) ? user.address : [user.address];
  const roles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
  const description = makeCardDescription(user);
  const socialLinks = collectSocialLinks(user);

  const addressValues = addresses
    .filter(Boolean)
    .map(address => {
      const { street = '', city = '', region = '', country = '' } = address;
      return [street, city, region, country]
        .map(part => String(part).trim())
        .filter(Boolean)
        .join(', ');
    });

  const row = [
    getContactName(user),
    stringifyList(phones),
    stringifyList(emails),
    stringifyList(addressValues),
    stringifyList(roles),
    stringifyList(socialLinks.Telegram || []),
    stringifyList(socialLinks.Instagram || []),
    stringifyList(socialLinks.TikTok || []),
    stringifyList(socialLinks.Facebook || []),
    stringifyList(socialLinks.VK || []),
    stringifyList(socialLinks.OtherLink || []),
    description ? String(description).trim() : '',
  ];

  return row.map(escapeCsvValue).join(',');
};

export const saveToContactCsv = data => {
  const CHUNK_SIZE = 8000;
  let usersList = [];
  let baseName = 'contacts';

  if (data.name) {
    usersList = [data];
    baseName = 'contact';
  } else {
    usersList = Object.values(data);
  }

  const headers = [
    'FullName',
    'Phone',
    'Email',
    'Address',
    'Role',
    'Telegram',
    'Instagram',
    'TikTok',
    'Facebook',
    'VK',
    'OtherLink',
    'Note',
  ];

  for (let i = 0; i < usersList.length; i += CHUNK_SIZE) {
    const chunk = usersList.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map(user => makeCsvRow(user));
    const csvContent = [headers.join(','), ...rows].join('\r\n');

    const fileSuffix = usersList.length > CHUNK_SIZE ? `_${Math.floor(i / CHUNK_SIZE) + 1}` : '';
    const fileName = `${baseName}${fileSuffix}.csv`;

    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();

    console.log('Generated CSV:', csvContent);

    window.URL.revokeObjectURL(url);
  }
};
