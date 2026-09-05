# Плагіни Claude Code для цього проєкту

Проєкт: CRA + React 18 + Redux Toolkit + styled-components + Firebase RTDB/Storage,
деплой на GitHub Pages. Набір плагінів підібраний під цей стек.

## Як увімкнути

Нічого робити не треба: `.claude/settings.json` описує і сам набір
(`enabledPlugins`), і джерело, з якого він береться (`extraKnownMarketplaces`).
Друге тут не формальність — без нього набір лишався списком імен: у сесії, що
починається з чистого контейнера (Claude Code у вебі), офіційний маркетплейс
нізвідки не береться, бо його реєструють інтерактивною командою, якої там
нема кому виконати. Тепер джерело названо в самому репозиторії, тож кожна
сесія — локальна чи веб — підтягує плагіни сама.

Вручну маркетплейс додається так (потрібно лише поза цим репозиторієм):

```
/plugin marketplace add anthropics/claude-plugins-official
```

Перевірка:

```
/plugin marketplace list
/plugin list
```

## Що входить у базовий набір

| Плагін | Навіщо тут |
|---|---|
| `security-guidance` | Перевіряє згенеровані дифи на XSS, ін'єкції, секрети в коді. Критично: у репо є `database.rules.json` і ключі Firebase. |
| `code-review` | `/code-review` кількома агентами з фільтрацією хибних спрацювань. |
| `pr-review-toolkit` | Ревʼю під PR: тести, обробка помилок, якість, спрощення. |
| `code-simplifier` | Прибирає дублікати й ускладнення в щойно зміненому коді. |
| `feature-dev` | Воркфлоу «дослідити код → спроєктувати → зробити → перевірити» для великих задач. |
| `commit-commands` | Команди для commit / push / PR. |
| `typescript-lsp` | LSP для TS **і JS** — go-to-definition і типи по всьому `src/`. |
| `frontend-design` | Якісний UI-код замість «генеричного AI-вигляду». |
| `modern-web-guidance` | Актуальні веб-практики (від команди Chrome). |
| `claude-md-management` | Підтримує `CLAUDE.md` в актуальному стані. |
| `context7` | Свіжа документація React / Firebase / Redux прямо в контекст. Працює без ключа. |
| `hookify` | Дивиться, **як** тут пишеться код, і перетворює зауваження на правила: `/hookify` без аргументів розбирає розмову й знаходить те, що ви вже виправляли за мною, а `/hookify <вимога>` записує правило зі слів. Далі правило спрацьовує саме — до або після виклику інструмента, а не в ревʼю постфактум. |

## Опційні (потребують акаунта або локальних залежностей)

Ставити точково, коли реально потрібні:

```
/plugin install firebase@claude-plugins-official           # MCP до Firestore/Auth/Storage, потрібен firebase login
/plugin install github@claude-plugins-official             # PR та issues з чату, потрібен GitHub token
/plugin install playwright@claude-plugins-official         # E2E-тести в браузері
/plugin install chrome-devtools-mcp@claude-plugins-official # профайлінг, network, console з живого Chrome
/plugin install sentry@claude-plugins-official             # розбір продакшн-помилок
/plugin install claude-security@claude-plugins-official    # глибокий скан вразливостей на вимогу
/plugin install claude-code-setup@claude-plugins-official  # аудит: які хуки/скіли варто додати саме сюди
```

## Правила hookify живуть у репозиторії

`/hookify` кладе кожне правило окремим файлом `.claude/hookify.<назва>.local.md`
(YAML-фронтматер: `name`, `enabled`, `event`, регулярка й текст повідомлення).
Список — `/hookify:list`, вимкнути чи ввімкнути — `/hookify:configure` або `enabled:`
у самому файлі, прибрати — видалити файл. Перезапуск не потрібен: правило діє з
наступного виклику інструмента.

Суфікс `.local.md` тут — **вимога формату, а не позначка «не комітити»**:
`config_loader` шукає рівно `.claude/hookify.*.local.md` і файл з іншим імʼям
просто не побачить. Ці файли ми **комітимо**, і з тієї самої причини, з якої в
`settings.json` названо джерело маркетплейсу: сесія в чистому контейнері
(Claude Code у вебі) не має звідки взяти правила, крім репозиторію. Некомічене
правило — це правило, яке діє на одній машині.

Правило описує **вимогу до коду, а не смак**, інакше воно шумить на кожній правці.
Матеріал для них тут уже накопичено — це домовленості з `CLAUDE.md`, які найлегше
порушити необачно: запис у `matchingCards` поза схемою, `get` на `users/...`,
зведення історії поля до поточного значення, правка `database.rules.json` без
`npm run test:rules`.

## Оновлення

```
/plugin marketplace update claude-plugins-official
```
