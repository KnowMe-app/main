# Вхід і реєстрація через Telegram

Основний спосіб входу KnowMe. Пошта лишається запасною: на екрані входу вона
схована за посиланням «Немає Telegram?». Для донорок і СМ телефон — це
Telegram, а пошта — ділове листування. SMS Firebase платна з кожного
повідомлення, та ще й мішень SMS pumping. Бот віддає **підтверджений** номер
безкоштовно.

## Як це працює

1. `/login` генерує одноразовий `nonce` і веде кнопкою на
   `https://t.me/<бот>?start=<nonce>` (`src/utils/telegramAuth.js`).
2. Бот (`functions/telegramAuth.js`, вебхук `telegramWebhook`) привʼязує спробу
   до акаунта Telegram і просить «📱 Поділитися номером» (`request_contact`).
3. Контакт приймається, лише коли `contact.user_id === from.id`: номер свій, а
   не пересланий. Бот знаходить чи заводить акаунт Firebase
   (`telegramAccounts/{tgId}` → uid) і випускає custom token.
4. Форма входу кожні 2,5 с (і щойно вкладка знову видима) питає
   `completeTelegramLogin`. Токен віддається рівно один раз, далі
   `signInWithCustomToken`.
5. Новий акаунт отримує анкету: номер (`phone`), нік (`telegram`), імʼя й
   прізвище з Telegram, роль із форми. Якщо вхід почали з вкладки «Увійти»,
   форма спершу питає роль і згоду з умовами.

У базі лежить лише sha256 від `nonce`. Вузли `telegramLogins`,
`telegramLoginsByTg`, `telegramAccounts` пише тільки функція; у
`database.rules.json` їх немає, тож клієнтам вони закриті коренем —
**викочувати правила не треба**. Спроба живе 10 хвилин.

Обмеження: акаунт Telegram і акаунт з поштою — різні акаунти. Людина, яка
вже має акаунт з поштою, входить поштою; привʼязки Telegram до наявного
акаунта поки немає. Звʼязувати їх автоматично за номером не можна: номер,
дописаний у чужу анкету (адміном чи доповненням), віддав би чужий акаунт.

## Розгортання (руками — CI цього не робить)

1. Створити бота в @BotFather (`/newbot`) і взяти токен. Опис і аватар
   налаштовуються там само.
2. Секрети функцій:
   ```bash
   npx firebase-tools functions:secrets:set TELEGRAM_BOT_TOKEN
   npx firebase-tools functions:secrets:set TELEGRAM_WEBHOOK_SECRET   # довільний рядок [A-Za-z0-9_-], 32+ знаки
   ```
3. Сервісному акаунту функцій (за замовчуванням
   `…-compute@developer.gserviceaccount.com`) дати роль **Service Account
   Token Creator** на самого себе: без неї `createCustomToken` падає з
   `iam.serviceAccounts.signBlob`.
4. `cd functions && npx firebase-tools deploy --only functions:telegramWebhook,functions:completeTelegramLogin`
5. Вебхук (адресу функції видно у виводі деплою):
   ```bash
   curl -sS "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
     -d url="https://europe-west1-webringitapp.cloudfunctions.net/telegramWebhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
     -d allowed_updates='["message"]'
   ```
6. GitHub → Settings → Secrets and variables → Actions → **Variables**:
   `REACT_APP_TELEGRAM_BOT_USERNAME` = імʼя бота без `@`, далі перезапустити
   деплой. Поки змінної немає, кнопки Telegram на вході немає, і форма поштова,
   як і раніше.

Порядок важливий: змінну в GitHub ставлять останньою, коли бот уже відповідає.

## Перевірка

- `cd functions && npm test` — потік бота на памʼяті: свій і чужий контакт,
  перехоплення спроби, строк, одноразовий токен.
- Локально: `REACT_APP_TELEGRAM_BOT_USERNAME=<бот> npm start`, кнопка на `/login`.
