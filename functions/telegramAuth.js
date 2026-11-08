'use strict';

const crypto = require('crypto');

/**
 * Вхід і реєстрація через Telegram-бота — основний спосіб входу KnowMe.
 *
 * Чому бот, а не SMS: для донорок і СМ телефон — це Telegram, пошта — для
 * ділового листування, і реєстрація поштою їм чужа. SMS Firebase платна з
 * кожного повідомлення (Україна — серед найдорожчих) і ще й мішень SMS
 * pumping. Бот віддає **підтверджений** номер акаунта Telegram безкоштовно:
 * кнопка `request_contact` надсилає контакт самого відправника, і
 * `contact.user_id === from.id` доводить, що номер його, а не пересланий.
 *
 * Потік:
 * 1. Застосунок генерує одноразовий `nonce` (128 біт) і відкриває
 *    `t.me/<бот>?start=<nonce>`. Сам `nonce` у базі не лежить — лише його
 *    sha256 (`telegramLogins/{hash}`): прочитавши вузол, сесію не вкрадеш.
 * 2. `/start <nonce>` — бот привʼязує спробу до акаунта Telegram і просить
 *    поділитися номером.
 * 3. Контакт — бот знаходить чи заводить акаунт Firebase
 *    (`telegramAccounts/{tgId}` → uid), випускає custom token і кладе його в
 *    спробу.
 * 4. Бот показує людині одноразовий код із шести цифр. Застосунок питає
 *    `completeTelegramLogin` з тим самим `nonce` **і цим кодом**, забирає
 *    токен рівно один раз і входить `signInWithCustomToken`.
 *
 * Чому код, а не самий `nonce`: посилання на бота може згенерувати будь-хто й
 * підсунути чужій людині («підтвердіть номер»). Без коду номер ділила б
 * жертва, а сесію забирав би браузер того, хто згенерував посилання. Код
 * бачить лише власник акаунта Telegram, і ввести його мусить той браузер, що
 * чекає, — рівень SMS-коду. П'ять хибних спроб спалюють вхід.
 *
 * Усі вузли пише лише функція (Admin SDK); у `database.rules.json` їх немає,
 * тож клієнтам вони закриті коренем — викочувати правила не треба.
 *
 * Модуль — чиста логіка з підставними залежностями (`deps`), щоб його можна
 * було перевірити без мережі (`test/telegramAuth.test.js`).
 */

const LOGIN_TTL_MS = 10 * 60 * 1000;
const LOGINS_ROOT = 'telegramLogins';
const LOGINS_BY_TG_ROOT = 'telegramLoginsByTg';
const ACCOUNTS_ROOT = 'telegramAccounts';
const APP_URL = 'https://knowme.pp.ua/login';
const PROFILE_URL = 'https://knowme.pp.ua/my-profile';
const MAX_CODE_ATTEMPTS = 5;

const defaultRandomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (key, code) => crypto.createHash('sha256').update(`${key}:${code}`).digest('hex');
const normalizeCode = code => String(code || '').replace(/\D/g, '');

// base64url від 16 байт — 22 знаки; Telegram пускає в `start` до 64 знаків
// [A-Za-z0-9_-]. Довшого чи коротшого застосунок не шле.
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

const isValidNonce = nonce => typeof nonce === 'string' && NONCE_PATTERN.test(nonce);

const hashNonce = nonce => crypto.createHash('sha256').update(String(nonce)).digest('hex');

const parseStartPayload = text => {
  const match = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(String(text || '').trim());
  if (!match) return null;
  return match[1] || '';
};

// Номер — так само, як його пише застосунок: самі цифри, без «+».
const normalizeTelegramPhone = value => String(value || '').replace(/\D/g, '');

const isExpired = (record, now) => !record || !Number.isFinite(record.createdAt) || now - record.createdAt > LOGIN_TTL_MS;

