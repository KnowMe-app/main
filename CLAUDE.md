# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KnowMe — застосунок для ведення анкет донорок і матчингу: CRA + React 18, Redux Toolkit,
styled-components, Firebase (Auth, RTDB, Storage, Firestore), деплой на GitHub Pages.
Мова коду й коментарів у репозиторії — англійська для ідентифікаторів, українська для
пояснень «чому». Тримайтесь цього ж.

## Команди

```bash
npm install
npm start                 # dev-сервер, http://localhost:3000
npm run build             # прод-збірка в build/
npm run lint:js           # eslint по src/**/*.{js,jsx}; має завершуватись кодом 0
npm test                  # watch-режим
CI=true npx react-scripts test --watchAll=false                          # весь набір один раз
CI=true npx react-scripts test --testPathPattern "cardIndex" --watchAll=false   # одна сюїта
npm run test:rules        # сценарії доступу в емуляторі RTDB (потрібна Java)
```

`npm run test:rules` піднімає емулятор через `firebase-tools` і прогоняє
`scripts/rulesEmulatorTests.mjs` — понад сто перевірок доступу. **Це єдиний спосіб
дізнатись, що `database.rules.json` узагалі можна задеплоїти:** мова правил має власний
діалект регулярок (`\s` і `\S` у ньому немає), і файл із непідтримуваною конструкцією база
відхиляє **цілком**, лишаючи в проді попередній набір правил. Прогоняйте його після кожної
правки правил; у `npm test` цю пастку ловить лише `databaseRulesRegexDialect.test.js`.

Кілька сюїт падають незалежно від змін (мок `localStorage` у них повертає `null`):
`cardsStorage`, `load2Storage`, `dplStorage`, `favoritesStorage`, `getFilteredCardsByList`,
`AddNewProfile.makeIndexGate`, `Matching.sharedReactions`, `profileLayoutConfig`. Перед тим
як щось «лагодити», звірте з чистим `main` — інакше згаєте час на чужу поломку.

## Деплой

Пуш у `main` запускає `.github/workflows/deploy.yml`: install → lint → build → gh-pages.
`.env` збирається з GitHub Secrets, локально його немає.

**Правила бази CI не викочує.** `database.rules.json` деплоїться руками:
`npx firebase deploy --only database` (проєкт `webringitapp`). Зміна правил у репозиторії
сама по собі нічого в проді не змінює — це вже коштувало тижня, коли межа приватності
жила в коді й не діяла в базі.

## Архітектура

### Анкета розкладена по вузлах RTDB

`/matchingCards`, `/profileDetails`, `/profileContacts`, `/profileWorkflow`,
`/profileTechnical`; `/users` лишається **legacy-дзеркалом для мобільного застосунку** —
веб туди пише, але з нього не читає. Розкладка описана декларативно в
`src/utils/profileNodeSchema.js` — це джерело правди і для міграції, і для runtime, і для
тестів правил. Деталі: `docs/rtdb-profile-nodes.md`.

`matchingCards/{id}` — проєкція під рядок стрічки (десяток скалярів + похідні
`surnameShort`, `rh`, `bloodGroup`, `avatar`). Контрактом володіє
`src/utils/matchingCardIndex.js`: `buildMatchingCardProjection` збирає, `expandMatchingCard`
розгортає назад у форму, яку читають рендер і фільтри.

`feedDate` (формат `YYYY-MM-DD`) — і допуск до стрічки, і порядок у ній. Ключ є → картка
показана; ключа немає → її в стрічці немає. Зняти з публікації = видалити ключ.

### Межа приватності: поза стрічкою видно саму картку

Це головна межа проєкту, і вона описана двічі — в базі й у коді:

- `database.rules.json` — `profileDetails/$uid` і `profileContacts/$uid` відкриті всій
  аудиторії матчингу (роль, відмінна від `ed`, **або** `accessLevel` зі словом `matching`)
  **лише поки в картці є непорожній `feedDate`**;
- `src/utils/profileVisibilityScope.js` — та сама умова в коді, який складає анкету.

Від межі не залежать двоє: власниця анкети й адміни (`ADMIN_UIDS` у
`src/utils/accessLevel.js`). **Виданий рівень доступу перепусткою не є.** Доти
`accessLevel` зі словом `matching` — тобто рівно те, що видають агенції заради самої
стрічки, — знімав межу цілком, і приховану анкету вони читали з контактами.

Поруч закриті обхідні шляхи до тих самих даних: перелічити `profileDetails` чи
legacy-колекцію `users` (дзеркало з контактами) може лише адмін, а поля
`users/$uid/{name,surname,birth,region,city}`, відкриті всім авторизованим, теж стоять
під ключем стрічки.

Кеш карток контактів не тримає нікому, крім власниці й адміна
(`sanitizeMatchingCardForCache`), тож `updateCard` повертає картку без них — на екран
контакти повертає `withContactsFromSource` із щойно прочитаного.

**Єдина воронка складання анкети — `readProfileFromNodes` у `src/components/config.js`.**
Сюди сходяться стрічка, пошук, реакції та гідратація за фільтрами; тут стоїть межа. Новий
шлях читання анкети веде сюди, а не в окремі `get`.

### Кеш карток

`src/utils/cardIndex.js` + `cardsStorage.js` тримають анкети в `localStorage`. Кеш
привʼязаний до `ownerId` і версіонований (`CARDS_CACHE_VERSION`) — підняття версії скидає
все збережене раніше. Контакти в кеш не потрапляють тому, чиє право на них тримається на
`feedDate`: право протухає в базі, а браузер про це не дізнається. Єдине місце цього
правила — `sanitizeMatchingCardForCache`; воно прикриває всі шляхи, що беруть картку з кеша.

### Пошук

Два індекси: `searchId` — точковий резолв «контакт → id» (перелічити вузол може лише
адмін), `searchKey` — бакети для фільтрів (`docs/searchKey-index.md`). Читач без повного
доступу отримує урізану проєкцію (`fetchLimitedProfileById`) і не сканує індекс.

### Трафік стрічки

Один запит на сторінку карток замість повних анкет, кеш проєкцій окремо від кеша анкет,
фото — лише для того, що на екрані. Мотивація і цифри: `docs/matching-feed-traffic.md`.
Перш ніж додавати читання «на кожну картку», прочитайте цей документ.

## Домовленості, які легко порушити необачно

- Багато тестів читають **вихідний текст** модулів (`config.js`, `Matching.jsx`) і
  перевіряють у ньому конкретні рядки. Перейменування функції або зміна виклику ламає такий
  тест не тому, що поведінка інша, — виправляйте тест разом із кодом.
- Коментарі тут пояснюють **чому**, часто з історією регресії. Не замінюйте їх на переказ
  коду і не видаляйте, переписуючи поруч.
- `matchingCards` приймає лише перелічені поля (`$other: false` у правилах) — нове поле
  стрічки треба додати і в схему, і в правила, інакше запис відхилиться мовчки.
- Плагіни Claude Code для цього репозиторію описані в `.claude/settings.json` разом із
  джерелом (`extraKnownMarketplaces`); перелік і призначення — `docs/claude-code-plugins.md`.
