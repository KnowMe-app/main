/**
 * Програми агенцій і клінік — що саме вони пропонують донорці чи сурогатній
 * мамі.
 *
 * Досі агенція казала про себе лише «Про себе», а донорка бачила в стрічці її
 * зріст і вагу. Пропозиції ж жили в чатах картинками: «до 35 років, можна з
 * 1 КР, 20 000 $ + 500 $ щомісяця, перенос 400 $, КС +2 000 $». Одна агенція
 * веде кілька програм одночасно — в Україні й у Грузії, для різного віку, з
 * різними доплатами, — і в чаті їх розрізняють лише за кольором картинки.
 *
 * Тут програма — окремий запис зі своїми вимогами, виплатами, можливими
 * доплатами й тим, що агенція покриває. Лежать програми не в анкеті й не в
 * картці стрічки, а окремо — `multiData/programs/{uid}` (`utils/programsStore`):
 * вони не приватні, тож відкриті кожному авторизованому, а картка несе про них
 * сам лише час останньої зміни (`programsAt`) — щоб кеш браузера знав, чи
 * його копія ще чинна.
 *
 * Модуль чистий: жодної мережі, лише форма даних і правила порівняння.
 * Програми картки, прочитані окремо, він бере через `setCardProgramsLookup`.
 */

import {
  DEFAULT_PROGRAM_CURRENCY,
  convertProgramAmount,
  normalizeProgramMoney,
  programMoneyInUsd,
} from './programCurrency';
import { listProfileRoles, listViewerRoles } from './matchingPeerVisibility';

export const PROGRAM_TYPES = Object.freeze(['ed', 'sm']);

export const hasVisibleOrganisationRole = card => {
  const roles = listProfileRoles(card);
  // Legacy/program-only fixtures have no projected role. An explicit role is
  // authoritative, which is what keeps a hidden organisation role hidden.
  return !roles.length || roles.some(role => role === 'ag' || role === 'cl');
};

export const PROGRAM_TYPE_LABELS = Object.freeze({
  ed: 'Донор ооцитів',
  sm: 'Сурогатна мати',
});

/**
 * Виплати за типом програми. Перша — головна: саме вона йде в діапазон
 * рядка стрічки, у фільтр і в сортування.
 *
 * `bonus` — **можлива** доплата: її отримує не кожна, а та, з ким щось
 * сталося (досвід, КС, двійня, вагітність з першої спроби). У чатах агенцій
 * вона стояла в одному стовпчику з гарантованим, і сума «20 000 + 2 000 за КС»
 * читалась як 22 000. Тому ці два переліки живуть окремими блоками і в
 * редакторі, і в показі, а в загальну суму можливе не входить.
 */
export const PROGRAM_PAYMENT_FIELDS = Object.freeze({
  ed: Object.freeze([
    { key: 'final', label: 'Винагорода за цикл' },
    { key: 'repeat', label: 'Повторна донація', bonus: true },
    { key: 'experience', label: 'Доплата за досвід', bonus: true },
  ]),
  sm: Object.freeze([
    { key: 'final', label: 'Фінальна виплата' },
    { key: 'monthly', label: 'Щомісячно' },
    { key: 'transfer', label: 'Перенос ембріона' },
    { key: 'contract', label: 'Підписання договору' },
    { key: 'cSection', label: 'Кесарів розтин', bonus: true },
    { key: 'twins', label: 'Двійня', bonus: true },
    { key: 'firstTry', label: 'Вагітність з першої спроби', bonus: true },
    { key: 'experience', label: 'Доплата за досвід СМ', bonus: true },
  ]),
});

/**
 * Загальна сума за програму, введена агенцією рукою. Нові програми її не
 * пишуть — загальну суму рахує `programBreakdown` з самих виплат, — а старі
 * записи без жодної окремої виплати показуються через неї.
 */
export const PROGRAM_TOTAL_FIELD = 'total';

/**
 * Щомісячна виплата сама по собі нічого не каже про заробіток: «500 $
 * щомісяця» — це 4 500 $ за дев'ять місяців. Тож поруч із сумою лежить
 * кількість місяців (`payments.monthly.months`), а коли агенція її не
 * вказала, рахунок бере тривалість вагітності й позначає її як орієнтовну.
 */
export const DEFAULT_MONTHLY_MONTHS = 9;
export const MAX_MONTHLY_MONTHS = 24;

export const listGuaranteedPaymentFields = type => (PROGRAM_PAYMENT_FIELDS[type] || []).filter(field => !field.bonus);
export const listBonusPaymentFields = type => (PROGRAM_PAYMENT_FIELDS[type] || []).filter(field => field.bonus);

export const PROGRAM_COVERAGE_OPTIONS = Object.freeze([
  { key: 'travel', label: 'Проїзд' },
  { key: 'housing', label: 'Житло' },
  { key: 'food', label: 'Харчування' },
  { key: 'clothes', label: 'Одяг' },
  { key: 'exams', label: 'Обстеження' },
  { key: 'insurance', label: 'Страховка' },
  { key: 'legal', label: 'Юридичний супровід' },
  { key: 'notary', label: 'Нотаріальний договір' },
  { key: 'support', label: 'Супровід 24/7' },
  { key: 'family', label: 'Переїзд із сімʼєю' },
]);

