import { parseProgramAmount } from './programCurrency';

/**
 * Відповіді анкети донорки й СМ, які форма питає готовими варіантами, а
 * картка читає назад: куріння й алкоголь, «Так» з подробицею, бажана
 * винагорода, де людина готова проходити програму.
 *
 * Форма й картка ходять сюди обидві, і так навмисно: поки варіант жив лише у
 * формі, картка показувала його сирим англійським словом («Куріння:
 * sometimes»), бо значення в базі — англійське, як і в решти довідників.
 */

// --- куріння й алкоголь ----------------------------------------------------

/*
 * «Так/Ні/Свій варіант» про куріння питало не те: курять «іноді» й
 * «кинула», а не «по-своєму», і «Свій варіант» лишав людину сам на сам із
 * порожнім полем. Тепер це готові варіанти (на прохання власниці продукту).
 * `Yes`/`No` — ті самі значення, що й раніше, тож записані відповіді
 * читаються як були.
 */
export const HABIT_SOMETIMES = 'Sometimes';
export const HABIT_QUIT = 'Quit';

export const MY_PROFILE_HABIT_CHOICES = Object.freeze({
  smoking: Object.freeze([
    { value: 'No', label: 'Не курю' },
    { value: 'Yes', label: 'Курю' },
    { value: HABIT_SOMETIMES, label: 'Іноді' },
    { value: HABIT_QUIT, label: 'Припинила' },
  ]),
  alcohol: Object.freeze([
    { value: 'No', label: 'Не вживаю' },
    { value: HABIT_SOMETIMES, label: 'Іноді' },
    { value: 'Yes', label: 'Вживаю' },
  ]),
});

const SOMETIMES_ANSWERS = new Set(['sometimes', 'іноді', 'інколи']);
const QUIT_ANSWERS = new Set(['quit', 'припинила', 'кинула']);

/** `sometimes` / `quit` / `''` — для речень картки (`ProfileFacts`). */
export const readHabitExtraKind = raw => {
  const lower = String(raw ?? '').trim().toLowerCase();
  if (SOMETIMES_ANSWERS.has(lower)) return 'sometimes';
  if (QUIT_ANSWERS.has(lower)) return 'quit';
  return '';
};

// --- «Так» з подробицями ---------------------------------------------------

/*
 * Операції, хронічні хвороби, алергії, ускладнення й окуляри: «Ні» або «Так»,
 * і лише після «Так» — поле «Що саме?». Тут стояв третій чіп «Уточнити» чи
 * «Детальніше» поруч із «Так», і людина не знала, який із двох обрати.
 * Подробиця лягає в те саме поле замість `Yes` — так їх і читала картка, —
 * а порожня подробиця лишає `Yes`.
 */
export const YES_WITH_DETAILS_FIELDS = Object.freeze(['surgeries', 'chronicDiseases', 'allergy', 'healthComplications', 'glasses']);

const NO_ANSWERS = new Set(['no', 'ні', 'немає', 'нема', 'відсутні', 'не було', '-', '0', 'false']);

/** `'No'` / `'Yes'` / `''` — який із двох чіпів світиться. */
export const readYesWithDetails = raw => {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return NO_ANSWERS.has(text.toLowerCase()) ? 'No' : 'Yes';
};

/** Подробиця під «Так»: сам текст, а голе `Yes` — порожньо. */
export const readYesDetails = raw => {
  const text = String(raw ?? '').trim();
  if (!text || readYesWithDetails(text) !== 'Yes') return '';
  return ['yes', 'так', '+', 'true'].includes(text.toLowerCase()) ? '' : text;
};

// --- де готова проходити програму ----------------------------------------

/*
 * «Де ви готові проходити програму?» — кілька відповідей разом, рядком кодів
 * через кому. Коди, а не слова: картка показує їх мовою читача. У картці
 * вони стоять посеред речення (`phrase`), а не на чіпі: зводити підпис чіпа
 * до малої літери не можна — німецька тримає велику в іменниках.
 */
export const PROGRAM_PLACE_CHOICES = Object.freeze([
  { value: 'city', label: 'У своєму місті', phrase: 'у своєму місті' },
  { value: 'country', label: 'В іншому місті', phrase: 'в іншому місті' },
  { value: 'abroad', label: 'За кордоном', phrase: 'за кордоном' },
]);

const PROGRAM_PLACE_CODES = new Set(PROGRAM_PLACE_CHOICES.map(choice => choice.value));

export const parseProgramPlaces = raw => {
  const seen = new Set(String(raw ?? '').split(',').map(item => item.trim()).filter(code => PROGRAM_PLACE_CODES.has(code)));
  return PROGRAM_PLACE_CHOICES.map(choice => choice.value).filter(code => seen.has(code));
};

export const encodeProgramPlaces = codes => parseProgramPlaces((codes || []).join(',')).join(',');

// --- бажана винагорода -----------------------------------------------------

/*
 * Сума, валюта й «Хочу обговорити» замість вільного тексту. Пишеться так само
 * рядком (`15000 $`), тож поле в базі й показ лишились тими самими, а старий
 * текст («від 1000 $, залежить від програми») читається як був.
 * «Хочу обговорити» — слово з бази (`Negotiable`), а не українська фраза:
 * картка показує його мовою читача.
 */
export const REWARD_NEGOTIABLE = 'Negotiable';
export const REWARD_CURRENCIES = Object.freeze(['$', '€', '₴']);
export const DEFAULT_REWARD_CURRENCY = '$';

const CURRENCY_ALIASES = [
  ['$', /^(\$|usd|дол\.?|долар(?:ів|и)?)$/i],
  ['€', /^(€|eur|євро)$/i],
  ['₴', /^(₴|uah|грн\.?|гривень|гривні)$/i],
];

const readCurrency = token => {
  const text = String(token ?? '').trim();
  if (!text) return '';
  return CURRENCY_ALIASES.find(([, pattern]) => pattern.test(text))?.[0] || null;
};

/**
 * `{ kind: 'empty' }`, `{ kind: 'negotiable' }`, `{ kind: 'amount', amount,
 * currency }` або `{ kind: 'text', text }` — те, чого форма не розбирає.
 */
export const parseRewardValue = raw => {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'empty' };
  if (text.toLowerCase() === REWARD_NEGOTIABLE.toLowerCase()) return { kind: 'negotiable' };
  const match = /^(\$|€|₴)?\s*(\d[\d\s.,  ]*)\s*([^\d\s].*)?$/.exec(text);
  if (match) {
    const currency = match[1] || readCurrency(match[3]);
    const amount = parseProgramAmount(match[2]);
    if (amount && currency !== null && !(match[1] && match[3])) {
      return { kind: 'amount', amount, currency: currency || DEFAULT_REWARD_CURRENCY };
    }
  }
  return { kind: 'text', text };
};

export const composeRewardValue = ({ amount, currency } = {}) => {
  const parsed = parseProgramAmount(amount);
  if (!parsed) return '';
  return `${parsed} ${REWARD_CURRENCIES.includes(currency) ? currency : DEFAULT_REWARD_CURRENCY}`;
};

const groupDigits = amount => String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Як показати винагороду читачеві: сума з розрядами й валютою, «Хочу
 * обговорити» — словами (`negotiableText`), старий текст — як написали.
 */
export const formatRewardForDisplay = (raw, negotiableText) => {
  const parsed = parseRewardValue(raw);
  if (parsed.kind === 'empty') return '';
  if (parsed.kind === 'negotiable') return negotiableText;
  if (parsed.kind === 'amount') return `${groupDigits(parsed.amount)} ${parsed.currency}`;
  return parsed.text;
};
