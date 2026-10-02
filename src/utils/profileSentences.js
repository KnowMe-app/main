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

/** Варіант довідника, якому відповідає записане значення, або `null`. */
export const findPresetOption = (field, value) => {
  const text = lower(pickCurrent(value));
  if (!text) return null;
  return (OPTIONS_BY_FIELD[field] || []).find(option => (
    lower(String(option.placeholder || '')) === text || lower(String(option.ukrainian || '')) === text
  )) || null;
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
  const breast = value('breastSize');
  const race = word('race');

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
    const figure = [body ? `my body type is ${body}` : '', breast ? `breast size ${breast}` : ''].filter(Boolean).join(', ');
    if (figure) parts.push(sentence(figure));
    if (race) parts.push(sentence(`my ethnicity is ${race}`));
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
    const figure = [body ? `тип моєї фігури — ${body}` : '', breast ? `розмір грудей — ${breast}` : ''].filter(Boolean).join(', ');
    if (figure) parts.push(sentence(figure));
    if (race) parts.push(sentence(`моя раса — ${race}`));
  }
  return { text: parts.join(' '), used };
};

/**
 * Волосся одним словосполученням: «темне хвилясте волосся». Значення не з
 * довідника стоїть як записали; порожньо — нема що сказати.
 */
export const describeHair = (user, lang) => {
  const words = ['hairColor', 'hairStructure'].map(field => {
    const preset = presetSentenceWord(field, user?.[field], lang);
    if (preset) return preset;
    const raw = pickCurrent(user?.[field]);
    return raw && !['other', 'інше'].includes(lower(raw)) ? lower(raw) : '';
  }).filter(Boolean);
  if (!words.length) return '';
  return `${words.join(' ')} ${lang === 'en' ? 'hair' : 'волосся'}`;
};

/** «Я маю вищу освіту та працюю за професією лікар.» */
export const describeWork = ({ user, lang, typed }) => {
  const used = new Set();
  const education = presetSentenceWord('education', user?.education, lang);
  if (education) used.add('education');
  const profession = typed('profession');
  if (profession) used.add('profession');
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
