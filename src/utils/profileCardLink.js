/**
 * Посилання на картку всередині застосунку й контакт для телефонної книжки.
 *
 * Посилання — це адреса, а не доступ: `/matching?card={id}` відкриває картку
 * тим самим шляхом, що й видача пошуку (`readSharedMatchingCard` у
 * `config.js`), тож отримувач бачить рівно те, що йому дають правила бази, —
 * а без входу не бачить нічого (`RequireAuth` веде на `/login` і повертає
 * сюди ж). У посиланні стоїть id картки, а не телефон чи нік: id нічого не
 * розкриває (саму картку `matchingCards` і так читає кожен, хто увійшов), а
 * номер в адресі поїхав би отримувачеві, превʼю месенджера й історії
 * браузера навіть тоді, коли контакти йому правила не відкривають.
 *
 * Без входу анкету показує інше — знімок `/p/:token`, який власниця випустила
 * сама (`utils/profileShare`). Плутати їх не можна: тут — «для тих, хто має
 * акаунт», там — «для будь-кого з посиланням».
 */
import { MATCHING_PATH } from './matchingSearchLocation';

export const MATCHING_CARD_QUERY_PARAM = 'card';

// Ключ RTDB не містить `. # $ [ ] /`, тож id з такими знаками — не картка, а
// підсунутий шлях. Довжина — з запасом над UID (28) і push-ключем (20).
export const isShareableCardId = value => typeof value === 'string'
  && value.length > 0
  && value.length <= 128
  && !/[.#$[\]/\s\\]/.test(value);

export const readSharedCardIdFromSearch = search => {
  try {
    const value = new URLSearchParams(search || '').get(MATCHING_CARD_QUERY_PARAM) || '';
    return isShareableCardId(value.trim()) ? value.trim() : '';
  } catch {
    return '';
  }
};

export const buildProfileCardPath = cardId => (isShareableCardId(cardId)
  ? `${MATCHING_PATH}?${MATCHING_CARD_QUERY_PARAM}=${encodeURIComponent(cardId)}`
  : MATCHING_PATH);

export const buildProfileCardUrl = (cardId, origin = typeof window !== 'undefined' ? window.location.origin : '') => {
  // Застосунок живе в корені knowme.pp.ua (див. `buildProfileShareUrl`).
  const base = process.env.PUBLIC_URL || '';
  return `${origin}${base}${buildProfileCardPath(cardId)}`;
};

/** Адреса повернення після входу веде на картку за посиланням. */
export const isProfileCardReturnTo = returnTo => {
  if (typeof returnTo !== 'string' || !returnTo.startsWith(MATCHING_PATH)) return false;
  const queryStart = returnTo.indexOf('?');
  return queryStart >= 0 && Boolean(readSharedCardIdFromSearch(returnTo.slice(queryStart)));
};

const currentValue = value => {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (value[index] === null || value[index] === undefined) continue;
      return String(value[index]).trim();
    }
    return '';
  }
  return value === null || value === undefined ? '' : String(value).trim();
};

/**
 * Імʼя контакту в телефоні: «KM Імʼя Прізвище». Приставка одна для всіх ролей
 * — за нею контакти з KnowMe знаходяться в книжці одним пошуком «KM». Прізвище
 * — те, яке бачить читач: повне з анкети, інакше ініціал з картки стрічки.
 * Організацію називає назва.
 */
export const buildContactCardName = ({ name, surname, agencyName } = {}) => {
  const organisation = currentValue(agencyName);
  const person = [currentValue(name), currentValue(surname)].filter(Boolean).join(' ');
  const body = organisation && person && organisation !== currentValue(name)
    ? `${organisation} (${person})`
    : organisation || person;
  return body ? `KM ${body}` : 'KM';
};

const escapeVCardText = value => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const VCARD_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

// vCard 3.0 обмежує рядок 75 октетами; довгий (фото в base64) складається
// продовженнями з пробілом на початку. Base64 — ASCII, тож символ = октет.
const foldVCardLine = line => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) parts.push(` ${line.slice(index, index + 74)}`);
  return parts.join('\r\n');
};

/*
 * Номер для vCard. «+» дописується лише туди, де код країни видно: номер
 * міжнародного вигляду без плюса (380…, 11+ цифр і не з нуля). Місцевий
 * «0501112233» лишається як є — з плюсом він став би неіснуючим міжнародним
 * номером, а набрати його з книжки вже не вийшло б. Ту саму форму без плюса
 * приймає рядок контактів (`ProfileRow.phoneFormat.test.js`), тож вгадувати
 * країну тут не можна.
 */