const BOT_TEXTS = Object.freeze({
  askContact:
    'Вхід у KnowMe (knowme.pp.ua).\n\n'
    + 'Натисніть зелену кнопку «📱 Поділитися номером» унизу екрана — так ми підтвердимо, що це ви. '
    + 'Пароль і пошта не потрібні.\n\n'
    + 'Якщо ви не відкривали KnowMe щойно — нічого не натискайте.',
  shareButton: '📱 Поділитися номером',
  // Окремим повідомленням, бо прибрати клавіатуру «Поділитися номером» і
  // дати кнопку посилання одне повідомлення не може: `reply_markup` один.
  contactReceived: '✅ Номер підтверджено.',
  // Код — у `<code>`: Telegram копіює моноширинний текст одним дотиком, і
  // це запасний шлях для входу, початого на іншому пристрої. Основний —
  // одна кнопка «Увійти в KnowMe»: вона несе код у фрагменті адреси
  // (`#tgcode=…`, на сервер не йде), і сторінка підставляє його сама — але
  // лише в спробу, що лежить у цьому браузері. Nonce у кнопці немає, тож
  // жертва підсунутого посилання, натиснувши її, завершити чужу спробу не
  // може, а код до того, хто посилання згенерував, не потрапляє
  // (docs/telegram-login.md). Решта тексту — без `<`, `>` і `&`.
  done: code => `Ваш код для входу в KnowMe: <code>${code}</code>\n\n`
    + 'Натисніть «Увійти в KnowMe» нижче — код підставиться сам.\n'
    + 'Почали вхід на іншому пристрої? Торкніться коду, щоб скопіювати, і введіть його там.\n\n'
    + '⚠️ Нікому не повідомляйте цей код — навіть якщо просять «підтвердити номер». '
    + 'Хто його знає, той увійде у ваш акаунт.',
  alreadyDone: 'Код для входу вже надіслано вище. Поверніться в KnowMe й введіть його.',
  returnButton: 'Повернутися в KnowMe',
  loginButton: '✅ Увійти в KnowMe',
  foreignContact: 'Надішліть, будь ласка, свій номер кнопкою «📱 Поділитися номером», а не чужий контакт.',
  noLogin: 'Щоб увійти, відкрийте KnowMe і натисніть «Увійти через Telegram».',
  expired: 'Час на вхід минув. Відкрийте KnowMe і натисніть «Увійти через Telegram» ще раз.',
  claimed: 'Це посилання для входу вже використано. Відкрийте KnowMe і натисніть «Увійти через Telegram» ще раз.',
  failed: 'Не вдалося завершити вхід. Спробуйте ще раз за хвилину.',
  linkAskContact:
    'Привʼязка Telegram до акаунта KnowMe (knowme.pp.ua).\n\n'
    + 'Натисніть «📱 Поділитися номером» нижче. Після цього «Увійти через Telegram» '
    + 'відкриватиме ваш наявний акаунт, а не новий.\n\n'
    + 'Якщо ви не відкривали «Мій профіль» щойно — нічого не натискайте.',
  linkDone: code => `Код для привʼязки Telegram: <code>${code}</code>\n\n`
    + 'Натисніть «Привʼязати Telegram» нижче — код підставиться сам.\n'
    + 'Почали на іншому пристрої? Торкніться коду, щоб скопіювати, і введіть його там.\n\n'
    + '⚠️ Нікому не повідомляйте цей код. Хто його знає, той привʼяже ваш Telegram до свого акаунта.',
  linkButton: '✅ Привʼязати Telegram',
});

