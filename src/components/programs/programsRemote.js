import { get, ref, remove, set, update } from 'firebase/database';
import { database, isReactionPermissionDeniedError } from '../config';
import { MATCHING_CARD_PROGRAMS_AT_FIELD } from '../../utils/matchingCardIndex';
import { listProgramBonuses, listPrograms, PROGRAM_WISH_FIELDS } from '../../utils/donorPrograms';
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

/**
 * Програми без кількості місяців щомісячної виплати.
 *
 * `payments.monthly.months` — ключ, якого правила знають лише після ручного
 * викочування (`$other: false` на виплаті). Доти програма з ним відлітала б
 * цілком, разом із сумами, — тож запис повторюється без нього, а підсумок
 * рахує орієнтовні дев'ять місяців (`DEFAULT_MONTHLY_MONTHS`).
 */
export const stripMonthlyMonths = items => Object.fromEntries(Object.entries(items || {}).map(([id, program]) => {
  const monthly = program?.payments?.monthly;
  if (!monthly || monthly.months === undefined) return [id, program];
  const { months: _months, ...rest } = monthly;
  return [id, { ...program, payments: { ...program.payments, monthly: rest } }];
}));

/**
 * Поля програми, яких правила не знають до ручного викочування: вид суми,
 * «до …» з умовою, подробиці виплат графіка, рівні вимог, етапи, переїзд,
 * подробиці покриття, вибрані ознаки. На кожному з них `$other: false`
 * відкинув би програму цілком — тож запис повторюється без них, а повна
 * версія лишається в браузері власниці (`programsStore`).
 */
// Найновіші поля — рід виплати (`guaranteed`: у суму програми чи
// перемикачем у картці), а зі старших записів — `counting` і `featured`. Їх
// знімається спершу окремо: правила, що вже знають решту розширених полів,
// не мусять коштувати агенції назви, етапів і графіка лише через ці. Без
// `guaranteed` у базі виплата бере типовий рід (`isGuaranteedPayment`).
const NEWEST_PROGRAM_FIELDS = Object.freeze(['featured', 'customRequirements', 'customCoverage']);
const NEWEST_PAYMENT_FIELDS = Object.freeze(['counting', 'guaranteed']);
const EXTENDED_PROGRAM_FIELDS = Object.freeze(['name', 'payKind', 'payMax', 'startNow', 'requirementMeta', 'stages', 'relocation', 'coverageDetails', 'highlights', ...NEWEST_PROGRAM_FIELDS]);
const EXTENDED_PAYMENT_FIELDS = Object.freeze(['when', 'condition', 'includes', ...NEWEST_PAYMENT_FIELDS]);

const omit = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));

const stripProgramFields = (items, programFields, paymentFields) => Object.fromEntries(Object.entries(items || {}).map(([id, program]) => {
  if (!program || typeof program !== 'object') return [id, program];
  const next = omit(program, programFields);
  if (program.payments) {
    next.payments = Object.fromEntries(Object.entries(program.payments).map(([key, money]) => [key, omit(money, paymentFields)]));
  }
  if (Array.isArray(program.otherPayments)) next.otherPayments = program.otherPayments.map(item => omit(item, paymentFields));
  if (Array.isArray(program.bonuses) && paymentFields.includes('condition')) next.bonuses = program.bonuses.map(item => omit(item, ['condition']));
  return [id, next];
}));

export const stripExtendedProgramFields = items => stripProgramFields(items, EXTENDED_PROGRAM_FIELDS, EXTENDED_PAYMENT_FIELDS);
export const stripNewestProgramFields = items => stripProgramFields(items, NEWEST_PROGRAM_FIELDS, NEWEST_PAYMENT_FIELDS);
// Власні вимоги агенції (`customRequirements`) — найсвіжіше поле: правила,
// що вже знають `guaranteed`, не мусять коштувати агенції роду виплат лише
// через нього, тож спершу знімається саме воно.
export const stripCustomRequirements = items => stripProgramFields(items, ['customRequirements'], []);
// Своє в «Що ще дає програма» (`customCoverage`) — ще свіжіше: спершу
// знімається лише воно, потім разом із власними вимогами.
export const stripCustomCoverage = items => stripProgramFields(items, ['customCoverage'], []);

/**
 * Програми без найновіших вимог (група крові, АМГ, «звідки не беруть») і з
 * коментарем у старій межі 600 знаків. Поки правила не викочено, ці поля
 * відкинули б програму цілком; знімаються вони першими й лишаються знятими
 * в кожному наступному відступі — усі старші версії правил їх теж не знають.
 */
const LATEST_REQUIREMENT_FIELDS = Object.freeze(['bloodGroups', 'amhFrom', 'regionsExcluded']);
const LEGACY_NOTE_MAX_LENGTH = 600;
export const stripLatestRequirementFields = items => Object.fromEntries(Object.entries(items || {}).map(([id, program]) => {
  if (!program || typeof program !== 'object') return [id, program];
  const next = { ...program };
  if (program.requirements) next.requirements = omit(program.requirements, LATEST_REQUIREMENT_FIELDS);
  if (typeof program.note === 'string' && program.note.length > LEGACY_NOTE_MAX_LENGTH) next.note = program.note.slice(0, LEGACY_NOTE_MAX_LENGTH);
  return [id, next];
}));

/**
 * Програми без побажань до донорки (`PROGRAM_WISH_FIELDS`: колір очей,
 * волосся, освіта). Найновіші поля — знімаються першими й лишаються знятими
 * в кожному наступному відступі.
 */
export const stripProgramWishFields = items => Object.fromEntries(Object.entries(items || {}).map(([id, program]) => {
  if (!program || typeof program !== 'object' || !program.requirements) return [id, program];
  return [id, { ...program, requirements: omit(program.requirements, PROGRAM_WISH_FIELDS) }];
}));

export const writeProgramsToDb = async (uid, items, at, options = {}) => {
  try {
    await writeProgramsUpdate(uid, items, at, options);
  } catch (error) {
    if (!isReactionPermissionDeniedError(error)) throw error;
    // Від новішого до старішого: спершу без нових полів, далі ще й без
    // кількості місяців — кожна з цих версій правил у проді вже бувала.
    const withoutWishes = stripProgramWishFields(items);
    const base = stripLatestRequirementFields(withoutWishes);
    const fallbacks = [withoutWishes, base, stripCustomCoverage(base), stripCustomRequirements(stripCustomCoverage(base)), stripNewestProgramFields(base), stripExtendedProgramFields(base), stripMonthlyMonths(stripExtendedProgramFields(base))];
    let previous = JSON.stringify(items);
    for (const fallback of fallbacks) {
      const serialized = JSON.stringify(fallback);
      if (serialized === previous) continue;
      previous = serialized;
      try {
        await writeProgramsUpdate(uid, fallback, at, options);
        console.warn('[programs] правила бази ще не знають частини полів програм — програми записано без них, повна версія лишилась у цьому браузері. Викотіть правила: npx firebase deploy --only database', { uid });
        return { partial: true };
      } catch (retryError) {
        if (!isReactionPermissionDeniedError(retryError)) throw retryError;
      }
    }
    console.warn('[programs] база не прийняла програми — правила `multiData/programs` і `matchingCards/…/programsAt` викочуються руками: npx firebase deploy --only database', { uid });
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