export const PROGRAM_RH_OPTIONS = Object.freeze([
  { key: 'any', label: 'Будь-який' },
  { key: '+', label: 'Лише Rh+' },
  { key: '-', label: 'Лише Rh−' },
]);

export const PROGRAM_MARITAL_OPTIONS = Object.freeze([
  { key: 'any', label: 'Не має значення' },
  { key: 'unmarried', label: 'Лише незаміжня' },
  { key: 'married', label: 'Лише заміжня' },
]);

export const PROGRAM_KIDS_OPTIONS = Object.freeze([
  { key: 'any', label: 'Не має значення' },
  { key: 'required', label: 'Потрібна власна дитина' },
]);

export const PROGRAM_CSECTION_OPTIONS = Object.freeze([
  { key: 'any', label: 'Не має значення' },
  { key: '0', label: 'Без КР' },
  { key: '1', label: 'Можна з 1 КР' },
  { key: '2', label: 'До 2 КР' },
]);

/** Послуги агенції чи клініки — чіпи в анкеті й у рядку стрічки. */
export const AGENCY_SERVICE_OPTIONS = Object.freeze([
  { key: 'ed', label: 'Донорство ооцитів' },
  { key: 'sm', label: 'Сурогатне материнство' },
  { key: 'ivf', label: 'ЕКЗ' },
  { key: 'cryo', label: 'Кріобанк' },
  { key: 'legal', label: 'Юридичний супровід' },
]);

/** Кого шукають біологічні батьки. */
export const PARENT_SEEKING_OPTIONS = Object.freeze([
  { key: 'ed', label: 'Донорку ооцитів' },
  { key: 'sm', label: 'Сурогатну маму' },
  { key: 'both', label: 'Обох' },
]);

export const PARENT_VIA_OPTIONS = Object.freeze([
  { key: 'agency', label: 'Через агенцію' },
  { key: 'clinic', label: 'Через клініку' },
  { key: 'direct', label: 'Напряму' },
]);

export const MAX_PROGRAMS = 12;
const MAX_TEXT = 80;
const MAX_NOTE = 600;

const text = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);

const wholeNumber = (value, { min = 0, max = 1000 } = {}) => {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  if (!Number.isFinite(n) || String(value ?? '').trim() === '') return null;
  const rounded = Math.round(n * 10) / 10;
  return rounded >= min && rounded <= max ? rounded : null;
};

const pickOption = (value, options, fallback = 'any') => {
  const key = String(value ?? '').trim();
  return options.some(option => option.key === key) ? key : fallback;
};

export const programSeeksDonor = program => program?.type !== 'sm';

/** Порожня програма для кнопки «Додати програму». */
export const createEmptyProgram = (type = 'ed', id = `p${Date.now().toString(36)}`) => ({
  id,
  type,
  location: '',
  requirements: { rh: 'any', marital: 'any', ownKids: 'any', csectionMax: 'any' },
  payments: { final: { amount: '', currency: DEFAULT_PROGRAM_CURRENCY } },
  otherPayments: [],
  bonuses: [],
  coverage: [],
  note: '',
});

/**
 * Приводить програму до форми, яку можна записати й показати.
 *
 * Порожні суми й вимоги зникають зовсім, а не лягають нулями: «0 $ за
 * двійню» і «про двійню нічого не сказано» — різні речі.
 */