// Кнопку `request_contact` Telegram дає лише в клавіатурі під полем вводу —
// під повідомленням (`inline_keyboard`) такої немає. Тож робимо помітною її:
// `style: 'success'` (Bot API 9.4) фарбує кнопку в зелений, як кнопка коду;
// клієнти без підтримки поле пропускають. `is_persistent` не дає згорнути
// клавіатуру в значок, а підказка в полі вводу показує, куди натиснути.
// `one_time_keyboard` не ставимо: клавіатуру прибирає `remove_keyboard` після
// контакту, а після чужого контакту вона мусить лишитись.
const contactKeyboard = () => ({
  keyboard: [[{ text: BOT_TEXTS.shareButton, request_contact: true, style: 'success' }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Натисніть «Поділитися номером» ↓',
});

const openAppButton = () => ({
  inline_keyboard: [[{ text: 'Відкрити KnowMe', url: APP_URL }]],
});

// Після коду людина мусить повернутись на сайт, а в Telegram посилання на
// нього не було — лише текст «введіть на сторінці». Кнопка веде на `/login`:
// спроба лежить у `localStorage` браузера, тож і нова вкладка показує поле
// для коду (`src/utils/telegramAuth.js`).
const returnToAppButton = () => ({
  inline_keyboard: [[{ text: BOT_TEXTS.returnButton, url: APP_URL }]],
});

// Одна кнопка замість двох («Скопіювати код» + «Повернутися в KnowMe»):
// кнопка Telegram має рівно одну дію, а копіювати й потім вставляти — два
// зайві кроки. Код їде у фрагменті (`#tgcode=`), і сторінка підставляє його в
// спробу цього браузера (`readTelegramCodeFromHash` у src/utils/telegramAuth).
const buildCodeUrl = (code, url = APP_URL) => `${url}#tgcode=${encodeURIComponent(String(code))}`;

const codeButtons = (code, url = APP_URL, text = BOT_TEXTS.loginButton) => ({
  inline_keyboard: [[{ text, url: buildCodeUrl(code, url), style: 'success' }]],
});

/**
 * Привʼязує спробу входу до акаунта Telegram. Спробу, яку вже взяв інший
 * акаунт Telegram, не переписує: інакше чужий `/start` з тим самим посиланням
 * перехопив би вхід.
 */
const handleStart = async ({ nonce, tgId, chatId }, { db, sendMessage, now }) => {
  if (!isValidNonce(nonce)) {
    await sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'no-login';
  }
  const key = hashNonce(nonce);
  let outcome = 'pending';
  let linking = false;
  await db.transaction(`${LOGINS_ROOT}/${key}`, current => {
    if (current && current.tgId && current.tgId !== tgId) {
      outcome = 'claimed';
      return undefined;
    }
    if (current && current.status === 'ready') {
      outcome = 'ready';
      return undefined;
    }
    outcome = 'pending';
    linking = Boolean(current && current.linkUid);
    // Спроба привʼязки (`linkUid`) заводиться застосунком ще до `/start`
    // (`startTelegramLink`) і мусить пережити цей запис.
    return {
      tgId,
      chatId,
      status: 'pending',
      createdAt: (current && current.createdAt) || now,
      ...(current && current.linkUid ? { linkUid: current.linkUid } : {}),
    };
  });
  if (outcome === 'claimed') {
    await sendMessage(chatId, BOT_TEXTS.claimed, openAppButton());
    return outcome;
  }
  if (outcome === 'ready') {
    await sendMessage(chatId, BOT_TEXTS.alreadyDone, returnToAppButton());
    return outcome;
  }
  // Попередня незавершена спроба тієї самої людини більше не потрібна: вхід
  // іде за новим посиланням. Так один акаунт Telegram, хоч скільки разів
  // натисни «старт», тримає в базі одну спробу, а не по запису на дотик.
  const previous = await db.get(`${LOGINS_BY_TG_ROOT}/${tgId}`);
  if (previous && previous.key && previous.key !== key) {
    await db.transaction(`${LOGINS_ROOT}/${previous.key}`, current => {
      if (current === null) return null;
      if (!current || current.tgId !== tgId || current.status !== 'pending' || current.linkUid) return undefined;
      return null;
    });
  }
  await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, { key, at: now });
  await sendMessage(chatId, linking ? BOT_TEXTS.linkAskContact : BOT_TEXTS.askContact, contactKeyboard());
  return outcome;
};

/**
 * Акаунт Firebase за акаунтом Telegram. Новий заводиться з автоматичним uid
 * (28 знаків — `isAccountProfileCard` впізнає його як анкету акаунта).
 * Дві одночасні спроби одного акаунта Telegram не заводять двох акаунтів:
 * перемагає перший запис мапи, зайвий акаунт видаляється.
 */
const resolveAccount = async ({ tgId, displayName }, { db, auth, now }) => {
  const existing = await db.get(`${ACCOUNTS_ROOT}/${tgId}`);
  if (existing && existing.uid) {
    try {
      await auth.getUser(existing.uid);
      return { uid: existing.uid, isNew: false };
    } catch (error) {
      if (error && error.code !== 'auth/user-not-found') throw error;
      // Акаунт видалили з консолі — мапа вказує в нікуди, заводимо новий.
      await db.set(`${ACCOUNTS_ROOT}/${tgId}`, null);
    }
  }
  const created = await auth.createUser(displayName ? { displayName } : {});
  let winnerUid = created.uid;
  await db.transaction(`${ACCOUNTS_ROOT}/${tgId}`, current => {
    if (current && current.uid) {
      winnerUid = current.uid;
      return undefined;
    }
    winnerUid = created.uid;
    return { uid: created.uid, createdAt: now };
  });
  if (winnerUid !== created.uid) {
    await auth.deleteUser(created.uid).catch(() => {});
    return { uid: winnerUid, isNew: false };
  }
  return { uid: created.uid, isNew: true };
};

const handleContact = async ({ message, tgId, chatId }, deps) => {
  const { db, auth, sendMessage, now } = deps;
  const contact = message.contact || {};
  if (String(contact.user_id || '') !== tgId) {
    await sendMessage(chatId, BOT_TEXTS.foreignContact, contactKeyboard());
    return 'foreign-contact';
  }
  const pointer = await db.get(`${LOGINS_BY_TG_ROOT}/${tgId}`);
  if (!pointer || !pointer.key) {
    await sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'no-login';
  }
  const loginPath = `${LOGINS_ROOT}/${pointer.key}`;
  const login = await db.get(loginPath);
  if (!login || login.tgId !== tgId || login.status !== 'pending' || isExpired(login, now)) {
    await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, null);
    await sendMessage(chatId, BOT_TEXTS.expired, openAppButton());
    return 'expired';
  }

  const phone = normalizeTelegramPhone(contact.phone_number);
  const from = message.from || {};
  const firstName = String(contact.first_name || from.first_name || '').trim();
  const lastName = String(contact.last_name || from.last_name || '').trim();
  const username = String(from.username || '').trim();
  const displayName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 100);

  if (login.linkUid) {
    // Привʼязка: акаунта не заводимо й токена не випускаємо — мапу
    // `telegramAccounts/{tgId}` переписує лише `completeTelegramLogin`, коли
    // код увела та сама людина, що почала привʼязку зі свого акаунта.
    const linkCode = (deps.randomCode || defaultRandomCode)();
    await db.set(loginPath, {
      tgId,
      status: 'ready',
      createdAt: login.createdAt,
      readyAt: now,
      linkUid: login.linkUid,
      codeHash: hashCode(pointer.key, linkCode),
      attempts: 0,
      profile: { phone, firstName, lastName, username },
    });
    await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, null);
    await sendMessage(chatId, BOT_TEXTS.contactReceived, { remove_keyboard: true });
    await sendMessage(chatId, BOT_TEXTS.linkDone(linkCode), codeButtons(linkCode, PROFILE_URL, BOT_TEXTS.linkButton), { html: true });
    return 'link-ready';
  }

  // Акаунт Firebase тут ще не заводиться — лише коли застосунок забере вхід
  // правильним кодом (`completeTelegramLogin`). Доки акаунт заводив вебхук,
  // кожна людина, що поділилась номером і не ввела код, лишала в Auth акаунт
  // без жодного входу («(anonymous)» у консолі), а номер жив лише в цій
  // спробі й зникав з нею — акаунт був, а знайти, чий він, не було як.
  const code = (deps.randomCode || defaultRandomCode)();
  await db.set(loginPath, {
    tgId,
    status: 'ready',
    createdAt: login.createdAt,
    readyAt: now,
    codeHash: hashCode(pointer.key, code),
    attempts: 0,
    displayName,
    profile: { phone, firstName, lastName, username },
  });
  await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, null);
  await sendMessage(chatId, BOT_TEXTS.contactReceived, { remove_keyboard: true });
  await sendMessage(chatId, BOT_TEXTS.done(code), codeButtons(code), { html: true });
  const known = await db.get(`${ACCOUNTS_ROOT}/${tgId}`);
  return known && known.uid ? 'signed-in' : 'registered';
};

