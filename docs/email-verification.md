# Лист підтвердження пошти

Брендований лист KnowMe замість стандартного листа Firebase. Мокап затверджено
01.11.2026, домен — `knowme.pp.ua`.

## Як це працює

```
реєстрація / меню «⋮ → Підтвердити email»
        │
        ▼
src/utils/emailVerification.js ── requestVerificationEmail()
        │  1. httpsCallable('sendVerificationEmail', europe-west1)
        │  2. не вийшло (не розгорнуто, сервіс відмовив, мережа) →
        │     стандартний sendEmailVerification мовою інтерфейсу
        ▼
functions/index.js ── sendVerificationEmail (Cloud Functions 2nd gen)
        │  • межі: акаунт і адреса — раз на хвилину, 5 на добу; усі — 100 на добу
        │    (RTDB emailVerificationSends/{byUid,byEmail,total}, адреса — хешем)
        │  • Admin SDK: generateEmailVerificationLink → лише oobCode
        │  • шаблон functions/emails/verifyEmail.js (uk/en, плашка ролі)
        │  • відправка: Brevo від KnowMe <hello@knowme.pp.ua>
        ▼
кнопка в листі → https://knowme.pp.ua/auth/action?mode=verifyEmail&oobCode=…&lang=uk
        │
        ▼
src/components/AuthActionPage.jsx ── applyActionCode → «Пошту підтверджено»
```

Поки функцію не розгорнуто, застосунок працює як раніше: кожен лист — стандартний
Firebase (на один невдалий запит до функції більше). Після деплою функція
вмикається сама, без прапорця в збірці.

Межа акаунта чи адреси (`resource-exhausted`) — не збій: стандартного листа тоді не
шлемо, а відповідаємо `auth/too-many-requests`, як Firebase на надто часті листи.
Межа адреси окремо від акаунта навмисно: акаунт на чужу адресу можна видалити й
завести знову з новим uid. Стеля на всіх (`GLOBAL_MAX_PER_DAY`, під денний ліміт
тарифу Brevo: 300 на добу безкоштовно, стеля — 250) відповідає `unavailable` — і застосунок шле стандартний лист Firebase.
Лист, який не пішов (сервіс відмовив), місця в межах повертає. У журнал функції
адреса не потрапляє: з відмови Brevo лишаються статус і код помилки.

## Що зробити руками, один раз

1. **План Blaze** на проєкті `webringitapp` — без нього Cloud Functions не деплояться.
2. **Brevo** (https://app.brevo.com): підтвердити телефон акаунта (без цього
   Brevo не шле нічого), далі Senders, Domains & Dedicated IPs → Domains →
   додати `knowme.pp.ua` і внести в DNS у реєстратора записи, які він покаже
   (Brevo code, DKIM, DMARC). Домен Resend не прийняв — сервіс тому й змінено.
   Поки домен не підтверджено, Brevo відмовляє, і застосунок шле стандартний лист.
   Ключ — SMTP & API → API keys (`xkeysib-…`).
   Права ключа — Restricted, лише **Transactional email → All**. Ключ Brevo
   **вимикається після 90 днів без викликів**: якщо три місяці ніхто не
   реєструвався, функція отримає 401, а застосунок слатиме стандартний лист
   Firebase. Тоді — новий ключ і `functions:secrets:set` ще раз. Обмеження за IP
   (Security → Authorized IPs) для цього ключа вимкнене: IP функції змінюються.
3. **Ключ Brevo — секретом Firebase**, не в код і не в `.env`:
   ```bash
   cd functions && npm ci
   npx firebase-tools functions:secrets:set BREVO_API_KEY --project webringitapp
   ```
4. **Деплой функції** (CI її не викочує, як і правила бази):
   ```bash
   npx firebase-tools deploy --only functions --project webringitapp
   ```
5. **Консоль Firebase → Authentication:**
   - *Settings → Authorized domains* — додати `knowme.pp.ua`;
   - *Templates → (олівець) → Customize action URL* — `https://knowme.pp.ua/auth/action`.
     Тоді й стандартні листи (запасний лист підтвердження, «Забули пароль?») ведуть
     на сторінку KnowMe, а не на `firebaseapp.com`. Сторінка вміє `verifyEmail`,
     `resetPassword`, `recoverEmail`, `verifyAndChangeEmail` — інакше ця адреса
     зламала б відновлення пароля;
   - там же в шаблоні підтвердження можна поставити відправника «KnowMe» і тему
     «Підтвердіть пошту для KnowMe» — це запасний лист.

## Перевірити

- `cd functions && npm test` — шаблон, посилання, межа, відправка (без мережі).
- Після деплою: зареєструватись на справжню скриньку (тестові акаунти
  `@example.com` листів не отримують) або натиснути «⋮ → Підтвердити email».
  Лист має прийти від `KnowMe <hello@knowme.pp.ua>`, кнопка — відкрити
  `knowme.pp.ua/auth/action` з «Пошту підтверджено».
- Журнал функції: `npx firebase-tools functions:log --only sendVerificationEmail`.
  Адреси там немає, лише uid, мова й роль. Якщо щоразу `unavailable` —
  дивіться `Brevo responded 400/403` (відправник не підтверджений) чи `401` (ключ).

## Лист зміни пароля («Забули пароль?»)

Друга функція того ж модуля — `sendPasswordResetEmail` (`functions/index.js`,
шаблон `functions/emails/passwordReset.js`, розкладка спільна — `emails/layout.js`).
Шаблони Firebase в консолі цього проєкту заблоковані («Email template updates are
currently unavailable»), тож стандартний лист лишався англійським і вів на
`firebaseapp.com`. Тепер «Забули пароль?» (`LoginScreen` →
`requestPasswordResetEmail` у `src/utils/emailVerification.js`) шле брендований
лист, кнопка якого веде на `/auth/action?mode=resetPassword`, а `AuthActionPage`
питає новий пароль. Не відповіла функція — стандартний лист Firebase мовою
інтерфейсу.

Функцію кличуть **без входу**, тож вона:
- відповідає `sent` і тоді, коли акаунта з такою адресою немає (форма не мусить
  розкривати, чи зареєстрована пошта);
- рахує межі на адресу (`resetByEmail`, як у листа підтвердження) і на IP
  (`resetByIp`, 30 на добу, раз на 10 с — за IP мобільного оператора сидять
  сотні людей), і не повертає їх навіть без акаунта, інакше перебір адрес був би
  безкоштовним;
- до спільної стелі (`total`) доходить лише тоді, коли акаунт є.

IP — остання адреса з `X-Forwarded-For` (першу може вписати сам клієнт). Скільки
адрес у ланцюжку, пише журнал (`password reset requested`, поле `xffParts`):
якщо там стабільно 2 без підробки, остання — це вже адреса фронтенду Google, і
`readClientIp` треба брати передостанню.

## Що змінювати де

| Що | Де |
|---|---|
| Текст листа, кроки «Що далі» | `functions/emails/verifyEmail.js` (обидві мови) |
| Адреса відправника, регіон, CORS | `functions/config.js` |
| Регіон на боці клієнта | `VERIFICATION_FUNCTION_REGION` у `src/utils/emailVerification.js` — мусить збігатися з `functions/config.js` (стереже тест) |
| Межа відправок | `functions/verificationQuota.js` |
| Текст листа зміни пароля | `functions/emails/passwordReset.js` (обидві мови) |
| Спільна розкладка листів | `functions/emails/layout.js` |
| Сторінка після кнопки | `src/components/AuthActionPage.jsx`, рядки — у словниках усіх семи мов |