export const normalizeProgram = (raw, id) => {
  if (!raw || typeof raw !== 'object') return null;
  const type = PROGRAM_TYPES.includes(raw.type) ? raw.type : 'ed';
  const requirementsRaw = raw.requirements || {};
  const requirements = {
    rh: pickOption(requirementsRaw.rh, PROGRAM_RH_OPTIONS),
    marital: pickOption(requirementsRaw.marital, PROGRAM_MARITAL_OPTIONS),
    ownKids: pickOption(requirementsRaw.ownKids, PROGRAM_KIDS_OPTIONS),
    csectionMax: pickOption(requirementsRaw.csectionMax, PROGRAM_CSECTION_OPTIONS),
  };
  const ageFrom = wholeNumber(requirementsRaw.ageFrom, { min: 16, max: 60 });
  const ageTo = wholeNumber(requirementsRaw.ageTo, { min: 16, max: 60 });
  const bmiMax = wholeNumber(requirementsRaw.bmiMax, { min: 15, max: 45 });
  const heightFrom = wholeNumber(requirementsRaw.heightFrom, { min: 130, max: 200 });
  const maxBirths = wholeNumber(requirementsRaw.maxBirths, { min: 0, max: 10 });
  if (ageFrom !== null) requirements.ageFrom = ageFrom;
  if (ageTo !== null) requirements.ageTo = ageTo;
  if (bmiMax !== null) requirements.bmiMax = bmiMax;
  if (heightFrom !== null) requirements.heightFrom = heightFrom;
  if (maxBirths !== null) requirements.maxBirths = maxBirths;

  const payments = {};
  [...PROGRAM_PAYMENT_FIELDS[type].map(field => field.key), PROGRAM_TOTAL_FIELD].forEach(key => {
    const money = normalizeProgramMoney(raw.payments?.[key]);
    if (!money) return;
    if (key === 'monthly') {
      const months = wholeNumber(raw.payments.monthly.months, { min: 1, max: MAX_MONTHLY_MONTHS });
      if (months !== null) money.months = Math.round(months);
    }
    payments[key] = money;
  });
  const otherPayments = normalizeLabeledPayments(raw.otherPayments);
  const bonuses = normalizeLabeledPayments(raw.bonuses);
  const coverageKeys = new Set(PROGRAM_COVERAGE_OPTIONS.map(option => option.key));
  const coverage = (Array.isArray(raw.coverage) ? raw.coverage : Object.keys(raw.coverage || {}))
    .filter(key => coverageKeys.has(key));

  const program = {
    id: text(raw.id || id, 40) || `p${Date.now().toString(36)}`,
    type,
    requirements,
    payments,
  };
  // «Тривалість і візити» тут було окремим полем — і лишилось порожнім у
  // кожної програми: це примітка, а не вимога чи виплата. Старе значення
  // переїжджає в примітку, а не зникає.
  const legacyDuration = text(raw.duration);
  const location = text(raw.location);
  const noteRaw = text(raw.note, MAX_NOTE);
  const note = legacyDuration && !noteRaw.includes(legacyDuration)
    ? text([legacyDuration, noteRaw].filter(Boolean).join('\n'), MAX_NOTE)
    : noteRaw;
  if (location) program.location = location;
  if (note) program.note = note;
  if (otherPayments.length) program.otherPayments = otherPayments;
  if (bonuses.length) program.bonuses = bonuses;
  if (coverage.length) program.coverage = [...new Set(coverage)];
  // Прихована програма лишається в редакторі, але її не бачить ніхто інший:
  // агенція набирає її раз і вмикає, коли набір знову відкритий.
  if (raw.hidden === true) program.hidden = true;
  const order = Number(raw.order);
  if (Number.isFinite(order)) program.order = Math.max(0, Math.min(99, Math.round(order)));
  return program;
};

const normalizeLabeledPayments = value => (Array.isArray(value) ? value : Object.values(value || {}))
  .map(item => {
    const money = normalizeProgramMoney(item);
    const label = text(item?.label, 60);
    return money && label ? { label, ...money } : null;
  })
  .filter(Boolean)
  .slice(0, 8);

/**
 * Чи програма каже читачеві хоч щось, окрім свого типу.
 *
 * «Додати програму» заводить запис одразу, і агенція, яка натиснула й
 * пішла, лишала в стрічці слайд із самою назвою «Донор ооцитів» і порожнім
 * місцем на пів екрана — у проді така програма є. Порожня програма — це
 * чернетка: редактор її показує й тримає, а читачам вона не видна, доки в
 * ній не зʼявиться місце, виплата, вимога, покриття чи умова.
 */
export const isProgramPresentable = program => {
  if (!program) return false;
  const payments = program.payments || {};
  const req = program.requirements || {};
  const hasRequirement = ['ageFrom', 'ageTo', 'bmiMax', 'heightFrom', 'maxBirths'].some(key => req[key] !== undefined && req[key] !== null && req[key] !== '')
    || ['rh', 'marital', 'ownKids', 'csectionMax'].some(key => req[key] && req[key] !== 'any');
  return Object.keys(payments).length > 0
    || Boolean(program.otherPayments?.length)
    || Boolean(program.bonuses?.length)
    || Boolean(program.coverage?.length)
    || Boolean(String(program.note || '').trim())
    || Boolean(String(program.location || '').trim())
    || hasRequirement;
};

// Порядок програм задає агенція (`order`, стрілки в редакторі): найцікавішу
// вона ставить першою. Без `order` — за id, тобто за часом створення.
const compareProgramOrder = (a, b) => {
  const left = a.order ?? Number.MAX_SAFE_INTEGER;
  const right = b.order ?? Number.MAX_SAFE_INTEGER;
  return (left - right) || a.id.localeCompare(b.id);
};

/**
 * Програми списком, у порядку агенції. Приховані — лише на прохання
 * (`includeHidden`): їх бачить сам редактор.
 */
export const listPrograms = (programs, { includeHidden = false } = {}) => {
  if (!programs || typeof programs !== 'object') return [];
  const entries = Array.isArray(programs)
    ? programs.map((program, index) => [program?.id || `p${index}`, program])
    : Object.entries(programs);
  return entries
    .map(([id, program]) => normalizeProgram(program, id))
    .filter(program => program && (includeHidden || (!program.hidden && isProgramPresentable(program))))
    .sort(compareProgramOrder)
    .slice(0, MAX_PROGRAMS);
};

