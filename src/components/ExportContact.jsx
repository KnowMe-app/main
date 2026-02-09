// Функція для експорту контактів у форматі vCard
import { makeCardDescription } from './makeCardDescription';

const hasCyrillic = value => /[\u0400-\u04FF]/.test(value);
const hasEmoji = value => /[\p{Extended_Pictographic}]/u.test(value);
const hasNonAscii = value => /[^\x20-\x7E]/.test(value);
const hasWhitespace = value => /\s/.test(value);

const normalizeTelegramHandle = value => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const stripped = trimmed.replace(/^@@/, '@');
  const tMeMatch = stripped.match(/t\.me\/([^/?#\s]+)/i);
  if (tMeMatch && tMeMatch[1]) {
    return tMeMatch[1].replace(/^@/, '');
  }
  const atMatch = stripped.match(/@([a-z0-9_.]+)/i);
  if (atMatch && atMatch[1]) {
    return atMatch[1];
  }
  return stripped.replace(/^@/, '').split(/[?#/\s]/)[0];
};

const isValidUrlValue = value => {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (hasWhitespace(trimmed)) return false;
  if (hasNonAscii(trimmed)) return false;
  if (hasCyrillic(trimmed)) return false;
  if (hasEmoji(trimmed)) return false;
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
  const stripped = trimmed.replace(/^@@/, '@');
  const atMatch = stripped.match(/@([a-z0-9_.]+)/i);
  if (atMatch && atMatch[1]) {
    return atMatch[1];
  }
  const match = trimmed.match(/tiktok\.com\/@?([^/?#]+)/i);
  if (match && match[1]) {
    return match[1].replace(/^@/, '');
  }
  return trimmed.replace(/^@/, '').split(/[?#/\s]/)[0];
};

const linkGenerators = {
  telegram: value => {
    const handle = normalizeTelegramHandle(value);
    return handle ? `https://t.me/${handle}` : '';
  },
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
    const invalidLinks = [];
    const normalizedLinks = links
      .filter(Boolean)
      .map(link => {
        const url = generateLink ? generateLink(link) : link;
        const rawValue = String(link).trim();
        if (!isValidUrlValue(rawValue)) {
          invalidLinks.push(rawValue);
          return null;
        }
        if (!isValidUrlValue(url)) {
          invalidLinks.push(rawValue);
          return null;
        }
        return url;
      })
      .filter(Boolean);

    if (normalizedLinks.length) {
      acc.links[label] = normalizedLinks;
    }
    if (invalidLinks.length) {
      acc.invalidLinks.push(...invalidLinks);
    }
    return acc;
  }, { links: {}, invalidLinks: [] });
};

const sanitizeNoteValue = value =>
  String(value ?? '')
    .replace(/\r\n|\r|\n/g, '\\n')
    .trim();

const escapeTextValue = value =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

const foldLine = (line, maxLength = 75) => {
  if (line.length <= maxLength) return [line];
  const parts = [];
  let remaining = line;
  while (remaining.length > maxLength) {
    parts.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  if (remaining) {
    parts.push(remaining);
  }
  return parts.reduce((acc, part, index) => {
    if (index === 0) {
      acc.push(part);
    } else {
      acc.push(` ${part}`);
    }
    return acc;
  }, []);
};

const validateContentLine = line => {
  if (!line) return false;
  if (/^[ \t]/.test(line)) return true;
  return line.includes(':');
};

const normalizeVCardLines = lines => {
  const physicalLines = [];
  lines.forEach(line => {
    if (!line) return;
    const folded = foldLine(line);
    folded.forEach(physicalLine => {
      if (validateContentLine(physicalLine)) {
        physicalLines.push(physicalLine);
      }
    });
  });

  return physicalLines.filter(Boolean);
};

const safeAddLine = (lines, line) => {
  if (!line) return;
  if (!validateContentLine(line)) {
    if (lines.length && /^[ \t]/.test(line)) {
      lines[lines.length - 1] += line.trimStart();
      return;
    }
    console.warn('Invalid vCard content line skipped:', line);
    return;
  }
  lines.push(line);
};

export const makeVCard = user => {
  // Формуємо vCard
  const lines = [];
  safeAddLine(lines, 'BEGIN:VCARD');
  safeAddLine(lines, 'VERSION:3.0');

  const finalName = getContactName(user);
  const phones = Array.isArray(user.phone) ? user.phone : [user.phone];

  safeAddLine(lines, `FN;CHARSET=UTF-8:${escapeTextValue(finalName)}`);
  safeAddLine(lines, `N;CHARSET=UTF-8:${escapeTextValue(finalName)};;;;`);

  // Обробка телефонів
  phones.forEach(phone => {
    if (phone) {
      safeAddLine(lines, `TEL;TYPE=CELL:+${String(phone).trim()}`);
    }
  });

  // Обробка email
  const emails = Array.isArray(user.email) ? user.email : [user.email];
  emails.forEach(email => {
    if (email) {
      safeAddLine(lines, `EMAIL;CHARSET=UTF-8;TYPE=HOME:${email.trim()}`);
    }
  });

  // Обробка адрес
  const addresses = Array.isArray(user.address) ? user.address : [user.address];
  addresses.forEach(address => {
    if (address) {
      const { street = '', city = '', region = '', country = '' } = address;
      safeAddLine(
        lines,
        `ADR;CHARSET=UTF-8;TYPE=HOME:;;${escapeTextValue(street.trim())};${escapeTextValue(
          city.trim(),
        )};${escapeTextValue(region.trim())};${escapeTextValue(country.trim())}`,
      );
    }
  });

  // Обробка ролей
  const roles = Array.isArray(user.userRole) ? user.userRole : [user.userRole];
  roles.forEach(role => {
    if (role) {
      safeAddLine(lines, `TITLE;CHARSET=UTF-8:${escapeTextValue(role.trim())}`);
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
  Object.entries(socialLinks.links).forEach(([label, links]) => {
    links.forEach(url => {
      safeAddLine(lines, `URL;CHARSET=UTF-8;TYPE=${label}:${url}`);
    });
  });

  // Опис карти з використанням makeCardDescription
  const description = makeCardDescription(user);
  const sanitizedDescription = sanitizeNoteValue(description);
  const invalidUrlsNote = socialLinks.invalidLinks.length
    ? `Invalid URLs: ${socialLinks.invalidLinks.join(', ')}`
    : '';
  const combinedNote = [sanitizedDescription, invalidUrlsNote]
    .filter(Boolean)
    .join('\\n')
    .trim();

  if (combinedNote) {
    safeAddLine(lines, `NOTE;CHARSET=UTF-8:${escapeTextValue(combinedNote)}`);
  }

  safeAddLine(lines, 'END:VCARD');

  const normalizedLines = normalizeVCardLines(lines);
  return `${normalizedLines.join('\r\n')}\r\n`;
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
      try {
        contactVCard += makeVCard(user);
      } catch (error) {
        const userId = user?.userId ?? user?.id ?? 'unknown';
        console.warn('Skipping invalid contact:', userId, error);
      }
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
  const socialLinksMap = socialLinks.links;

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
    stringifyList(socialLinksMap.Telegram || []),
    stringifyList(socialLinksMap.Instagram || []),
    stringifyList(socialLinksMap.TikTok || []),
    stringifyList(socialLinksMap.Facebook || []),
    stringifyList(socialLinksMap.VK || []),
    stringifyList(socialLinksMap.OtherLink || []),
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
