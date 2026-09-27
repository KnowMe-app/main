/**
 * Країна, область, місто, зріст і вага — у тому вигляді, в якому їх можна
 * показати й за яким можна фільтрувати.
 *
 * Ці поля люди заповнюють руками, і в базі вони лежать як набрали: у 278
 * опублікованих анкетах Україна записана вісьмома способами («Україна»,
 * «Україна », «Украина», «Ukraine », «УкраЇна», «Уркаїна»…), області —
 * українською, російською й англійською впереміш, міста — часто російською
 * («Славянск», «Каменское», «Коломыя»). Рядок стрічки показував це як є, тож
 * анкета читалась російською посеред українського застосунку, а фільтр
 * «Україна» не впізнавав частини українських анкет.
 *
 * Зріст і вага — те саме: форма просить сантиметри й кілограми, але частина
 * людей з-за кордону вписала фути («5»), і рядок стрічки казав «5/3 BMI 1200».
 *
 * Тут нічого не перекладається з вільного тексту: довідники нижче знають
 * конкретні назви (країни, області, міста), і лише їх показують мовою
 * інтерфейсу. Чого довідник не знає, те лишається як написали — тільки без
 * зайвих пробілів.
 */

/** Ключ для зіставлення: регістр, пробіли, апострофи й «і/и/ї», «е/є/ё». */
export const foldLocationKey = value => String(value ?? '')
  .toLowerCase()
  .replace(/[’ʼ`'"«»]/g, '')
  .replace(/[іїиы]/g, 'и')
  .replace(/[еєёэ]/g, 'е')
  .replace(/ґ/g, 'г')
  .replace(/[\s\-_.,]+/g, '')
  .trim();

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '').trim();

const buildIndex = (entries, keysOf) => {
  const index = new Map();
  entries.forEach(entry => keysOf(entry).forEach(key => {
    const folded = foldLocationKey(key);
    if (folded && !index.has(folded)) index.set(folded, entry);
  }));
  return index;
};

const pickLanguage = language => (language === 'en' ? 'en' : 'uk');

// --- країни -----------------------------------------------------------------

const COUNTRIES = [
  { code: 'UA', uk: 'Україна', en: 'Ukraine', aliases: ['Украина', 'Ukraina', 'UA', 'Укр', 'Уркаїна', 'Украіна', 'Украйна', 'Ukrainе'] },
  { code: 'PL', uk: 'Польща', en: 'Poland', aliases: ['Польша', 'Polska'] },
  { code: 'DE', uk: 'Німеччина', en: 'Germany', aliases: ['Германия', 'Deutschland'] },
  { code: 'CZ', uk: 'Чехія', en: 'Czechia', aliases: ['Чехия', 'Česko', 'Czech Republic', 'Česká republika'] },
  { code: 'SK', uk: 'Словаччина', en: 'Slovakia', aliases: ['Словакия', 'Slovensko'] },
  { code: 'HU', uk: 'Угорщина', en: 'Hungary', aliases: ['Венгрия', 'Magyarország'] },
  { code: 'ES', uk: 'Іспанія', en: 'Spain', aliases: ['Испания', 'España'] },
  { code: 'IT', uk: 'Італія', en: 'Italy', aliases: ['Италия', 'Italia'] },
  { code: 'FR', uk: 'Франція', en: 'France', aliases: ['Франция'] },
  { code: 'PT', uk: 'Португалія', en: 'Portugal', aliases: ['Португалия'] },
  { code: 'NL', uk: 'Нідерланди', en: 'Netherlands', aliases: ['Нидерланды', 'Голландия', 'Nederland', 'Holland'] },
  { code: 'AT', uk: 'Австрія', en: 'Austria', aliases: ['Австрия', 'Österreich'] },
  { code: 'CH', uk: 'Швейцарія', en: 'Switzerland', aliases: ['Швейцария', 'Schweiz'] },
  { code: 'BE', uk: 'Бельгія', en: 'Belgium', aliases: ['Бельгия'] },
  { code: 'SE', uk: 'Швеція', en: 'Sweden', aliases: ['Швеция', 'Sverige', 'Švedska'] },
  { code: 'NO', uk: 'Норвегія', en: 'Norway', aliases: ['Норвегия', 'Norge'] },
  { code: 'FI', uk: 'Фінляндія', en: 'Finland', aliases: ['Финляндия', 'Suomi'] },
  { code: 'DK', uk: 'Данія', en: 'Denmark', aliases: ['Дания', 'Danmark'] },
  { code: 'IE', uk: 'Ірландія', en: 'Ireland', aliases: ['Ирландия'] },
  { code: 'GB', uk: 'Велика Британія', en: 'United Kingdom', aliases: ['Великобритания', 'Британія', 'Англия', 'Англія', 'UK', 'Great Britain', 'England'] },
  { code: 'LT', uk: 'Литва', en: 'Lithuania', aliases: ['Lietuva'] },
  { code: 'LV', uk: 'Латвія', en: 'Latvia', aliases: ['Латвия', 'Latvija'] },
  { code: 'EE', uk: 'Естонія', en: 'Estonia', aliases: ['Эстония', 'Eesti'] },
  { code: 'RO', uk: 'Румунія', en: 'Romania', aliases: ['Румыния', 'România'] },
  { code: 'BG', uk: 'Болгарія', en: 'Bulgaria', aliases: ['Болгария'] },
  { code: 'GR', uk: 'Греція', en: 'Greece', aliases: ['Греция'] },
  { code: 'CY', uk: 'Кіпр', en: 'Cyprus', aliases: ['Кипр'] },
  { code: 'TR', uk: 'Туреччина', en: 'Turkey', aliases: ['Турция', 'Türkiye'] },
  { code: 'MD', uk: 'Молдова', en: 'Moldova', aliases: ['Молдавия'] },
  { code: 'BY', uk: 'Білорусь', en: 'Belarus', aliases: ['Беларусь', 'Белоруссия'] },
  { code: 'RU', uk: 'Росія', en: 'Russia', aliases: ['Россия', 'РФ'] },
  { code: 'GE', uk: 'Грузія', en: 'Georgia', aliases: ['Грузия', 'Sakartvelo'] },
  { code: 'AM', uk: 'Вірменія', en: 'Armenia', aliases: ['Армения'] },
  { code: 'AZ', uk: 'Азербайджан', en: 'Azerbaijan', aliases: [] },
  { code: 'KZ', uk: 'Казахстан', en: 'Kazakhstan', aliases: [] },
  { code: 'KG', uk: 'Киргизстан', en: 'Kyrgyzstan', aliases: ['Кыргызстан', 'Киргизия'] },
  { code: 'UZ', uk: 'Узбекистан', en: 'Uzbekistan', aliases: [] },
  { code: 'TM', uk: 'Туркменістан', en: 'Turkmenistan', aliases: ['Туркменистан'] },
  { code: 'IL', uk: 'Ізраїль', en: 'Israel', aliases: ['Израиль'] },
  { code: 'AE', uk: 'ОАЕ', en: 'United Arab Emirates', aliases: ['ОАЭ', 'UAE', 'Emirates'] },
  { code: 'US', uk: 'США', en: 'United States', aliases: ['USA', 'US', 'United States of America', 'Америка'] },
  { code: 'CA', uk: 'Канада', en: 'Canada', aliases: [] },
  { code: 'MX', uk: 'Мексика', en: 'Mexico', aliases: ['México'] },
  { code: 'BR', uk: 'Бразилія', en: 'Brazil', aliases: ['Бразилия', 'Brasil'] },
  { code: 'AR', uk: 'Аргентина', en: 'Argentina', aliases: [] },
  { code: 'CO', uk: 'Колумбія', en: 'Colombia', aliases: ['Колумбия'] },
  { code: 'AU', uk: 'Австралія', en: 'Australia', aliases: ['Австралия'] },
  { code: 'IN', uk: 'Індія', en: 'India', aliases: ['Индия', 'Indian', 'Bharat'] },
  { code: 'BD', uk: 'Бангладеш', en: 'Bangladesh', aliases: [] },
  { code: 'PH', uk: 'Філіппіни', en: 'Philippines', aliases: ['Филиппины'] },
  { code: 'KE', uk: 'Кенія', en: 'Kenya', aliases: ['Кения'] },
  { code: 'UG', uk: 'Уганда', en: 'Uganda', aliases: [] },
  { code: 'NG', uk: 'Нігерія', en: 'Nigeria', aliases: ['Нигерия'] },
  { code: 'GH', uk: 'Гана', en: 'Ghana', aliases: [] },
  { code: 'ZA', uk: 'Південна Африка', en: 'South Africa', aliases: ['ПАР', 'ЮАР', 'Южная Африка', 'Southafrica', 'RSA'] },
  { code: 'ZW', uk: 'Зімбабве', en: 'Zimbabwe', aliases: ['Зимбабве'] },
  { code: 'EG', uk: 'Єгипет', en: 'Egypt', aliases: ['Египет'] },
  { code: 'CN', uk: 'Китай', en: 'China', aliases: [] },
  { code: 'TH', uk: 'Таїланд', en: 'Thailand', aliases: ['Таиланд'] },
];

const COUNTRY_INDEX = buildIndex(COUNTRIES, entry => [entry.code, entry.uk, entry.en, ...entry.aliases]);

/** Код країни (`UA`, `PL`…) або порожній рядок, якщо довідник її не знає. */
export const resolveCountryCode = value => COUNTRY_INDEX.get(foldLocationKey(value))?.code || '';

export const isUkraineCountry = value => resolveCountryCode(value) === 'UA';

/** Назва країни мовою інтерфейсу; незнайома — як написали, без зайвих пробілів. */
export const formatCountryName = (value, language) => {
  const text = cleanText(value);
  if (!text) return '';
  const entry = COUNTRY_INDEX.get(foldLocationKey(text));
  return entry ? entry[pickLanguage(language)] : text;
};

// --- області України ---------------------------------------------------------

const OBLASTS = [
  { uk: 'Вінницька', en: 'Vinnytsia', aliases: ['Винницкая', 'Vinnytska', 'Vinnitsa'] },
  { uk: 'Волинська', en: 'Volyn', aliases: ['Волынская', 'Volynska'] },
  { uk: 'Дніпропетровська', en: 'Dnipropetrovsk', aliases: ['Днепропетровская', 'Dnipropetrovska', 'Dnipro', 'Dnepropetrovsk'] },
  { uk: 'Донецька', en: 'Donetsk', aliases: ['Донецкая', 'Donetska'] },
  { uk: 'Житомирська', en: 'Zhytomyr', aliases: ['Житомирская', 'Zhytomyrska', 'Zhitomir'] },
  { uk: 'Закарпатська', en: 'Zakarpattia', aliases: ['Закарпатская', 'Zakarpatska', 'Transcarpathian'] },
  { uk: 'Запорізька', en: 'Zaporizhzhia', aliases: ['Запорожская', 'Zaporizka', 'Zaporozhye'] },
  { uk: 'Івано-Франківська', en: 'Ivano-Frankivsk', aliases: ['Ивано-Франковская', 'Ivano-Frankivska'] },
  { uk: 'Київська', en: 'Kyiv', aliases: ['Киевская', 'Kyivska', 'Kiev', 'Київщина'] },
  { uk: 'Кіровоградська', en: 'Kirovohrad', aliases: ['Кировоградская', 'Kirovohradska', 'Kropyvnytskyi'] },
  { uk: 'Луганська', en: 'Luhansk', aliases: ['Луганская', 'Luhanska', 'Lugansk'] },
  { uk: 'Львівська', en: 'Lviv', aliases: ['Львовская', 'Lvivska'] },
  { uk: 'Миколаївська', en: 'Mykolaiv', aliases: ['Николаевская', 'Mykolaivska', 'Nikolaev'] },
  { uk: 'Одеська', en: 'Odesa', aliases: ['Одесская', 'Odeska', 'Odessa'] },
  { uk: 'Полтавська', en: 'Poltava', aliases: ['Полтавская', 'Poltavska'] },
  { uk: 'Рівненська', en: 'Rivne', aliases: ['Ровенская', 'Ровненская', 'Rivnenska'] },
  { uk: 'Сумська', en: 'Sumy', aliases: ['Сумская', 'Sumska'] },
  { uk: 'Тернопільська', en: 'Ternopil', aliases: ['Тернопольская', 'Ternopilska'] },
  { uk: 'Харківська', en: 'Kharkiv', aliases: ['Харьковская', 'Kharkivska', 'Kharkov'] },
  { uk: 'Херсонська', en: 'Kherson', aliases: ['Херсонская', 'Khersonska'] },
  { uk: 'Хмельницька', en: 'Khmelnytskyi', aliases: ['Хмельницкая', 'Khmelnytska'] },
  { uk: 'Черкаська', en: 'Cherkasy', aliases: ['Черкасская', 'Cherkaska'] },
  { uk: 'Чернівецька', en: 'Chernivtsi', aliases: ['Черновицкая', 'Chernivetska'] },
  { uk: 'Чернігівська', en: 'Chernihiv', aliases: ['Черниговская', 'Chernihivska'] },
];

// Суфікс «область» у будь-якому з написань, які трапляються в базі. Без нього
// англійська назва центру («Odessa») може бути й містом, тож область
// впізнається лише з прикметника («Одеська», «Одесская») або з суфіксом.
const OBLAST_SUFFIX_RE = /\s*(?:область|обл\.?|oblast|obl\.?|region|reg\.?)\s*$/i;
const ADJECTIVE_KEYS = entry => [entry.uk, ...entry.aliases.filter(alias => /(ська|цька|зька|ская|цкая|зкая|ska|ka)$/i.test(alias))];
const OBLAST_ADJECTIVE_INDEX = buildIndex(OBLASTS, ADJECTIVE_KEYS);
const OBLAST_ANY_INDEX = buildIndex(OBLASTS, entry => [entry.uk, entry.en, ...entry.aliases]);

export const resolveOblast = value => {
  const text = cleanText(value);
  if (!text) return null;
  const hasSuffix = OBLAST_SUFFIX_RE.test(text);
  const base = text.replace(OBLAST_SUFFIX_RE, '');
  const key = foldLocationKey(base);
  return (hasSuffix ? OBLAST_ANY_INDEX : OBLAST_ADJECTIVE_INDEX).get(key) || null;
};

/**
 * Область мовою інтерфейсу: «Київська область» (або «Київська обл.», коли
 * `short`) і «Kyiv Oblast». Незнайома область — як написали.
 */
export const formatRegionName = (value, language, { short = false } = {}) => {
  const text = cleanText(value);
  if (!text) return '';
  const oblast = resolveOblast(text);
  if (!oblast) return text;
  if (pickLanguage(language) === 'en') return `${oblast.en} Oblast`;
  return `${oblast.uk} ${short ? 'обл.' : 'область'}`;
};

// --- міста України ----------------------------------------------------------

// Лише найчастіші — ті, що справді трапляються в анкетах, і обласні центри.
// Решту міст довідник не знає, і вони лишаються як написали.
const CITIES = [
  ['Київ', 'Kyiv', ['Киев', 'Kiev']],
  ['Харків', 'Kharkiv', ['Харьков', 'Kharkov']],
  ['Дніпро', 'Dnipro', ['Днепр', 'Днепропетровськ', 'Днепропетровск', 'Dnepr']],
  ['Одеса', 'Odesa', ['Одесса', 'Odessa']],
  ['Запоріжжя', 'Zaporizhzhia', ['Запорожье', 'Zaporozhye']],
  ['Львів', 'Lviv', ['Львов']],
  ['Миколаїв', 'Mykolaiv', ['Николаев', 'Nikolaev']],
  ['Кривий Ріг', 'Kryvyi Rih', ['Кривой Рог', 'Krivoy Rog']],
  ['Вінниця', 'Vinnytsia', ['Винница', 'Vinnitsa']],
  ['Полтава', 'Poltava', []],
  ['Чернігів', 'Chernihiv', ['Чернигов']],
  ['Черкаси', 'Cherkasy', ['Черкассы']],
  ['Житомир', 'Zhytomyr', []],
  ['Суми', 'Sumy', ['Сумы']],
  ['Рівне', 'Rivne', ['Ровно']],
  ['Луцьк', 'Lutsk', ['Луцк']],
  ['Тернопіль', 'Ternopil', ['Тернополь']],
  ['Івано-Франківськ', 'Ivano-Frankivsk', ['Ивано-Франковск']],
  ['Ужгород', 'Uzhhorod', []],
  ['Чернівці', 'Chernivtsi', ['Черновцы']],
  ['Хмельницький', 'Khmelnytskyi', ['Хмельницкий']],
  ['Кропивницький', 'Kropyvnytskyi', ['Кропивницкий', 'Кировоград']],
  ['Херсон', 'Kherson', []],
  ['Маріуполь', 'Mariupol', ['Мариуполь']],
  ['Краматорськ', 'Kramatorsk', ['Краматорск']],
  ["Слов'янськ", 'Sloviansk', ['Славянск', 'Slavyansk']],
  ['Бахмут', 'Bakhmut', []],
  ['Покровськ', 'Pokrovsk', ['Покровск']],
  ['Костянтинівка', 'Kostiantynivka', ['Константиновка']],
  ['Дружківка', 'Druzhkivka', ['Дружковка']],
  ['Сєвєродонецьк', 'Sievierodonetsk', ['Северодонецк']],
  ['Лисичанськ', 'Lysychansk', ['Лисичанск']],
  ["Кам'янське", 'Kamianske', ['Каменское', 'Днепродзержинск']],
  ['Нікополь', 'Nikopol', ['Никополь']],
  ['Павлоград', 'Pavlohrad', []],
  ['Новомосковськ', 'Novomoskovsk', ['Новомосковск']],
  ['Марганець', 'Marhanets', ['Марганец']],
  ['Мелітополь', 'Melitopol', ['Мелитополь']],
  ['Бердянськ', 'Berdiansk', ['Бердянск']],
  ['Енергодар', 'Enerhodar', ['Энергодар']],
  ['Кременчук', 'Kremenchuk', ['Кременчуг']],
  ['Лубни', 'Lubny', ['Лубны']],
  ['Миргород', 'Myrhorod', []],
  ['Біла Церква', 'Bila Tserkva', ['Белая Церковь']],
  ['Бровари', 'Brovary', ['Бровары']],
  ['Бориспіль', 'Boryspil', ['Борисполь']],
  ['Ірпінь', 'Irpin', ['Ирпень']],
  ['Буча', 'Bucha', []],
  ['Васильків', 'Vasylkiv', ['Васильков']],
  ['Фастів', 'Fastiv', ['Фастов']],
  ['Обухів', 'Obukhiv', ['Обухов']],
  ['Вишневе', 'Vyshneve', ['Вишневое']],
  ["Кам'янець-Подільський", 'Kamianets-Podilskyi', ['Каменец-Подольский']],
  ['Коломия', 'Kolomyia', ['Коломыя']],
  ['Калуш', 'Kalush', []],
  ['Дрогобич', 'Drohobych', ['Дрогобыч']],
  ['Стрий', 'Stryi', ['Стрый']],
  ['Мукачево', 'Mukachevo', []],
  ['Ковель', 'Kovel', []],
  ['Умань', 'Uman', []],
  ['Сміла', 'Smila', ['Смела']],
  ['Олександрія', 'Oleksandriia', ['Александрия']],
  ["Знам'янка", 'Znamianka', ['Знаменка']],
  ['Світловодськ', 'Svitlovodsk', ['Светловодск']],
  ['Ніжин', 'Nizhyn', ['Нежин']],
  ['Прилуки', 'Pryluky', []],
  ['Конотоп', 'Konotop', []],
  ['Шостка', 'Shostka', []],
  ['Охтирка', 'Okhtyrka', ['Ахтырка']],
  ['Бердичів', 'Berdychiv', ['Бердичев']],
  ['Коростень', 'Korosten', []],
  ['Ізмаїл', 'Izmail', ['Измаил']],
  ['Чорноморськ', 'Chornomorsk', ['Черноморск', 'Ильичевск']],
  ['Білгород-Дністровський', 'Bilhorod-Dnistrovskyi', ['Белгород-Днестровский']],
  ['Первомайськ', 'Pervomaisk', ['Первомайск']],
  ['Вознесенськ', 'Voznesensk', ['Вознесенск']],
  ['Южноукраїнськ', 'Yuzhnoukrainsk', ['Южноукраинск']],
  ['Нова Каховка', 'Nova Kakhovka', ['Новая Каховка']],
  ['Ізюм', 'Izium', ['Изюм']],
  ['Лозова', 'Lozova', ['Лозовая']],
  ['Чугуїв', 'Chuhuiv', ['Чугуев']],
  ['Нетішин', 'Netishyn', ['Нетешин']],
  ['Шепетівка', 'Shepetivka', ['Шепетовка']],
  ['Жмеринка', 'Zhmerynka', []],
  ['Могилів-Подільський', 'Mohyliv-Podilskyi', ['Могилев-Подольский']],
].map(([uk, en, aliases]) => ({ uk, en, aliases }));

const CITY_INDEX = buildIndex(CITIES, entry => [entry.uk, entry.en, ...entry.aliases]);

// Префікс типу поселення: «Пгт» — російське «поселок городского типа», тобто
// «смт»; «г.» — «город», тобто «м.». Решта префіксів («с.», «село», «м.»)
// лишається як є.
const SETTLEMENT_PREFIXES = [
  [/^(?:пгт|п\.г\.т\.?)\s+/i, 'смт '],
  [/^(?:г\.|город)\s*/i, 'м. '],
];

// Префікси, які вже українські й лишаються як написали.
const KEPT_SETTLEMENT_PREFIX_RE = /^(?:м\.|місто|с\.|село|смт)\s*/i;

/** Місто мовою інтерфейсу, якщо довідник його знає; інакше — як написали. */
export const formatCityName = (value, language) => {
  let text = cleanText(value);
  if (!text) return '';
  let prefix = '';
  SETTLEMENT_PREFIXES.forEach(([pattern, replacement]) => {
    if (!prefix && pattern.test(text)) {
      prefix = replacement;
      text = text.replace(pattern, '').trim();
    }
  });
  const kept = !prefix && text.match(KEPT_SETTLEMENT_PREFIX_RE);
  if (kept) {
    prefix = `${kept[0].trim()} `;
    text = text.slice(kept[0].length).trim();
  }
  const known = CITY_INDEX.get(foldLocationKey(text));
  const name = known ? known[pickLanguage(language)] : text;
  return `${prefix}${name}`.trim();
};

// --- зріст, вага, ІМТ -------------------------------------------------------

const toNumber = value => {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
};

const FOOT_CM = 30.48;
const INCH_CM = 2.54;

/**
 * Зріст у сантиметрах — або `null`, якщо з того, що записано, його не
 * вивести.
 *
 * Форма просить сантиметри, але частина анкет з-за кордону має фути: «5»,
 * «5'4», «5.4» (п'ять футів чотири дюйми). Метри («1.68») трапляються теж.
 * Усе, що не лягає в людський зріст ні в якій з цих одиниць, не показується
 * зовсім — «5» сантиметрів краще не казати, ніж казати.
 */
export const normalizeHeightCm = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const feetInches = text.match(/^(\d)\s*(?:ft|['′’])\s*(\d{1,2})?/i);
  if (feetInches) {
    const cm = Number(feetInches[1]) * FOOT_CM + Number(feetInches[2] || 0) * INCH_CM;
    return cm >= 120 && cm <= 230 ? Math.round(cm) : null;
  }
  const n = toNumber(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 120 && n <= 230) return Math.round(n);
  if (n >= 1.2 && n <= 2.3) return Math.round(n * 100);
  if (n >= 4 && n < 8) {
    // «5.4» у футах — це п'ять футів чотири дюйми, а не 5,4 фута.
    const [feet, inches = '0'] = String(n).split('.');
    const cm = Number(feet) * FOOT_CM + Number(inches.slice(0, 2)) * INCH_CM;
    return cm >= 120 && cm <= 230 ? Math.round(cm) : null;
  }
  return null;
};

/** Вага в кілограмах (фунти перераховуються) — або `null`, якщо неправдоподібна. */
export const normalizeWeightKg = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = toNumber(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = /\b(lb|lbs|pounds?|фунт)/i.test(text) ? n * 0.45359237 : n;
  return kg >= 30 && kg <= 250 ? Math.round(kg) : null;
};

/**
 * ІМТ із нормалізованих зросту й ваги. Неправдоподібний результат не
 * показується: «BMI 1200» не каже нічого, крім того, що одиниці переплутані.
 */
export const computeBmi = (height, weight) => {
  const cm = normalizeHeightCm(height);
  const kg = normalizeWeightKg(weight);
  if (!cm || !kg) return null;
  const bmi = kg / ((cm / 100) ** 2);
  return bmi >= 12 && bmi <= 70 ? Math.round(bmi) : null;
};

// --- введення ---------------------------------------------------------------

/**
 * Що записати в анкету, коли людина закінчила вводити поле (на blur).
 *
 * Країна, область і місто, які знає довідник, записуються канонічною
 * українською назвою — так само, як їх підказує сама форма («Україна»,
 * «Київська», «Київ»). Зріст у футах чи метрах записується сантиметрами.
 * Під час набору нічого не міняється: «Кие» — це ще не «Київ».
 */
export const normalizeProfileFieldInput = (name, value) => {
  if (typeof value !== 'string') return value;
  if (name === 'country') {
    const entry = COUNTRY_INDEX.get(foldLocationKey(value));
    return entry ? entry.uk : cleanText(value);
  }
  if (name === 'region') {
    const oblast = resolveOblast(value);
    return oblast ? oblast.uk : cleanText(value);
  }
  if (name === 'city') return formatCityName(value, 'uk');
  if (name === 'height') {
    const cm = normalizeHeightCm(value);
    return cm ? String(cm) : value;
  }
  return value;
};
