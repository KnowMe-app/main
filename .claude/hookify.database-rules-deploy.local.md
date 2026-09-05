---
name: database-rules-need-emulator-and-manual-deploy
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: database\.rules\.json$
---

🔒 **Ви правите `database.rules.json`. Дві речі, які легко забути.**

**1. Прогоніть емулятор — це єдина перевірка, що файл узагалі приймається:**

```
npm run test:rules
```

Мова правил має власний діалект регулярок (`\s` і `\S` у ньому немає). База
відхиляє файл із непідтримуваною конструкцією **цілком** і лишає в проді
попередній набір правил. `npm test` цю пастку ловить лише частково
(`databaseRulesRegexDialect.test.js`).

**2. CI правила не викочує.** Пуш у `main` їх не задеплоїть:

```
npx firebase deploy --only database    # проєкт webringitapp
```

Зміна правил у репозиторії сама по собі нічого в проді не змінює — це вже
коштувало тижня, коли межа приватності жила в коді й не діяла в базі.
