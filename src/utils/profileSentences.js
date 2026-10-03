/*
 * Анкета словами: відповіді, вибрані зі списку, складаються в речення.
 *
 * «Форма обличчя — овальне, ніс — прямий, губи — повні» — це таблиця, і
 * читалась вона таблицею; та сама людина реченням — «У мене темне хвилясте
 * волосся, овальна форма обличчя, прямий ніс і повні губи». Але речення
 * вміє лише те, що знає наперед: слово з довідника стає в потрібний рід і
 * відмінок (`SENTENCE_FORMS`), а те, що людина набрала сама («після
 * пластики», «залежить від сезону»), у речення не лягає — воно лишається
 * рядком «підпис — значення», як і було (`buildProfileDetailSections`).
 *
 * Поля без довідника (розміри, професія) — теж частина речення: там уже
 * значення, а не варіант, і «розмір одягу — 38» читається однаково.
 */
import {
  bodyTypeOptions,
  chinShapeOptions,
  educationModalOptions,
  faceShapeOptions,
  hairColorOptions,
  hairStructureOptions,
  lipsShapeOptions,
  noseShapeOptions,
  raceOptions,
} from '../components/formFields';

const OPTIONS_BY_FIELD = {
  hairColor: hairColorOptions,
  hairStructure: hairStructureOptions,
  faceShape: faceShapeOptions,
  noseShape: noseShapeOptions,
  lipsShape: lipsShapeOptions,
  chin: chinShapeOptions,
  bodyType: bodyTypeOptions,
  race: raceOptions,
  education: educationModalOptions,
};

/*
 * Словоформа для речення, коли напис довідника в нього не стає.
 *
 * Колір волосся в довіднику — частково іменники («Брюнетка», «Шатенка»), а
 * перед словом «волосся» потрібен прикметник середнього роду. Форма обличчя
 * в довіднику середнього роду («Овальне») — бо відповідає на «яке обличчя»,
 * а в реченні вона при слові «форма». Освіта — знахідний відмінок після
 * «маю».
 */
const SENTENCE_FORMS = {
  uk: {
    hairColor: {
      brunette: 'темне',
      'dark brunette': 'дуже темне',
      shoten: 'світло-каштанове',
      blonde: 'світле',
    },
    faceShape: { 'heart-shaped': 'серцеподібна' },
    education: {
      higher: 'вищу освіту',
      technical: 'професійно-технічну освіту',
      secondary: 'загальну середню освіту',
      bachelor: 'ступінь бакалавра',
      master: 'ступінь магістра',
      phd: 'ступінь доктора філософії (PhD)',
    },
  },
  en: {
    education: {
      higher: 'a higher education',
      technical: 'a vocational education',
      secondary: 'a secondary education',
      bachelor: "a bachelor's degree",
      master: "a master's degree",
      phd: 'a PhD',
    },
  },
};

const pickCurrent = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  return String(raw ?? '').trim();
};

const lower = text => text.toLocaleLowerCase('uk-UA');

/*
 * Як люди називають варіант, коли пишуть його самі, — ключ варіанта.
 *
 * «Середня» — це той самий варіант, що й «Загальна середня освіта», і поки
 * довідник знав лише свій напис, одна донорка казала «Я маю загальну середню
 * освіту…» реченням, а друга — окремим рядком «Освіта — середня» під
 * «Я працюю за професією…». Тут лише однозначні назви рівня.
 */
const OPTION_ALIASES = {
  education: {
    'середня': 'secondary',
    'середня освіта': 'secondary',
    'загальна середня': 'secondary',
    'повна середня': 'secondary',
    'средняя': 'secondary',
    'среднее': 'secondary',
    'вища': 'higher',
    'висша': 'higher',
    'высшее': 'higher',
    'профтехосвіта': 'technical',
    'професійно-технічна': 'technical',
    'середня спеціальна': 'technical',
    'средне-специальное': 'technical',
    'бакалавр': 'bachelor',
    'магістр': 'master',
  },
};