/**
 * Мапа `{ id: program }` для запису: разом із прихованими, а `order` —
 * позиція в переданому списку, тож порядок редактора й є записаний порядок.
 */
export const programsToRecord = programs => {
  const list = Array.isArray(programs)
    ? programs.map((program, index) => normalizeProgram(program, program?.id || `p${index}`)).filter(Boolean).slice(0, MAX_PROGRAMS)
    : listPrograms(programs, { includeHidden: true });
  return list.reduce((acc, program, index) => ({ ...acc, [program.id]: { ...program, order: index } }), {});
};

/** Головна сума програми: фінальна виплата, а без неї — загальна. */
export const programHeadlinePay = program => program?.payments?.final || program?.payments?.[PROGRAM_TOTAL_FIELD] || null;

let cardProgramsLookup = null;

/**
 * Звідки брати програми картки, яка сама їх не несе. Реєструє сховище
 * (`utils/programsStore`) — так само, як курс кладе `setProgramRates`: цей
 * модуль мережі не знає, а в картці стрічки самих програм немає.
 */
export const setCardProgramsLookup = lookup => {
  cardProgramsLookup = typeof lookup === 'function' ? lookup : null;
};

/**
 * Видимі програми картки: ті, що несе сама картка (`programs` — «Мій
 * профіль», прев'ю), інакше прочитані сховищем. Порожній список — або
 * програм немає, або їх ще не дочитали; `loaded` каже, що саме.
 */
export const resolveCardPrograms = card => {
  if (card?.programs && typeof card.programs === 'object') {
    return { programs: listPrograms(card.programs), loaded: true };
  }
  const found = cardProgramsLookup ? cardProgramsLookup(card) : null;
  if (!found) return { programs: [], loaded: false };
  return { programs: listPrograms(found), loaded: true };
};

// --- порівняння з анкетою читача -------------------------------------------

const YES = new Set(['yes', 'так', 'є', 'true']);
const NO = new Set(['no', 'ні', 'немає', 'false', '0']);

const readCount = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (NO.has(s)) return 0;
  if (YES.has(s)) return 1;
  return null;
};

const readMarital = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  const s = String(raw ?? '').trim().toLowerCase().replace(/[.,;:!]/g, '').replace(/\s+/g, '');
  if (!s) return '';
  if (['+', 'yes', 'так', 'заміжня', 'замужем', 'одружена', 'married'].includes(s)) return 'married';
  if (['-', 'no', 'ні', 'незаміжня', 'незамужем', 'неодружена', 'single', 'unmarried'].includes(s)) return 'unmarried';
  return '';
};

/**
 * Що з анкети читача важить для вимог програми.
 *
 * Функції розбору передаються ззовні (`helpers`): вони живуть у компонентах
 * поруч із показом (`getProfileAge`, `parseBloodValue`, `computeBmi`), і
 * порівняння мусить читати анкету рівно так, як її показує картка.
 */
export const extractViewerProgramFacts = (profile, helpers = {}) => {
  if (!profile || typeof profile !== 'object') return null;
  const last = value => (Array.isArray(value) ? value[value.length - 1] : value);
  const age = Number(helpers.age?.(profile)) || null;
  const heightCm = helpers.height?.(last(profile.height)) || null;
  const bmi = Number(last(profile.bmi)) || helpers.bmi?.(last(profile.height), last(profile.weight)) || null;
  const rh = helpers.rh?.(last(profile.blood)) || '';
  const csectionRaw = profile.csection ?? profile.cSection ?? profile.c_section;
  return {
    age,
    heightCm,
    bmi,
    rh,
    marital: readMarital(profile.maritalStatus),
    births: readCount(profile.ownKids),
    csections: readCount(csectionRaw),
    experience: readCount(profile.surrogacyExperience ?? profile.experience ?? profile.donationExperience ?? profile.previousDonation),
  };
};

/**
 * Одна програма проти анкети читача.
 *
 * Кожна вимога дає `true` (підходить), `false` (ні) або `null` (в анкеті
 * цього немає). Програма «підходить», коли жодна вимога не каже «ні»: чесно
 * відмовити можна лише на тому, що відомо. Невідоме показується окремо —
 * «вкажіть вік в анкеті», — а не ховає програму.
 */
export const evaluateProgram = (program, facts) => {
  const req = program?.requirements || {};
  const checks = [];
  const push = (key, ok) => checks.push({ key, ok });
  const f = facts || {};
  if (req.ageFrom !== undefined || req.ageTo !== undefined) {
    push('age', f.age ? (req.ageFrom === undefined || f.age >= req.ageFrom) && (req.ageTo === undefined || f.age <= req.ageTo) : null);
  }
  if (req.bmiMax !== undefined) push('bmi', f.bmi ? f.bmi <= req.bmiMax : null);
  if (req.heightFrom !== undefined) push('height', f.heightCm ? f.heightCm >= req.heightFrom : null);
  if (req.rh && req.rh !== 'any') push('rh', f.rh ? f.rh === req.rh : null);
  if (req.marital && req.marital !== 'any') push('marital', f.marital ? f.marital === req.marital : null);
  if (req.ownKids === 'required') push('ownKids', f.births === null || f.births === undefined ? null : f.births > 0);
  if (req.maxBirths !== undefined) push('births', f.births === null || f.births === undefined ? null : f.births <= req.maxBirths);
  if (req.csectionMax && req.csectionMax !== 'any') {
    push('csection', f.csections === null || f.csections === undefined ? null : f.csections <= Number(req.csectionMax));
  }
  const failed = checks.some(check => check.ok === false);
  const unknown = checks.some(check => check.ok === null);
  return { matches: !failed, uncertain: !failed && unknown, checks };
};

