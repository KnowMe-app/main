---
name: no-read-from-legacy-users-node
enabled: true
event: file
conditions:
  - field: new_text
    operator: regex_match
    pattern: get\(\s*ref2?\(\s*database\s*,\s*['"\x60]users[/'"\x60]
---

🚫 **Читання з `/users` — це legacy-вузол.**

`/users` лишається **дзеркалом**: веб туди пише, але з нього **не читає
взагалі**. Жодного `get` на `users/...` у коді немає, і додавати новий не можна.

**Куди переїхало те, що читалось звідти раніше:**

| Було в `/users` | Тепер |
|---|---|
| `publish` | `feedDate` у картці |
| `accessLevel` | `profileTechnical` |
| `cycleStatus`, `lastAction`, `lastCycle` | `profileWorkflow` |
| `lastLogin`, `createdAt` | `profileTechnical` |
| контакти | `searchId` + `profileContacts` |

**Питання «чи є legacy-тіло» вирішує формат id, а не читання** —
`hasLegacyUsersBody`, `getCardLegacyCollection`.

**Єдиний явний виняток** — кнопка «завантажити users.json» в адмінці
(`AddNewProfile.jsx`): вона й існує, щоб вивантажити legacy для міграції.

Новий шлях читання анкети веде в `readProfileFromNodes` (`src/components/config.js`),
а не в окремий `get` — там стоїть межа приватності.