/** Варіант довідника, якому відповідає записане значення, або `null`. */
export const findPresetOption = (field, value) => {
  const text = lower(pickCurrent(value)).replace(/\s+/g, ' ').replace(/[.,;]+$/u, '');
  if (!text) return null;
  const options = OPTIONS_BY_FIELD[field] || [];
  const direct = options.find(option => (
    lower(String(option.placeholder || '')) === text || lower(String(option.ukrainian || '')) === text
  ));
  if (direct) return direct;
  const aliasKey = OPTION_ALIASES[field]?.[text];
  return aliasKey ? options.find(option => lower(String(option.placeholder || '')) === aliasKey) || null : null;
};

// Прикметник середнього роду → жіночого: «овальне» → «овальна».
const toFeminine = word => word.replace(/е$/u, 'а');

/** Словоформа варіанта для речення; порожньо — значення не з довідника. */
export const presetSentenceWord = (field, value, lang) => {
  const option = findPresetOption(field, value);
  if (!option) return '';
  const key = lower(String(option.placeholder || ''));
  const override = SENTENCE_FORMS[lang]?.[field]?.[key];
  if (override) return override;
  if (lang === 'en') return key;
  const word = lower(String(option.ukrainian || ''));
  return field === 'faceShape' ? toFeminine(word) : word;
};

// «a, b та c» / «a, b and c».
const joinClauses = (clauses, lang) => {
  const list = clauses.filter(Boolean);
  if (list.length < 2) return list[0] || '';
  const and = lang === 'en' ? 'and' : 'та';
  return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
};

const sentence = text => (text ? `${text.charAt(0).toLocaleUpperCase('uk-UA')}${text.slice(1)}.` : '');

/**
 * Речення про зовнішність і поля, які в нього лягли (`used`): ті самі поля
 * таблиця під реченням уже не повторює.
 *
 * Волосся сюди не йде за замовчуванням: колір і структура стоять разом угорі
 * картки, у «Зовнішності» (`describeHair`), і друге місце про те саме
 * волосся читалось як розбіжність. `includeHair` — для екранів без того
 * рядка.
 */
export const describeLooks = ({ user, lang, typed, includeHair = false }) => {
  const used = new Set();
  const word = field => {
    const result = presetSentenceWord(field, user?.[field], lang);
    if (result) used.add(field);
    return result;
  };
  const value = field => {
    const result = typed(field);
    if (result) used.add(field);
    return result;
  };

  const hairWords = includeHair ? [word('hairColor'), word('hairStructure')].filter(Boolean) : [];
  const face = word('faceShape');
  const nose = word('noseShape');
  const lips = word('lipsShape');
  const chin = word('chin');
  const chinOption = findPresetOption('chin', user?.chin);
  const body = word('bodyType');
  // «Розмір грудей — 1 розмір»: людина відповідала на «який розмір» і
  // повторила слово з питання.
  const breast = value('breastSize').replace(/\s*розмір\s*$/iu, '').replace(/^розмір\s*/iu, '').trim()
    || value('breastSize');
  const race = word('race');
  // Розміри — частина тієї ж фігури: окремим розділом «Розміри» стояло одне
  // речення з двох чисел під заголовком, а поруч — «розмір грудей» у фігурі.
  const clothing = value('clothingSize');
  const shoe = value('shoeSize');
  const glasses = describeGlasses(user?.glasses, lang);
  if (glasses) used.add('glasses');

  const parts = [];
  if (lang === 'en') {
    const features = joinClauses([
      hairWords.length ? `${hairWords.join(' ')} hair` : '',
      face ? `${face} face` : '',
      nose ? `${nose} nose` : '',
      lips ? `${lips} lips` : '',
      chin ? `${chin} chin` : '',
    ], lang);
    if (features) parts.push(sentence(`I have ${features}`));
    const figure = [
      body ? `my body type is ${body}` : '',
      breast ? `breast size ${breast}` : '',
      clothing ? `clothing size ${clothing}` : '',
      shoe ? `shoe size ${shoe}` : '',
    ].filter(Boolean).join(', ');
    if (figure) parts.push(sentence(figure));
    if (race) parts.push(sentence(`my ethnicity is ${race}`));
    if (glasses) parts.push(glasses);
  } else {
    // «З ямкою» стоїть після слова: «підборіддя з ямкою», а не «з ямкою підборіддя».
    const chinClause = chin
      ? (lower(String(chinOption?.placeholder || '')) === 'cleft' ? `підборіддя ${chin}` : `${chin} підборіддя`)
      : '';
    const features = joinClauses([
      hairWords.length ? `${hairWords.join(' ')} волосся` : '',
      face ? `${face} форма обличчя` : '',
      nose ? `${nose} ніс` : '',
      lips ? `${lips} губи` : '',
      chinClause,
    ], lang);
    if (features) parts.push(sentence(`у мене ${features}`));
    const figure = [
      body ? `тип моєї фігури — ${body}` : '',
      breast ? `розмір грудей — ${breast}` : '',
      clothing ? `розмір одягу — ${clothing}` : '',
      shoe ? `розмір взуття — ${shoe}` : '',
    ].filter(Boolean).join(', ');
    if (figure) parts.push(sentence(figure.startsWith('розмір') ? `мій ${figure}` : figure));
    if (race) parts.push(sentence(`моя раса — ${race}`));
    if (glasses) parts.push(glasses);
  }
  return { text: parts.join(' '), used };
};