/** Тип програм, які стосуються читача: донорка бачить донорські, СМ — свої. */
export const resolveViewerProgramType = viewerRole => {
  const roles = listViewerRoles(viewerRole);
  const current = roles[roles.length - 1];
  if (current === 'ed') return 'ed';
  if (current === 'sm') return 'sm';
  return '';
};

/**
 * Зведення програм картки для рядка стрічки.
 *
 * `relevant` — програми типу читача (донорці — донорські); для решти читачів
 * (агенція, адмін, батьки) — усі. «Підходить N з M» рахується лише тоді, коли
 * читач — донорка чи СМ і його анкету прочитано.
 */
export const summarizeCardPrograms = (card, { viewerType = '', facts = null } = {}) => {
  const { programs } = resolveCardPrograms(card);
  if (!programs.length) return null;
  const relevant = viewerType ? programs.filter(program => program.type === viewerType) : programs;
  const list = relevant;
  const evaluated = list.map(program => ({ program, result: viewerType && facts ? evaluateProgram(program, facts) : null }));
  const matched = evaluated.filter(item => item.result?.matches).length;
  // Діапазон рядка — гарантовано за програму, а не сама фінальна виплата:
  // картка програми показує саме цю суму першою, і число в рядку мусить
  // бути тим самим числом, а не третім.
  const finals = list.map(program => programGuaranteedMoney(program)).filter(Boolean);
  const byType = PROGRAM_TYPES
    .map(type => ({ type, totals: list.filter(program => program.type === type).map(program => programGuaranteedMoney(program)).filter(Boolean) }))
    .filter(item => item.totals.length);
  return {
    total: list.length,
    allTotal: programs.length,
    matched: viewerType && facts ? matched : null,
    evaluated,
    finals,
    byType,
  };
};

/** Найбільша гарантована сума програми в доларах — для сорту й фільтра. */
export const maxProgramPayUsd = (programs, rates) => programs
  .map(program => programGuaranteedUsd(program, rates))
  .filter(value => Number.isFinite(value))
  .reduce((max, value) => (max === null || value > max ? value : max), null);

/**
 * Бакети фільтра «Виплата» — за **гарантованою сумою за програму**
 * (`programGuaranteedUsd`), тим самим числом, яке картка програми показує
 * першим. Межі різні для донорок і СМ: 1 600 $ і 25 000 $ — звичайні суми
 * кожна у своїй програмі, і одна шкала на обидві була б порожньою для однієї
 * з них. Ключі СМ нові (`sm_lt22k`…): межі тут рахувались від самої
 * фінальної виплати, і збережений у браузері старий вибір під новими межами
 * означав би інше.
 */
export const PAYMENT_FILTER_BUCKETS = Object.freeze({
  ed: Object.freeze([
    { key: 'ed_lt1500', label: 'до 1 500 $', max: 1500 },
    { key: 'ed_1500', label: '1 500–2 000 $', min: 1500, max: 2000 },
    { key: 'ed_2000', label: 'від 2 000 $', min: 2000 },
  ]),
  sm: Object.freeze([
    { key: 'sm_lt22k', label: 'до 22 000 $', max: 22000 },
    { key: 'sm_22k', label: '22 000–26 000 $', min: 22000, max: 26000 },
    { key: 'sm_26k', label: 'від 26 000 $', min: 26000 },
  ]),
});

export const PAYMENT_FILTER_NONE = 'none';

/**
 * У які бакети фільтра потрапляє картка. Кожна програма кладе картку у свій
 * бакет, тож агенція з програмою на 1 400 $ і на 2 200 $ відповідає і «до
 * 1 500 $», і «від 2 000 $». Без курсу валютна програма бакета не має — і не
 * вдає, що має.
 */
let paymentFilterProgramTypes = null;

/**
 * Які типи програм рахує фільтр «Виплата». Донорці шухляда показує лише
 * донорські бакети, а приховані лишаються в стані увімкненими — і агенція
 * з самими програмами СМ проходила б крізь «від 2 000 $». Тож бакети картки
 * рахуються лише з програм того типу, який цікавить читача. Тип кладе
 * `Matching`, так само як курс (`setProgramRates`), бо фільтр стрічки читача
 * не знає.
 */
export const setPaymentFilterProgramTypes = types => {
  paymentFilterProgramTypes = Array.isArray(types) && types.length ? types : null;
};

