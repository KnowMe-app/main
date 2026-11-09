import { get, ref, remove, set, update } from 'firebase/database';
import { database, isReactionPermissionDeniedError } from '../config';
import { MATCHING_CARD_PROGRAMS_AT_FIELD } from '../../utils/matchingCardIndex';
import { listProgramBonuses, listPrograms } from '../../utils/donorPrograms';
import { setProgramsTransport } from '../../utils/programsStore';

/*
 * Мережевий бік сховища програм (`utils/programsStore`).
 *
 * Програми — `multiData/programs/{uid}` = `{ updatedAt, items }`; картка несе
 * той самий `updatedAt` як `programsAt`, і пишуться вони одним записом, щоб
 * версія в картці ніколи не випереджала самих програм.
 */

export const PROGRAMS_ROOT = 'multiData/programs';

export const readProgramsFromDb = async uid => {
  const snapshot = await get(ref(database, `${PROGRAMS_ROOT}/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
};

const writeProgramsUpdate = (uid, items, at, { advertise = true } = {}) => {
  const hasItems = items && Object.keys(items).length > 0;
  return update(ref(database), {
    [`${PROGRAMS_ROOT}/${uid}`]: hasItems ? { updatedAt: at, items } : null,
    // Без програм версії немає: картка без `programsAt` не питає нічого.
    // Не несе її й картка, де схована анкета, якій програми належать
    // (`isProgramsOwnerRoleHidden`): програми зберігаються, але не
    // показуються, а версію повертає збереження анкети, яке цю роль покаже
    // знову (`syncMatchingCardIndex`).
    [`matchingCards/${uid}/${MATCHING_CARD_PROGRAMS_AT_FIELD}`]: hasItems && advertise ? at : null,
  });
};

/*
 * Запис програм — один `update` без відступів.
 *
 * Тут стояв ланцюжок «повторити без нових полів» (`stripMonthlyMonths`,
 * `stripExtendedProgramFields`, `stripCustomCoverage`…): поки правила бази
 * викочувались руками, `$other: false` відкидав програму з полем, якого прод
 * ще не знав, і запис повторювався урізаним, а повна версія лишалась у
 * браузері власниці. З 09.11 правила викочує CI після емулятора
 * (`deploy-database-rules.yml`), тож прод знає ті самі поля, що й код, і
 * відмова тепер означає справжню помилку — її треба бачити, а не тихо писати
 * програму без вимог чи виплат.
 */
export const writeProgramsToDb = async (uid, items, at, options = {}) => {
  try {
    await writeProgramsUpdate(uid, items, at, options);
  } catch (error) {
    if (isReactionPermissionDeniedError(error)) {
      console.warn('[programs] база не прийняла програми (PERMISSION_DENIED)', { uid });
    }
    throw error;
  }
};

setProgramsTransport({ read: readProgramsFromDb, write: writeProgramsToDb });

/**
 * Програми, записані ще в анкету (`profileDetails/{uid}/programs`, перша
 * версія), переносяться в окремий вузол і з анкети знімаються. Знімаються
 * лише після вдалого запису: інакше невикочені правила коштували б програм.
 */
export const migrateLegacyProfilePrograms = async (uid, legacyPrograms, save) => {
  if (!uid || !legacyPrograms || typeof legacyPrograms !== 'object' || !Object.keys(legacyPrograms).length) return false;
  await save(uid, legacyPrograms);
  await remove(ref(database, `profileDetails/${uid}/programs`));
  return true;
};

// --- назви доплат, які вже вживають агенції ------------------------------

export const PROGRAM_TERMS_ROOT = 'multiData/programTerms';
const TERMS_CACHE_KEY = 'programTerms:v2';
const TERMS_TTL_MS = 24 * 60 * 60 * 1000;
let termsRequest = null;

/**
 * Ключ назви в словнику: те саме слово, набране з іншим регістром чи
 * пробілами, не стає другою підказкою. Символи, яких ключ бази не терпить,
 * замінюються.
 */
export const buildProgramTermKey = label => String(label || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[.#$/[\]]/g, '_')
  .slice(0, 60);

const readTermsCache = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERMS_CACHE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeTermsCache = (terms, cachedAt = Date.now()) => {
  try {
    window.localStorage.setItem(TERMS_CACHE_KEY, JSON.stringify({ ...terms, cachedAt }));
  } catch {
    // без кеша підказки просто перечитаються завтра
  }
};

const toLabels = node => Object.values(node || {}).filter(value => typeof value === 'string' && value.trim());

/**
 * Назви доплат інших агенцій — підказки для поля «Назва». Один запит на
 * добу на браузер: словник малий і змінюється рідко.
 */
export const loadProgramTerms = () => {
  const cached = readTermsCache();
  if (cached && Date.now() - Number(cached.cachedAt || 0) < TERMS_TTL_MS) {
    return Promise.resolve({ payment: cached.payment || [], bonus: cached.bonus || [], usage: cached.usage || {} });
  }
  if (termsRequest) return termsRequest;
  termsRequest = get(ref(database, PROGRAM_TERMS_ROOT))
    .then(snapshot => {
      const value = snapshot.exists() ? snapshot.val() : {};
      return loadProgramTermUsage().then(usage => {
        const terms = { payment: toLabels(value.payment), bonus: toLabels(value.bonus), usage };
        writeTermsCache(terms);
        return terms;
      });
    })
    .catch(error => {
      console.warn('[programs] не вдалося прочитати назви доплат', error);
      return { payment: cached?.payment || [], bonus: cached?.bonus || [], usage: cached?.usage || {} };
    })
    .finally(() => { termsRequest = null; });
  return termsRequest;
};

/**
 * Дописує в словник назви, яких там ще немає. Правило приймає лише новий
 * ключ, тож повторна назва не переписує чужу — і не пишеться зовсім.
 */
export const rememberProgramTerms = async (kind, labels) => {
  const cached = readTermsCache() || {};
  const known = new Set((cached[kind] || []).map(buildProgramTermKey));
  const fresh = [...new Set(labels.map(label => String(label || '').trim()).filter(label => label.length > 1))]
    .filter(label => !known.has(buildProgramTermKey(label)));
  if (!fresh.length) return;
  await Promise.all(fresh.map(label => set(ref(database, `${PROGRAM_TERMS_ROOT}/${kind}/${buildProgramTermKey(label)}`), label.slice(0, 60))
    .catch(error => {
      // Назва вже є (правило приймає лише новий ключ) або правила ще не
      // викочені — програму це не зачіпає.
      if (!isReactionPermissionDeniedError(error)) console.warn('[programs] назву доплати не записано', label, error);
    })));
  // Свіжість кеша не продовжується: дописане своє — ще не словник інших.
  writeTermsCache({ payment: cached.payment || [], bonus: cached.bonus || [], usage: cached.usage || {}, [kind]: [...(cached[kind] || []), ...fresh] }, Number(cached.cachedAt) || 0);
};

/**
 * Скільки агенцій уживає кожну назву доплати — з самих програм.
 *
 * Словник поповнює кожне автозбереження будь-якої агенції, тож у ньому
 * лежало все: «Тестова доплата», обрізки посеред набору, одноразові назви. І
 * кожна нова агенція бачила це підказками. Підказкою тепер стає лише назва,
 * яку вжили щонайменше дві агенції (`isSuggestedProgramTerm`). Програми
 * відкриті кожному авторизованому й малі, тож це одне читання на добу разом зі
 * словником, а не новий вузол.
 */
export const loadProgramTermUsage = () => get(ref(database, PROGRAMS_ROOT))
  .then(snapshot => {
    const usage = {};
    Object.values(snapshot.exists() ? snapshot.val() || {} : {}).forEach(record => {
      const keys = new Set(listPrograms(record, { includeHidden: false })
        .flatMap(program => listProgramBonuses(program))
        .filter(item => /^(other|bonus)-/.test(item.key))
        .map(item => buildProgramTermKey(item.label))
        .filter(Boolean));
      keys.forEach(key => { usage[key] = (usage[key] || 0) + 1; });
    });
    return usage;
  })
  .catch(() => ({}));

// Скільки різних агенцій мусить ужити назву, щоб її підказувати іншим.
export const PROGRAM_TERM_MIN_OWNERS = 2;
// Тестові назви — словами цілком: «тестостерон» лишається.
const TEST_TERM_RE = /(^|[^\p{L}])(test|testing|тест|тестова|тестовий|тестове|тестові)(?=$|[^\p{L}])/iu;

/** Чи підказувати назву звичайному редакторові програм. */
export const isSuggestedProgramTerm = (label, usage = {}) => (
  !TEST_TERM_RE.test(String(label || ''))
  && (usage[buildProgramTermKey(label)] || 0) >= PROGRAM_TERM_MIN_OWNERS
);

/**
 * Адмін прибирає пропозицію зі словника — обидва роди одним дотиком.
 * Правило дає адмінові переписати й зняти будь-який ключ; на програми, де
 * назва вже вжита, це не впливає — це лише підказка.
 */
export const forgetProgramTerm = async label => {
  const key = buildProgramTermKey(label);
  if (!key) return;
  await Promise.all(['payment', 'bonus'].map(kind => remove(ref(database, `${PROGRAM_TERMS_ROOT}/${kind}/${key}`))));
  const cached = readTermsCache();
  if (cached) {
    const keep = list => (list || []).filter(item => buildProgramTermKey(item) !== key);
    writeTermsCache({ ...cached, payment: keep(cached.payment), bonus: keep(cached.bonus) }, Number(cached.cachedAt) || 0);
  }
};
