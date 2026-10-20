---
name: no-read-from-legacy-users-node
enabled: true
event: file
conditions:
  - field: new_text
    operator: regex_match
    pattern: ref2?\(\s*[a-zA-Z]+\s*,\s*['"\x60]users[/'"\x60]
---

🚫 **`/users` у RTDB закрито й видалено з правил.**

Веб з ним не працює взагалі: ні читання, ні запису, ні дзеркала. Будь-який
`ref(..., 'users/...')` у RTDB відлетить з `PERMISSION_DENIED` — у всіх, адмінів
теж. (Firestore `users/{uid}` — інша річ: туди пише `updateDataInFiresoreDB`.)

**Куди переїхало те, що жило в `/users`:**

| Було в `/users` | Тепер |
|---|---|
| `publish` | `feedDate` у картці |
| `accessLevel`, `canCreateProfiles`, `multiDataSourceUserIds` | `profileTechnical` |
| роль читача для правил | `matchingCards/{uid}/role` |
| `cycleStatus`, `lastAction`, `lastCycle` | `profileWorkflow` |
| `lastLogin`, `createdAt` | `profileTechnical` |
| контакти | `searchId` + `profileContacts` |

Анкету акаунта впізнає формат id — `isAccountProfileCard`.

Новий шлях читання анкети веде в `readProfileFromNodes` (`src/components/config.js`),
а не в окремий `get` — там стоїть межа приватності.