export const listPaymentBuckets = (card, rates, types = paymentFilterProgramTypes) => {
  if (!hasVisibleOrganisationRole(card)) return [PAYMENT_FILTER_NONE];
  const { programs } = resolveCardPrograms(card);
  const buckets = new Set();
  programs.filter(program => !types || types.includes(program.type)).forEach(program => {
    const usd = programGuaranteedUsd(program, rates);
    if (!Number.isFinite(usd)) return;
    PAYMENT_FILTER_BUCKETS[program.type].forEach(bucket => {
      if ((bucket.min === undefined || usd >= bucket.min) && (bucket.max === undefined || usd < bucket.max)) {
        buckets.add(bucket.key);
      }
    });
  });
  if (!buckets.size) buckets.add(PAYMENT_FILTER_NONE);
  return [...buckets];
};

/**
 * Релевантність картки для читача — для сортування за замовчуванням.
 *
 * Картка з програмою, яка підходить, стоїть вище за ту, де програм немає, а
 * та — вище за ту, де жодна не підходить. Усередині однакової релевантності
 * лишається порядок стрічки (сорт стабільний), тож для читача, якому
 * програми не адресовані, порядок не змінюється зовсім.
 */
export const programRelevanceScore = (card, { viewerType = '', facts = null } = {}) => {
  if (!viewerType || !facts) return 0;
  if (!hasVisibleOrganisationRole(card)) return 0;
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  if (!summary) return 0;
  const typed = summary.evaluated.filter(item => item.program.type === viewerType);
  if (!typed.length) return 0;
  return typed.some(item => item.result?.matches) ? 1 : -1;
};

export const MATCHING_SORT_MODES = Object.freeze([
  { key: 'relevance', label: 'За релевантністю' },
  { key: 'payment', label: 'За виплатою' },
  { key: 'newest', label: 'Спершу нові' },
]);

/**
 * Сортує деку, не чіпаючи порядку там, де ключі рівні.
 *
 * «Спершу нові» — порядок стрічки як він є (за `feedDate`). Релевантність і
 * виплата переставляють лише картки, які відрізняються за ключем.
 */
export const sortCardsByMode = (cards, mode, { viewerType = '', facts = null, rates = null } = {}) => {
  const list = Array.isArray(cards) ? cards : [];
  if (mode === 'newest' || !list.length) return list;
  const keyed = list.map((card, index) => {
    if (mode === 'payment') {
      const { programs } = resolveCardPrograms(card);
      const typed = viewerType ? programs.filter(program => program.type === viewerType) : programs;
      const pay = hasVisibleOrganisationRole(card) ? maxProgramPayUsd(typed, rates) : null;
      return { card, index, key: Number.isFinite(pay) ? pay : -1 };
    }
    return { card, index, key: programRelevanceScore(card, { viewerType, facts }) };
  });
  if (keyed.every(item => item.key === keyed[0].key)) return list;
  return keyed
    .sort((a, b) => (b.key - a.key) || (a.index - b.index))
    .map(item => item.card);
};

/**
 * Вимоги програми словами — по чіпу на вимогу, з ключем для позначки збігу.
 * Порядок сталий: спершу те, за чим відсіюють найчастіше (вік, ІМТ).
 */
export const describeProgramRequirements = program => {
  const req = program?.requirements || {};
  const items = [];
  if (req.ageFrom !== undefined && req.ageTo !== undefined) items.push({ key: 'age', text: '{from}–{to} років', variables: { from: req.ageFrom, to: req.ageTo } });
  else if (req.ageTo !== undefined) items.push({ key: 'age', text: 'до {value} років', variables: { value: req.ageTo } });
  else if (req.ageFrom !== undefined) items.push({ key: 'age', text: 'від {value} років', variables: { value: req.ageFrom } });
  if (req.bmiMax !== undefined) items.push({ key: 'bmi', text: 'ІМТ до {value}', variables: { value: req.bmiMax } });
  if (req.heightFrom !== undefined) items.push({ key: 'height', text: 'зріст від {value} см', variables: { value: req.heightFrom } });
  if (req.rh === '+') items.push({ key: 'rh', text: 'лише Rh+' });
  if (req.rh === '-') items.push({ key: 'rh', text: 'лише Rh−' });
  if (req.marital === 'unmarried') items.push({ key: 'marital', text: 'незаміжня' });
  if (req.marital === 'married') items.push({ key: 'marital', text: 'заміжня' });
  if (req.ownKids === 'required') items.push({ key: 'ownKids', text: 'є власна дитина' });
  if (req.maxBirths !== undefined) items.push({ key: 'births', text: 'до {value} пологів', variables: { value: req.maxBirths } });
  if (req.csectionMax === '0') items.push({ key: 'csection', text: 'без КР' });
  if (req.csectionMax === '1') items.push({ key: 'csection', text: 'можна з 1 КР' });
  if (req.csectionMax === '2') items.push({ key: 'csection', text: 'до 2 КР' });
  return items;
};

const labeledEntries = (items, prefix) => (items || []).map((item, index) => ({
  key: `${prefix}-${index}`,
  label: item.label,
  money: { amount: item.amount, currency: item.currency },
}));