const GLASSES_NO = new Set(['no', 'false', 'ні', 'немає', 'нема', 'нет', 'не ношу', '-', '—']);
const GLASSES_YES = new Set(['yes', 'true', 'так', 'є', 'ношу']);

/*
 * Окуляри реченням про зір. «Окуляри — ні» читалось як відповідь на питання,
 * якого читач не бачив; людина ж, що окулярів не носить, каже цим, що зір у
 * неї гарний. Власна відповідь («-2.5», «для читання») стає уточненням.
 */
export const describeGlasses = (value, lang) => {
  const raw = pickCurrent(value);
  if (!raw) return '';
  const key = lower(raw).replace(/[.!]+$/u, '');
  if (GLASSES_NO.has(key)) return lang === 'en' ? "I don't wear glasses, my eyesight is good." : 'Окулярів не ношу, зір гарний.';
  if (GLASSES_YES.has(key)) return lang === 'en' ? 'I wear glasses.' : 'Ношу окуляри.';
  // Власна відповідь. Число з діоптріями («-2.5», «+1,5», «-2/-3») — це вже
  // сам зір, і реченням він читається як «Мій зір — −2.5 діоптрії». Решта
  // («лінзи», «для читання», «лише за кермом») стає уточненням про зір:
  // «Ношу окуляри (лінзи)» неправда для тієї, хто носить саме лінзи.
  const text = raw.replace(/[.!]+$/u, '');
  if (/^[+-−]?\s*\d+([.,]\d+)?(\s*[/;]\s*[+-−]?\s*\d+([.,]\d+)?)?$/u.test(text)) {
    const diopters = text.replace(/^-/u, '−').replace(/\/-/gu, '/−');
    return lang === 'en' ? `My eyesight is ${diopters} diopters.` : `Мій зір — ${diopters} діоптрії.`;
  }
  return lang === 'en' ? `About my eyesight and glasses: ${lowerFirstWord(text)}.` : `Щодо зору й окулярів — ${lowerFirstWord(text)}.`;
};

/*
 * Перша літера слова — мала, якщо це звичайне слово з великої («Кухар
 * Кондитер», «Бухгалтер»): у реченні воно стоїть посередині, і велика літера
 * читалась як назва. Абревіатури («IT», «ФОП») лишаються як є.
 */