/**
 * Контакти нового акаунта лягають в анкету разом з самим акаунтом. Решту
 * анкети пише застосунок одразу після входу, але між кодом і тим записом
 * браузер може зникнути (мережа, закрита вкладка), а номер мусить лишитись
 * там, де його шукає адмін, — у `profileContacts/{uid}`. Вузол уже записаний
 * (повторний акаунт, гонка) не переписується. Ті самі значення й та сама
 * форма, що їх пише застосунок (`buildTelegramProfileData`).
 */
const seedProfileContacts = async ({ uid, profile }, { db }) => {
  const contacts = {};
  if (profile && profile.phone) contacts.phone = String(profile.phone);
  const username = String((profile && profile.username) || '').trim().replace(/^@/, '');
  if (username) contacts.telegram = username;
  if (!Object.keys(contacts).length) return;
  await db.transaction(`profileContacts/${uid}`, current => (current ? undefined : contacts));
};

/**
 * Контакт із Telegram лягає поруч з uid у `telegramAccounts/{tgId}/contact`.
 * Анкету пише застосунок, і лише після вибору ролі — тож людина, що закрила
 * вкладку на виборі ролі, лишала акаунт із входом, але без жодного вузла, а
 * номер, яким вона поділилась, не лежав ніде: спроба входу стирається, щойно
 * код прийнято. Тепер номер лишається тут (вузол читають лише функції й
 * консоль адміна, видалення акаунта стирає його разом з мапою).
 */
