export const OBLASTS_UA = [
  'Вінницька', 'Волинська', 'Дніпропетровська', 'Донецька',
  'Житомирська', 'Закарпатська', 'Запорізька', 'Івано-Франківська',
  'Київська', 'Кіровоградська', 'Луганська', 'Львівська',
  'Миколаївська', 'Одеська', 'Полтавська', 'Рівненська',
  'Сумська', 'Тернопільська', 'Харківська', 'Херсонська',
  'Хмельницька', 'Черкаська', 'Чернівецька', 'Чернігівська'
];

export const OBLASTS_RU = [
  'Винницкая', 'Волынская', 'Днепропетровская', 'Донецкая',
  'Житомирская', 'Закарпатская', 'Запорожская', 'Ивано-Франковская',
  'Киевская', 'Кировоградская', 'Луганская', 'Львовская',
  'Николаевская', 'Одесская', 'Полтавская', 'Ровненская',
  'Сумская', 'Тернопольская', 'Харьковская', 'Херсонская',
  'Хмельницкая', 'Черкасская', 'Черновицкая', 'Черниговская'
];

const TRIM_RE = /\s+область$/i;

export const normalizeRegion = region => {
  if (!region || typeof region !== 'string') return region;
  let trimmed = region.trim().replace(/,$/, '');
  const base = trimmed.replace(TRIM_RE, '');
  const lower = base.toLowerCase();
  const uaMatch = OBLASTS_UA.some(o => o.toLowerCase() === lower);
  const ruMatch = OBLASTS_RU.some(o => o.toLowerCase() === lower);
  if ((uaMatch || ruMatch) && !TRIM_RE.test(trimmed)) {
    trimmed = `${base} область`;
  }
  return trimmed;
};

export const normalizeLocation = str => {
  if (!str || typeof str !== 'string') return str;
  const parts = str.split(',');
  const region = parts[0] ? normalizeRegion(parts[0]) : '';
  const city = parts.slice(1).join(',').trim();
  return city ? `${region}, ${city}`.trim() : region;
};
