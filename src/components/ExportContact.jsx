// Функція для експорту контактів у форматі vCard
import { makeCardDescription } from './makeCardDescription';

const hasCyrillic = value => /[\u0400-\u04FF]/.test(value);
const hasEmoji = value => /[\p{Extended_Pictographic}]/u.test(value);
const hasNonAscii = value => /[^\x20-\x7E]/.test(value);
const hasWhitespace = value => /\s/.test(value);

export const normalizeContactPhoneForExport = value =>
  String(value ?? '').replace(/\s+/g, '');

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

const parseBirthDate = value => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const dottedMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const day = dottedMatch ? Number(dottedMatch[1]) : isoMatch ? Number(isoMatch[3]) : null;
  const month = dottedMatch ? Number(dottedMatch[2]) : isoMatch ? Number(isoMatch[2]) : null;
  const year = dottedMatch ? Number(dottedMatch[3]) : isoMatch ? Number(isoMatch[1]) : null;

  if (!day || !month || !year) return null;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const calculateAge = birth => {
  const birthDate = parseBirthDate(birth);
  if (!birthDate) return '';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  return Number.isFinite(age) && age >= 0 ? String(age) : '';
};

const hasNegativeRh = blood => {
  const normalized = String(blood || '').trim().toLowerCase().replace(/\s+/g, '');
  return normalized.endsWith('-') || normalized === '-';
};

const isCsectionDate = value => /^(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{1,2}-\d{1,2})$/.test(String(value || '').trim());

const getCsectionMarker = value => {
  if (Array.isArray(value)) {
    const items = value.map(item => String(item || '').trim()).filter(Boolean);
    if (!items.length) return '';

    const numericCounts = items
      .filter(item => /^\d+$/.test(item))
      .map(item => Number.parseInt(item, 10))
      .filter(count => count > 0);

    if (numericCounts.length) return `кс${Math.max(...numericCounts)}`;
    return `кс${items.length}`;
  }

  const raw = String(value || '').trim().toLowerCase();
  if (!raw || ['не було', 'no', 'ні', '-', '0', 'false', 'cs0'].includes(raw)) return '';
  if (isCsectionDate(raw)) return 'кс1';
  if (raw === '++') return 'кс2';
  if (raw === '+++') return 'кс3';

  const match = raw.match(/(?:^|\b)([1-9]\d*)(?:\b|$)/);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    return count > 0 ? `кс${count}` : '';
  }

  if (['+', 'plus', 'yes', 'так', 'було', 'кс', 'cs1'].includes(raw)) return 'кс1';
  return '';
};

const isMarried = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['yes', 'так', '+', 'married', 'одружена', 'заміжня', 'замужем'].includes(normalized);
};

const normalizeNumericValue = value => {
  if (Array.isArray(value)) {
    const parsed = value.map(normalizeNumericValue).find(number => Number.isFinite(number));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);

  if (!normalized) return null;

  const number = Number.parseFloat(normalized[0]);
  return Number.isFinite(number) ? number : null;
};

const calculateImt = user => {
  const directImt = normalizeNumericValue(user.imt ?? user.bmi);
  if (Number.isFinite(directImt)) return directImt;

  const height = normalizeNumericValue(user.height);
  const weight = normalizeNumericValue(user.weight);
  if (!height || !weight) return null;

  const heightInMeters = height > 3 ? height / 100 : height;
  if (heightInMeters <= 0) return null;

  const imt = weight / (heightInMeters * heightInMeters);
  return Number.isFinite(imt) ? imt : null;
};

const getImtMarker = user => {
  const imt = calculateImt(user);
  if (!Number.isFinite(imt) || imt <= 28) return '';
  return `імт${imt.toFixed(1)}`;
};

const getContactNameMarkers = user => [
  calculateAge(user.birth),
  hasNegativeRh(user.blood) ? 'рк-' : '',
  getCsectionMarker(user.csection),
  getImtMarker(user),
  isMarried(user.maritalStatus) ? 'заміжня' : '',
].filter(Boolean);

const getContactName = user => {
  const prefix = getPrefix(user);
  const phones = (Array.isArray(user.phone) ? user.phone : [user.phone])
    .map(normalizeContactPhoneForExport);
  const firstPhone = phones.find(phone => phone);

  const names = Array.isArray(user.name) ? user.name : [user.name];
  const surnames = Array.isArray(user.surname) ? user.surname : [user.surname];
  const fathersNames = Array.isArray(user.fathersname) ? user.fathersname : [user.fathersname];

  const primaryNameParts = cleanedNameParts(names);
  const secondaryNameParts = [
    ...cleanedNameParts(surnames),
    ...cleanedNameParts(fathersNames),
  ];
  const markerParts = getContactNameMarkers(user);
  const hasPersonalName = primaryNameParts.length || secondaryNameParts.length;
  const fullNameParts = [
    ...primaryNameParts,
    ...markerParts,
    ...secondaryNameParts,
    ...(!hasPersonalName && firstPhone ? [String(firstPhone).trim()] : []),
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
  const phones = (Array.isArray(user.phone) ? user.phone : [user.phone])
    .map(normalizeContactPhoneForExport);

  safeAddLine(lines, `FN;CHARSET=UTF-8:${escapeTextValue(finalName)}`);
  safeAddLine(lines, `N;CHARSET=UTF-8:${escapeTextValue(finalName)};;;;`);

  // Обробка телефонів
  phones.forEach(phone => {
    if (phone) {
      safeAddLine(lines, `TEL;TYPE=CELL:+${phone}`);
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

export const isSingleUserPayload = data =>
  Boolean(
    data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      (
        Object.prototype.hasOwnProperty.call(data, 'userId') ||
        Object.prototype.hasOwnProperty.call(data, 'name') ||
        Object.prototype.hasOwnProperty.call(data, 'phone')
      ),
  );

export const saveToContact = data => {
  // Максимум 5000 контактів у кожному файлі; кількість файлів не обмежуємо.
  const CHUNK_SIZE = 5000;
  let usersList = [];
  let baseName = 'contacts';

  if (isSingleUserPayload(data)) {
    // Один користувач (навіть якщо поле name порожнє)
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
  const phones = (Array.isArray(user.phone) ? user.phone : [user.phone])
    .map(normalizeContactPhoneForExport);
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
  const CHUNK_SIZE = 5000;
  let usersList = [];
  let baseName = 'contacts';

  if (isSingleUserPayload(data)) {
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