const rememberTelegramContact = async ({ tgId, uid, profile }, { db, now }) => {
  if (!profile || !profile.phone) return;
  await db.transaction(`${ACCOUNTS_ROOT}/${tgId}`, current => {
    if (current === null) return null;
    if (!current || current.uid !== uid) return undefined;
    return { ...current, contact: { ...profile, at: now } };
  });
};

/**
 * Прибирання спроб входу. Спроба живе 10 хвилин, але зникала лише тоді, коли
 * застосунок питав про неї після строку, — а людина, що закрила вкладку,
 * не питає вже ніколи. Тож `telegramLogins` накопичував кожен `/start` і
 * кожен незабраний номер (з телефоном і, до 07.11, з токеном входу) назавжди.
 * Тепер оновлення від бота (не частіше за раз на хвилину на інстанс,
 * `maybeSweepExpiredLogins`) знімає те, що пережило строк із запасом
 * (`LOGIN_SWEEP_GRACE_MS`: годинник браузера, який закриває спробу сам, може
 * відставати), і вказівники `telegramLoginsByTg` на зниклі спроби. Вузли
 * малі — лише живі спроби останніх хвилин, — тож читати їх цілком дешевше,
 * ніж тримати окремий розклад. Збій прибирання вхід не зупиняє.
 */
const LOGIN_SWEEP_GRACE_MS = 5 * 60 * 1000;
// Стеля роботи одного прибирання й частота: спам `/start` інакше змушував би
// кожне оновлення читати й чистити весь вузол.
const LOGIN_SWEEP_MAX_DELETES = 200;
const LOGIN_SWEEP_INTERVAL_MS = 60 * 1000;
let lastLoginSweepAt = -Infinity;

const sweepExpiredLogins = async ({ db, now }) => {
  const isStale = at => !Number.isFinite(at) || now - at > LOGIN_TTL_MS + LOGIN_SWEEP_GRACE_MS;
  const logins = (await db.get(LOGINS_ROOT)) || {};
  const removed = new Set();
  for (const [key, record] of Object.entries(logins)) {
    if (removed.size >= LOGIN_SWEEP_MAX_DELETES) break;
    if (!isStale(record && record.createdAt)) continue;
    await db.set(`${LOGINS_ROOT}/${key}`, null);
    removed.add(key);
  }
  // Вказівник читається вже після знімка спроб, і свіжий `/start` між двома
  // читаннями дає вказівник на спробу, якої знімок не бачив. Тож знімається
  // лише вказівник, що сам старий, або той, чию спробу щойно прибрано, —
  // інакше людина посеред входу діставала б «спробу не знайдено».
  //
  // Рішення про вказівник ухвалене за знімком, а свіжий `/start` може
  // переписати його вже після читання — тож знімається він транзакцією й лише
  // тоді, коли в базі лежить той самий вказівник (той самий `key` і `at`).
  // Безумовний `set(null)` зносив би новий вказівник за старим рішенням, і
  // контакт людини посеред входу діставав би `no-login`.
  const pointers = (await db.get(LOGINS_BY_TG_ROOT)) || {};
  for (const [tgId, pointer] of Object.entries(pointers)) {
    const key = pointer && pointer.key;
    const at = pointer && pointer.at;
    if (!removed.has(key) && !isStale(at)) continue;
    await db.transaction(`${LOGINS_BY_TG_ROOT}/${tgId}`, current => {
      // Перший виклик бачить порожній локальний кеш: `null` нічого не пише,
      // а сервер, у якого запис є, покличе обробник ще раз уже з даними.
      if (current === null) return null;
      if (current.key !== key || current.at !== at) return undefined;
      return null;
    });
  }
  return removed.size;
};

