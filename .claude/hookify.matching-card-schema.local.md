---
name: matching-card-field-needs-schema-and-rules
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/utils/(matchingCardIndex|profileNodeSchema)\.js$
---

📇 **Контракт картки стрічки описаний у трьох місцях — не в одному.**

`matchingCards` приймає **лише перелічені поля** (`$other: false` у правилах).
Нове поле, додане тільки сюди, буде відхилено при записі **мовчки**.

Якщо додаєте чи перейменовуєте поле картки, пройдіть усі три:

1. `src/utils/profileNodeSchema.js` — джерело правди для міграції, runtime і тестів;
2. `src/utils/matchingCardIndex.js` — `buildMatchingCardProjection` збирає,
   `expandMatchingCard` розгортає назад;
3. `database.rules.json` — інакше запис відхилиться (і не забудьте
   `npm run test:rules` + ручний `npx firebase deploy --only database`).

**Окремо про історію значень.** `projectionValue` дописує `''` назад, коли
поточного значення немає, а `sameProjectionValue` цю різницю бачить — інакше
писач вважав би картку незміненою і рядок стрічки показував би те, чого у
відкритій анкеті вже немає. **Зводити історію до поточного значення в картці
не можна**: `name` живе тільки в ній.