/** Гарантовані виплати програми по порядку: головна, решта за типом, далі інші. */
export const listProgramPayments = program => {
  if (!program) return [];
  const known = listGuaranteedPaymentFields(program.type)
    .filter(({ key }) => program.payments?.[key])
    .map(({ key, label }) => ({ key, label, money: program.payments[key] }));
  return [...known, ...labeledEntries(program.otherPayments, 'other')];
};

/** Можливі доплати: за типом програми, далі дописані агенцією. */
export const listProgramBonuses = program => {
  if (!program) return [];
  const known = listBonusPaymentFields(program.type)
    .filter(({ key }) => program.payments?.[key])
    .map(({ key, label }) => ({ key, label, money: program.payments[key] }));
  return [...known, ...labeledEntries(program.bonuses, 'bonus')];
};

/**
 * Доплати, які читачка вже має за анкетою: досвід — факт, і його відмічено
 * одразу. Кесарів, двійня, вагітність з першої спроби — події цієї програми,
 * а не попередніх: колишній КР не обіцяє доплати за наступний, тож їх
 * читачка відмічає сама, коли хоче порахувати «а якщо».
 */
export const defaultProgramBonusKeys = (program, facts) => {
  if (!facts || !(Number(facts.experience) > 0)) return [];
  return listProgramBonuses(program)
    .filter(item => item.key === 'experience' || item.key === 'repeat' || /досвід|повторн/i.test(String(item.label || '')))
    .map(item => item.key);
};

/**
 * Сума кількох виплат у валюті програми. Інша валюта переводиться за курсом
 * НБУ і робить суму «≈»; без курсу вона лишається окремою частиною
 * («23 800 $ + 2 000 ₴») — вигадана сума гірша за дві чесні.
 */
const sumMoney = (items, baseCurrency, rates) => {
  const parts = new Map([[baseCurrency, 0]]);
  let approximate = false;
  items.forEach(money => {
    const amount = Number(money?.amount);
    if (!Number.isFinite(amount) || !money?.currency) return;
    if (money.currency === baseCurrency) {
      parts.set(baseCurrency, parts.get(baseCurrency) + amount);
      return;
    }
    // Без явного курсу береться той, що поклав `useProgramRates`
    // (`setProgramRates`): рядок стрічки курсу в руках не тримає.
    const converted = convertProgramAmount(amount, money.currency, baseCurrency, rates || undefined);
    if (Number.isFinite(converted)) {
      parts.set(baseCurrency, parts.get(baseCurrency) + converted);
      approximate = true;
      return;
    }
    parts.set(money.currency, (parts.get(money.currency) || 0) + amount);
  });
  // Сума за курсом — не точна, і точних одиниць вона не вдає: «≈ 1 650 $», а
  // не «1 649 $». Крок той самий, що й у діапазоні рядка (`formatPayRange`).
  const step = baseCurrency === 'UAH' ? 100 : 10;
  const list = [...parts.entries()]
    .filter(([currency, amount]) => amount > 0 || currency === baseCurrency)
    .map(([currency, amount]) => ({ currency, amount: approximate && currency === baseCurrency ? Math.round(amount / step) * step : amount }));
  return { parts: list, approximate, amount: list[0]?.amount || 0, currency: baseCurrency };
};

/**
 * Із чого складається заробіток за програмою — одне місце на картку
 * програми, редактор, рядок стрічки, фільтр і сортування.
 *
 * Гарантовано — усе, що виплачують кожній: фінальна, щомісячні × місяці,
 * перенос, договір і дописані агенцією виплати. Досі загальна сума брала
 * лише разові виплати, і «500 $ щомісяця» — найбільша після фінальної
 * частина заробітку СМ — у підсумок не потрапляла взагалі, а рядок стрічки
 * показував третє число, саму фінальну. Можливі доплати додаються лише
 * відмічені (`selectedBonusKeys`); `max` — якщо справдиться все.
 */
export const programBreakdown = (program, { selectedBonusKeys = [], rates = null } = {}) => {
  const selected = new Set(selectedBonusKeys);
  let lines = listProgramPayments(program).map(entry => {
    if (entry.key !== 'monthly') return { ...entry, subtotal: entry.money };
    const months = Number(entry.money.months) || DEFAULT_MONTHLY_MONTHS;
    return {
      ...entry,
      months,
      monthsEstimated: !entry.money.months,
      subtotal: { amount: Number(entry.money.amount) * months, currency: entry.money.currency },
    };
  });
  // Старий запис, де агенція ввела саму загальну суму, без складових.
  const legacyTotal = program?.payments?.[PROGRAM_TOTAL_FIELD];
  if (!lines.length && legacyTotal) {
    lines = [{ key: PROGRAM_TOTAL_FIELD, label: 'Загальна сума за програму', money: legacyTotal, subtotal: legacyTotal }];
  }
  const bonuses = listProgramBonuses(program).map(entry => ({ ...entry, selected: selected.has(entry.key), subtotal: entry.money }));
  const baseCurrency = program?.payments?.final?.currency || lines[0]?.money?.currency || bonuses[0]?.money?.currency || DEFAULT_PROGRAM_CURRENCY;
  const guaranteedItems = lines.map(line => line.subtotal);
  return {
    lines,
    bonuses,
    baseCurrency,
    guaranteed: sumMoney(guaranteedItems, baseCurrency, rates),
    total: sumMoney([...guaranteedItems, ...bonuses.filter(item => item.selected).map(item => item.subtotal)], baseCurrency, rates),
    max: sumMoney([...guaranteedItems, ...bonuses.map(item => item.subtotal)], baseCurrency, rates),
    hasMonthlyEstimate: lines.some(line => line.monthsEstimated),
  };
};