const maybeSweepExpiredLogins = async deps => {
  if (deps.now - lastLoginSweepAt < LOGIN_SWEEP_INTERVAL_MS) return;
  lastLoginSweepAt = deps.now;
  await sweepExpiredLogins(deps);
};

/**
 * Одне оновлення від Telegram. Відповідає лише в приватному чаті з ботом:
 * у групі контакт і `/start` не означають входу.
 */
const handleTelegramUpdate = async (update, deps) => {
  const message = update && update.message;
  if (!message || !message.chat || message.chat.type !== 'private' || !message.from) return 'ignored';
  const tgId = String(message.from.id);
  const chatId = message.chat.id;

  await maybeSweepExpiredLogins(deps).catch(() => {});

  try {
    if (message.contact) return await handleContact({ message, tgId, chatId }, deps);
    const nonce = parseStartPayload(message.text);
    if (nonce !== null) return await handleStart({ nonce, tgId, chatId }, deps);
    await deps.sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'hint';
  } catch (error) {
    await deps.sendMessage(chatId, BOT_TEXTS.failed).catch(() => {});
    throw error;
  }
};

/**
 * Застосунок забирає вхід. Токен віддається лише з кодом, який бот показав
 * власникові акаунта Telegram, і рівно один раз: спроба видаляється
 * транзакцією. Хибний код рахується; на `MAX_CODE_ATTEMPTS` спроба згорає.
 */
