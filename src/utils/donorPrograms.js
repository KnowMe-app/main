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
 * Тут програма — окремий запис зі своїми вимогами, виплатами й тим, що агенція
 * покриває. Повний запис лежить в анкеті (`profileDetails/{uid}/programs`), а
 * стислий — у картці стрічки (`programsBrief`, `buildProgramsBrief`): рядок
 * стрічки мусить сказати «вам підходить 2 з 3, 1 600–2 500 $» без жодного
 * читання, а повну програму дочитує дотик.
 *
 * Модуль чистий: жодної мережі, лише форма даних і правила порівняння.
 */

import {
  DEFAULT_PROGRAM_CURRENCY,
  normalizeProgramMoney,
  programMoneyInUsd,
} from './programCurrency';

export const PROGRAM_TYPES = Object.freeze(['ed', 'sm']);

export const PROGRAM_TYPE_LABELS = Object.freeze({
  ed: 'Донорка ооцитів',
  sm: 'Сурогатна мати',
});

/**
 * Виплати за типом програми. Перша — головна: саме вона йде в діапазон
 * рядка стрічки, у фільтр і в сортування.
 */
export const PROGRAM_PAYMENT_FIELDS = Object.freeze({
  ed: Object.freeze([
    { key: 'final', label: 'Винагорода за цикл' },
    { key: 'repeat', label: 'Повторна донація' },
    { key: 'experience', label: 'Доплата за досвід' },
  ]),
  sm: Object.freeze([
    { key: 'final', label: 'Фінальна виплата' },
    { key: 'monthly', label: 'Щомісячно' },
    { key: 'transfer', label: 'Перенос ембріона' },
    { key: 'contract', label: 'Підписання договору' },
    { key: 'cSection', label: 'Кесарів розтин' },
    { key: 'twins', label: 'Двійня' },
    { key: 'experience', label: 'Доплата за досвід СМ' },
  ]),
});

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
  title: '',
  location: '',
  requirements: { rh: 'any', marital: 'any', ownKids: 'any', csectionMax: 'any' },
  payments: { final: { amount: '', currency: DEFAULT_PROGRAM_CURRENCY } },
  otherPayments: [],
  coverage: [],
  duration: '',
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
  PROGRAM_PAYMENT_FIELDS[type].forEach(({ key }) => {
    const money = normalizeProgramMoney(raw.payments?.[key]);
    if (money) payments[key] = money;
  });
  const otherPayments = (Array.isArray(raw.otherPayments) ? raw.otherPayments : Object.values(raw.otherPayments || {}))
    .map(item => {
      const money = normalizeProgramMoney(item);
      const label = text(item?.label, 60);
      return money && label ? { label, ...money } : null;
    })
    .filter(Boolean)
    .slice(0, 8);
  const coverageKeys = new Set(PROGRAM_COVERAGE_OPTIONS.map(option => option.key));
  const coverage = (Array.isArray(raw.coverage) ? raw.coverage : Object.keys(raw.coverage || {}))
    .filter(key => coverageKeys.has(key));

  const program = {
    id: text(raw.id || id, 40) || `p${Date.now().toString(36)}`,
    type,
    requirements,
    payments,
  };
  const title = text(raw.title);
  const location = text(raw.location);
  const duration = text(raw.duration);
  const note = text(raw.note, MAX_NOTE);
  if (title) program.title = title;
  if (location) program.location = location;
  if (duration) program.duration = duration;
  if (note) program.note = note;
  if (otherPayments.length) program.otherPayments = otherPayments;
  if (coverage.length) program.coverage = [...new Set(coverage)];
  return program;
};

/** Програми анкети списком, у сталому порядку (за id — тобто за часом створення). */
export const listPrograms = programs => {
  if (!programs || typeof programs !== 'object') return [];
  const entries = Array.isArray(programs)
    ? programs.map((program, index) => [program?.id || `p${index}`, program])
    : Object.entries(programs);
  return entries
    .map(([id, program]) => normalizeProgram(program, id))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_PROGRAMS);
};

/** Мапа `{ id: program }` для запису в анкету. */
export const programsToRecord = programs => listPrograms(programs)
  .reduce((acc, program) => ({ ...acc, [program.id]: program }), {});

/**
 * Стисла програма для картки стрічки: вимоги й головна виплата, без доплат,
 * покриття й приміток. Цього досить, щоб рядок сказав «підходить N з M» і
 * показав діапазон; решту дочитує дотик до картки.
 */
export const buildProgramBrief = program => {
  const normalized = normalizeProgram(program, program?.id);
  if (!normalized) return null;
  const brief = { type: normalized.type };
  if (normalized.title) brief.title = normalized.title.slice(0, 60);
  if (normalized.location) brief.location = normalized.location.slice(0, 60);
  const req = normalized.requirements;
  ['ageFrom', 'ageTo', 'bmiMax', 'heightFrom', 'maxBirths'].forEach(key => {
    if (req[key] !== undefined) brief[key] = req[key];
  });
  ['rh', 'marital', 'ownKids', 'csectionMax'].forEach(key => {
    if (req[key] && req[key] !== 'any') brief[key] = req[key];
  });
  const final = normalized.payments.final;
  if (final) {
    brief.pay = final.amount;
    brief.currency = final.currency;
  }
  return brief;
};

export const buildProgramsBrief = programs => {
  const list = listPrograms(programs);
  if (!list.length) return null;
  return list.reduce((acc, program) => {
    const brief = buildProgramBrief(program);
    if (brief) acc[program.id] = brief;
    return acc;
  }, {});
};