/**
 * Гарантована сума однією сумою в одній валюті — для діапазону рядка.
 * Без курсу й з виплатами у двох валютах однієї суми немає; тоді рядок
 * показує саму головну виплату, а не вигадану суму.
 */
export const programGuaranteedMoney = (program, rates) => {
  const { guaranteed } = programBreakdown(program, { rates });
  if (guaranteed.parts.length === 1 && guaranteed.amount > 0) {
    return { amount: guaranteed.amount, currency: guaranteed.currency, ...(guaranteed.approximate ? { approximate: true } : {}) };
  }
  return programHeadlinePay(program);
};

/** Гарантована сума в доларах — фільтр «Виплата» й сортування. */
export const programGuaranteedUsd = (program, rates) => {
  const breakdown = programBreakdown(program, { rates });
  const usd = breakdown.lines.map(line => programMoneyInUsd(line.subtotal, rates || undefined));
  if (usd.length && usd.every(value => Number.isFinite(value))) return usd.reduce((sum, value) => sum + value, 0);
  if (!breakdown.lines.length) return programMoneyInUsd(programHeadlinePay(program), rates || undefined);
  return null;
};

// --- порівняння програм однієї агенції --------------------------------------

/**
 * Ключові ознаки програми для рядка списку — те, за чим програми однієї
 * агенції й відрізняються: місце, вік, головні вимоги, доплати, покриття.
 *
 * Кожна ознака має `key`: `listProgramDifferences` порівнює програми саме за
 * ними, і рядок підсвічує те, чим ця програма не схожа на сусідні. Порожніх
 * ознак немає — чого агенція не вказала, того в рядку просто нема.
 */
export const describeProgramHighlights = program => {
  if (!program) return [];
  const requirements = describeProgramRequirements(program);
  const age = requirements.find(item => item.key === 'age');
  const others = requirements.filter(item => item.key !== 'age');
  const bonuses = listProgramBonuses(program);
  const items = [];
  if (age) items.push({ ...age, compare: `${age.text}|${JSON.stringify(age.variables || {})}` });
  others.slice(0, 2).forEach(item => items.push({ ...item, compare: `${item.text}|${JSON.stringify(item.variables || {})}` }));
  if (bonuses.length) {
    items.push({
      key: 'bonuses',
      text: bonuses.length === 1 ? '+1 доплата' : '+{count} доплати',
      variables: { count: bonuses.length },
      compare: bonuses.map(item => `${item.label}:${item.money.amount}${item.money.currency}`).sort().join(','),
    });
  }
  if (program.coverage?.length) {
    items.push({
      key: 'coverage',
      text: 'покриває {count}',
      variables: { count: program.coverage.length },
      compare: [...program.coverage].sort().join(','),
    });
  }
  return items;
};

const programPayCompareKey = program => {
  const money = programGuaranteedMoney(program);
  return money ? `${money.amount}${money.currency}` : '';
};

/**
 * Чим кожна програма відрізняється від інших програм **того самого типу** в
 * цієї агенції: `Map<id, Set<key>>`, де `key` — 'location', 'pay' або ключ
 * ознаки з `describeProgramHighlights`. Дві донорські програми, що різняться
 * лише віком і сумою, мусять показати саме це, а не змусити читати обидві.
 * Єдина програма свого типу відмінностей не має — порівнювати нема з чим.
 */
export const listProgramDifferences = programs => {
  const result = new Map();
  const list = Array.isArray(programs) ? programs : [];
  PROGRAM_TYPES.forEach(type => {
    const group = list.filter(program => program.type === type);
    if (group.length < 2) return;
    const signatures = group.map(program => {
      const sig = new Map([
        ['location', String(program.location || '').trim().toLowerCase()],
        ['pay', programPayCompareKey(program)],
      ]);
      describeProgramHighlights(program).forEach(item => sig.set(item.key, item.compare));
      return sig;
    });
    const keys = new Set(signatures.flatMap(sig => [...sig.keys()]));
    group.forEach((program, index) => {
      const differs = new Set();
      keys.forEach(key => {
        const own = signatures[index].get(key) ?? '';
        if (signatures.some((sig, other) => other !== index && (sig.get(key) ?? '') !== own)) differs.add(key);
      });
      result.set(program.id, differs);
    });
  });
  return result;
};
