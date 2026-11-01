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
        │  • відправка: Resend від KnowMe <hello@knowme.pp.ua>
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
тарифу Resend) відповідає `unavailable` — і застосунок шле стандартний лист Firebase.
Лист, який не пішов (сервіс відмовив), місця в межах повертає. У журнал функції
адреса не потрапляє: з відмови Resend лишаються статус і назва помилки.

## Що зробити руками, один раз

1. **План Blaze** на проєкті `webringitapp` — без нього Cloud Functions не деплояться.
2. **Resend** (https://resend.com): додати домен `knowme.pp.ua` і внести в DNS у
   реєстратора записи, які він покаже (SPF, DKIM; DMARC — бажано). Поки домен не
   підтверджено, Resend відповідає 403, і застосунок шле стандартний лист.
3. **Ключ Resend — секретом Firebase**, не в код і не в `.env`:
   ```bash
   cd functions && npm ci
   npx firebase-tools functions:secrets:set RESEND_API_KEY --project webringitapp
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
  дивіться `Resend responded 403` (домен не підтверджено) чи `401` (ключ).

## Що змінювати де

| Що | Де |
|---|---|
| Текст листа, кроки «Що далі» | `functions/emails/verifyEmail.js` (обидві мови) |
| Адреса відправника, регіон, CORS | `functions/config.js` |
| Регіон на боці клієнта | `VERIFICATION_FUNCTION_REGION` у `src/utils/emailVerification.js` — мусить збігатися з `functions/config.js` (стереже тест) |
| Межа відправок | `functions/verificationQuota.js` |
| Сторінка після кнопки | `src/components/AuthActionPage.jsx`, рядки — у словниках усіх семи мов |
