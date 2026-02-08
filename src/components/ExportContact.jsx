// Функція для експорту контактів у форматі vCard
import { makeCardDescription } from './makeCardDescription';

const normalizeArray = value => (Array.isArray(value) ? value : [value]);

const hasCyrillic = value => /[\u0400-\u04FF]/.test(value);
const hasEmoji = value =>
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(
    value,
  );

const isValidContactUrl = value => {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return false;
  if (hasCyrillic(trimmed)) return false;
  if (hasEmoji(trimmed)) return false;
  if (trimmed.includes('@') && !trimmed.endsWith('@')) return false;
  return true;
};

const getPrefix = user => {
  const hasAgentName = Array.isArray(user.name)
    ? user.name.some(n => String(n).trim().toLowerCase() === 'агент')
    : String(user.name).trim().toLowerCase() === 'агент';

  const userRoles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
  const roles = Array.isArray(user.role) ? user.role : [user.role];

  if (hasAgentName || userRoles.includes('ag') || roles.includes('ag')) {
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

const buildContactName = user => {
  const prefix = getPrefix(user);
  const phones = normalizeArray(user.phone);
  const firstPhone = phones.find(phone => phone);

  const names = normalizeArray(user.name);
  const surnames = normalizeArray(user.surname);
  const fathersnames = normalizeArray(user.fathersname);

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

  return { finalName, phones };
};

const collectSocialLinks = user => {
  const socialLinksData = {
    Telegram: normalizeArray(user.telegram),
    Instagram: normalizeArray(user.instagram),
    TikTok: normalizeArray(user.tiktok),
    Facebook: normalizeArray(user.facebook),
    VK: normalizeArray(user.vk),
    OtherLink: normalizeArray(user.otherLink),
  };

  const linkGenerators = {
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherlink: value => `${value}`,
  };

  const collected = [];

  Object.entries(socialLinksData).forEach(([label, links]) => {
    links.forEach(link => {
      if (link) {
        const lowercaseLabel = label.toLowerCase();
        const generateLink = linkGenerators[lowercaseLabel];
        const url = generateLink ? generateLink(link) : link;
        if (isValidContactUrl(url)) {
          collected.push({ label, url });
        }
      }
    });
  });

  return collected;
};

export const makeVCard = user => {
  // Формуємо vCard
  let contactVCard = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;

  // Обробка телефонів (необхідно для випадку, коли немає ПІБ)
  const { finalName, phones } = buildContactName(user);

  contactVCard += `FN;CHARSET=UTF-8:${finalName}\r\n`;
  contactVCard += `N;CHARSET=UTF-8:${finalName};;;;\r\n`;

  // Обробка телефонів
  phones.forEach(phone => {
    if (phone) {
      contactVCard += `TEL;TYPE=CELL:+${String(phone).trim()}\r\n`;
    }
  });

  // Обробка email
  const emails = normalizeArray(user.email);
  emails.forEach(email => {
    if (email) {
      contactVCard += `EMAIL;CHARSET=UTF-8;TYPE=HOME:${email.trim()}\r\n`;
    }
  });

  // Обробка адрес
  const addresses = normalizeArray(user.address);
  addresses.forEach(address => {
    if (address) {
      const { street = '', city = '', region = '', country = '' } = address;
      contactVCard += `ADR;CHARSET=UTF-8;TYPE=HOME:;;${street.trim()};${city.trim()};${region.trim()};${country.trim()}\r\n`;
    }
  });

  // Обробка ролей
  const roles = normalizeArray(user.userRole);
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
  const socialLinks = collectSocialLinks(user);
  socialLinks.forEach(({ label, url }) => {
    contactVCard += `URL;CHARSET=UTF-8;TYPE=${label}:${url}\r\n`;
  });

  // Опис карти з використанням makeCardDescription
  const description = makeCardDescription(user);

  if (description) {
    contactVCard += `NOTE;CHARSET=UTF-8:${description}\r\n`;
  }

  contactVCard += `END:VCARD\r\n`;
  return contactVCard;
};

const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatAddresses = addresses =>
  addresses
    .map(address => {
      if (!address) return '';
      const { street = '', city = '', region = '', country = '' } = address;
      return [street, city, region, country].map(part => String(part).trim()).filter(Boolean).join(', ');
    })
    .filter(Boolean)
    .join(' | ');

export const saveToContactCSV = data => {
  const CHUNK_SIZE = 8000;
  let usersList = [];
  let baseName = 'contacts';

  if (data.name) {
    usersList = [data];
    baseName = 'contact';
  } else {
    usersList = Object.values(data);
  }

  for (let i = 0; i < usersList.length; i += CHUNK_SIZE) {
    const chunk = usersList.slice(i, i + CHUNK_SIZE);
    const rows = [
      [
        'Name',
        'Phones',
        'Emails',
        'Addresses',
        'Roles',
        'Links',
        'Description',
      ].join(','),
    ];

    chunk.forEach(user => {
      const { finalName, phones } = buildContactName(user);
      const emails = normalizeArray(user.email).filter(Boolean).map(value => String(value).trim());
      const addresses = normalizeArray(user.address);
      const roles = normalizeArray(user.userRole).filter(Boolean).map(value => String(value).trim());
      const socialLinks = collectSocialLinks(user).map(({ label, url }) => `${label}:${url}`);
      const description = makeCardDescription(user);

      rows.push(
        [
          csvEscape(finalName),
          csvEscape(phones.filter(Boolean).map(value => String(value).trim()).join(' | ')),
          csvEscape(emails.join(' | ')),
          csvEscape(formatAddresses(addresses)),
          csvEscape(roles.join(' | ')),
          csvEscape(socialLinks.join(' | ')),
          csvEscape(description || ''),
        ].join(','),
      );
    });

    const fileSuffix = usersList.length > CHUNK_SIZE ? `_${Math.floor(i / CHUNK_SIZE) + 1}` : '';
    const fileName = `${baseName}${fileSuffix}.csv`;

    const csvBlob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();

    window.URL.revokeObjectURL(url);
  }
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