/** Стисла програма назад у форму повної — для однакового показу. */
export const programFromBrief = (brief, id) => {
  if (!brief || typeof brief !== 'object') return null;
  return normalizeProgram({
    id,
    type: brief.type,
    title: brief.title,
    location: brief.location,
    requirements: {
      ageFrom: brief.ageFrom,
      ageTo: brief.ageTo,
      bmiMax: brief.bmiMax,
      heightFrom: brief.heightFrom,
      maxBirths: brief.maxBirths,
      rh: brief.rh,
      marital: brief.marital,
      ownKids: brief.ownKids,
      csectionMax: brief.csectionMax,
    },
    payments: brief.pay ? { final: { amount: brief.pay, currency: brief.currency } } : {},
  }, id);
};

/**
 * Програми картки: повні, якщо анкета вже дочитана, інакше стислі з картки.
 * Прапорець `brief` каже екрану, що доплат і покриття ще немає звідки взяти.
 */
export const resolveCardPrograms = card => {
  const full = listPrograms(card?.programs);
  if (full.length) return { programs: full, brief: false };
  const brief = card?.programsBrief && typeof card.programsBrief === 'object'
    ? Object.entries(card.programsBrief).map(([id, item]) => programFromBrief(item, id)).filter(Boolean)
    : [];
  return { programs: brief.sort((a, b) => a.id.localeCompare(b.id)), brief: true };
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
    experience: readCount(profile.experience),
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
  const roles = (Array.isArray(viewerRole) ? viewerRole : [viewerRole]).map(role => String(role || '').trim().toLowerCase());
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
  const list = relevant.length ? relevant : programs;
  const evaluated = list.map(program => ({ program, result: viewerType && facts ? evaluateProgram(program, facts) : null }));
  const matched = evaluated.filter(item => item.result?.matches).length;
  const finals = list.map(program => program.payments.final).filter(Boolean);
  return {
    total: list.length,
    allTotal: programs.length,
    matched: viewerType && facts ? matched : null,
    evaluated,
    finals,
  };
};

/** Найбільша головна виплата в доларах серед програм — для сорту й фільтра. */
export const maxProgramPayUsd = (programs, rates) => programs
  .map(program => programMoneyInUsd(program.payments.final, rates))
  .filter(value => Number.isFinite(value))
  .reduce((max, value) => (max === null || value > max ? value : max), null);

/**
 * Бакети фільтра «Виплата». Межі різні для донорок і СМ: 1 600 $ і 20 000 $
 * — звичайні суми кожна у своїй програмі, і одна шкала на обидві була б
 * порожньою для однієї з них.
 */
export const PAYMENT_FILTER_BUCKETS = Object.freeze({
  ed: Object.freeze([
    { key: 'ed_lt1500', label: 'до 1 500 $', max: 1500 },
    { key: 'ed_1500', label: '1 500–2 000 $', min: 1500, max: 2000 },
    { key: 'ed_2000', label: 'від 2 000 $', min: 2000 },
  ]),
  sm: Object.freeze([
    { key: 'sm_lt18k', label: 'до 18 000 $', max: 18000 },
    { key: 'sm_18k', label: '18 000–20 000 $', min: 18000, max: 20000 },
    { key: 'sm_20k', label: 'від 20 000 $', min: 20000 },
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
  const { programs } = resolveCardPrograms(card);
  const buckets = new Set();
  programs.filter(program => !types || types.includes(program.type)).forEach(program => {
    const usd = programMoneyInUsd(program.payments.final, rates);
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
      const pay = maxProgramPayUsd(typed.length ? typed : programs, rates);
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
  if (req.ageFrom !== undefined && req.ageTo !== undefined) items.push({ key: 'age', text: `${req.ageFrom}–${req.ageTo} років` });
  else if (req.ageTo !== undefined) items.push({ key: 'age', text: `до ${req.ageTo} років` });
  else if (req.ageFrom !== undefined) items.push({ key: 'age', text: `від ${req.ageFrom} років` });
  if (req.bmiMax !== undefined) items.push({ key: 'bmi', text: `ІМТ до ${req.bmiMax}` });
  if (req.heightFrom !== undefined) items.push({ key: 'height', text: `зріст від ${req.heightFrom} см` });
  if (req.rh === '+') items.push({ key: 'rh', text: 'лише Rh+' });
  if (req.rh === '-') items.push({ key: 'rh', text: 'лише Rh−' });
  if (req.marital === 'unmarried') items.push({ key: 'marital', text: 'незаміжня' });
  if (req.marital === 'married') items.push({ key: 'marital', text: 'заміжня' });
  if (req.ownKids === 'required') items.push({ key: 'ownKids', text: 'є власна дитина' });
  if (req.maxBirths !== undefined) items.push({ key: 'births', text: `до ${req.maxBirths} пологів` });
  if (req.csectionMax === '0') items.push({ key: 'csection', text: 'без КР' });
  if (req.csectionMax === '1') items.push({ key: 'csection', text: 'можна з 1 КР' });
  if (req.csectionMax === '2') items.push({ key: 'csection', text: 'до 2 КР' });
  return items;
};

/** Усі виплати програми по порядку: головна, решта за типом, далі інші. */
export const listProgramPayments = program => {
  if (!program) return [];
  const fields = PROGRAM_PAYMENT_FIELDS[program.type] || [];
  const known = fields
    .filter(({ key }) => program.payments?.[key])
    .map(({ key, label }) => ({ key, label, money: program.payments[key] }));
  const other = (program.otherPayments || []).map((item, index) => ({
    key: `other-${index}`,
    label: item.label,
    money: { amount: item.amount, currency: item.currency },
  }));
  return [...known, ...other];
};