const completeTelegramLogin = async (nonce, codeInput, { db, auth, now, callerUid = null, intent = '' }) => {
  if (!isValidNonce(nonce)) return { status: 'invalid' };
  const key = hashNonce(nonce);
  const path = `${LOGINS_ROOT}/${key}`;
  const record = await db.get(path);
  if (!record) {
    // Початок привʼязки: застосунок, що вже увійшов (поштою), заводить спробу
    // зі своїм uid. Без входу привʼязувати нема до чого.
    if (intent === 'link') {
      if (!callerUid) return { status: 'invalid' };
      await db.transaction(path, current => {
        if (current) return undefined;
        return { linkUid: callerUid, status: 'pending', createdAt: now };
      });
    }
    return { status: 'pending', started: false };
  }
  // Спробу привʼязки завершує лише той акаунт, що її почав: інакше хтось
  // інший прочитаним кодом привʼязав би чужий Telegram до себе.
  if (record.linkUid && record.linkUid !== callerUid) return { status: 'invalid' };
  if (isExpired(record, now)) {
    await db.set(path, null);
    if (record.tgId) await db.set(`${LOGINS_BY_TG_ROOT}/${record.tgId}`, null);
    return { status: 'expired' };
  }
  if (record.status !== 'ready') return { status: 'pending', started: true };

  const code = normalizeCode(codeInput);
  if (!code) return { status: 'code-required' };

  let outcome = 'gone';
  let claimed = null;
  let attemptsLeft = 0;
  await db.transaction(path, current => {
    // Обробник кличуть кілька разів, тож підсумок рахується щоразу заново.
    claimed = null;
    attemptsLeft = 0;
    if (current === null) {
      // Перший виклик бачить локальний кеш, а у функції він порожній, хоч
      // запис щойно прочитано. `undefined` тут скасовував транзакцію без
      // сервера, і правильний код відповідав «час минув» — на кожному вході.
      // `null` у `null` сервер з наявним записом відхиляє й кличе обробник
      // уже з даними; зниклий запис так і лишається зниклим.
      outcome = 'gone';
      return null;
    }
    if (current.status !== 'ready') {
      outcome = 'gone';
      return undefined;
    }
    if (current.codeHash === hashCode(key, code)) {
      outcome = 'ready';
      claimed = current;
      return null;
    }
    const attempts = (Number(current.attempts) || 0) + 1;
    attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - attempts);
    if (attemptsLeft === 0) {
      outcome = 'expired';
      return null;
    }
    outcome = 'wrong-code';
    return { ...current, attempts };
  });
  if (outcome === 'ready' && claimed && claimed.linkUid) {
    // Людина довела обидва: увійшла в акаунт і бачить код у своєму Telegram.
    // Старий акаунт, заведений через Telegram раніше, лишається як є —
    // його анкету адмін зводить «Порівнянням»; вхід через Telegram відтепер
    // відкриває акаунт, до якого привʼязали.
    const previous = await db.get(`${ACCOUNTS_ROOT}/${claimed.tgId}`);
    const previousUid = previous && previous.uid && previous.uid !== claimed.linkUid ? previous.uid : null;
    await db.set(`${ACCOUNTS_ROOT}/${claimed.tgId}`, {
      uid: claimed.linkUid,
      createdAt: (previous && previous.createdAt) || now,
      linkedAt: now,
      ...(previousUid ? { previousUid } : {}),
      ...(claimed.profile && claimed.profile.phone ? { contact: { ...claimed.profile, at: now } } : {}),
    });
    return { status: 'linked', hadOtherAccount: Boolean(previousUid), profile: claimed.profile || {} };
  }
  if (outcome === 'ready' && claimed && claimed.token) {
    // Спроба, яку вебхук завів ще до цієї зміни: акаунт і токен уже є.
    return {
      status: 'ready',
      token: claimed.token,
      isNew: Boolean(claimed.isNew),
      profile: claimed.profile || {},
    };
  }
  if (outcome === 'ready' && claimed) {
    const profile = claimed.profile || {};
    const { uid, isNew } = await resolveAccount({ tgId: claimed.tgId, displayName: claimed.displayName || '' }, { db, auth, now });
    await rememberTelegramContact({ tgId: claimed.tgId, uid, profile }, { db, now });
    if (isNew) await seedProfileContacts({ uid, profile }, { db });
    const token = await auth.createCustomToken(uid);
    return { status: 'ready', token, isNew, profile };
  }
  if (outcome === 'wrong-code') return { status: 'wrong-code', attemptsLeft };
  return { status: 'expired' };
};

/**
 * Обгортка RTDB Admin SDK під інтерфейс `deps.db`: модулю досить get/set/
 * transaction, а тест підставляє памʼять.
 */
const createAdminDb = database => ({
  get: async path => (await database.ref(path).get()).val(),
  set: (path, value) => database.ref(path).set(value),
  transaction: async (path, update) => {
    const result = await database.ref(path).transaction(update);
    return { committed: result.committed };
  },
});

const createTelegramSender = (token, fetchImpl = fetch) => async (chatId, text, replyMarkup, options = {}) => {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(options.html ? { parse_mode: 'HTML' } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  if (!response.ok) {
    // Токен бота в помилку не потрапляє — лише статус.
    const error = new Error(`Telegram sendMessage failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
};

// Порівняння секрету вебхука за сталий час.
const isWebhookSecretValid = (received, expected) => {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  ACCOUNTS_ROOT,
  BOT_TEXTS,
  LOGINS_BY_TG_ROOT,
  LOGINS_ROOT,
  LOGIN_TTL_MS,
  MAX_CODE_ATTEMPTS,
  maybeSweepExpiredLogins,
  sweepExpiredLogins,
  completeTelegramLogin,
  createAdminDb,
  createTelegramSender,
  handleTelegramUpdate,
  hashNonce,
  isValidNonce,
  isWebhookSecretValid,
  normalizeTelegramPhone,
  parseStartPayload,
};