export const normalizeVCardPhone = phone => {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\+/g, '')}`;
  const digits = raw.replace(/\+/g, '');
  return digits.length >= 11 && !digits.startsWith('0') ? `+${digits}` : digits;
};

/**
 * vCard 3.0 з того, що читач і так бачить на екрані: номери, пошта, посилання
 * каналів, головне фото й місто. Опису анкети тут немає (на відміну від
 * адмінського `makeVCard`): у телефонну книжку йде контакт, а анкета — за
 * посиланням, щоб у книжці не лежала копія, яка старіє. Фото й місто — на
 * прохання власниці продукту (20.11): без них у книжці лежав сірий кружок без
 * жодного знаку, хто це. Посилання на картку стоїть першим URL.
 */
export const buildReaderVCard = ({
  name = 'KM',
  roleLabel = '',
  phones = [],
  emails = [],
  links = [],
  cardUrl = '',
  photoJpegBase64 = '',
  address = null,
} = {}) => {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`FN;CHARSET=UTF-8:${escapeVCardText(name)}`);
  lines.push(`N;CHARSET=UTF-8:${escapeVCardText(name)};;;;`);
  if (roleLabel) lines.push(`TITLE;CHARSET=UTF-8:${escapeVCardText(roleLabel)}`);
  const city = String(address?.city || '').trim();
  const region = String(address?.region || '').trim();
  const country = String(address?.country || '').trim();
  if (city || region || country) {
    lines.push(`ADR;TYPE=HOME;CHARSET=UTF-8:;;;${escapeVCardText(city)};${escapeVCardText(region)};;${escapeVCardText(country)}`);
  }
  if (/^[A-Za-z0-9+/=]+$/.test(photoJpegBase64 || '')) {
    lines.push(foldVCardLine(`PHOTO;ENCODING=b;TYPE=JPEG:${photoJpegBase64}`));
  }
  const seenPhones = new Set();
  phones.forEach(phone => {
    const normalized = normalizeVCardPhone(phone);
    if (normalized.length < 6 || seenPhones.has(normalized)) return;
    seenPhones.add(normalized);
    lines.push(`TEL;TYPE=CELL:${normalized}`);
  });
  emails.forEach(email => {
    const trimmed = String(email || '').trim();
    if (trimmed && /^[^\s@]+@[^\s@]+$/.test(trimmed)) lines.push(`EMAIL;TYPE=INTERNET:${trimmed}`);
  });
  const urls = [cardUrl, ...links].filter(url => VCARD_URL_PATTERN.test(String(url || '')));
  [...new Set(urls)].forEach(url => lines.push(`URL:${url}`));
  if (cardUrl && VCARD_URL_PATTERN.test(cardUrl)) {
    lines.push(`NOTE;CHARSET=UTF-8:${escapeVCardText(`KnowMe: ${cardUrl}`)}`);
  }
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
};

/**
 * Головне фото для контакту — JPEG до 480 px у base64, або порожньо.
 *
 * Береться мініатюра стрічки (вона вже в кеші браузера), перемальовується на
 * полотні: Android і iOS приймають у vCard JPEG, а мініатюра буває й іншим
 * форматом, і зайві сотні КБ у файлі контакту нікому не потрібні. Читає байти
 * `fetch` — бакет пускає домен сайту (`storage.cors.json`); не вийшло за
 * `timeoutMs` чи впало — контакт зберігається без фото.
 */
export const loadContactPhotoJpegBase64 = async (url, { maxSide = 480, timeoutMs = 4000 } = {}) => {
  if (!/^https?:\/\//i.test(String(url || '')) || typeof fetch !== 'function'
    || typeof document === 'undefined' || typeof createImageBitmap !== 'function') return '';
  const work = (async () => {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return '';
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.startsWith('data:image/jpeg;base64,') ? dataUrl.slice('data:image/jpeg;base64,'.length) : '';
  })();
  const timeout = new Promise(resolve => { setTimeout(() => resolve(''), timeoutMs); });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return '';
  }
};

// Імʼя файлу — латиницею: Chromium відкидає `download` з кирилицею й називає
// файл «download» без розширення, тож телефон не впізнавав би в ньому контакт.
// Кирилиця транслітерується (інакше всі файли звались би однаково), а імʼя
// самого контакту в книжці дає `FN` усередині файлу.
const FILE_NAME_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ю: 'yu', я: 'ya', ё: 'yo', ы: 'y', э: 'e', ъ: '',
};
const transliterateForFileName = value => Array.from(String(value || '')).map(char => {
  const lower = char.toLowerCase();
  const mapped = FILE_NAME_LATIN[lower];
  if (mapped === undefined) return char;
  return char !== lower && mapped ? mapped[0].toUpperCase() + mapped.slice(1) : mapped;
}).join('');

export const buildContactFileName = name => {
  const safe = transliterateForFileName(name)
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${safe && safe !== 'KM' ? safe : 'KnowMe_contact'}.vcf`;
};

/**
 * Віддає контакт телефону: Android відкриває файл у «Контактах», iOS показує
 * картку з «Створити контакт». `navigator.share` з файлом тут не беремо:
 * Android пропонує тоді месенджери, а не книжку.
 */
export const downloadReaderVCard = ({ vcard, name, doc = typeof document !== 'undefined' ? document : null }) => {
  if (!doc || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = buildContactFileName(name);
  link.rel = 'noopener';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

/**
 * Поділитися посиланням: на телефоні — системне меню (Telegram, Viber…), де
 * його немає — буфер обміну. `cancelled` — людина закрила меню сама, і
 * копіювати «замість» не треба.
 */
export const shareProfileCardLink = async ({
  url,
  title = '',
  text = '',
  nav = typeof navigator !== 'undefined' ? navigator : null,
} = {}) => {
  if (!url) return 'failed';
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // Інша відмова (немає жесту, заборона в рамці) — далі буфер обміну.
    }
  }
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    // Буфер закритий — лишається показати посилання людині.
  }
  return 'failed';
};

/**
 * Відповідь бази з межею часу: без мережі `get` не падає, а висить, і
 * посилання стояло б на «Відкриваю…» без кінця. `timeout` — окремий
 * результат, а не «картки немає»: збій мережі не мусить читатись як
 * «анкету приховали».
 */
export const SHARED_CARD_READ_TIMEOUT_MS = 10000;
export const withSharedCardTimeout = (promise, ms = SHARED_CARD_READ_TIMEOUT_MS) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms);
  Promise.resolve(promise).then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); },
  );
});