const lowerCapitalizedWords = text => text.replace(
  /(^|[\s-])(\p{Lu})(\p{Ll}+)/gu,
  (match, before, first, rest) => `${before}${first.toLocaleLowerCase('uk-UA')}${rest}`,
);
const lowerFirstWord = text => text.replace(
  /^(\p{Lu})(\p{Ll})/u,
  (match, first, second) => `${first.toLocaleLowerCase('uk-UA')}${second}`,
);

/**
 * Волосся одним словосполученням: «темне хвилясте волосся».
 *
 * Словосполучення складається лише з варіантів довідника: їх рід і відмінок
 * відомі. Колір, який людина описала сама («Темно русий природній»,
 * «світло русяве своє, та зараз покрашена в блондинку»), між прикметником і
 * «волоссям» розвалював фразу — «темно русий природній пряме волосся». Тож
 * власна відповідь стоїть поруч, підписана: «пряме волосся, колір волосся —
 * темно русий природній». Порожньо — нема що сказати.
 */
export const describeHair = (user, lang) => {
  const presetWords = [];
  const ownAnswers = [];
  ['hairColor', 'hairStructure'].forEach(field => {
    const preset = presetSentenceWord(field, user?.[field], lang);
    if (preset) {
      presetWords.push(preset);
      return;
    }
    const raw = pickCurrent(user?.[field]);
    if (!raw || ['other', 'інше'].includes(lower(raw))) return;
    const label = field === 'hairColor'
      ? (lang === 'en' ? 'hair color' : 'колір волосся')
      : (lang === 'en' ? 'hair texture' : 'структура волосся');
    ownAnswers.push(`${label} — ${lowerFirstWord(raw)}`);
  });
  const parts = [];
  if (presetWords.length) parts.push(`${presetWords.join(' ')} ${lang === 'en' ? 'hair' : 'волосся'}`);
  return [...parts, ...ownAnswers].join(', ');
};

/*
 * Відповідь «ні» на «професія» — це не назва професії: «Я працюю за
 * професією Ні» стояло в картці дослівно. Таку відповідь речення пропускає.
 */
const NO_PROFESSION_VALUES = new Set(['ні', 'no', 'немає', 'нема', 'нет', 'не працюю', '-', '—']);

/** «Я маю вищу освіту та працюю за професією лікар.» */
export const describeWork = ({ user, lang, typed }) => {
  const used = new Set();
  const education = presetSentenceWord('education', user?.education, lang);
  if (education) used.add('education');
  const rawProfession = typed('profession');
  const noProfession = NO_PROFESSION_VALUES.has(lower(rawProfession).replace(/[.!]+$/u, ''));
  const profession = rawProfession && !noProfession ? lowerCapitalizedWords(rawProfession) : '';
  if (rawProfession) used.add('profession');
  let text = '';
  if (lang === 'en') {
    const clauses = [education ? `have ${education}` : '', profession ? `work as ${profession}` : ''].filter(Boolean);
    text = clauses.length ? sentence(`I ${clauses.join(' and ')}`) : '';
  } else {
    const clauses = [education ? `маю ${education}` : '', profession ? `працюю за професією ${profession}` : ''].filter(Boolean);
    text = clauses.length ? sentence(`я ${clauses.join(' та ')}`) : '';
  }
  return { text, used };
};

/** «Мій розмір одягу — 38, розмір взуття — 39.» */
export const describeSizes = ({ lang, typed }) => {
  const used = new Set();
  const clothing = typed('clothingSize');
  const shoe = typed('shoeSize');
  if (clothing) used.add('clothingSize');
  if (shoe) used.add('shoeSize');
  const clauses = lang === 'en'
    ? [clothing ? `my clothing size is ${clothing}` : '', shoe ? `shoe size ${shoe}` : '']
    : [clothing ? `мій розмір одягу — ${clothing}` : '', shoe ? `${clothing ? 'розмір' : 'мій розмір'} взуття — ${shoe}` : ''];
  return { text: sentence(clauses.filter(Boolean).join(', ')), used };
};
